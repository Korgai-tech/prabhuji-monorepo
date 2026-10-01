# Observability

The backend services (`apps/api`, `apps/events`) emit **OpenTelemetry** — traces, logs, and
metrics — to **ClickStack** (ClickHouse's observability stack: OTel Collector → ClickHouse →
HyperDX UI). This is a **third pipe**, distinct from the two event pipes in
[`EVENT-ARCHITECTURE.md`](EVENT-ARCHITECTURE.md): those move _business_ data (domain events, click
analytics); this moves _operational_ telemetry about the services themselves.

## Architecture

ClickStack has three parts. On **ClickHouse Cloud, the ClickHouse database (storage) and the
HyperDX UI are hosted for us — but the OTel Collector is not.** We run the collector ourselves, as
a **sidecar container inside each service's ECS task**.

```
┌──────────── ECS Fargate task (awsvpc: one shared network namespace) ────────────┐
│                                                                                  │
│   app container            OTLP/HTTP                 otel-collector sidecar       │
│   (Fastify + HyperDX SDK) ──localhost:4318─────────▶ clickhouse/clickstack-       │
│   traces + logs + metrics                            otel-collector               │
└───────────────────────────────────────────────────────────┬─────────────────────┘
                                          batches + writes    │  https://…:8443
                                                              ▼
                                    ┌───────────────────────────────────────────┐
                                    │  ClickHouse Cloud  (otel_traces/logs/…)     │
                                    │              ──▶  HyperDX UI (hosted)       │
                                    └───────────────────────────────────────────┘
```

**Why a sidecar, not a shared collector service:** in Fargate `awsvpc` mode all containers in a
task share one network namespace, so the app reaches the collector at plain `localhost:4318` — no
service discovery, internal ALB, or extra security-group rules. Each task is self-contained, and
the collector is **non-essential** so its failure never takes the app down (telemetry loss ≠
outage). The cost is one collector per task rather than one per fleet — fine at this scale.

Only `api` and `events` are instrumented. **`admin` is not** — it is a static nginx-served SPA with
no Node process and no OTel SDK, so it gets no sidecar and no telemetry env.

## How it's wired

- **SDK**: `@hyperdx/node-opentelemetry` — preloaded via **`node --import ./telemetry.js index.js`**
  (see each `Dockerfile`) so OTel patches instrumented libraries at _module-load time_, before the
  app's imports. A top-of-file `import` would not work (ESM hoists). This works because the esbuild
  build is `thirdParty:false` — deps stay external as real node_modules the SDK can patch, not
  inlined into the bundle. Auto-instruments HTTP/Fastify, Postgres (`pg`), Redis (`ioredis`), Kafka
  (`kafkajs`), the AWS SDK (Kinesis); stamps `trace_id`/`span_id` into `pino` logs and ships stdout
  as trace-correlated logs. Code: `apps/{api,events}/src/telemetry.ts` — **unchanged by the sidecar
  model**; the SDK just points at a different endpoint.
- **Off by default**: `telemetry.ts` no-ops (never loads the SDK) unless `ENABLE_TELEMETRY=true`.
  The SDK also **skips init entirely without a non-empty `HYPERDX_API_KEY`**, so the env schema
  (`src/shared/config/env.ts`) requires the key when telemetry is on and fails fast at boot.
- **Transport**: OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`, which the Terraform wiring sets to
  `http://localhost:4318` — the in-task collector.
- **Collector**: `clickhouse/clickstack-otel-collector` — a **public image pulled from Docker Hub**
  (not built by us; no Dockerfile in this repo), **pinned to a specific version** (`2.30.0`) rather
  than `:latest` so deploys are reproducible. Configured exactly as the ClickStack UI's generated
  `docker run`: `CLICKHOUSE_ENDPOINT=https://<host>:8443` plus `CLICKHOUSE_USER` /
  `CLICKHOUSE_PASSWORD`. It receives OTLP on `:4318`, batches, and writes the `otel_*` tables to
  ClickHouse Cloud. It **reuses the same `clickhouse_user` / `clickhouse_password` secrets** the
  CI/CD warehouse-migration step already uses.
