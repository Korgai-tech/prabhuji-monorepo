# Media upload optimizer (TAM-267) — compress video/audio BEFORE the CMS saves its URL.
#
# WHY. The first prod CDN logs (TAM-266) put 92% of media egress on ONE paywall
# hero upload: a 32.5 MB 1080p HEVC clip with no faststart. TAM-265 re-encodes
# what is already stored; nothing stopped the next heavy upload. Editors cannot
# be expected to hand-tune bitrates, so every optimisable upload now goes through
# the same quality ladder as the backfill (`@prabhuji/media-profiles`) on its way
# in.
#
# FLOW (spec: specs/TAM-267-media-upload-optimizer.md):
#
#   CMS ─presign─► api  (signs incoming/<final key>, returns the FINAL key/url)
#   CMS ─PUT─────► s3://<media>/incoming/<final key>
#                     │ ObjectCreated, prefix incoming/   (aws_s3_bucket_notification)
#                     ▼
#               Lambda media-optimizer  (Node 22 arm64 + ffmpeg layer)
#                     │ over budget + output accepted → PUT <final key> (compressed)
#                     │ anything else                 → CopyObject → <final key>
#   CMS polls GET /admin/media/status until the final key exists, then saves it.
#
# FAIL-OPEN. Every path with a source ends with the final key existing — an
# in-budget file, an ffmpeg crash or timeout, an output that drifts or saves
# < 20% all end in a byte copy of the original. The worst case is exactly the
# pre-TAM-267 behaviour. Only a failed COPY throws, and Lambda's async retry
# (2 attempts by default) runs the record again.
#
# IDEMPOTENT. S3 delivers events at least once. An existing final key is a
# no-op, and every write is `If-None-Match: *` — keys stay immutable (ADR A3)
# even when two deliveries race.
#
# OFF BY DEFAULT. `enable_media_upload_optimizer` gates EVERYTHING in this file
# AND the api's MEDIA_OPTIMIZE_UPLOADS flag (services.tf), so the api never
# signs an `incoming/` upload in an env where nothing would pick it up — that
# would leave the editor polling for a final key that never appears.
#
# ARTIFACTS MUST EXIST AT PLAN TIME. The function zip is archived from the esbuild
# bundle (`pnpm nx build media-optimizer` → apps/media-optimizer/dist/index.mjs)
# and the layer is `scripts/build-ffmpeg-layer.sh` →
# apps/media-optimizer/dist-layer/ffmpeg-layer.zip. `scripts/deploy-infra.sh`
# builds both before `terraform plan`; running terraform by hand, build them
# first (the preconditions below say so). NOTE the CodeBuild pipeline does NOT
# ship this function — it deploys images, never Terraform — so a code change to
# apps/media-optimizer reaches AWS only through `pnpm deploy:infra <env>`.

locals {
  media_optimizer_count = var.enable_media_upload_optimizer ? 1 : 0
  media_optimizer_name  = "${local.name_prefix}-media-optimizer"

  # path.module is relative to the env root (envs/<env>), so this climbs
  # modules/stack → terraform → infra → the repo root.
  media_optimizer_app_dir    = "${path.module}/../../../../apps/media-optimizer"
  media_optimizer_bundle     = "${local.media_optimizer_app_dir}/dist/index.mjs"
  media_optimizer_layer_zip  = "${local.media_optimizer_app_dir}/dist-layer/ffmpeg-layer.zip"
  media_optimizer_layer_sha  = fileexists(local.media_optimizer_layer_zip) ? filesha256(local.media_optimizer_layer_zip) : "missing"
  media_optimizer_layer_hash = fileexists(local.media_optimizer_layer_zip) ? filebase64sha256(local.media_optimizer_layer_zip) : null
}

# --- Artifacts bucket ---------------------------------------------------------------
# The ffmpeg layer is ~49 MB zipped. Lambda accepts at most 50 MB INLINE (and the
# API call base64-inflates it on the way), so one ffmpeg upgrade would tip an
# inline upload over the edge. Publishing from S3 has no such ceiling. A dedicated
# PRIVATE bucket, not the media bucket: the media bucket is world-readable through
# CloudFront (media.tf, ADR A2), and a build artifact has no business there.

