-- TAM-175 — the Postgres mirror of each user's warehouse-derived deity preference.
--
-- The source of truth is `custom_user_properties` in ClickHouse and it stays
-- there. This table exists because `GET /home/feed` is the app's cold-start
-- screen — its page hydrate is ~0.9 ms — and ClickHouse Cloud is a hosted
-- analytical store reached over the public internet. A per-request lookup would
-- put a warehouse round trip on every app open and make the feed's availability
-- depend on the warehouse's, where today it survives Redis being down entirely.
--
-- `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md` already specifies this shape:
-- "Warehouse-derived, written back periodically."
--
-- COLUMN MAPPING (warehouse -> here):
--   first_preferred_shared_deity_id  -> primary_deity_slug     (the MAIN pool)
--   second_preferred_shared_deity_id -> secondary_deity_slug   (the SECOND pool)
--   ad_god_name                      -> ad_deity_slug          (a slug, despite the name)
--   preferred_shared_deity_source    -> source
--   updated_at                       -> warehouse_updated_at   (also the sync watermark)
--
-- A MISSING ROW IS NORMAL, never an error: it means "no preference known", both
-- pools fall through to "any god", and the feed serves exactly what it serves
-- today. That is equally the degraded mode when the sync is behind or the
-- warehouse is unreachable — stale or absent personalisation, never a broken
-- feed.
--
-- SLUGS, NOT UUIDS, and no FK — matching `status_items`, `wallpapers`,
-- `ringtones`, `audio_items`, `mantra_audio_items` and `pinned_content`, all of
-- which store `deity_slug` as a logical reference. A deity the CMS later
-- retires must not break a stored preference; it must simply stop matching
-- content.

CREATE TABLE IF NOT EXISTS "user_deity_preferences" (
  "user_id"              UUID        NOT NULL,
  "primary_deity_slug"   TEXT,
  "secondary_deity_slug" TEXT,
  "ad_deity_slug"        TEXT,
  "source"               TEXT,
  "warehouse_updated_at" TIMESTAMPTZ(6),
  "synced_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_deity_preferences_pkey" PRIMARY KEY ("user_id")
);

-- Serves the `MAX(warehouse_updated_at)` watermark read at the start of every
-- sync run, so the incremental cursor never needs its own table to drift.
CREATE INDEX IF NOT EXISTS "user_deity_preferences_warehouse_updated_at_idx"
  ON "user_deity_preferences" ("warehouse_updated_at");
