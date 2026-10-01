-- TAM-63: Aarti & Bhajans audio library. NOTE: `audio_items.audio_stream_url`
-- always holds the real playable URL in the DB — it is ENTITLEMENT-GATED AT THE
-- API (nulled before serialization for non-Pro callers), NOT at the DB level.
-- `audio_deity_tags.deity_slug` logically references `deities.slug` (TAM-57)
-- with no DB FK across the module boundary (validated via the deity facade).

-- CreateTable
CREATE TABLE "audio_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "description" TEXT,
    "display_color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_items" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cover_image_url" TEXT NOT NULL,
    "audio_stream_url" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "singer_name" TEXT,
    "composer_names" TEXT,
    "language" TEXT,
    "description" TEXT,
    "published_at" TIMESTAMP(3),
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_prabhuji_original" BOOLEAN NOT NULL DEFAULT false,
    "requires_pro_for_playback" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_category_tags" (
    "audio_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "audio_category_tags_pkey" PRIMARY KEY ("audio_id","category_id")
);

-- CreateTable
CREATE TABLE "audio_deity_tags" (
    "audio_id" UUID NOT NULL,
    "deity_slug" TEXT NOT NULL,

    CONSTRAINT "audio_deity_tags_pkey" PRIMARY KEY ("audio_id","deity_slug")
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" UUID NOT NULL,
    "section_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "item_query" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_playback_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "audio_id" UUID NOT NULL,
    "last_played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_position_seconds" INTEGER,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_playback_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_categories_slug_key" ON "audio_categories"("slug");

-- CreateIndex
CREATE INDEX "audio_categories_is_active_sort_order_idx" ON "audio_categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "audio_items_slug_key" ON "audio_items"("slug");

-- CreateIndex
CREATE INDEX "audio_items_is_active_sort_order_idx" ON "audio_items"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "audio_items_is_active_play_count_idx" ON "audio_items"("is_active", "play_count");

-- CreateIndex
CREATE INDEX "audio_items_is_active_published_at_idx" ON "audio_items"("is_active", "published_at");

-- CreateIndex
CREATE INDEX "audio_category_tags_category_id_idx" ON "audio_category_tags"("category_id");

-- CreateIndex
CREATE INDEX "audio_deity_tags_deity_slug_idx" ON "audio_deity_tags"("deity_slug");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_sections_section_type_key" ON "homepage_sections"("section_type");

-- CreateIndex
CREATE INDEX "homepage_sections_is_active_sort_order_idx" ON "homepage_sections"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "user_playback_history_user_id_last_played_at_idx" ON "user_playback_history"("user_id", "last_played_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_playback_history_user_id_audio_id_key" ON "user_playback_history"("user_id", "audio_id");

-- AddForeignKey
ALTER TABLE "audio_category_tags" ADD CONSTRAINT "audio_category_tags_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_category_tags" ADD CONSTRAINT "audio_category_tags_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "audio_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_deity_tags" ADD CONSTRAINT "audio_deity_tags_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_playback_history" ADD CONSTRAINT "user_playback_history_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
