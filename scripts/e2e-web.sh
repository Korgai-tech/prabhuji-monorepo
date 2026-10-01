#!/usr/bin/env bash
set -euo pipefail

# Web E2E: Playwright drives the admin SPA against the real API + Postgres +
# floci S3. Playwright boots both app servers (see
# apps/admin-e2e/playwright.config.ts); this script ensures the infra they need
# is up first: a migrated database AND a floci media bucket whose CORS allows a
# browser PUT from the admin origin.
#
# Usage:  pnpm e2e:web            (extra args pass through to playwright)
# Env:    POSTGRES_PORT (default 5432), E2E_WEB_PORT (default 4310)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PG_PORT="${POSTGRES_PORT:-5432}"
WEB_PORT="${E2E_WEB_PORT:-4310}"
export E2E_WEB_PORT="$WEB_PORT"

echo "==> postgres + floci up"
docker compose up -d --wait postgres floci-aws

echo "==> media bucket + CORS for the e2e admin origin (http://localhost:${WEB_PORT})"
# Re-run the one-shot floci-init (idempotent: creates the bucket if absent, then
# applies CORS) with the CORS origin set to THIS run's admin origin, so the
# browser's presigned PUT is not blocked cross-origin. Runs synchronously.
docker compose run --rm --no-deps \
  -e MEDIA_CORS_ALLOWED_ORIGINS="http://localhost:${WEB_PORT}" \
  floci-init

echo "==> migrate"
DATABASE_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/app" \
  pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "==> playwright"
export E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/app"
cd apps/admin-e2e
pnpm exec playwright test "$@"