resource "aws_s3_bucket" "lambda_artifacts" {
  count  = local.media_optimizer_count
  bucket = "${local.name_prefix}-lambda-artifacts-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "lambda_artifacts" {
  count  = local.media_optimizer_count
  bucket = aws_s3_bucket.lambda_artifacts[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "lambda_artifacts" {
  count  = local.media_optimizer_count
  bucket = aws_s3_bucket.lambda_artifacts[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lambda_artifacts" {
  count  = local.media_optimizer_count
  bucket = aws_s3_bucket.lambda_artifacts[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Content-addressed key: a new ffmpeg build is a new object (and a new layer
# version); the same build re-uploads nothing. The build script's zip is
# byte-reproducible, so an unchanged pin never shows up as a diff.
resource "aws_s3_object" "ffmpeg_layer" {
  count  = local.media_optimizer_count
  bucket = aws_s3_bucket.lambda_artifacts[0].id
  key    = "layers/ffmpeg-${substr(local.media_optimizer_layer_sha, 0, 16)}.zip"
  source = local.media_optimizer_layer_zip

  lifecycle {
    precondition {
      condition     = fileexists(local.media_optimizer_layer_zip)
      error_message = "apps/media-optimizer/dist-layer/ffmpeg-layer.zip is missing. Run scripts/build-ffmpeg-layer.sh (pnpm deploy:infra does this for you) before planning with enable_media_upload_optimizer = true."
    }
  }
}

# ffmpeg + ffprobe, mounted at /opt/bin. A PINNED, sha256-verified static arm64
# build — see scripts/build-ffmpeg-layer.sh for which build and why.
resource "aws_lambda_layer_version" "ffmpeg" {
  count                    = local.media_optimizer_count
  layer_name               = "${local.name_prefix}-ffmpeg"
  description              = "Static ffmpeg + ffprobe (linux arm64) for ${local.media_optimizer_name}"
  s3_bucket                = aws_s3_object.ffmpeg_layer[0].bucket
  s3_key                   = aws_s3_object.ffmpeg_layer[0].key
  source_code_hash         = local.media_optimizer_layer_hash
  compatible_runtimes      = ["nodejs22.x"]
  compatible_architectures = ["arm64"]

  # Layer versions are immutable; a new build is a new version. Publish it and
  # repoint the function before the old version is removed.
  lifecycle {
    create_before_destroy = true
  }
}

# --- Function ------------------------------------------------------------------------

data "archive_file" "media_optimizer" {
  count       = local.media_optimizer_count
  type        = "zip"
  source_file = local.media_optimizer_bundle
  output_path = "${local.media_optimizer_app_dir}/dist/function.zip"

  lifecycle {
    precondition {
      condition     = fileexists(local.media_optimizer_bundle)
      error_message = "apps/media-optimizer/dist/index.mjs is missing. Run `pnpm nx build media-optimizer` (pnpm deploy:infra does this for you) before planning with enable_media_upload_optimizer = true."
    }
  }
}

# Created here rather than on first invocation so the retention is ours. 30 days,
# like every other log group in this repo. One JSON line per upload:
#   filter action = "compressed" | stats sum(bytesIn - bytesOut)
resource "aws_cloudwatch_log_group" "media_optimizer" {
  count             = local.media_optimizer_count
  name              = "/aws/lambda/${local.media_optimizer_name}"
  retention_in_days = 30
}

data "aws_iam_policy_document" "media_optimizer_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "media_optimizer" {
  count              = local.media_optimizer_count
  name               = "${local.media_optimizer_name}-role"
  assume_role_policy = data.aws_iam_policy_document.media_optimizer_assume.json
}

# Deliberately minimal, in the api's style (services.tf):
#
#   s3:GetObject    — read the upload under incoming/, and HEAD final keys (S3
#                     authorizes HeadObject via s3:GetObject). Also the source
#                     side of CopyObject.
#   s3:PutObject    — write the final key (PutObject, and the destination side
#                     of CopyObject). Final keys live under every module prefix,
#                     hence bucket/*.
#   s3:ListBucket   — NOT to list anything (the code never does). Without it S3
#                     answers a HEAD/GET on a MISSING key with 403 instead of 404,
#                     so "final key not written yet" and "source already gone"
#                     would be indistinguishable from a broken policy.
#   DENY PutObject on incoming/* — a write there would re-trigger this function.
#                     The code never writes there; the deny makes an event loop
#                     STRUCTURALLY impossible rather than merely unlikely.
#
# NOT granted: s3:DeleteObject (ADR A6 — nothing deletes; `incoming/` is cleaned
# by the lifecycle rule below, not by this role), and nothing outside this env's
# media bucket.
data "aws_iam_policy_document" "media_optimizer" {
  statement {
    sid       = "ReadUploadsAndHeadFinalKeys"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]
  }

  statement {
    sid       = "WriteFinalKeys"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.media.arn}/*"]
  }

  statement {
    sid       = "MissingKeyIs404Not403"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
  }

  statement {
    sid       = "NeverWriteIncoming"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.media.arn}/incoming/*"]
  }

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.media_optimizer_name}:*"]
  }
}

resource "aws_iam_role_policy" "media_optimizer" {
  count  = local.media_optimizer_count
  name   = "media-optimizer"
  role   = aws_iam_role.media_optimizer[0].id
  policy = data.aws_iam_policy_document.media_optimizer.json
}

# SIZING. Memory is also Lambda's CPU dial: 6144 MB ≈ 3.5 vCPU, which is what
# makes x264 `-preset slow` finish a 200 MB (the upload cap) 4K status clip well
# inside 900 s. The service kills ffmpeg with 60 s to spare and copies the
# original instead, so even a clip too long to encode still lands (fail-open)
# rather than timing the invocation out. Ephemeral /tmp 4096 MB holds the source
# (≤ 200 MB) and the output with a wide margin. Reserved concurrency 5 caps the
# spend of a bulk upload — further events queue (async invokes wait up to 6 h),
# they are not dropped.
#
# NOT in a VPC: it talks only to S3's public endpoint, so no NAT hop and no ENIs.
resource "aws_lambda_function" "media_optimizer" {
  count         = local.media_optimizer_count
  function_name = local.media_optimizer_name
  description   = "TAM-267: compress CMS video/audio uploads (incoming/ → final key), fail-open"
  role          = aws_iam_role.media_optimizer[0].arn

  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"

  filename         = data.archive_file.media_optimizer[0].output_path
  source_code_hash = data.archive_file.media_optimizer[0].output_base64sha256
  layers           = [aws_lambda_layer_version.ffmpeg[0].arn]

  memory_size                    = 6144
  timeout                        = 900
  reserved_concurrent_executions = 5

  ephemeral_storage {
    size = 4096
  }

  environment {
    variables = {
      MEDIA_BUCKET = aws_s3_bucket.media.bucket
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.media_optimizer[0].name
  }

  depends_on = [aws_iam_role_policy.media_optimizer]
}

# --- Trigger -------------------------------------------------------------------------

resource "aws_lambda_permission" "media_optimizer_s3" {
  count          = local.media_optimizer_count
  statement_id   = "AllowMediaBucketInvoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.media_optimizer[0].function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.media.arn
  source_account = data.aws_caller_identity.current.account_id
}

# A bucket has exactly ONE notification configuration, and this resource owns
# all of it. A future notification on the media bucket must be added HERE, not
# as a second aws_s3_bucket_notification — the two would overwrite each other on
# every apply.
resource "aws_s3_bucket_notification" "media" {
  count  = local.media_optimizer_count
  bucket = aws_s3_bucket.media.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.media_optimizer[0].arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "incoming/"
  }

  depends_on = [aws_lambda_permission.media_optimizer_s3]
}

# --- incoming/ expiry: the ONE lifecycle rule on the media bucket --------------------
#
# ADR A6 forbids expiry on the media bucket because S3 cannot tell an orphan
# from an object a row still points at. `incoming/` is the exception BY
# CONSTRUCTION: nothing ever stores an `incoming/` key or URL. The presign
# returns the FINAL key/url, the media_objects ledger records the final key, and
# validateOwnedUrl's key-shape check is anchored on `^<module>/<entity>/<uuid>`,
# which an `incoming/…` key cannot match — so no row can be saved pointing at
# one. An `incoming/` object is only ever read by the optimizer, within minutes
# of arriving. 3 days covers a weekend of retries and investigation, then the
# untouched original goes; its final key (compressed or copied) is unaffected.
#
# The filter is the prefix and nothing else; no other key in the bucket can
# match it. Like the notification above, a bucket has exactly ONE lifecycle
# configuration — any future rule must be added to THIS resource.
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  count  = local.media_optimizer_count
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "expire-incoming-uploads"
    status = "Enabled"

    filter {
      prefix = "incoming/"
    }

    expiration {
      days = 3
    }
  }
}