- **Secrets flow**: Terraform sensitive var → `aws_secretsmanager_secret` (+ `_version`) → passed as
  an ARN in the task's `secrets` map → rendered into the ECS task definition as
  `{ name, valueFrom: <ARN> }` → resolved by the **execution role** at task start and injected as
  env (never plaintext). The execution-role `read-secrets` policy is auto-scoped to exactly the app
  + sidecar secret ARNs.
- **Environment tag**: `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=<env>` is added to both
  services so stage and prod are distinguishable in HyperDX even though the service names
  (`api`/`events`) are identical and the two envs may share one ClickHouse Cloud service.

## Configuration

**App container env** (set by Terraform when telemetry is on):

| Env var                       | Meaning                                                              |
| ----------------------------- | ------------------------------------------------------------------- |
| `ENABLE_TELEMETRY`            | Master switch; off = no SDK loaded.                                  |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` — the collector sidecar.                     |
| `HYPERDX_API_KEY`             | Must be non-empty (SDK skips init without it). With the sidecar (no client auth on localhost) any placeholder works. Injected from Secrets Manager. |
| `OTEL_RESOURCE_ATTRIBUTES`    | `deployment.environment=<env>` — filters stage vs prod in HyperDX.   |

**Terraform inputs** (per-env root `envs/<env>`, mostly via the gitignored `secrets.auto.tfvars`):

| Variable                        | Meaning                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `enable_telemetry`              | Turn the whole feature on for the env (default `false`).                        |
| `hyperdx_api_key`               | Sensitive; stored in Secrets Manager. Placeholder OK with the sidecar.          |
| `clickhouse_host` / `clickhouse_password` (`clickhouse_user` defaults `default`) | Collector's export target — the same creds the warehouse migration uses. |
| `otel_exporter_otlp_endpoint`   | External collector override. Normally empty — only for pointing at a collector you run elsewhere instead of the sidecar. |
| `clickstack_collector_image`    | Collector image (stack var). Defaults to a **pinned** `clickhouse/clickstack-otel-collector:2.30.0`; bump the tag deliberately (don't use `:latest`). |
| `clickstack_clickhouse_database`| Optional per-env target DB (e.g. `otel_stage` / `otel_prod`); empty = collector default. Requires a matching HyperDX source. |

**Gating** — the whole thing turns on one local in `modules/stack/services.tf`:

```
wire_clickstack_collector = var.enable_telemetry && local.wire_clickhouse   # host + password present
```

- **On**: the collector sidecar is attached to both `api` and `events`, `OTEL_EXPORTER_OTLP_ENDPOINT`
  points at `localhost:4318`, and the task size is bumped to **1024 CPU / 2048 MB** to fit the
  collector.
- **Off** (the default everywhere): no sidecar, no telemetry env, unchanged task size — a complete
  **no-op** (zero plan diff). This is why an env with telemetry off is unaffected.

**Plan-time guard.** `enable_telemetry = true` with *neither* ClickHouse creds *nor* an external
endpoint fails the plan, via a precondition on `terraform_data.telemetry_guard` in
`modules/stack/services.tf`. Without it the tasks would take `ENABLE_TELEMETRY=true` and an empty
endpoint, fail their `EnvSchema` at boot, and crash-loop until the deployment circuit breaker
halted the rollout. Failing the plan is strictly cheaper than debugging that.

The sidecar mechanism itself lives in the reusable `modules/fargate-service` module
(`sidecar_image` / `sidecar_name` / `sidecar_environment` / `sidecar_secrets`) and is available to
any future service, not just these two.

## Runtime flow (what happens when a task starts)

1. ECS pulls both images and the execution role resolves all secrets from Secrets Manager.
2. Both containers start — **no `dependsOn`**: the app's OTLP exporter retries until the collector's
   `:4318` is listening, so a slow/broken collector never blocks the app from booting.
3. The app's `--import` preload runs first → SDK sees `ENABLE_TELEMETRY=true` + key → registers
   auto-instrumentation → the app boots and serves traffic.
4. Each request/query/log emits spans/logs/metrics → exported over OTLP to `localhost:4318`.
5. The collector batches and writes to ClickHouse Cloud's `otel_*` tables.
6. The hosted HyperDX UI queries those tables — you search/dashboard by `service.name` (`api` /
   `events`) and `deployment.environment`.

### One-off tasks share the api task definition

Two things run on the **api task definition** with a command override: the Prisma migration
(CI/CD buildspec + `scripts/deploy-infra.sh`) and the 30-minute billing tick
(`modules/billing-scheduler`). Both therefore also start a collector container.

That is harmless — the sidecar is **non-essential**, so ECS stops the task once the command
container exits; it does not hold the task open. But it has one consequence worth knowing: reading
the migration's result as `tasks[0].containers[0].exitCode` is no longer safe, because
`describe-tasks` does not guarantee container ordering and `[0]` could be the stopped collector.
Both call sites select **by container name** instead:

```
--query "tasks[0].containers[?name=='<api container>'].exitCode | [0]"
```

## Running it

- **Local (`nx serve`, source hot-reload): telemetry is OFF** — the OTel loader is deliberately kept
  out of the tsx dev path.
- **Local built image**: `pnpm deploy:local` runs the `deploy`-profile containers with `--import`.
  Set `ENABLE_TELEMETRY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `HYPERDX_API_KEY` in `.env` (pointing at a
  collector — local or the one in your cluster) to see spans/logs flow.
