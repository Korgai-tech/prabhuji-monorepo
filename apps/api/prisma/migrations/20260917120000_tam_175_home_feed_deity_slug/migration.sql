-- TAM-175 — give a Home feed card a deity, so the feed can be split by god.
--
-- The deity-personalised feed needs three pools per user (their main god, their
-- second god, and everything). `status_items`, `wallpapers`, `ringtones`,
-- `audio_items` and `mantra_audio_items` all already carry `deity_slug`, but the
-- Home feed's own cards never did — so "a status card for the user's main god"
-- was not expressible. This adds the column, indexes it, and backfills what can
-- be recovered.
--
-- WHY A SLUG, NOT A UUID. Every content table in this database stores the deity
-- as `deity_slug` (a logical reference to `deities.slug`, no FK), and so does
-- `pinned_content`. The warehouse property the preference is derived from
-- (`custom_user_properties.preferred_deity_id`) is also a slug despite its name.
-- Storing a uuid here would mean translating slug → uuid on every feed request,
-- forever, for nothing.
--
-- WHY NULLABLE. Three of the five producer tables have a nullable `deity_slug`
-- themselves, and an admin-authored card need not name a deity at all. NULL is a
-- real, permanent state — not missing data — and a NULL card is eligible only
-- for an "any god" slot, never a main/second pool. That is precisely what makes
-- a catalogue with no deities keep serving exactly what it serves today.

-- 1. The column. Inert until the pools read it.
ALTER TABLE "home_feed_items"
  ADD COLUMN IF NOT EXISTS "deity_slug" TEXT;

-- 2. Prefix-covers the three shapes that ask for a pool: `(is_active)` for the
--    whole-catalogue rotation read, `(is_active, content_type)` for a module
--    pool, and all three for the admin list filter.
CREATE INDEX IF NOT EXISTS "home_feed_items_is_active_content_type_deity_slug_idx"
  ON "home_feed_items" ("is_active", "content_type", "deity_slug");

-- 3. Backfill through `cta_content_id`, which the auto-feed sync
--    (`upsertContentFeedCard`) populates with the underlying content's uuid.
--
--    NOT EVERY ROW WILL MATCH, and that is the intended outcome rather than a
--    partial failure:
--      * admin-authored `content_detail` cards carry no `cta_content_id` (the
--        admin has no content-id concept for arbitrary CTAs);
--      * rows written before `cta_content_id` existed have it NULL;
--      * three source tables allow a NULL `deity_slug` of their own.
--    Each of those legitimately lands on NULL — an "any god" card. New cards get
--    the value from the producer at write time, so this backfill is a one-off
--    recovery of history, not the mechanism.
--
--    `WHERE hfi."deity_slug" IS NULL` keeps the statement re-runnable without
--    clobbering a value ops has since set by hand.
UPDATE "home_feed_items" AS hfi
SET "deity_slug" = src."deity_slug"
FROM (
  SELECT "id", "deity_slug", 'status'    AS "content_type" FROM "status_items"
  UNION ALL
  SELECT "id", "deity_slug", 'wallpaper' AS "content_type" FROM "wallpapers"
  UNION ALL
  SELECT "id", "deity_slug", 'ringtone'  AS "content_type" FROM "ringtones"
  UNION ALL
  SELECT "id", "deity_slug", 'aarti'     AS "content_type" FROM "audio_items"
  UNION ALL
  SELECT "id", "deity_slug", 'mantra'    AS "content_type" FROM "mantra_audio_items"
) AS src
WHERE hfi."cta_content_id" = src."id"
  AND hfi."content_type"   = src."content_type"
  AND hfi."deity_slug"    IS NULL
  AND src."deity_slug"    IS NOT NULL;
