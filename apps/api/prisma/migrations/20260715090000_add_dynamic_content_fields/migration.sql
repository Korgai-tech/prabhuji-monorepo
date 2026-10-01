-- TAM-56: close the "everything comes from the backend" gaps — content the app
-- was forced to hardcode because the API had no field/table to serve it. Postgres
-- IS the Phase-1 CMS store (TAM-56 Scope Decision 1); rows come from the
-- committed seeds. Purely ADDITIVE — no column/table is dropped or rewritten, so
-- existing rows and every current response shape keep working.
--
--  1. `home_feed_items.badge_label` — CMS-owned DISPLAY COPY for the `badge`
--     enum ("TRENDING"/"SUGGESTED" were hardcoded in the app). Nullable; the
--     service serves it non-null exactly when `badge` is non-null.
--  2. `home_shortcuts` — the Home shortcut grid (labels + ORDER + destinations),
--     previously a fully hardcoded client list with no server story.
--     #EXPORT_CRITICAL: `destination_value` is a STABLE KEY the client resolves
--     through its own hardcoded route allowlist (unknown ⇒ no-op) — never a URL
--     or raw deep link. Mirrors the `home_banners` destination convention.
--  3. `book_sections` — CMS-owned titles + ordering for the Books surfaces
--     ("Books" / "Newly Added Books" / "Browse Categories" / "All Books" were
--     hardcoded). Mirrors the Aarti module's `homepage_sections`.
--
-- Reversible: ALTER TABLE home_feed_items DROP COLUMN badge_label;
--             DROP TABLE home_shortcuts; DROP TABLE book_sections;

-- AlterTable
ALTER TABLE "home_feed_items" ADD COLUMN     "badge_label" TEXT;

-- CreateTable
CREATE TABLE "book_sections" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_shortcuts" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "destination_type" TEXT NOT NULL,
    "destination_value" TEXT,
    "icon_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_shortcuts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_sections_key_key" ON "book_sections"("key");

-- CreateIndex
CREATE INDEX "book_sections_is_active_sort_order_idx" ON "book_sections"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "home_shortcuts_key_key" ON "home_shortcuts"("key");

-- CreateIndex
CREATE INDEX "home_shortcuts_is_active_sort_order_idx" ON "home_shortcuts"("is_active", "sort_order");