- **Production (Terraform)**: create/append `infra/terraform/envs/<env>/secrets.auto.tfvars`
  (gitignored) with `enable_telemetry = true`, the `clickhouse_*` creds, a `hyperdx_api_key`, and
  optionally `clickstack_clickhouse_database`; then `pnpm deploy:infra <env>` rolls both services
  onto task defs that carry the collector sidecar.

## Current state

- **stage** — configured **on**: `envs/stage/secrets.auto.tfvars` already carries
  `enable_telemetry = true` + `hyperdx_api_key`, and the env root now declares those variables, so
  the values finally take effect. Live at the next `pnpm deploy:infra stage`, which replaces both
  task definitions (adding the sidecar and resizing to 1024/2048) and rolls both services.
- **prod** — variables plumbed and armed, but telemetry is **off** until `envs/prod/secrets.auto.tfvars`
  exists with prod's ClickHouse creds + a `hyperdx_api_key` (template in `envs/prod/variables.tf`).
  Independently of that, **prod's stack has never been applied at all** — turning telemetry on there
  is part of prod's first full provisioning, not a standalone change.

Set `clickstack_clickhouse_database` per env (`otel_stage` / `otel_prod`) if you want the two envs'
OTel data in separate ClickHouse databases; each needs a matching HyperDX source. Leaving both
empty is fine — `deployment.environment` still separates them in the UI.

## Deferred

- **Dev-source telemetry** (`nx serve` with the loader) — opt-in later if wanted.
- **Explicit pino OTLP transport** (`getPinoTransport`) — richer than stdout capture; add if the
  console-capture path proves lossy.
- **Shared collector service** (one collector for the fleet instead of a sidecar per task) — only
  worth it if per-task collector overhead becomes material.
- **Mirror the collector image into ECR** — the collector is pulled from Docker Hub (subject to
  pull rate limits, and pinned by tag not digest). If churn triggers `toomanyrequests` or you want
  digest-level immutability, mirror `clickhouse/clickstack-otel-collector:<ver>` into ECR (as `api`/
  `events` already are) and point `clickstack_collector_image` at that ref. Bump the pinned version
  by re-mirroring.

## See also

- `apps/api/CLAUDE.md`, `apps/events/CLAUDE.md` — where `telemetry.ts` sits in each service
- `apps/{api,events}/src/shared/config/env.ts` — the env schema that gates telemetry at boot
- `infra/terraform/modules/fargate-service` — the reusable sidecar mechanism
- `infra/terraform/modules/stack/services.tf` — where the collector is wired into `api` + `events`
- `docs/DEPLOYMENT.md` — how to apply, and the local-state caveat to read first
- `docs/EVENT-ARCHITECTURE.md` — the two _business_ event pipes (Kafka domain events, Kinesis analytics)
- `docs/ANALYTICS-WAREHOUSE.md` — the ClickHouse Cloud warehouse (same service, different databases)
