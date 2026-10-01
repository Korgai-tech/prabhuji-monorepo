# Analytics Warehouse (ClickHouse)

The downstream end of the analytics pipe (`EVENT-ARCHITECTURE.md` Pipe 2):

```
apps/events ──▶ Kinesis ──▶ ClickPipe ──▶ events   (ClickHouse Cloud)
(StoredEvent JSON,          (managed,      (single table: one snake_case column
 snake_case, typed)          assumes IAM)   per field, 1:1 by name, + 3 computed
                                            columns, append-only, query-time dedup)
```

One ClickHouse Cloud service hosts the environment databases, plus a local compose container
(db `analytics`) for development. Schema is migrated by the owned runner in
[`apps/events/db/`](../apps/events/db/README.md) (workflow + commands there). The wire contract
feeding this is [`ANALYTICS-EVENT-CONTRACT.md`](ANALYTICS-EVENT-CONTRACT.md).

> ### ⚠️ What is actually live (verified against the service, 2026-09-22)
>
> This document described `events` in the databases `staging` and `prod`. Two of those three
> names are wrong, and the difference is not cosmetic — a query against the documented names
> returns an empty result rather than an error:
>
> |                | Documented here | Actually live     |
> | -------------- | --------------- | ----------------- |
> | Table          | `events`        | **`saas_events`** |
> | Prod database  | `prod`          | **`production`**  |
> | Stage database | `staging`       | `staging` ✓       |
>
> `prod.events` exists but is **empty**; `production.events` stopped receiving rows on
> 2026-08-18. The live table is `<database>.saas_events`, which carries a leading
> **`tenant`** column (filter on it) and types `user_id` as a real `UUID` rather than
> `String DEFAULT ''`.
>
> **`saas_events` is managed OUTSIDE this repo.** It is declared in no migration here, so
> `pnpm nx run events:ch-check` drift-gates a table nothing writes to and gives **zero**
> protection for the columns consumers actually depend on. Adopting it into the owned
> migrations is tracked as **TAM-257**. Everything below about `events` still describes the
> schema this repo _owns_; it is not what the pipeline is filling today.

### Reading the warehouse from `apps/api`

Two readers, both optional — the serving API boots and stays ALB-healthy with no ClickHouse
configuration at all:

- **the deity-preference sync job** (TAM-175) — `custom_user_properties`, a scheduled task;
- **the admin status-performance report** (TAM-256) — `saas_events`, live on an **admin**
  request path, an approved scoped exception.

Before adding a third, read
[`patterns_library/api/warehouse-read-on-request-path.md`](../patterns_library/api/warehouse-read-on-request-path.md);
a new consumer of that pattern needs System Architect sign-off.

## Schema (see `apps/events/db/schema.sql` for the generated truth)

There is **one table, `events`** — **33 columns, all snake_case, one column per field**. ClickPipe
writes each Kinesis `StoredEvent` field **directly** into its typed column (a clean 1:1 by field
name, no overrides); three columns are **computed on insert** via `DEFAULT` / `MATERIALIZED`. No
landing table, no materialized view, no camelCase raw duplicates, no stringified bags.

