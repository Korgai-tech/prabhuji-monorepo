-- TAM-159: multiple paywall screens, traffic-split, CMS-driven.
--
-- Additive and backward compatible by construction. After this migration the
-- public `GET /paywall/config` response is BYTE-IDENTICAL for every existing
-- caller: no variant rows exist yet, and the flat `paywall_translations.video_*`
-- columns are left in place and still populated. Shipped APKs read those columns
-- directly, so they are not dropped here — they stop being the source of truth
-- (that becomes `paywall_hero_media`) but keep being emitted on the wire from
-- the response projection. Dropping them is a later, separate migration once no
-- supported build reads them.

-- ---------------------------------------------------------------------------
-- 1. Which built layout renders a config.
--
-- Every existing row is the shipped design, so the default backfills them
-- correctly and no UPDATE is needed. TEXT rather than an enum: a new layout must
-- not require a migration, and the real validation boundary is the client's
-- fallback (an unrecognised value renders `card_hero`), not the database.
-- ---------------------------------------------------------------------------
ALTER TABLE "paywall_configs"
  ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'card_hero';

-- ---------------------------------------------------------------------------
-- 1b. The lowest app version allowed to receive this paywall.
--
-- A layout only exists inside an app binary, so serving one to a build that
-- predates it renders a broken screen. Per-paywall rather than one global
-- constant because that is what it describes — "which builds contain this
-- screen" — and a single gate cannot express "layouts 1-4 shipped in 1.1.0,
-- layout 5 in 1.3.0" without cutting off the four that were fine.
--
-- `0.0.0` = no gate, which is right for every existing row: they are all the
-- shipped paywall, which every build has.
-- ---------------------------------------------------------------------------
ALTER TABLE "paywall_configs"
  ADD COLUMN "min_app_version" TEXT NOT NULL DEFAULT '0.0.0';

-- ---------------------------------------------------------------------------
-- 2. Scope plan COPY to a variant, while the plan itself stays canonical.
--
-- This is what lets a variant reword its trial line without duplicating
-- `paywall_plans` — so `amount_paise`, `product_id` and `initial_deposit_paise`
-- remain a single row set and a price change stays one row, not one per variant.
--
-- NOT NULL with a sentinel default, deliberately NOT a nullable "canonical means
-- NULL": Postgres treats NULLs as DISTINCT in unique indexes, so
-- `(plan_id, locale, NULL)` could be inserted twice and the uniqueness the old
-- two-column constraint gave us would be silently gone. The sentinel keeps a
-- plain unique index doing the same job.
--
-- The default backfills every existing row to the canonical paywall, and because
-- the old constraint already guaranteed `(plan_id, locale)` was unique, adding a
-- constant third column cannot collide. The new index is therefore safe to build
-- immediately after.
-- ---------------------------------------------------------------------------
ALTER TABLE "paywall_plan_translations"
  ADD COLUMN "paywall_id" TEXT NOT NULL DEFAULT 'vip-membership-v1';

DROP INDEX "paywall_plan_translations_plan_id_locale_key";

CREATE UNIQUE INDEX "paywall_plan_translations_plan_id_locale_paywall_id_key"
  ON "paywall_plan_translations"("plan_id", "locale", "paywall_id");

-- ---------------------------------------------------------------------------
-- 3. The hero, as an ordered per-locale list.
--
-- Replaces "one nullable video URL" with something that can also express "one
-- image" and "N images in a carousel". No FK to `paywall_configs` — consistent
-- with every other paywall child table, which join by the `paywall_id` string.
-- ---------------------------------------------------------------------------
CREATE TABLE "paywall_hero_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paywall_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "media_type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "media_id" TEXT NOT NULL,

    CONSTRAINT "paywall_hero_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paywall_hero_media_paywall_id_locale_sort_order_key"
  ON "paywall_hero_media"("paywall_id", "locale", "sort_order");

CREATE INDEX "paywall_hero_media_paywall_id_locale_sort_order_idx"
  ON "paywall_hero_media"("paywall_id", "locale", "sort_order");

-- ---------------------------------------------------------------------------
-- 4. Backfill the hero from the flat video columns.
--
-- One row per translation that actually has an asset. A translation with a
-- `video_url` becomes a `video` row (its poster carried as `thumbnail_url`); one
-- with only a poster becomes an `image` row, which is exactly how the shipped
-- screen already treats that case. Translations with neither produce no row, and
-- the response projection yields the same nulls it does today.
--
-- `media_id` is NOT NULL because it is the analytics identity of the creative.
-- Seeded rows predate that requirement, so a legacy row without a `video_id`
-- gets a synthetic, stable id rather than blocking the migration — it is
-- distinguishable in the warehouse precisely because it is prefixed.
-- ---------------------------------------------------------------------------
INSERT INTO "paywall_hero_media" ("paywall_id", "locale", "sort_order", "media_type", "url", "thumbnail_url", "media_id")
SELECT
    t."paywall_id",
    t."locale",
    0,
    CASE WHEN t."video_url" IS NOT NULL THEN 'video' ELSE 'image' END,
    COALESCE(t."video_url", t."video_thumbnail_url"),
    CASE WHEN t."video_url" IS NOT NULL THEN t."video_thumbnail_url" ELSE NULL END,
    COALESCE(t."video_id", 'legacy-' || t."paywall_id" || '-' || t."locale")
FROM "paywall_translations" t
WHERE t."video_url" IS NOT NULL
   OR t."video_thumbnail_url" IS NOT NULL;
