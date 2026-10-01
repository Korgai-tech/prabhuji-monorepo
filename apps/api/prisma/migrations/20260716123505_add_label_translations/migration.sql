-- CreateTable
CREATE TABLE "audio_category_translations" (
    "id" UUID NOT NULL,
    "audio_category_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "audio_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homepage_section_translations" (
    "id" UUID NOT NULL,
    "homepage_section_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "homepage_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantra_category_translations" (
    "id" UUID NOT NULL,
    "mantra_category_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,

    CONSTRAINT "mantra_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantra_homepage_section_translations" (
    "id" UUID NOT NULL,
    "mantra_homepage_section_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "mantra_homepage_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallpaper_homepage_row_translations" (
    "id" UUID NOT NULL,
    "wallpaper_homepage_row_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "wallpaper_homepage_row_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_section_translations" (
    "id" UUID NOT NULL,
    "book_section_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "book_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_banner_translations" (
    "id" UUID NOT NULL,
    "home_banner_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "home_banner_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_feed_item_translations" (
    "id" UUID NOT NULL,
    "home_feed_item_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "label" TEXT,
    "cta_label" TEXT NOT NULL,
    "badge_label" TEXT,

    CONSTRAINT "home_feed_item_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_shortcut_translations" (
    "id" UUID NOT NULL,
    "home_shortcut_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "home_shortcut_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_category_translations_audio_category_id_locale_key" ON "audio_category_translations"("audio_category_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_section_translations_homepage_section_id_locale_key" ON "homepage_section_translations"("homepage_section_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "mantra_category_translations_mantra_category_id_locale_key" ON "mantra_category_translations"("mantra_category_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "mantra_homepage_section_translations_mantra_homepage_sectio_key" ON "mantra_homepage_section_translations"("mantra_homepage_section_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "wallpaper_homepage_row_translations_wallpaper_homepage_row__key" ON "wallpaper_homepage_row_translations"("wallpaper_homepage_row_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "book_section_translations_book_section_id_locale_key" ON "book_section_translations"("book_section_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "home_banner_translations_home_banner_id_locale_key" ON "home_banner_translations"("home_banner_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "home_feed_item_translations_home_feed_item_id_locale_key" ON "home_feed_item_translations"("home_feed_item_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "home_shortcut_translations_home_shortcut_id_locale_key" ON "home_shortcut_translations"("home_shortcut_id", "locale");

-- AddForeignKey
ALTER TABLE "audio_category_translations" ADD CONSTRAINT "audio_category_translations_audio_category_id_fkey" FOREIGN KEY ("audio_category_id") REFERENCES "audio_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homepage_section_translations" ADD CONSTRAINT "homepage_section_translations_homepage_section_id_fkey" FOREIGN KEY ("homepage_section_id") REFERENCES "homepage_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantra_category_translations" ADD CONSTRAINT "mantra_category_translations_mantra_category_id_fkey" FOREIGN KEY ("mantra_category_id") REFERENCES "mantra_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantra_homepage_section_translations" ADD CONSTRAINT "mantra_homepage_section_translations_mantra_homepage_secti_fkey" FOREIGN KEY ("mantra_homepage_section_id") REFERENCES "mantra_homepage_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallpaper_homepage_row_translations" ADD CONSTRAINT "wallpaper_homepage_row_translations_wallpaper_homepage_row_fkey" FOREIGN KEY ("wallpaper_homepage_row_id") REFERENCES "wallpaper_homepage_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_section_translations" ADD CONSTRAINT "book_section_translations_book_section_id_fkey" FOREIGN KEY ("book_section_id") REFERENCES "book_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_banner_translations" ADD CONSTRAINT "home_banner_translations_home_banner_id_fkey" FOREIGN KEY ("home_banner_id") REFERENCES "home_banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_feed_item_translations" ADD CONSTRAINT "home_feed_item_translations_home_feed_item_id_fkey" FOREIGN KEY ("home_feed_item_id") REFERENCES "home_feed_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_shortcut_translations" ADD CONSTRAINT "home_shortcut_translations_home_shortcut_id_fkey" FOREIGN KEY ("home_shortcut_id") REFERENCES "home_shortcuts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
