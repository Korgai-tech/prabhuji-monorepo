# Access logs for the media CDN (TAM-266).
#
# The media distribution served ~1.7 TB/week on prod with logging OFF, so nobody
# could say which objects the bytes went to. These logs are measurement data for
# the egress work (TAM-264 loop re-download fix, TAM-265 re-encode backfill) —
# read them with `scripts/cdn-log-report.sh <env> [days]`.
#
# CloudFront STANDARD (legacy) logging, not v2 log delivery: v2 must be created
# in us-east-1 and this module has no us-east-1 provider alias. Legacy logging
# writes to a bucket in any region, but needs ACLs ON the target bucket
# (CloudFront grants the `awslogsdelivery` account write through an ACL). Hence a
# DEDICATED bucket: the media bucket stays BucketOwnerEnforced (ADR A2) and is
# not touched by this file.
#
# Spec: specs/TAM-266-media-cdn-access-logs.md.

resource "aws_s3_bucket" "media_cdn_logs" {
  bucket = "${local.name_prefix}-media-cdn-logs-${data.aws_caller_identity.current.account_id}"
}

# Still fully on: the awslogsdelivery grant is an account grant, not a public
# ACL, so BPA does not block it.
resource "aws_s3_bucket_public_access_block" "media_cdn_logs" {
  bucket = aws_s3_bucket.media_cdn_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# BucketOwnerPreferred (not Enforced) — legacy CloudFront logging refuses a
# bucket with ACLs disabled. Deliberately NO `aws_s3_bucket_acl`: CloudFront adds
# its own grant when logging is enabled, and a Terraform-managed ACL would strip
# it on the next apply.
resource "aws_s3_bucket_ownership_controls" "media_cdn_logs" {
  bucket = aws_s3_bucket.media_cdn_logs.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_cdn_logs" {
  bucket = aws_s3_bucket.media_cdn_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Measurement data, not an audit trail: 90 days covers a before/after for the
# egress fixes with margin.
resource "aws_s3_bucket_lifecycle_configuration" "media_cdn_logs" {
  bucket = aws_s3_bucket.media_cdn_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }
  }
}