- **`events`** — the wide analytics table. Append-only `MergeTree` (ClickHouse Cloud runs it as
  SharedMergeTree), **`PARTITION BY toYYYYMM(server_time, 'Asia/Kolkata')`** (the _server receive_
  month in IST — not the client event month; client clocks are unreliable and the SDK queues offline,
  so partitioning by ingestion keeps partitions bounded and TTL clean. Trade-off: filters on
  `event_date` don't prune partitions, but `event_date` leads the `ORDER BY`), `ORDER BY (event_date,
event_type, user_id)` — low-cardinality first, matching funnel access. `event_date` is the
  **skew-corrected** event day (`toDate(corrected_time, 'Asia/Kolkata')`, below), so a wrong client
  clock cannot mis-date a row into the wrong day. Identity is denormalized onto every row; no query ever JOINs.
  - **Written directly by ClickPipe** (snake_case, 1:1 by field name — the `StoredEvent` wire is
    already snake_case and correctly typed, so each field lands in its column with no transform):
    - identity + event: `insert_id`, `event_type` (`LowCardinality`), `user_id`, `device_id`,
      `pseudo_id`, `session_id`, `event_seq_id` (the client's per-device event sequence, from
      Amplitude `event_id` — the ordering tiebreaker)
    - timestamps — **sent as epoch-ms integers**, landing straight in **tz-naive `DateTime64(3)`**
      columns (UTC epoch — ClickPipe forbids tz-typed columns; ClickHouse parses an integer into
      `DateTime64` as ms): `event_time`, `server_time`,
      `client_upload_time`
    - scoped bags — **sent as JSON objects**, landing straight in their column (no stringified bags,
      no cast): `event_properties JSON` · `user_properties JSON` (point-in-time snapshot — the client
      bag as-sent on the event; no server-side merge) · `group_properties JSON` · `groups Map` (sent
      as a native JSON object → `Map` — the only wire/column type nuance; no `groupsRaw`, no `JSONExtract`)
    - promoted context (sent flat, snake_case, one per column): `platform`, `os_name`,
      `os_version`, `app_version`, `device_brand`, `device_model`, `device_manufacturer`,
      `carrier`, `country`, `language`, `adid`, `library`, `ip`
    - server/diag: `req_guid, attempts, retry_count`
  - **Computed on insert** (`DEFAULT` / `MATERIALIZED` — not carried on the wire):
    - **`corrected_time`** = `server_time − (client_upload_time − event_time)` — the device-clock
      skew cancels (both stamps are the device clock), anchoring to the trusted `server_time`.
      Computed from the `DateTime64` columns (via `toUnixTimestamp64Milli`); the guard **falls back
      to `event_time`** when `client_upload_time` is epoch 0 or lands before the event. Declared
      **first** because the two columns below both derive from it.
    - `event_date` = `toDate(corrected_time, 'Asia/Kolkata')` (leads the `ORDER BY`) — the
      **skew-corrected**, **IST** event day, not `toDate(event_time)`: an untrusted client clock must
      not decide which day (hence which leading sort-key bucket) a row lands in. When the skew signal
      is absent `corrected_time` falls back to `event_time`, so healthy clocks are unaffected. The
      explicit `'Asia/Kolkata'` supplies IST because `corrected_time` is tz-naive.
    - **`synthetic_sequence_time`** `UInt64` = `corrected_ms × 1e6 + (event_seq_id % 1e6)` — a
      deterministic within-device total order (ties within a corrected ms broken by the sequence).
    - All three computed columns (`event_date`, `corrected_time`, `synthetic_sequence_time`) are
      `MATERIALIZED` — never on the wire (ClickPipe must not set them) and **not in `SELECT *`**;
      name them explicitly.
  - **Timestamps are stored timezone-naive** (`DateTime64(3)`, a UTC epoch) — **not** IST-typed.
    **ClickPipe rejects destination columns whose type carries a timezone** (`data types with time
zones are not permitted`), so `event_time` / `server_time` / `client_upload_time` (and the
    `MATERIALIZED` `corrected_time`) must all be plain `DateTime64(3)`. IST (`Asia/Kolkata`) is
    applied at the **calendar boundaries**: `event_date` = `toDate(corrected_time, 'Asia/Kolkata')`
    and the partition `toYYYYMM(server_time, 'Asia/Kolkata')` — those are computed in IST. Everything
    else is UTC unless you convert: a bare `SELECT event_time` shows UTC, so pass the zone in queries
    (`toDate(event_time, 'Asia/Kolkata')`, `toStartOfHour(event_time, 'Asia/Kolkata')`), or
    `SET session_timezone = 'Asia/Kolkata'` to make a session IST-native. `now()`/`today()` follow the
    server/session tz — use `today('Asia/Kolkata')` when filtering `event_date`.
  - The table has **no insert-time filter** — every delivered row lands. That is why `$identify`
    must never reach it: the collector **skips `$identify`** upstream (no downstream consumer;
    identity ops would otherwise pollute the funnel table — see below).
  - No TTL yet — add later with one migration:
    `ALTER TABLE events MODIFY TTL event_date + INTERVAL 12 MONTH;`

## Deferred: persons / `$identify` enrichment

The persons enrichment layer (the `persons`/`persons_current`/`persons_dict` store and the
server-side stamp) was **removed pre-release** — the app is not live yet, so there was no history
to migrate. What that means today:

- `$identify` is **skipped at the collector** — `apps/events` drops it before Kinesis (logs a skip,
  still returns 200). It has no downstream consumer, and the single `events` table has no
  insert-time filter, so identity ops must not reach it. `$identify` therefore never touches
  Kinesis or ClickHouse. (The wire contract still _defines_ `$identify` — producers may send it;
  the collector just doesn't ingest it.)
- `events.user_properties` is now **only the client snapshot as-sent on each event** — there is
  no server-side merge of accumulated user state. It is still point-in-time, but it reflects only
  what the client attached to that specific event.
- **Future**: if identity resolution returns, it will ingest on its **own separate Kinesis
  stream** (a separate pipe), not bolted onto this events collector. The removed design and its
  load-test evidence live in git history.

## Query conventions

The pipe is **at-least-once end to end** (SDK retries, collector, ClickPipe) — duplicates with
the same `insert_id` are expected and removed **at read time**:

```sql
-- dedup: latest ingest wins
SELECT * FROM events
ORDER BY server_time DESC
LIMIT 1 BY insert_id;

-- funnel (app_opened → chat_room_entered → game_started within 1h, this week)
SELECT windowFunnel(3600)(
         toDateTime(event_time),
         event_type = 'app_opened',
         event_type = 'chat_room_entered',
         event_type = 'game_started') AS depth,
       count() AS users
FROM (SELECT * FROM events WHERE event_date >= today('Asia/Kolkata') - 7 LIMIT 1 BY insert_id)
GROUP BY user_id;

