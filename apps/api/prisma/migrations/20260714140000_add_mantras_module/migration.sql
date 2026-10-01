-- TAM-65: Mantras & Stutis module. Sibling of the TAM-63 Aarti module — same
-- rule: DISCOVERY IS FREE, PLAYBACK IS PRO. NOTE: `mantra_audio_items.audio_url`
-- always holds the real playable URL in the DB — it is ENTITLEMENT-GATED AT THE
-- API (nulled before serialization for non-Pro callers), NOT at the DB level.
-- `mantra_text` is TEXT storing UTF-8 Devanagari with line breaks preserved
-- byte-for-byte (never trimmed/normalized). `mantra_deity_tags.deity_slug`
-- logically references `deities.slug` (TAM-57) with no DB FK across the module
-- boundary (validated via the deity facade). Like/view/share counts are NOT
-- stored here — they live in the shared TAM-57 engagement tables (contentType
-- "mantra"). Content ownership (catalogue + sections) is CMS/ops (Phase 2 admin).

-- CreateTable
CREATE TABLE "mantra_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "image_url" TEXT,
    "background_color_token" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mantra_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantra_audio_items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "artwork_url" TEXT NOT NULL,
    "audio_url" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "singer_name" TEXT,
    "composer_name" TEXT,
    "mantra_text" TEXT NOT NULL,
    "transliteration_text" TEXT,
    "language" TEXT,
    "description" TEXT,
    "deep_link_url" TEXT,
    "short_share_text" TEXT,
    "published_at" TIMESTAMP(3),
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "requires_pro_for_playback" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mantra_audio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantra_category_tags" (
    "item_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "mantra_category_tags_pkey" PRIMARY KEY ("item_id","category_id")
);

-- CreateTable
CREATE TABLE "mantra_deity_tags" (
    "item_id" UUID NOT NULL,
    "deity_slug" TEXT NOT NULL,

    CONSTRAINT "mantra_deity_tags_pkey" PRIMARY KEY ("item_id","deity_slug")
);

-- CreateTable
CREATE TABLE "mantra_homepage_sections" (
    "id" UUID NOT NULL,
    "section_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "layout_type" TEXT NOT NULL,
    "show_all_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mantra_homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantra_recently_played" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "last_played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_progress_seconds" INTEGER,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mantra_recently_played_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantra_counter_preferences" (
    "user_id" UUID NOT NULL,
    "last_selected_repeat_target" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mantra_counter_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mantra_categories_slug_key" ON "mantra_categories"("slug");

-- CreateIndex
CREATE INDEX "mantra_categories_is_active_sort_order_idx" ON "mantra_categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "mantra_audio_items_slug_key" ON "mantra_audio_items"("slug");

-- CreateIndex
CREATE INDEX "mantra_audio_items_is_active_sort_order_idx" ON "mantra_audio_items"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "mantra_audio_items_is_active_play_count_idx" ON "mantra_audio_items"("is_active", "play_count");

-- CreateIndex
CREATE INDEX "mantra_audio_items_is_active_published_at_idx" ON "mantra_audio_items"("is_active", "published_at");

-- CreateIndex
CREATE INDEX "mantra_category_tags_category_id_idx" ON "mantra_category_tags"("category_id");

-- CreateIndex
CREATE INDEX "mantra_deity_tags_deity_slug_idx" ON "mantra_deity_tags"("deity_slug");

-- CreateIndex
CREATE UNIQUE INDEX "mantra_homepage_sections_section_type_key" ON "mantra_homepage_sections"("section_type");

-- CreateIndex
CREATE INDEX "mantra_homepage_sections_is_active_sort_order_idx" ON "mantra_homepage_sections"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "mantra_recently_played_user_id_last_played_at_idx" ON "mantra_recently_played"("user_id", "last_played_at");

-- CreateIndex
CREATE UNIQUE INDEX "mantra_recently_played_user_id_item_id_key" ON "mantra_recently_played"("user_id", "item_id");

-- AddForeignKey
ALTER TABLE "mantra_category_tags" ADD CONSTRAINT "mantra_category_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "mantra_audio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantra_category_tags" ADD CONSTRAINT "mantra_category_tags_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "mantra_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantra_deity_tags" ADD CONSTRAINT "mantra_deity_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "mantra_audio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantra_recently_played" ADD CONSTRAINT "mantra_recently_played_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "mantra_audio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

