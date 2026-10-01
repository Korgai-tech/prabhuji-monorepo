-- TAM-71: Status Sharing module. EVERYTHING HERE IS FREE — browse, filter by
-- deity, customize + save the personal/business overlay profile, set an avatar
-- URL, like and view; the ONLY Pro action is the final Share render, enforced
-- CLIENT-SIDE (TAM-72). So NO server entitlement gate. Like/view/share counts
-- live in the shared TAM-57 engagement tables (contentType "status"); the view
-- is recorded by the client after a 2s threshold (server just exposes
-- recordView). `deity_slug` logically references `deities.slug` (TAM-57) with no
-- DB FK. `user_status_profiles` is one row per user (active_profile_type +
-- both field sets). `status_overlay_templates` is the single fixed Phase-1
-- template. Reversible: DROP TABLE status_deity_tags, status_overlay_templates,
-- user_status_profiles, status_items.

-- CreateTable
CREATE TABLE "status_items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "media_type" TEXT NOT NULL,
    "image_url" TEXT,
    "video_url" TEXT,
    "thumbnail_url" TEXT NOT NULL,
    "overlay_safe_area" JSONB NOT NULL,
    "duration_seconds" INTEGER,
    "language" TEXT,
    "festival_tag" TEXT,
    "share_caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_deity_tags" (
    "status_id" UUID NOT NULL,
    "deity_slug" TEXT NOT NULL,

    CONSTRAINT "status_deity_tags_pkey" PRIMARY KEY ("status_id","deity_slug")
);

-- CreateTable
CREATE TABLE "user_status_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_profile_type" TEXT NOT NULL DEFAULT 'personal',
    "personal_display_name" TEXT,
    "business_name" TEXT,
    "business_details" TEXT,
    "business_mobile_number" TEXT,
    "avatar_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_status_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_overlay_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_overlay_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "status_items_slug_key" ON "status_items"("slug");

-- CreateIndex
CREATE INDEX "status_items_is_active_sort_order_idx" ON "status_items"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "status_items_media_type_is_active_idx" ON "status_items"("media_type", "is_active");

-- CreateIndex
CREATE INDEX "status_deity_tags_deity_slug_idx" ON "status_deity_tags"("deity_slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_status_profiles_user_id_key" ON "user_status_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "status_overlay_templates_key_key" ON "status_overlay_templates"("key");

-- AddForeignKey
ALTER TABLE "status_deity_tags" ADD CONSTRAINT "status_deity_tags_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

