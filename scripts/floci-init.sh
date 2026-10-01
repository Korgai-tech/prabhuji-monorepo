#!/bin/sh
set -eu

# Media bucket bootstrap for the floci-aws S3 emulator (TAM-83).
#
# Runs as the one-shot `floci-init` compose service on every `docker compose up
# -d`, and from `scripts/local-deploy.sh` for the deploy profile. Idempotent:
# re-running is a no-op, so it is safe on every start.
#
# It creates the local equivalent of the real media bucket (Terraform:
# infra/terraform/modules/stack/media.tf) and applies the SAME CORS rule, so a
# browser PUT that works locally works on stage for the same reason.
#
# floci is a DEV CONVENIENCE; S3 + CloudFront is the product. A locally uploaded
# asset is only reachable locally — an http://localhost:4566/... URL is
# meaningless to a phone on a mobile network. See docs/ADMIN-CMS-ARCHITECTURE.md
# §A7 and the local-vs-real table in specs/TAM-83-media-storage-infra.md.

ENDPOINT="${FLOCI_ENDPOINT_URL:-http://floci-aws:4566}"
BUCKET="${MEDIA_BUCKET:-app-local-media}"
REGION="${AWS_REGION:-ap-south-1}"
ORIGINS="${MEDIA_CORS_ALLOWED_ORIGINS:-http://localhost:4200}"

aws_s3api() {
  aws --endpoint-url "$ENDPOINT" --region "$REGION" s3api "$@"
}

# Idempotent: floci returns BucketAlreadyOwnedByYou on re-runs, which is fine.
if aws_s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "floci-init: bucket '$BUCKET' already exists"
else
  aws_s3api create-bucket \
    --bucket "$BUCKET" \
    --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  echo "floci-init: created bucket '$BUCKET'"
fi

# "a,b" -> "a","b" — MEDIA_CORS_ALLOWED_ORIGINS is a comma-separated list,
# mirroring Terraform's media_cors_allowed_origins (an explicit list, never "*").
origins_json=$(printf '%s' "$ORIGINS" | sed 's/[^,]*/"&"/g')

# Mirrors infra/terraform/modules/stack/media.tf's aws_s3_bucket_cors_configuration:
# PUT only (GET/HEAD are the CDN's job on stage/prod), Content-Type allowed
# because it is a SIGNED header on the presigned PUT (TAM-84).
aws_s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --cors-configuration "{
    \"CORSRules\": [
      {
        \"AllowedOrigins\": [${origins_json}],
        \"AllowedMethods\": [\"PUT\"],
        \"AllowedHeaders\": [\"content-type\", \"content-length\", \"cache-control\"],
        \"ExposeHeaders\": [\"ETag\"],
        \"MaxAgeSeconds\": 3000
      }
    ]
  }" >/dev/null
echo "floci-init: CORS on '$BUCKET' allows PUT from ${ORIGINS}"
