#!/usr/bin/env bash
set -euo pipefail

# Local deploy: run the FULL stack in docker compose — the built API and
# click-events (HTTP, Amplitude V2) images against Postgres, Redis, and the
# floci-aws emulator (Secrets Manager, Kinesis).
#
# Usage:  pnpm deploy:local          (or: bash scripts/local-deploy.sh)
# Env:    POSTGRES_PORT (default 5432)  host port for Postgres
#         API_PORT      (default 3000)  host port for the API
#
# The click-events collector writes to floci-aws Kinesis (created below);
# the stack is otherwise Postgres + Redis + Secrets Manager.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PG_PORT="${POSTGRES_PORT:-5432}"
API_PORT="${API_PORT:-3000}"

echo "==> infra up (postgres, redis, floci-aws)"
docker compose up -d --wait postgres redis floci-aws

echo "==> migrations"
DATABASE_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/app" \
  pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "==> kinesis stream (floci-aws emulator)"
STREAM_NAME="${KINESIS_STREAM_NAME:-events}"
COMPOSE_NETWORK="$(docker inspect "$(docker compose ps -q floci-aws)" \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
docker run --rm --network "$COMPOSE_NETWORK" \
  -e AWS_ACCESS_KEY_ID=test -e AWS_SECRET_ACCESS_KEY=test \
  amazon/aws-cli --endpoint-url http://floci-aws:4566 --region ap-south-1 \
  kinesis create-stream --stream-name "$STREAM_NAME" --shard-count 1 \
  >/dev/null 2>&1 || true # idempotent: ResourceInUse on re-runs is fine

echo "==> build + start api + events images"
docker compose --profile deploy up -d --build api events

echo "==> waiting for health"
api_ok=""
events_ok=""
for _ in $(seq 1 60); do
  if [ -z "$api_ok" ] && curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    api_ok=1
    echo "✅ api healthy: http://localhost:${API_PORT}/health"
  fi
  if [ -z "$events_ok" ]; then
    events_status="$(docker inspect --format '{{.State.Health.Status}}' \
      "$(docker compose ps -q events)" 2>/dev/null || echo unknown)"
    if [ "$events_status" = "healthy" ]; then
      events_ok=1
      echo "✅ events healthy: http://localhost:${EVENTS_PORT:-3001}/health"
    fi
  fi
  if [ -n "$api_ok" ] && [ -n "$events_ok" ]; then
    echo "✅ local deploy healthy"
    exit 0
  fi
  sleep 1
done

echo "❌ stack did not become healthy (api=${api_ok:-no} events=${events_ok:-no})" >&2
docker compose logs api events --tail 40
exit 1
