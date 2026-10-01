-- TAM-108 (step 1 of 3 — ADDITIVE ONLY): content-model correction.
--
-- Product-confirmed model change:
--   * Each content asset has ONE deity (today aarti/mantras/wallpaper/status use
--     many-to-many `*_deity_tags` tables; ringtone already has a single
--     `deity_slug`).
--   * Each asset links to MULTIPLE languages — an availability set (one media
--     file shown to users of those languages; today each item has a single
--     `language` column). An EMPTY set means "shown to all languages".
--
-- This migration is PURELY ADDITIVE and NON-DESTRUCTIVE. Nothing is dropped:
--   * The `*_deity_tags` join tables + relations are UNTOUCHED (dropped in
--     step 3, after the per-module code migrates off them).
--   * The legacy single `language` columns are UNTOUCHED (dropped in step 3).
-- So old task versions serving traffic during a rolling deploy keep working
-- (they never read the new columns; new columns are nullable / defaulted).
--
-- New columns:
--   * `deity_slug TEXT` (nullable) on audio_items, mantra_audio_items,
--     wallpapers, status_items — logical ref to `deities.slug` (no DB FK across
--     the module boundary, same convention as the tag tables). Ringtone already
--     has one; left as-is.
--   * `languages TEXT[]` DEFAULT '{}' on audio_items, mantra_audio_items,
--     ringtones, status_items, content (BookContent), and wallpapers. Wallpaper
--     never had a `language` column; `{}` = all languages matches its current
--     behavior.
--
-- Backfill (idempotent — every UPDATE is guarded so re-running is a no-op):
--   * `deity_slug` = the lowest (deterministic MIN) `deity_slug` from the item's
--     `*_deity_tags` rows. Items with no tag are left NULL.
--     NOTE: items with MULTIPLE deity tags collapse to the single lowest slug —
--     the other tags are NOT migrated here (they remain in the tag tables until
--     step 3). Content ops may need to re-pick the intended deity for those.
--   * `languages` = ARRAY[language] where the legacy `language` is non-null;
--     otherwise the '{}' default stands. Wallpaper has no legacy language → '{}'.

-- ---------------------------------------------------------------------------
-- 1. ADD COLUMNS (additive)
-- ---------------------------------------------------------------------------

-- AlterTable
ALTER TABLE "audio_items" ADD COLUMN     "deity_slug" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "mantra_audio_items" ADD COLUMN     "deity_slug" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ringtones" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "wallpapers" ADD COLUMN     "deity_slug" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "status_items" ADD COLUMN     "deity_slug" TEXT,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "content" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ---------------------------------------------------------------------------
-- 2. BACKFILL deity_slug from the *_deity_tags tables (lowest slug per item)
-- ---------------------------------------------------------------------------

UPDATE "audio_items" a
SET "deity_slug" = t.slug
FROM (
  SELECT "audio_id", MIN("deity_slug") AS slug
  FROM "audio_deity_tags"
  GROUP BY "audio_id"
) t
WHERE a."id" = t."audio_id" AND a."deity_slug" IS NULL;

UPDATE "mantra_audio_items" m
SET "deity_slug" = t.slug
FROM (
  SELECT "item_id", MIN("deity_slug") AS slug
  FROM "mantra_deity_tags"
  GROUP BY "item_id"
) t
WHERE m."id" = t."item_id" AND m."deity_slug" IS NULL;

UPDATE "wallpapers" w
SET "deity_slug" = t.slug
FROM (
  SELECT "wallpaper_id", MIN("deity_slug") AS slug
  FROM "wallpaper_deity_tags"
  GROUP BY "wallpaper_id"
) t
WHERE w."id" = t."wallpaper_id" AND w."deity_slug" IS NULL;

UPDATE "status_items" s
SET "deity_slug" = t.slug
FROM (
  SELECT "status_id", MIN("deity_slug") AS slug
  FROM "status_deity_tags"
  GROUP BY "status_id"
) t
WHERE s."id" = t."status_id" AND s."deity_slug" IS NULL;

-- ---------------------------------------------------------------------------
-- 3. BACKFILL languages from the legacy single `language` column
--    (ARRAY[language] when non-null; '{}' default otherwise). Guarded on an
--    empty array so re-runs never append. Wallpaper has no legacy language.
-- ---------------------------------------------------------------------------

UPDATE "audio_items"
SET "languages" = ARRAY["language"]
WHERE "language" IS NOT NULL AND cardinality("languages") = 0;

UPDATE "mantra_audio_items"
SET "languages" = ARRAY["language"]
WHERE "language" IS NOT NULL AND cardinality("languages") = 0;

UPDATE "ringtones"
SET "languages" = ARRAY["language"]
WHERE "language" IS NOT NULL AND cardinality("languages") = 0;

UPDATE "status_items"
SET "languages" = ARRAY["language"]
WHERE "language" IS NOT NULL AND cardinality("languages") = 0;

-- content.language is NOT NULL (default 'hi'), so every row backfills.
UPDATE "content"
SET "languages" = ARRAY["language"]
WHERE "language" IS NOT NULL AND cardinality("languages") = 0;
