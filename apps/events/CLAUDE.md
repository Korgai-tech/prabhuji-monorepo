# apps/events

Click-events collector. HTTP service (Fastify 5 + Zod) implementing **Amplitude's HTTP V2 API** (`POST /2/httpapi`) — the mobile app's `amplitude_flutter` SDK points its `serverUrl` here. Sink: AWS Kinesis (batched `PutRecords`), emulated locally by floci-aws. Default port **3001**.

This is the **analytics** pipe (Amplitude events → Kinesis → ClickPipe → ClickHouse) — separate from the API's Kafka domain-event bus. See `docs/EVENT-ARCHITECTURE.md` for why both exist.

## Scope

Analytics events, **scoped** industry-style (see `docs/ANALYTICS-EVENT-CONTRACT.md`): `event_properties` (this action) / `user_properties` (user snapshot) / `groups` (account) stay separate end-to-end, plus the SDK's auto-collected device/app context. An ingestible event carries an `event_type` (the funnel dimension) and at least one identity — `user_id` (the app calls `setUserId`; transitional fallback `event_properties.player_id`), `device_id`, or `pseudo_id` (`user_id`/`device_id` ≥5 chars, Amplitude's min-id rule). `$identify` events (user-state changes — from the client SDK **or** server producers) are **accepted on the wire but SKIPPED by the collector** — there is no downstream consumer (warehouse persons enrichment removed pre-release; the single `events` table has no insert-time filter), so `$identify` is dropped before Kinesis and never reaches the warehouse. Like an identity-less event, a skipped `$identify` is logged and the batch still returns 200: Amplitude V2 has no partial-accept semantics, and a 4xx would poison the SDK's retry queue. **Never change the skip-keeps-200 rule.** (Generalized from click-only in TAM-15; see `specs/TAM-15-generalize-events-mapping.md`.)

## Contract

The wire contract is Amplitude V2 (external — no OpenAPI emission, by design):

- Auth: the payload's body `api_key` is compared (timing-safe) against `EVENTS_API_KEY`. Not a header — that is how the SDK sends it.
- Responses are V2-shaped: `200 {code, events_ingested, payload_size_bytes, server_upload_time}`, `400 {code, error}`.
- Zod schemas in `core/events/handlers/amplitude.schemas.ts` define what we accept (`z.looseObject` — tolerate unknown SDK fields). Mapping to the domain `AnalyticsEvent` lives in `toAnalyticsEvent` (`click-events.handler.ts`); the JSON stored on Kinesis is `StoredEvent` (adds server `reqGuid` + `receivedAtMs`) — identity + event fields, the scoped bags (`eventProperties`/`userProperties`/`groups`/`groupProperties`, value types preserved), flat device/app context fields (`platform`/`os_name`/… snake_case, one per promoted column), and client diagnostics (`attempts`/`retryCount`/`sentAtMs`). Full field table: `docs/ANALYTICS-EVENT-CONTRACT.md`.

## Layering (CI-enforced via `pnpm check:arch-boundaries`)

Handler → Service → Repository. A layer imports only the one below it + `shared/`; the shared domain types live in `core/events/types.ts`.

- `handlers/` — fastify routes + Zod boundary validation + Amplitude→domain mapping; NEVER `@aws-sdk/*` or `repositories/`
- `services/` — transport-agnostic logic; NEVER `fastify` or `@aws-sdk/*`
- `repositories/` — the event sink; `@aws-sdk/*` is allowed ONLY here (the Prisma-rule analogue)
- `shared/` — config (Zod env), logs (pino `createModuleLogger`), api-key compare; never imports `@events/core/`

## Conventions

- Env validated in `src/shared/config/env.ts` (fail-fast at boot); AWS endpoint/region/creds come from the standard `AWS_*` chain — never configured in code.
- Logging: `createModuleLogger("events:<layer>")`; never `console.log`; never log `EVENTS_API_KEY` or event payloads above debug.
- Kinesis: batch ≤ 500 (`KINESIS_BATCH_SIZE`), flush on size/interval/shutdown; partition key `userId || deviceId || pseudoId`; failed records are logged and dropped (v1 — no retry/DLQ, see PHASE-NOTES).
- **At-least-once, dedup downstream**: `insert_id` (→ `eventId`) is the idempotency key, but the collector does NOT dedupe — Amplitude retries produce duplicate Kinesis records. The ClickHouse consumer must dedupe by `eventId` within a window (Amplitude's contract is 7 days). Do not add server-side dedup here (stateless by design).
- **Fire-and-forget, by design**: the endpoint returns 200 as soon as events are buffered; a Kinesis outage is invisible to the client (records logged+dropped, never a 5xx). This keeps the SDK's queue healthy but means loss is silent — the durability backstop is the future retry/DLQ, not the response code.
- **Body limit** 256 KiB (`BODY_LIMIT_BYTES` in `server.ts`) — caps the unauthenticated public POST; Amplitude's default 30-event batch is far under it.

## Observability

OpenTelemetry → a ClickStack OTel collector sidecar in the same ECS task (which exports to ClickHouse Cloud), via the HyperDX SDK. `src/telemetry.ts` (sibling to `index.ts`) is **preloaded** with `node --import ./telemetry.js index.js` so auto-instrumentation hooks Fastify/HTTP/@aws-sdk (Kinesis) before they load; it no-ops (SDK never loaded) unless `ENABLE_TELEMETRY=true`. Traces + logs (pino, trace-correlated) + metrics. `@hyperdx/node-opentelemetry` lives only in `telemetry.ts` (it is NOT the `@aws-sdk`-in-repositories rule — telemetry is bootstrap infra, beside `index.ts`). Design: `docs/OBSERVABILITY.md`.

## Warehouse schema (`db/`)

The ClickHouse analytics warehouse schema lives in `db/` (owned migration runner `migrate.ts`,
immutable checksummed `migrations/*.sql`, generated `schema.sql` — conventions: `db/README.md`).
Migrations are **host-run only, never from the Docker image**: local targets the compose container,
staging/prod target ClickHouse Cloud via `CLICKHOUSE_HOST`/`CLICKHOUSE_PASSWORD`.

- `pnpm nx run events:migrate` — env from `CLICKHOUSE_ENV` (default local; `staging`/`prod` for Cloud). One command, no per-env configs; local needs `docker compose up -d clickhouse` first (targets no longer start it)
- `pnpm nx run events:ch-status` / `events:ch-check` — status / CI drift gate (check runs in the CodeBuild gate)
- From `apps/events/`: `pnpm migrate` (env from `CLICKHOUSE_ENV`, default `local`) and `pnpm start` (migrate, then `node dist/index.js`)

## Run & test

- `pnpm nx serve events` — tsx watch on :3001 (needs `EVENTS_API_KEY` in `.env`)
- `pnpm tsx apps/events/scripts/smoke.ts` — V2 payload demo: health, bad key 400, valid click batch 200
- `pnpm nx test events` — unit + fastify-inject round trip (no Docker)
- `pnpm nx test events --configuration=integration` — real Kinesis via a floci-aws testcontainer (needs Docker)
- `pnpm deploy:local` — full stack incl. this service against floci-aws Kinesis
- Image healthcheck: `node healthcheck.js` (bundled GET /health probe)
