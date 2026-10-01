-- TAM-69: Wallpaper module. DISCOVERY IS FREE, only the device Set action is
-- Pro (enforced CLIENT-SIDE in TAM-70) — so NO server entitlement gate here:
-- every preview + apply asset URL is returned to any authenticated user. Like/
-- share counts live in the shared TAM-57 engagement tables (contentType
-- "wallpaper"); `set_count` is a LOCAL server-authoritative counter (drives the
-- trending row/listing, incremented only after a confirmed device set). Homepage
-- rows are CMS-configurable via data (wallpaper_homepage_rows + row_items).
-- `deity_slug` logically references `deities.slug` (TAM-57) with no DB FK.
-- Reversible: DROP TABLE wallpaper_row_items, wallpaper_homepage_rows,
-- wallpaper_deity_tags, wallpapers.

-- CreateTable
CREATE TABLE "wallpapers" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "preview_image_url" TEXT NOT NULL,
    "preview_video_url" TEXT,
    "apply_asset_url" TEXT,
    "live_wallpaper_asset_url" TEXT,
    "live_wallpaper_package" TEXT,
    "fallback_static_thumbnail_url" TEXT,
    "custom_category_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alt_text" TEXT,
    "dominant_color" TEXT,
    "video_duration_seconds" INTEGER,
    "supported_android_versions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focal_point" JSONB,
    "safe_area_metadata" JSONB,
    "set_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallpapers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallpaper_deity_tags" (
    "wallpaper_id" UUID NOT NULL,
    "deity_slug" TEXT NOT NULL,

    CONSTRAINT "wallpaper_deity_tags_pkey" PRIMARY KEY ("wallpaper_id","deity_slug")
);

-- CreateTable
CREATE TABLE "wallpaper_homepage_rows" (
    "id" UUID NOT NULL,
    "row_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "row_type" TEXT NOT NULL,
    "icon_key" TEXT,
    "media_type_filter" TEXT,
    "deity_tag_filter" TEXT,
    "custom_category_tag_filter" TEXT,
    "max_items" INTEGER NOT NULL DEFAULT 20,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallpaper_homepage_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallpaper_row_items" (
    "row_id" UUID NOT NULL,
    "wallpaper_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "wallpaper_row_items_pkey" PRIMARY KEY ("row_id","wallpaper_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallpapers_slug_key" ON "wallpapers"("slug");

-- CreateIndex
CREATE INDEX "wallpapers_media_type_is_active_idx" ON "wallpapers"("media_type", "is_active");

-- CreateIndex
CREATE INDEX "wallpapers_is_active_display_order_idx" ON "wallpapers"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "wallpapers_is_active_set_count_idx" ON "wallpapers"("is_active", "set_count");

-- CreateIndex
CREATE INDEX "wallpapers_is_active_created_at_idx" ON "wallpapers"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "wallpapers_custom_category_tags_idx" ON "wallpapers" USING GIN ("custom_category_tags");

-- CreateIndex
CREATE INDEX "wallpaper_deity_tags_deity_slug_idx" ON "wallpaper_deity_tags"("deity_slug");

-- CreateIndex
CREATE UNIQUE INDEX "wallpaper_homepage_rows_row_key_key" ON "wallpaper_homepage_rows"("row_key");

-- CreateIndex
CREATE INDEX "wallpaper_homepage_rows_is_active_display_order_idx" ON "wallpaper_homepage_rows"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "wallpaper_row_items_row_id_position_idx" ON "wallpaper_row_items"("row_id", "position");

-- AddForeignKey
ALTER TABLE "wallpaper_deity_tags" ADD CONSTRAINT "wallpaper_deity_tags_wallpaper_id_fkey" FOREIGN KEY ("wallpaper_id") REFERENCES "wallpapers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallpaper_row_items" ADD CONSTRAINT "wallpaper_row_items_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "wallpaper_homepage_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallpaper_row_items" ADD CONSTRAINT "wallpaper_row_items_wallpaper_id_fkey" FOREIGN KEY ("wallpaper_id") REFERENCES "wallpapers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

