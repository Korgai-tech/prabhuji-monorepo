# monorepo-boilerplate

Nx 23 + pnpm 11 workspace, Node 22 (`.nvmrc`). Nx projects: `api`, `events`, `media-optimizer`, `admin`, `mobile`, `api-client`, `clickhouse`, `@repo/eslint-config`.

## Layout

- `apps/api` — Fastify 5 + Prisma (Postgres) + Zod modular monolith. Event-driven: modules emit domain events over Kafka/MSK (🔜 planned) alongside sync `performServiceCall`. Conventions: `apps/api/CLAUDE.md` (read it before touching api code).
- `apps/events` — click-events collector (client events only, no s2s): HTTP endpoint implementing Amplitude's V2 API (`amplitude_flutter` points its `serverUrl` here), batching to AWS Kinesis (→ ClickPipe → ClickHouse; floci-aws locally). Conventions: `apps/events/CLAUDE.md`.
- `apps/admin` — React 19 + Vite admin SPA. Conventions: `apps/admin/CLAUDE.md`.
- `apps/media-optimizer` — S3-triggered Lambda (Node 22 arm64 + pinned ffmpeg layer) that compresses CMS video/audio uploads from `incoming/` to their final key, fail-open (TAM-267). Deployed by `pnpm deploy:infra` only. Conventions: `apps/media-optimizer/CLAUDE.md`.
- `apps/mobile` — Flutter app (not a pnpm package; needs the Flutter SDK). Conventions: `apps/mobile/CLAUDE.md`.
- `apps/admin-e2e` — Playwright E2E for the admin UI (real API + Postgres).
- `apps/events/db` — analytics warehouse schema (ClickHouse Cloud: `staging` + `prod` databases; local compose container), owned by the events app. Owned migration runner (`migrate.ts` on `@clickhouse/client` — no hosted tooling): immutable checksummed `migrations/*.sql` + generated `schema.sql`, CI drift-checked. Host-run only (never in the Docker image): `events:migrate` nx targets / `pnpm migrate` in `apps/events`. Conventions: `apps/events/db/README.md`; design: `docs/ANALYTICS-WAREHOUSE.md`.
- `infra/terraform` — AWS production infra: two isolated environments (`envs/stage`, `envs/prod`), each a dedicated VPC running the full stack via `modules/stack` (ALB, ECS cluster, RDS Postgres, ElastiCache Redis, Kinesis, MSK, Secrets Manager) + a `fargate-service` module per backend service (`api`, `events`).
- `packages/api-client` — typed TS client generated from `apps/api/openapi.json`. Never hand-edit `src/types.ts`.
- `packages/eslint-config` — shared flat ESLint config (`@repo/eslint-config`).

Two independent event pipes — **Kafka/MSK** (internal API domain events, 🔜 planned) and **Kinesis** (external Amplitude analytics → ClickPipe → ClickHouse). Design: `docs/EVENT-ARCHITECTURE.md`.

Recurring payments run on **Cashfree UPI Autopay** (`apps/api/src/core/payment`, provider-neutral behind `MandateProvider`; Decentro is a second implementation). Money lives in one append-only `transactions` ledger; `subscriptions` is the entitlement projection every Pro gate reads; `mandates` is the stored consent. Every wire payload, the NPCI timing rules, the verified endpoint matrix and the **unresolved `plan_type: PERIODIC` double-charge risk**: `docs/PAYMENT-FLOW.md` — read before touching the billing path.

Discovery ordering is **rotated, not scheduled**: `/home/feed` plus the status, ringtone and wallpaper listings re-order every 5 hours as a pure function of `(refresh epoch, catalogue)` — no cron, no table, `apps/api/src/shared/rotation`. Why it exists, the show/hold-back/resurface/new-boost rules, which surfaces rotate and which deliberately don't: `docs/FEED-ROTATION.md` — read before changing any public listing's order or cursor.

Observability is a separate third pipe: `apps/api` + `apps/events` emit **OpenTelemetry** (traces/logs/metrics) via the HyperDX SDK (preloaded `node --import ./telemetry.js`, opt-in via `ENABLE_TELEMETRY`) to a **ClickStack** OTel collector run as a per-task sidecar, which exports to ClickHouse Cloud (hosted ClickHouse + HyperDX UI). Design: `docs/OBSERVABILITY.md`.

## Verify your work (run before claiming done)