-- segment by a user property (point-in-time — the client-sent value on the event, no server stamp)
SELECT count() FROM events
WHERE event_date >= today('Asia/Kolkata') - 7
  AND event_type = 'chat_room_entered'
  AND user_properties.plan = 'premium';

-- one user's session journey (served by the inline `sessions_projection`,
-- ordered (user_id, session_id, event_time) — no full-table scan)
SELECT event_time, event_type, event_properties
FROM events
WHERE user_id = '2123059' AND session_id = 1783346772519
ORDER BY event_time;
```

JSON paths (`event_properties.room_id`, `user_properties.plan`) are real typed sub-columns —
fast to filter/aggregate. If a property becomes hot enough, promote it to a materialized column
in a migration (the PostHog pattern).

## Runbook — wiring an environment (once per env)

You provide three things; everything else is scripted.

1. **Secrets** (from the ClickHouse Cloud service's _Connect_ panel):
   `CLICKHOUSE_HOST`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` (see `.env.example`).
2. **Migrate** — creates the database and applies the schema:
   `pnpm nx run events:migrate:staging` (then `:prod`).
3. **IAM role** (Terraform, opt-in): start the ClickPipe wizard in the ClickHouse Cloud console
   (Data sources → ClickPipes → Amazon Kinesis) with **IAM role** auth; it shows the trusted
   principal ARN + external id. Then:

   ```bash
   cd infra/terraform/envs/stage
   terraform apply \
     -var enable_clickpipe=true \
     -var 'clickpipe_trusted_principal_arn=<from the wizard>' \
     -var 'clickpipe_external_id=<from the wizard>' \
     -var api_image=... -var events_image=...
   terraform output -raw clickpipe_reader_role_arn   # paste back into the wizard
   ```

   The role is least-privilege: Kinesis read on **that env's stream only**
   (`modules/stack/clickpipe.tf`).

4. **ClickPipe** (console, manual): source = the env's stream (`app-stage-events` /
   `app-prod-events`), auth = the role ARN, format JSON, **target table `events`** in the
   matching database (`staging`/`prod`), start from _earliest_ (24 h retention). The wire is
   already snake_case and correctly typed, so every field maps **1:1 by field name** with **no
   mapping overrides** — the only type nuance is `groups`, which arrives as a JSON object and lands
   straight in the `groups` `Map` column; everything else maps automatically.
5. **Verify**: send a batch through the collector (`apps/events/scripts/smoke.ts` against the
   env) → row appears in `events` with the typed columns populated directly (epoch-ms → the
   `event_time` / `server_time` `DateTime64`s, the JSON bags, `groups`) and the three computed
   columns (`event_date`, `corrected_time`, `synthetic_sequence_time`) filled on insert.

## Ops notes — schema changes

There is **no materialized view** anymore, and ClickPipe writes typed columns directly (no cast) —
only `event_date` / `corrected_time` / `synthetic_sequence_time` are computed, via `MATERIALIZED`
expressions that apply on every insert (including ClickPipe's) with no gap to rebuild.
Schema changes are plain `ALTER TABLE` / re-create DDL; there is no MV-rebuild backfill procedure to run.

## Ops notes

- **Never edit an applied migration** — checksums fail hard. Add a new one
  (`pnpm tsx apps/events/db/migrate.ts create <slug>`), apply locally, commit migration +
  regenerated `schema.sql` together; CI (`events:ch-check`) re-derives the schema from a fresh
  apply and fails on drift. **Write idempotent DDL** (`IF NOT EXISTS`, `CREATE OR REPLACE`) —
  applies are not transactional, and idempotence is what makes a partially-failed apply
  recoverable by simply re-running `migrate`.
- **Local test data**: insert a `StoredEvent`'s snake_case fields straight into `events`
  (`docker compose exec clickhouse clickhouse-client --user default --password local-dev-only
--database analytics`) — typed columns take the values 1:1 (epoch-ms → the `DateTime64`s), and
  the `MATERIALIZED` expressions compute `event_date` / `corrected_time` /
  `synthetic_sequence_time` on insert, no pipe needed locally.
- The warehouse is a **projection**: identity truth lives in the api's Postgres; wiping the
  warehouse loses analytics history only. Persons enrichment is deferred (removed pre-release) —
  historical design: `specs/TAM-17-persons-enrichment.md`.

## See also

- `apps/events/db/README.md` — migration runner + commands
- `docs/ANALYTICS-EVENT-CONTRACT.md` — the wire/Kinesis contract (scopes; the wire defines
  `$identify` but the collector skips it, and warehouse-side persons enrichment is deferred)
- `docs/EVENT-ARCHITECTURE.md` — the pipes; `docs/ARCHITECTURE.md` — the whole system
- `specs/TAM-16-clickhouse-analytics-warehouse.md` · `specs/TAM-17-persons-enrichment.md`
  (historical — persons enrichment deferred/removed pre-release)
