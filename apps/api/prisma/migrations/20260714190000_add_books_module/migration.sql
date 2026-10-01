-- TAM-75: Books & Scriptures module. TWO CONTENT HIERARCHIES, ONE `content`
-- table discriminated by `content_type`:
--   major_book       → sub_book (kanda) → chapter (body_text + optional audio_url),
--                      OR chapter directly under content (sub-book-less book —
--                      chapter.sub_book_id is NULLABLE). AUDIO (`chapter.audio_url`)
--                      IS MAJOR-BOOK-ONLY (PRD §10, r7).
--   direct_scripture → carries `content_body` INLINE on the content row; NO
--                      sub_book / chapter rows and NEVER an audio URL.
-- DISCOVERY IS FREE, READING IS PRO: `body_text` / `content_body` / `audio_url`
-- are Pro-gated AT THE API (books service, fail-closed via the subscription
-- facade), never in the DB. CMS OWNERSHIP: write-side owned by CMS/ops (Phase 2
-- admin UI); the API only reads. Seeds carry SYNTHETIC placeholder text only.
-- Reversible: DROP TABLE chapter, sub_book, content; DROP TYPE book_category,
-- book_content_type.

-- CreateEnum
CREATE TYPE "book_content_type" AS ENUM ('major_book', 'direct_scripture');

-- CreateEnum
CREATE TYPE "book_category" AS ENUM ('Chalisa', 'Aarti', 'Kavach', 'Stotram');

-- CreateTable
CREATE TABLE "content" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "content_type" "book_content_type" NOT NULL,
    "category" "book_category",
    "title" TEXT NOT NULL,
    "cover_image_url" TEXT NOT NULL,
    "author" TEXT,
    "language" TEXT NOT NULL DEFAULT 'hi',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "pro_access_required" BOOLEAN NOT NULL DEFAULT true,
    "offline_cache_eligible" BOOLEAN NOT NULL DEFAULT true,
    "newly_added_at" TIMESTAMP(3),
    "content_body" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_book" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "chapter_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "sub_book_id" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "body_text" TEXT NOT NULL,
    "audio_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_slug_key" ON "content"("slug");

-- CreateIndex
CREATE INDEX "content_content_type_sort_order_idx" ON "content"("content_type", "sort_order");

-- CreateIndex
CREATE INDEX "content_category_sort_order_idx" ON "content"("category", "sort_order");

-- CreateIndex
CREATE INDEX "content_newly_added_at_idx" ON "content"("newly_added_at");

-- CreateIndex
CREATE INDEX "sub_book_content_id_order_idx" ON "sub_book"("content_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "sub_book_content_id_slug_key" ON "sub_book"("content_id", "slug");

-- CreateIndex
CREATE INDEX "chapter_content_id_order_idx" ON "chapter"("content_id", "order");

-- CreateIndex
CREATE INDEX "chapter_sub_book_id_order_idx" ON "chapter"("sub_book_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_content_id_slug_key" ON "chapter"("content_id", "slug");

-- AddForeignKey
ALTER TABLE "sub_book" ADD CONSTRAINT "sub_book_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_sub_book_id_fkey" FOREIGN KEY ("sub_book_id") REFERENCES "sub_book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

