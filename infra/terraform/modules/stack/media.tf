# Media object store (TAM-83) — the CMS's upload target.
#
# The admin panel presigns a PUT against this bucket and the browser uploads the
# bytes directly (the api task never sees a file body — ADR A1). Mobile devices
# then fetch the object through CloudFront. Locally, floci-aws emulates S3 and
# there is NO CloudFront — see docker-compose.yml + .env.example (ADR A7).
#
# THE BUCKET IS PRIVATE AND STAYS PRIVATE. The product decision is that *media is
# publicly readable*, not that *the bucket is public* (ADR A2): Block Public
# Access is fully on, ACLs are disabled, and the ONLY reader is the CloudFront
# distribution below (bucket policy conditioned on its ARN). A future ticket that
# "just needs" a public bucket policy is wrong.
#
# Design rationale: docs/ADMIN-CMS-ARCHITECTURE.md §A2/§A3/§A6/§A7.
# Spec: specs/TAM-83-media-storage-infra.md.

# S3 bucket names live in a GLOBAL namespace shared by every AWS account, so a
# generic "app-stage-media" is very likely already taken by a stranger — apply
# would fail with BucketAlreadyExists. Qualifying with the account id makes the
# name collision-proof without changing anything user-visible: every stored media
# URL is built from the CloudFront domain (MEDIA_PUBLIC_BASE_URL, see outputs.tf),
# never from the bucket name. Renaming is free now and expensive once content is
# uploaded, so it is done before the first apply.
data "aws_caller_identity" "current" {}

locals {
  media_bucket_name = "${local.name_prefix}-media-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "media" {
  bucket = local.media_bucket_name
}

# All four flags on. This is the load-bearing control: nothing else in this file
# is allowed to make the bucket reachable without CloudFront.
resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs disabled entirely — the bucket owner owns every object. Uploads arrive via
# presigned PUT from the task role, so there is no cross-account ACL story to
# support and object-ACL drift cannot make an object public.
resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# --- Deliberately absent: versioning + lifecycle ---------------------------------
#
# VERSIONING IS OFF (ADR A3) and there is no `aws_s3_bucket_versioning` resource:
# a new S3 bucket is unversioned, which is exactly the desired state. Versioning
# protects against overwrite and delete; we never overwrite (keys are immutable
# `<module>/<entity>/<uuid>.<ext>` — a replace is a NEW key and a NEW URL) and we
# never delete (ADR A6). It would be pure cost and noise.
#   >>> RECONSIDER THIS IF THE NEVER-DELETE RULE (ADR A6) IS EVER REVISITED. <<<
#
# NO LIFECYCLE EXPIRY RULE ON LIVE KEYS (ADR A6): S3 cannot distinguish an
# orphaned object from a live one, so any expiry rule would eventually delete an
# asset that an active row still points at. Orphans accumulate by design (risk
# A-R3); the `media_objects` ledger (TAM-84) is what makes a future reaper
# possible.
#
# THE SINGLE CARVE-OUT (TAM-267, media-optimizer.tf): objects under `incoming/`
# expire after 3 days. It cannot touch a live key because no live key can be
# under `incoming/` — that prefix only ever holds raw CMS uploads waiting for the
# upload optimizer, which writes the FINAL `<module>/<entity>/<uuid>.<ext>` key
# the row stores; validateOwnedUrl's key-shape check rejects an `incoming/` URL,
# so no row can reference one. The rule filters on that prefix alone and exists
# only where the optimizer does (`enable_media_upload_optimizer`). Any OTHER
# expiry rule remains forbidden.

# CORS — the browser PUTs to S3 directly, so the bucket itself must allow the
# admin origin. `media_cors_allowed_origins` is an explicit list and defaults to
# the localhost dev server (the admin panel is localhost-only this epic — epic
# Scope Decision 5). NEVER `*`: this is what stops any other web origin from
# driving an upload with a presign it somehow obtained.
resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_origins = concat(var.media_cors_allowed_origins, local.admin_static_origins)
    # PUT only — GET/HEAD are served by CloudFront, never from this origin.
    allowed_methods = ["PUT"]
    # Content-Type + Content-Length are SIGNED headers on the presigned PUT
    # (TAM-84), so the browser must be allowed to send them.
    allowed_headers = ["content-type", "content-length", "cache-control"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# --- CloudFront + OAC — the only reader ------------------------------------------

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.name_prefix}-media"
  description                       = "OAC for ${local.media_bucket_name} — the only principal allowed to read it"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Public + unauthenticated by design: this is how "media is public" (epic Scope
# Decision 4) is delivered WITHOUT a public bucket.
#
# RISK A-R1, ACCEPTED (product decision, 2026-07-16): everything here is
# world-readable forever. A Pro media URL, once leaked by any means, is a
# permanent public link with no entitlement check on fetch and no revocation.
# The entitlement gate protects DISCOVERY of the URL, not access to the object.
# NOTHING SECRET AND NO PII MAY EVER BE UPLOADED HERE — devotional media only.
resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name_prefix} media CDN (private S3 origin via OAC)"

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = local.media_bucket_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id = local.media_bucket_name
    # Uploads go direct to S3 — the CDN is read-only. No PUT through the CDN.
    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true
    # CDN reads are always https; a plaintext request is redirected, never served.
    viewer_protocol_policy = "redirect-to-https"
    # Managed-CachingOptimized honours the object's own Cache-Control, which
    # TAM-84 sets to `public, max-age=31536000, immutable` at upload time.
    cache_policy_id = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # No custom domain, no ACM cert — the distribution ships on its default
  # *.cloudfront.net domain (deferral D-D1: no domain exists yet). Changing this
  # later is a DNS/cert change + a MEDIA_PUBLIC_BASE_URL flip, and because keys
  # are immutable, old URLs can be redirected rather than rewritten.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  # Per-request access logs (TAM-266) — the bucket and why it has ACLs on live in
  # media-logs.tf. The ownership controls must exist before CloudFront validates
  # the target bucket's ACL support.
  logging_config {
    bucket          = aws_s3_bucket.media_cdn_logs.bucket_domain_name
    prefix          = "media/"
    include_cookies = false
  }

  depends_on = [aws_s3_bucket_ownership_controls.media_cdn_logs]

  # ##############################################################################
  # NO INVALIDATION. NOT A RESOURCE, NOT A PIPELINE STEP, NOT A SCRIPT.
  # A new asset is a new key is a new URL (ADR A3). "Overwrite in place +
  # invalidate" was rejected: invalidations are async, rate-limited, billed, and
  # routinely leave a stale asset in some edge for minutes — an editor replacing
  # a wrong image would see the old one and re-upload in a loop.
  # ADDING INVALIDATION HERE IS A REVIEW-BLOCKER.
  # ##############################################################################
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# The whole point: `s3:GetObject` for the distribution and nothing else. No
# `s3:ListBucket` for anyone — the bucket is not enumerable, only fetchable by
# exact key, and only through the CDN.
data "aws_iam_policy_document" "media_cdn_read" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    # Scoped to THIS distribution — another account's distribution cannot read
    # this bucket even though the service principal is shared account-wide.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.media_cdn_read.json

  # BPA's block_public_policy must be in place before a policy is attached, so
  # the bucket is never briefly attachable with a permissive one.
  depends_on = [aws_s3_bucket_public_access_block.media]
}
