#!/usr/bin/env bash
set -euo pipefail

# Provision / update ONE AWS environment's Terraform infrastructure, then run the
# Postgres (Prisma) migration. A single command wraps `terraform init` + `plan` +
# `apply` (create AND update — safe to re-run) so you never run raw terraform by
# hand. Application images are built & pushed by the CI/CD pipeline (push to the
# `stage` / `main` branch), NOT here.
#
# Usage:
#   ./scripts/deploy-infra.sh <stage|prod>     (or: pnpm deploy:infra <stage|prod>)
#   ENV=prod ./scripts/deploy-infra.sh          # env may also come from $ENV
#
# Required:
#   * AWS credentials on the standard chain — AWS_PROFILE=... (or AWS_ACCESS_KEY_ID
#     + AWS_SECRET_ACCESS_KEY). The script aborts if `aws sts get-caller-identity`
#     fails.
#
# Optional env vars (forwarded to Terraform as -var only when set):
#   AWS_REGION                       AWS region (default: ap-south-1)
#   IMAGE_TAG                        deploy a specific image tag instead of the
#                                    tfvars default (:latest) — applied to BOTH
#                                    app-<env>-{api,events}-images (e.g. a commit sha)
#   CLICKHOUSE_HOST                  ClickHouse Cloud host  (warehouse migrations)
#   CLICKHOUSE_PASSWORD              ClickHouse Cloud password (stored as a secret)
#   ENABLE_CLICKPIPE=true            provision the ClickPipe cross-account reader role
#   CLICKPIPE_TRUSTED_PRINCIPAL_ARN  ClickHouse principal ARN (with ENABLE_CLICKPIPE)
#   CLICKPIPE_EXTERNAL_ID            sts:ExternalId for the ClickPipe trust
#   AUTO_APPROVE=1                   skip the prod typed-confirmation prompt (CI)
#   SKIP_MIGRATE=1                   apply infra only; don't run the DB migration
#
# Steps: 1 preflight · 2 init · 3 plan · 4 apply (prod: typed confirmation) ·
#        5 db migrate (one-off Fargate task; skipped if no api image in ECR yet) ·
#        6 health (best-effort GET <api_url>/health)
#        (before 2: build the media-optimizer Lambda bundle + ffmpeg layer, TAM-267)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV="${1:-${ENV:-}}"
case "$ENV" in
  stage | prod) ;;
  *)
    echo "usage: $0 <stage|prod>   (or ENV=<stage|prod> $0)" >&2
    exit 2
    ;;
esac

REGION="${AWS_REGION:-ap-south-1}"
ENV_DIR="$REPO_ROOT/infra/terraform/envs/$ENV"
CLUSTER="app-$ENV"
API_NAME="app-$ENV-api" # ECS task-def family AND container name

# --- 1. preflight ------------------------------------------------------------
echo "==> preflight ($ENV / $REGION)"
command -v terraform >/dev/null || {
  echo "❌ terraform not found on PATH" >&2
  exit 1
}
command -v aws >/dev/null || {
  echo "❌ aws CLI not found on PATH" >&2
  exit 1
}
ACCOUNT="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)" || {
  echo "❌ AWS credentials not usable — set AWS_PROFILE or AWS_ACCESS_KEY_ID/SECRET" >&2
  exit 1
}
echo "    account=$ACCOUNT  cluster=$CLUSTER"

# --- assemble terraform vars from the environment ----------------------------
TF_ARGS=(-var "region=$REGION")
if [ -n "${IMAGE_TAG:-}" ]; then
  REG="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
  # All THREE services, not two. The pipeline builds and pushes api, events and
  # admin from the same commit, so a pinned-tag rollback that leaves admin on
  # :latest reverts the API to the last-good build while the CMS keeps serving
  # the broken one — the half-working safety net is worse than none.
  TF_ARGS+=(-var "api_image=$REG/app-$ENV-api-images:$IMAGE_TAG"
    -var "events_image=$REG/app-$ENV-events-images:$IMAGE_TAG"
    -var "admin_image=$REG/app-$ENV-admin-images:$IMAGE_TAG")
  echo "    images pinned to :$IMAGE_TAG"
fi
[ -n "${CLICKHOUSE_HOST:-}" ] && TF_ARGS+=(-var "clickhouse_host=$CLICKHOUSE_HOST")
[ -n "${CLICKHOUSE_PASSWORD:-}" ] && TF_ARGS+=(-var "clickhouse_password=$CLICKHOUSE_PASSWORD")
if [ "${ENABLE_CLICKPIPE:-}" = "true" ]; then
  TF_ARGS+=(-var "enable_clickpipe=true"
    -var "clickpipe_trusted_principal_arn=${CLICKPIPE_TRUSTED_PRINCIPAL_ARN:-}"
    -var "clickpipe_external_id=${CLICKPIPE_EXTERNAL_ID:-}")
fi

