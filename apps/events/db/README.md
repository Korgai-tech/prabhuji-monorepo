# apps/events/db — analytics warehouse migrations

ClickHouse schema for the analytics pipe (`docs/EVENT-ARCHITECTURE.md` Pipe 2 → `docs/ANALYTICS-WAREHOUSE.md`),
managed Prisma-style with an **owned runner** ([migrate.ts](migrate.ts), ~200 lines on the official
`@clickhouse/client`) — no hosted migration tooling, no logins.

- `migrations/*.sql` — ordered, hand-authored, **the source of truth**. Immutable once applied
  (sha-256 checksums recorded in a `_migrations` table per database; editing an applied file fails hard).
- `schema.sql` — **generated** dump of the live schema after every local `migrate`. Reviewable in
  PRs; CI re-derives it from a fresh apply and fails on any diff.
- Statement convention: each statement ends with `;` at end of line. Forward-only (no down migrations).

## Environments

| env       | database    | connection                                                                                              |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| `local`   | `analytics` | compose container (`http://localhost:${CLICKHOUSE_HTTP_PORT:-8123}`, user `default` / `local-dev-only`) |
| `staging` | `staging`   | ClickHouse Cloud — `https://$CLICKHOUSE_HOST:8443`                                                      |
| `prod`    | `prod`      | same service, database `prod`                                                                           |

staging/prod need exactly three env vars — `CLICKHOUSE_HOST`, `CLICKHOUSE_USER` (default `default`),
`CLICKHOUSE_PASSWORD` (see `.env.example`). The runner **creates the database if missing** — you only
provide the service credentials. One Cloud service hosts both databases with identical schema.

Engine note: DDL says `MergeTree`; ClickHouse Cloud transparently runs it as SharedMergeTree — the
same migrations work locally (pinned image `25.3`, first with the `JSON` type GA) and in Cloud.

## Commands

One env-driven command per action — the target is the same everywhere, the env is
picked by `CLICKHOUSE_ENV` (unset = local). Local commands need the compose ClickHouse
already up (it is profile-gated, so bring it up yourself first — the targets no longer do).

> ### ⚠️ `saas_events` is the live table, and this runner does not own it
>
> Verified against the service on 2026-09-22. The migrations here declare **`events`**; the
> table the pipeline actually fills is **`saas_events`**, in the databases `staging` and
> **`production`**. It is created and altered **outside this repo**, so:
>
> - `pnpm nx run events:ch-check` drift-gates `events` — a table nothing currently writes to.
>   It gives **no** protection for `saas_events`, which is what `apps/api`'s admin
>   status-performance report (TAM-256) reads.
> - A rename of a `saas_events` column, an `event_properties` key, or an `event_type` value
>   will **not** fail CI here. Consumers carry their own canaries instead.
> - `CLICKHOUSE_ENV=prod` below targets the database literally named `prod` — which is
>   **empty**. Production data is in `production`. This mismatch is deliberately left alone
>   rather than patched in passing; repointing a migration runner at the live production
>   database is its own change with its own blast radius.
>
> Adopting `saas_events` into these migrations is tracked as **TAM-257**.

```bash
docker compose up -d clickhouse       # prerequisite for the local commands below
pnpm nx run events:migrate            # env from CLICKHOUSE_ENV (default local): apply pending; local also refreshes schema.sql
CLICKHOUSE_ENV=staging pnpm nx run events:migrate    # ClickHouse Cloud, database `staging`
CLICKHOUSE_ENV=prod    pnpm nx run events:migrate    # ClickHouse Cloud, database `prod`
pnpm nx run events:ch-status          # applied/pending per migration (CLICKHOUSE_ENV=staging|prod for Cloud)
pnpm nx run events:ch-check           # CI gate: fresh throwaway LOCAL db → apply ALL → dump → diff vs schema.sql (always local)
pnpm tsx apps/events/db/migrate.ts create <slug>   # scaffold migrations/<UTC-ts>_<slug>.sql
```

npm surface (from `apps/events/`, host-side only — the Docker image never migrates):

```bash
pnpm migrate                          # tsx db/migrate.ts, env from CLICKHOUSE_ENV (default local; needs the compose container up)
CLICKHOUSE_ENV=staging pnpm migrate   # ClickHouse Cloud (CLICKHOUSE_HOST/PASSWORD from the environment)
pnpm start                            # migrate, then node dist/index.js (build first: pnpm nx build events)
```

## Adding a migration

1. `pnpm tsx apps/events/db/migrate.ts create add-plan-column`
2. Write the DDL (each statement `;`-terminated at end of line, **idempotent** — `IF NOT EXISTS` /
   `CREATE OR REPLACE` — so a partially-failed apply recovers by re-running; applies are not
   transactional). Never edit an applied migration — add a new one (checksums enforce this).
   (There is no materialized view anymore — ClickPipe writes typed columns directly, and only
   `event_date` / `corrected_time` / `synthetic_sequence_time` are computed via `MATERIALIZED`
   expressions — so schema changes are plain `ALTER TABLE` / re-create DDL.)
3. `docker compose up -d clickhouse && pnpm nx run events:migrate` — applies locally and refreshes `schema.sql`.
4. Commit the migration **and** the regenerated `schema.sql` together (`events:ch-check` in CI
   fails otherwise).
5. Apply to Cloud when ready: `CLICKHOUSE_ENV=staging pnpm nx run events:migrate`, verify, then `CLICKHOUSE_ENV=prod …`.

## What the schema is

A **single snake_case `events` table** — **33 columns, one per field** (wide, append-only; dedup by
`insert_id` at query: `LIMIT 1 BY insert_id`). The Kinesis `StoredEvent` wire is snake_case and
correctly typed, so ClickPipe writes each field **directly** into its column — a clean **1:1 by
field name, no overrides**: epoch-ms integers → tz-naive `DateTime64(3)` (UTC — ClickPipe forbids tz-typed columns)
(`event_time`/`server_time`/`client_upload_time`), the property bags and `groups` as native JSON
objects → `JSON` / the `groups` `Map`, the device/app context sent flat → its promoted typed columns
(no `context` blob, no `groupsRaw`, no extract, no stringified bags, no camelCase raw duplicates).
Only **three columns are computed on insert**, all `MATERIALIZED`: `corrected_time`, then
`event_date` (`toDate(corrected_time, 'Asia/Kolkata')` — the skew-corrected **IST** event day, so a
wrong client clock can't mis-date a row) and `synthetic_sequence_time`, both derived from
`corrected_time` (which is tz-naive `DateTime64(3)`). There is no landing table and
no materialized view. `$identify` is **skipped at the collector** (no downstream consumer; the single
table has no insert-time filter), so it never reaches the warehouse.

Design, query patterns, and the ClickPipe wizard runbook: `docs/ANALYTICS-WAREHOUSE.md`.
Wire contract: `docs/ANALYTICS-EVENT-CONTRACT.md`. Spec: `specs/TAM-16-clickhouse-analytics-warehouse.md`.
