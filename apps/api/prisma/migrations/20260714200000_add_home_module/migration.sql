-- TAM-61: Home module (CMS-driven hero banners + a mixed, paginated devotional
-- feed). Postgres IS the Phase-1 CMS store — NO admin UI (TAM-56 Scope Decision
-- 1); rows are populated by the committed `home.seed.ts`. Ranking is IDENTICAL
-- for free and Pro (PRD §5, §10) — nothing here branches on subscription; the
-- only Pro-conditional signal is the server-authored `is_pro_feature_discovery`
-- banner flag the CLIENT resolves into a paywall route (TAM-58). `home_feed_items`
-- is DENORMALIZED display+routing data (NOT an FK into the sibling module tables);
-- like/view/share counts live in the shared TAM-57 engagement tables (contentType
-- "home_item"). `home_settings` is a single-row config toggling `feed_trending_first`.
-- Reversible: DROP TABLE home_settings, home_feed_items, home_banners.

-- CreateTable
CREATE TABLE "home_banners" (
    "id" UUID NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "title" TEXT,
    "destination_type" TEXT NOT NULL,
    "destination_value" TEXT,
    "is_pro_feature_discovery" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_feed_items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "label" TEXT,
    "badge" TEXT,
    "hero_image_url" TEXT NOT NULL,
    "audio_preview_url" TEXT,
    "cta_label" TEXT NOT NULL,
    "cta_destination_type" TEXT NOT NULL,
    "cta_destination_value" TEXT NOT NULL,
    "header_destination_module" TEXT NOT NULL,
    "share_title" TEXT NOT NULL,
    "share_text" TEXT NOT NULL,
    "share_deep_link" TEXT NOT NULL,
    "share_thumbnail_url" TEXT,
    "trending_score" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_feed_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "feed_trending_first" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_banners_is_active_sort_order_idx" ON "home_banners"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "home_feed_items_slug_key" ON "home_feed_items"("slug");

-- CreateIndex
CREATE INDEX "home_feed_items_is_active_sort_order_idx" ON "home_feed_items"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "home_feed_items_is_active_trending_score_idx" ON "home_feed_items"("is_active", "trending_score");

-- CreateIndex
CREATE UNIQUE INDEX "home_settings_key_key" ON "home_settings"("key");

