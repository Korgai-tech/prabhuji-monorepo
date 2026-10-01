---
description: Check local docker-compose environment status (Postgres, Redis, floci-aws)
allowed-tools: [Read, Bash, Grep, Glob]
---

Check the health of the local development environment defined in `docker-compose.yml`.

## Steps

### 1. Service Status

```bash
docker compose ps
```

Expected services: `postgres` (:5432, healthcheck `pg_isready`), `redis` (:6379, healthcheck `redis-cli ping`), `floci-aws` (:4566, AWS emulator — Secrets Manager et al.).

### 2. If Something Is Down

```bash
docker compose up -d                      # start/restart everything
docker compose logs <service> --tail 50   # inspect a failing service
```

### 3. API Reachability (when `pnpm nx serve api` is running)

```bash
curl -s http://localhost:3000/health   # -> {"status":"ok"}
```

### 4. Database Migrations Current?

```bash
pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

## Report

Per service:

- ✅ running and healthy
- ⚠️ running but unhealthy → check logs
- ❌ not running → `docker compose up -d`

Note: external integrations are opt-in via env flags (`ENABLE_REDIS`, `ENABLE_KAFKA`, `ENABLE_SECRET_MANAGER` — see `.env.example`). A service can be up while the API deliberately ignores it.