# --- build Lambda artifacts (TAM-267 media optimizer) --------------------------
# Terraform zips the function bundle and uploads the ffmpeg layer AT PLAN TIME
# (infra/terraform/modules/stack/media-optimizer.tf), so both must exist before
# `terraform plan` whenever enable_media_upload_optimizer is on. Built on every
# run — cheap, and it guarantees the plan ships the checked-out code rather than
# a stale dist/. The layer download is cached and sha256-pinned; the zip is
# byte-reproducible, so an unchanged build is not a diff.
echo "==> build media-optimizer Lambda bundle + ffmpeg layer (needed at plan time)"
(cd "$REPO_ROOT" && pnpm nx build media-optimizer --skip-nx-cache >/dev/null) || {
  echo "❌ media-optimizer build failed — run \`pnpm nx build media-optimizer\` to see why" >&2
  exit 1
}
bash "$REPO_ROOT/scripts/build-ffmpeg-layer.sh" || {
  echo "❌ ffmpeg layer build failed (scripts/build-ffmpeg-layer.sh)" >&2
  exit 1
}

cd "$ENV_DIR"

# --- 2. init (idempotent — installs modules + providers) ---------------------
echo "==> terraform init"
terraform init -input=false >/dev/null

# --- 3. plan -----------------------------------------------------------------
echo "==> terraform plan"
terraform plan -input=false -out=.tfplan "${TF_ARGS[@]}"

# --- prod safety gate --------------------------------------------------------
if [ "$ENV" = "prod" ] && [ "${AUTO_APPROVE:-}" != "1" ]; then
  echo ""
  printf 'This APPLIES the plan above to PRODUCTION. Type "prod" to continue: '
  read -r reply
  [ "$reply" = "prod" ] || {
    echo "aborted."
    rm -f .tfplan
    exit 1
  }
fi

# --- 4. apply the saved plan -------------------------------------------------
echo "==> terraform apply"
terraform apply -input=false .tfplan
rm -f .tfplan

# --- 5. db migrate (Prisma migrate deploy as a one-off Fargate task) ---------
if [ "${SKIP_MIGRATE:-}" = "1" ]; then
  echo "==> db migrate: skipped (SKIP_MIGRATE=1)"
elif ! aws ecr list-images --repository-name "app-$ENV-api-images" --region "$REGION" \
  --query 'imageIds[0].imageDigest' --output text 2>/dev/null | grep -q sha256; then
  branch="$([ "$ENV" = prod ] && echo main || echo stage)"
  echo "==> db migrate: skipped — no api image in ECR yet."
  echo "    push to '$branch' so the pipeline builds one, then re-run to migrate."
else
  echo "==> db migrate (one-off Fargate task)"
  SUBNETS="$(terraform output -json private_subnet_ids | tr -d '[]" \n')"
  SG="$(terraform output -raw api_task_security_group_id)"
  NETCFG="awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}"
  OVERRIDES="{\"containerOverrides\":[{\"name\":\"$API_NAME\",\"command\":[\"npx\",\"prisma\",\"migrate\",\"deploy\",\"--schema\",\"./prisma/schema.prisma\"]}]}"
  TASK_ARN="$(aws ecs run-task --region "$REGION" --cluster "$CLUSTER" \
    --launch-type FARGATE --task-definition "$API_NAME" \
    --network-configuration "$NETCFG" --overrides "$OVERRIDES" \
    --query 'tasks[0].taskArn' --output text)"
  [ -n "$TASK_ARN" ] && [ "$TASK_ARN" != "None" ] || {
    echo "❌ failed to start migrate task" >&2
    exit 1
  }
  echo "    task ${TASK_ARN##*/} — waiting for it to stop…"
  aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN"
  # Select the exit code BY CONTAINER NAME, not containers[0]. When telemetry is
  # on the task def carries a second container (the otel-collector sidecar), and
  # describe-tasks does not guarantee container ordering — reading [0] could pick
  # up the stopped collector's non-zero code and abort a healthy deploy.
  CODE="$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN" \
    --query "tasks[0].containers[?name=='$API_NAME'].exitCode | [0]" --output text)"
  [ "$CODE" = "0" ] || {
    echo "❌ migration exited $CODE — see CloudWatch /ecs/$API_NAME" >&2
    exit 1
  }
  echo "    ✅ migration applied"
fi

# --- 6. health check (best-effort; app may still be pulling images) ----------
API_URL="$(terraform output -raw api_url 2>/dev/null || true)"
if [ -n "$API_URL" ]; then
  echo "==> health check $API_URL/health (best-effort)"
  ok=""
  for _ in $(seq 1 30); do
    if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 2
  done
  [ -n "$ok" ] && echo "    ✅ api healthy" ||
    echo "    ⚠ api not healthy yet — services may still be pulling images or need a pipeline push (infra + migrate still succeeded)"
fi

echo ""
echo "✅ $ENV infra applied.  Endpoints:  (cd $ENV_DIR && terraform output)"
