-- Initial analytics warehouse schema (TAM-16, consolidated pre-release).
-- ONE wide table, ONE column per field, all snake_case. ClickPipe writes each
-- Kinesis StoredEvent field DIRECTLY into its typed column (1:1 by name, no
-- overrides): epoch-ms integers land in DateTime64 columns, JSON objects land in
-- JSON / Map columns. Only a few columns are computed on insert (see below).
--
-- The collector's wire record is already snake_case and correctly typed
-- (kinesis-events.repository.ts toWireRecord): timestamps as epoch ms, the
-- property bags + groups as JSON objects. So there are no raw camelCase
-- duplicates, no raw String bags, and no separate raw-ms columns.
--
-- Timestamps are stored TIMEZONE-NAIVE (DateTime64(3), a UTC epoch): ClickPipe
-- REJECTS destination columns whose type carries a timezone ("data types with
-- time zones are not permitted"), so no column may be DateTime64(_, 'Asia/Kolkata').
-- IST (Asia/Kolkata) is applied at the calendar boundaries instead — event_date and
-- the monthly partition pass 'Asia/Kolkata' explicitly (below) — and ad-hoc queries
-- must too: toDate(event_time,'Asia/Kolkata'), toStartOfHour(event_time,'Asia/Kolkata'),
-- and today('Asia/Kolkata') (now()/today() follow the server/session tz, not the data).
--
-- PARTITION BY the server-receive month (server_time), not the client event
-- month: client clocks are unreliable and the SDK queues offline, so partitioning
-- by ingestion keeps partitions bounded and TTL clean.
--
-- $identify: plain MergeTree has no insert-time filter, so the collector skips
-- `$identify` before Kinesis (no downstream consumer). No persons/identity
-- resolution (removed pre-release). See docs/ANALYTICS-WAREHOUSE.md.
--
-- Conventions:
-- * Engine is MergeTree so the same DDL runs locally AND in ClickHouse Cloud
--   (Cloud transparently runs MergeTree as SharedMergeTree).
-- * Every statement is idempotent (IF NOT EXISTS, no DROPs) so a partially
--   failed apply can simply be re-run. Keep future migrations idempotent too.
-- * Statements end with `;` at end of line. Applied migrations are immutable.

-- Wide events table — append-only; dedup by insert_id AT QUERY TIME
-- (LIMIT 1 BY insert_id). ORDER BY is the index: low-cardinality first, matching
-- funnel access (day -> event type -> user). The inline projection serves per-user
-- session-journey reads.
CREATE TABLE IF NOT EXISTS events (
  -- written 1:1 by ClickPipe from the (snake_case) Kinesis record. DEFAULTs let
  -- records with omitted optional fields land cleanly. Epoch-ms integers on the
  -- wire land directly in the DateTime64 columns (tz-naive UTC — ClickPipe forbids
  -- timezone-typed columns); JSON objects in JSON / the Map.
  insert_id String,
  event_type LowCardinality(String),
  user_id String DEFAULT '',
  device_id String DEFAULT '',
  pseudo_id String DEFAULT '',
  session_id Int64 DEFAULT -1,
  event_seq_id UInt64 DEFAULT 0,
  event_time DateTime64(3),
  server_time DateTime64(3),
  client_upload_time DateTime64(3) DEFAULT 0,
  event_properties JSON DEFAULT '{}',
  user_properties JSON DEFAULT '{}',
  group_properties JSON DEFAULT '{}',
  groups Map(LowCardinality(String), String),
  platform LowCardinality(String) DEFAULT '',
  os_name LowCardinality(String) DEFAULT '',
  os_version LowCardinality(String) DEFAULT '',
  app_version LowCardinality(String) DEFAULT '',
  device_brand LowCardinality(String) DEFAULT '',
  device_model String DEFAULT '',
  device_manufacturer LowCardinality(String) DEFAULT '',
  carrier LowCardinality(String) DEFAULT '',
  country LowCardinality(String) DEFAULT '',
  language LowCardinality(String) DEFAULT '',
  adid String DEFAULT '',
  library LowCardinality(String) DEFAULT '',
  ip String DEFAULT '',
  attempts UInt16 DEFAULT 0,
  retry_count UInt16 DEFAULT 0,
  req_guid String DEFAULT '',
  -- computed on insert. ORDER MATTERS: corrected_time is declared first because
  -- event_date and synthetic_sequence_time are both derived from it.
  -- corrected_time = server_time - (client_upload_time - event_time) on-device age.
  -- The upload and event stamps are both the device clock, so their difference
  -- cancels clock skew; anchoring to the trusted server_time yields a skew-free
  -- event time. Guard: missing client_upload_time (epoch 0) or upload-before-event
  -- -> fall back to event_time.
  corrected_time DateTime64(3) MATERIALIZED
    fromUnixTimestamp64Milli(multiIf(
      toUnixTimestamp64Milli(client_upload_time) = 0, toUnixTimestamp64Milli(event_time),
      toUnixTimestamp64Milli(client_upload_time) < toUnixTimestamp64Milli(event_time), toUnixTimestamp64Milli(event_time),
      toUnixTimestamp64Milli(server_time) - (toUnixTimestamp64Milli(client_upload_time) - toUnixTimestamp64Milli(event_time)))),
  -- event_date leads the ORDER BY: derive it from the skew-corrected time, NOT the
  -- raw (untrusted) device event_time, so a skewed client clock cannot mis-date the
  -- row into the wrong day. corrected_time falls back to event_time when the skew
  -- signal is absent, so healthy clocks are unaffected. MATERIALIZED (never on the
  -- wire — ClickPipe must not set it). 'Asia/Kolkata' is passed explicitly because
  -- corrected_time is now tz-naive (UTC) — this is where the IST day is decided.
  event_date Date MATERIALIZED toDate(corrected_time, 'Asia/Kolkata'),
  -- deterministic within-device order: [corrected ms] * 1e6 + [6-digit client seq]
  synthetic_sequence_time UInt64 MATERIALIZED
    (toUInt64(toUnixTimestamp64Milli(corrected_time)) * 1000000) + (event_seq_id % 1000000),
  PROJECTION sessions_projection (
    SELECT * ORDER BY (user_id, session_id, event_time)
  )
) ENGINE = MergeTree
PARTITION BY toYYYYMM(server_time, 'Asia/Kolkata')
ORDER BY (event_date, event_type, user_id);
-- TTL later (one line): ALTER TABLE events MODIFY TTL toDate(server_time, 'Asia/Kolkata') + INTERVAL 12 MONTH;
