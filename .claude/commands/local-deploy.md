---
description: Build and run the full stack locally (API image + Postgres/Redis/floci-aws emulator)
allowed-tools: [Read, Bash, Grep, Glob]
---

Deploy the whole stack locally: the BUILT API image (not tsx) against docker-compose infra with the floci-aws emulator standing in for AWS (Secrets Manager; Kafka opt-in).

## Run

```bash
pnpm deploy:local
```

This (see `scripts/local-deploy.sh`):

1. `docker compose up -d --wait postgres redis floci-aws`
2. `pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma`
3. `docker compose --profile deploy up -d --build api` (image from `apps/api/Dockerfile`)
4. Polls `GET /health` until healthy (fails with `docker compose logs api` after 30s)

Host-port overrides when defaults are taken: `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT`.

## Verify

```bash
curl -s localhost:3000/health   # {"status":"ok"}
curl -s localhost:3000/ready    # {"status":"ready"}
docker compose ps               # api + infra all running/healthy
```

## Teardown / logs / rebuild

```bash
docker compose --profile deploy down          # stop everything (add -v to drop DB data)
docker compose logs api --tail 50             # API logs
docker compose --profile deploy up -d --build api   # rebuild after code changes
```

## Notes

- The runtime image ships the Prisma CLI — the same image can run `prisma migrate deploy` (e.g. as a one-off ECS task in production).
- Kafka is opt-in: floci-aws MSK spawns a redpanda sidecar via the host Docker socket; set `ENABLE_KAFKA=true` + `KAFKA_BROKERS` when needed.
- Production is Terraform (`infra/terraform/README.md`) — this command is the local mirror of that stack.
