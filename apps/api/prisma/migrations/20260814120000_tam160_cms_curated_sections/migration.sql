-- TAM-160: CMS-curated sections for Aarti & Mantras.
--
-- Lets an editor create an arbitrary number of hand-picked sections (e.g.
-- "Top Aartis listened to by 80s kids") with an explicit item order, instead of
-- the fixed set of query-resolved section types.
--
-- HAND-WRITTEN ON PURPOSE. Two reasons:
--   1. `prisma migrate dev` must never run from a worktree against the shared
--      local database.
--   2. The partial unique indexes below cannot be expressed in schema.prisma,
--      so THIS FILE is their source of truth. A future `migrate dev` will not
--      know about them — do not let it drop them.

-- ---------------------------------------------------------------------------
-- 1. section_type: plain UNIQUE -> PARTIAL unique (built-in types only)
-- ---------------------------------------------------------------------------
-- The built-in types stay capped at one row each, but `curated` is exempt so an
-- editor can create many curated sections. Keeping this in the DB (rather than
-- a findFirst check in the service) keeps the invariant atomic and preserves
-- the existing P2002 -> 409 STALE/duplicate path in the repositories.
--
-- Both statements run inside the single implicit transaction Prisma wraps this
-- file in, so there is no window in which a duplicate built-in row could land.
-- Dropping a unique constraint is metadata-only: no table rewrite, no backfill.

ALTER TABLE "homepage_sections" DROP CONSTRAINT IF EXISTS "homepage_sections_section_type_key";
DROP INDEX IF EXISTS "homepage_sections_section_type_key";

CREATE UNIQUE INDEX "homepage_sections_builtin_type_key"
  ON "homepage_sections" ("section_type")
  WHERE "section_type" <> 'curated';

ALTER TABLE "mantra_homepage_sections" DROP CONSTRAINT IF EXISTS "mantra_homepage_sections_section_type_key";
DROP INDEX IF EXISTS "mantra_homepage_sections_section_type_key";

CREATE UNIQUE INDEX "mantra_homepage_sections_builtin_type_key"
  ON "mantra_homepage_sections" ("section_type")
  WHERE "section_type" <> 'curated';

-- ---------------------------------------------------------------------------
-- 2. Explicit ordered membership for curated sections
-- ---------------------------------------------------------------------------
-- Mirrors `wallpaper_row_items` exactly: composite PK, a (section, position)
-- index for the ordered read, and CASCADE on both sides so deleting a section
-- or an item cleans up the join with no application code.

CREATE TABLE "homepage_section_items" (
    "section_id" UUID NOT NULL,
    "audio_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "homepage_section_items_pkey" PRIMARY KEY ("section_id","audio_id")
);

CREATE INDEX "homepage_section_items_section_id_position_idx"
  ON "homepage_section_items" ("section_id", "position");

ALTER TABLE "homepage_section_items"
  ADD CONSTRAINT "homepage_section_items_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "homepage_sections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homepage_section_items"
  ADD CONSTRAINT "homepage_section_items_audio_id_fkey"
  FOREIGN KEY ("audio_id") REFERENCES "audio_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mantra_homepage_section_items" (
    "section_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "mantra_homepage_section_items_pkey" PRIMARY KEY ("section_id","item_id")
);

CREATE INDEX "mantra_homepage_section_items_section_id_position_idx"
  ON "mantra_homepage_section_items" ("section_id", "position");

ALTER TABLE "mantra_homepage_section_items"
  ADD CONSTRAINT "mantra_homepage_section_items_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "mantra_homepage_sections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mantra_homepage_section_items"
  ADD CONSTRAINT "mantra_homepage_section_items_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "mantra_audio_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
