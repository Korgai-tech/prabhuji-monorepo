# The admin CMS as a static site (TAM-172): a private S3 bucket behind CloudFront
# with an origin access control, the same shape as media.tf. The SPA is built in
# CI (VITE_BASE_PATH=/ VITE_API_URL=https://<api domain>) and synced here; every
# unknown path falls back to index.html for client-side routing. It runs alongside
# the nginx container on Fargate until `admin_on_fargate` is flipped off. Custom
# domain (ACM in us-east-1 + a CNAME in the external DNS) is a follow-up; until
# then the *.cloudfront.net hostname is HTTPS out of the box.

locals {
  admin_static_bucket_name = "${local.name_prefix}-admin-${data.aws_caller_identity.current.account_id}"
  # The api's CORS + the media bucket's CORS must admit the new origin.
  admin_static_origins = var.enable_admin_static ? ["https://${aws_cloudfront_distribution.admin[0].domain_name}"] : []
}

resource "aws_s3_bucket" "admin" {
  count  = var.enable_admin_static ? 1 : 0
  bucket = local.admin_static_bucket_name
}

resource "aws_s3_bucket_public_access_block" "admin" {
  count  = var.enable_admin_static ? 1 : 0
  bucket = aws_s3_bucket.admin[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "admin" {
  count  = var.enable_admin_static ? 1 : 0
  bucket = aws_s3_bucket.admin[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "admin" {
  count  = var.enable_admin_static ? 1 : 0
  bucket = aws_s3_bucket.admin[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "admin" {
  count                             = var.enable_admin_static ? 1 : 0
  name                              = "${local.name_prefix}-admin"
  description                       = "OAC for ${local.admin_static_bucket_name} — the only principal allowed to read it"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "admin" {
  count               = var.enable_admin_static ? 1 : 0
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} admin CMS (static SPA, private S3 origin via OAC)"
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.admin[0].bucket_regional_domain_name
    origin_id                = local.admin_static_bucket_name
    origin_access_control_id = aws_cloudfront_origin_access_control.admin[0].id
  }

  default_cache_behavior {
    target_origin_id       = local.admin_static_bucket_name
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # SPA routing: S3 answers 403 (with OAC) or 404 for any deep link; serve the
  # app shell instead and let the router take it from there. Not cached, so a
  # fresh deploy is visible right after the invalidation.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "admin_cdn_read" {
  count = var.enable_admin_static ? 1 : 0

  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.admin[0].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.admin[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "admin" {
  count  = var.enable_admin_static ? 1 : 0
  bucket = aws_s3_bucket.admin[0].id
  policy = data.aws_iam_policy_document.admin_cdn_read[0].json
}