- `pnpm verify` — arch boundaries + OpenAPI drift + typecheck/lint/unit tests for every Node project. The stage CodeBuild pipeline (this repo's only CI — no GitHub Actions) runs exactly this as a deploy gate.
- `pnpm verify:mobile` — `flutter analyze` + `flutter test` (needs the Flutter SDK).
- `pnpm nx test api --configuration=integration` — real Postgres via testcontainers (needs Docker; slower).
- `pnpm nx run events:ch-check` — warehouse migrations apply cleanly to a fresh ClickHouse + `schema.sql` current (needs Docker; runs in the CodeBuild gate alongside the integration suites, not in `pnpm verify`).
- `pnpm e2e:web` — Playwright: admin UI against the real API + Postgres (`apps/admin-e2e`; boots both servers itself).
- `pnpm e2e:android` — Flutter integration test (needs a running API + Android emulator; `E2E_DEVICE=<id>` to pick one).
- Single project: `pnpm nx <typecheck|lint|test> <api|admin|api-client>`.

## Contract-first codegen — the API is the source of truth

After any route/schema change in `apps/api`, regenerate downstream artifacts IN ORDER and commit them with the change:

1. `pnpm nx run api:openapi` — re-emits **both** `apps/api/openapi.json` (the **full** contract — public + admin) **and** `apps/api/openapi.public.json` (the **filtered** contract — `/admin/*` paths and admin-only schemas removed). CI fails on drift for **either** file via `pnpm check:openapi`.
2. `pnpm nx run api-client:generate` — TS types used by admin, from the **full** `openapi.json` (the admin SPA needs both `/auth/login` and `/admin/*`)
3. `pnpm nx run mobile:generate` — Dart models, from the **public** `openapi.public.json` **only** (the Dart generator emits a model per schema, so admin write schemas must never reach it — TAM-85). Needs JDK 17.

The split is enforced two ways: `pnpm check:openapi` gates both files for drift, and a **tag⇔path invariant** (an admin route must be both tagged `admin` and under `/admin/`, or neither) fails the same gate — so a mis-tagged admin route cannot silently ship its schemas in the APK. See `patterns_library/ci/contract-codegen-chain.md`.

`apps/events` is the exception: its endpoint implements Amplitude's HTTP V2 contract (external spec — no OpenAPI emission; Zod schemas in its handlers define what we accept).

## Architecture boundaries (machine-enforced)

`pnpm check:arch-boundaries` enforces `arch-boundaries.json` (multi-root): api — Route → Controller → Service → Repository, Prisma only inside `repositories/`; events — Handler → Service → Repository, AWS SDK only inside `repositories/`, fastify never in services; media-optimizer — the same, plus child processes (ffmpeg) only inside `repositories/`. `shared/` never imports `core/`. Details in each app's `CLAUDE.md`.

## Local dev & deploy

`docker compose up -d` (Postgres, Redis, floci-aws emulator), then `pnpm nx serve api` (tsx watch from source, http://localhost:3000). Admin: `pnpm nx serve admin` (`VITE_API_URL` sets the API base). External services are opt-in via env flags — see `.env.example`. Host-port overrides: `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT`, `CLICKHOUSE_HTTP_PORT`/`CLICKHOUSE_TCP_PORT`.

- **Local deploy (floci)**: `pnpm deploy:local` — builds the API image (`apps/api/Dockerfile`) and runs the full stack in compose (profile `deploy`) against the floci-aws emulator, migrates, health-checks. `pnpm nx start api` runs the built artifact directly (`node apps/api/dist/index.js`).
- **Production infra (Terraform)**: `infra/terraform/` — per-env roots (`envs/stage`, `envs/prod`, separate state) over `modules/stack` (dedicated VPC + ALB/ECS/RDS/Redis/Kinesis/MSK/Secrets Manager); `modules/fargate-service` instantiated for `api` (catch-all route) and `events` (`/2/httpapi*`). Adding service N+1 = one module block in `modules/stack/services.tf`. See `infra/terraform/README.md`. **Both** envs auto-deploy via a CodeBuild webhook (`modules/cicd`) — stage from the `stage` branch, prod from `main`; each build applies Prisma migrations as a one-off ECS task before rolling the services (TAM-79), so pushing to either branch migrates that env's database. **BOTH pipelines are live — merging to `main` deploys PRODUCTION and migrates the production database.** There is no manual gate in between and prod carries real customers (and an armed billing scheduler), so treat a `main` merge as a release, not as landing code: land it on `stage` first and verify there. (This line previously read "stage only so far — prod's pipeline is unapplied", which was stale and made a `main` merge look inert.) Terraform itself is never applied by the pipeline — that stays `pnpm deploy:infra <stage|prod>`. **Deploy flow + the Terraform state situation (remote in S3 — bucket `prabhuji-tfstate`, key `<env>/terraform.tfstate`, since TAM-128; this repo is a fork of `monorepo-metaservice` and now owns stage's state): `docs/DEPLOYMENT.md` — read before applying.**

## SAFe agent workflow (harness)

The agent harness (SAFe roles, commands, skills, hooks, spec/pattern templates) lives in a separate repo — `~/krutyug/krutyug-agent-harness` (the source of truth) — and an installed copy is committed here, so new projects cloned from this boilerplate inherit it. Refresh it here, or rebrand it in a clone, by re-running the installer:

    bash ~/krutyug/krutyug-agent-harness/install.sh [--prefix ABC] [--project name]

Harness changes are made in the harness repo and re-installed — never edited here directly (except project-specific additions like new patterns, which installs preserve). The workflow: tickets as in-repo specs (`specs/TAM-N-*.md`; no AC/DoD → no work), branch `TAM-N-{description}` off `main`, commits `type(scope): description [TAM-N]`, `/start-work` → `/pre-pr` (runs `pnpm verify`) → `/end-work`. This repo's own ticket history lives in `specs/` regardless.

## Deferred-work ledger

`docs/PHASE-NOTES.md` records consciously deferred items and known-broken states. Check it before fixing anything that looks wrong — it may be deferred on purpose. Currently: `nx build api` output is NOT runnable (`bundle:false` leaves unresolved `@api/*` aliases — Phase 6).
