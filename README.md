# monorepo-boilerplate

Nx + pnpm monorepo. Phase 1 delivers `apps/api` (Fastify 5 + Prisma + Zod) with an example `auth` module.

## Quickstart

```bash
pnpm install
cp .env.example .env            # then edit JWT_SECRET + DATABASE_URL
docker run --rm -d --name db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:18-alpine
pnpm prisma migrate deploy --schema apps/api/prisma/schema.prisma
pnpm nx serve api
```

## Test

```bash
pnpm verify                                    # all Node gates: arch + OpenAPI drift + typecheck + lint + unit tests
pnpm nx test api --configuration=unit          # fast, mocked
pnpm nx test api --configuration=integration   # testcontainers Postgres (needs Docker)
pnpm e2e:web                                   # Playwright: admin UI vs real API (boots both servers)
pnpm e2e:android                               # Flutter integration test (needs emulator + running API)
pnpm check:arch-boundaries                     # layering gate
pnpm nx typecheck api
pnpm nx build api
```

## Local development

Bring up Postgres, Redis, and the floci-aws emulator (Secrets Manager + the rest of the AWS APIs):

    docker compose up -d

Then run the API from source (watch mode):

    pnpm nx serve api    # boots http://localhost:3000, GET /health -> {"status":"ok"}

The click-events collector (`apps/events`) runs the same way (needs `EVENTS_API_KEY` in `.env`):

    pnpm nx serve events                        # HTTP on :3001 — Amplitude V2 at /2/httpapi + GET /health
    pnpm tsx apps/events/scripts/smoke.ts       # demo client: health + Amplitude-shaped click batch

The Flutter app tracks clicks through `amplitude_flutter` v4 pointed at it via `serverUrl` (`EVENTS_URL`/`EVENTS_API_KEY` dart-defines; see `apps/mobile/lib/core/analytics.dart`).

Everything external is off by default. Opt in per-service via env flags (see `.env.example`):

- `ENABLE_REDIS=true` + `REDIS_URL`
- `ENABLE_SECRETS_MANAGER=true` (+ `AWS_ENDPOINT_URL=http://localhost:4566` and dummy `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY=test` locally)
- `ENABLE_KINESIS=true` + `KINESIS_STREAM_NAME` (apps/events click-events sink → ClickPipe → ClickHouse)
- `ENABLE_KAFKA=true` + `KAFKA_BROKERS` (🔜 planned — the API's internal domain-event bus; see `docs/EVENT-ARCHITECTURE.md`)

> The floci-aws emulator serves the AWS APIs (Secrets Manager, S3, SQS, Kinesis, ...) on `:4566`; its container-backed services (Lambda, RDS, ElastiCache, ECS) use the host Docker socket (mounted in `docker-compose.yml`).

## Deploy

```bash
pnpm deploy:local    # full stack in docker compose: built API + events images + Postgres/Redis/floci-aws emulator (incl. Kinesis stream)
pnpm nx start api    # run the built artifact directly (node apps/api/dist/index.js)
```

Production infra is Terraform (`infra/terraform/`): two isolated environments (`envs/stage`, `envs/prod`), each a dedicated VPC running the full stack via `modules/stack` (ALB, ECS cluster, RDS Postgres, ElastiCache Redis, Kinesis, MSK, Secrets Manager) with a `fargate-service` module per backend service — `api` (catch-all) and `events` (`/2/httpapi*`) behind one path-routed ALB per env. See `infra/terraform/README.md`. Stage auto-deploys from the `stage` branch via AWS CodeBuild (`modules/cicd`); `main` is the prod line — prod deploys stay manual and pinned. Host-port overrides for local stacks: `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT`.

## Layout

`apps/api` — Fastify app. `apps/api/src/core/<mod>` — feature modules (Route→Controller→Service→Repository→DB). `apps/api/src/shared` — infrastructure only (config, db, errors, logging, response envelope, workspace service registry). `apps/api/prisma` — Prisma schema + migrations.

`apps/events` — click-events collector (Handler→Service→Repository; Kinesis sink). Its HTTP endpoint implements Amplitude's V2 API so the mobile Amplitude SDK posts straight to it (`serverUrl`).

**Events**: two independent pipes — Kafka/MSK for the API's internal domain events (🔜 planned) and Kinesis for external Amplitude analytics (→ ClickPipe → ClickHouse). See `docs/EVENT-ARCHITECTURE.md`.

Agent/contributor context: root `CLAUDE.md` (repo map + verification commands), per-app `CLAUDE.md` files for conventions, `apps/api/.claude/rules/coding-standards.md` for coding rules. CI (`.github/workflows/ci.yml`) runs `pnpm verify`, the API integration tests, and Flutter analyze/test. Workflow: agent harness from `~/krutyug/krutyug-agent-harness` (install via its `install.sh`); this repo's tickets live in `specs/` (`TAM-N`).
