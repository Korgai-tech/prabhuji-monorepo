-- TAM-84: media ledger (`media_objects`).
--
-- ADDITIVE + REVERSIBLE. One row is written AT PRESIGN TIME for every key the
-- API mints (POST /admin/media/presign). It backs the write-path ownership gate
-- (IMediaApi.validateOwnedUrl), audit (`uploaded_by` = the presigning admin's
-- JWT subject), and any FUTURE orphan reaper / media-library UI. Backfilling it
-- later is impossible — S3 does not know who uploaded what or why — so it is
-- written now (ADR §A6).
--
-- Nothing references this table (media URLs live as plain TEXT columns across
-- ~20 content tables; there is no FK to here), so it is safe under TAM-79's
-- rolling deploy and trivially reversible.
--
-- Rollback: DROP TABLE "media_objects";

-- CreateTable
CREATE TABLE "media_objects" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_objects_key_key" ON "media_objects"("key");

-- CreateIndex
CREATE INDEX "media_objects_module_entity_idx" ON "media_objects"("module", "entity");
