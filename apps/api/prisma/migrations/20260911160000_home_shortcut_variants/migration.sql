-- TAM-174 (revised) — per-A/B-arm PRESENTATION moves off `home_shortcuts` and
-- into its own table.
--
-- WHY THE CHANGE. The first cut treated the experiment as a colour swap: one
-- tile, one palette, published to the gradient arm only. The requirement is
-- wider — the CMS holds a COMPLETE tile per arm (its own artwork, its own copy,
-- its own palette), so each arm can be merchandised independently. That is a
-- row per (shortcut, arm), not five more columns on the shortcut.
--
-- Every presentation column here is NULLABLE and null means "inherit the base
-- `home_shortcuts` row", so an arm that only changes the palette does not have
-- to re-state copy that has not moved.
--
-- SAFE TO RE-RUN and safe to deploy over the previous migration: the palette
-- columns added by `20260911120000_add_home_shortcut_theme_and_gradient_experiment`
-- are CARRIED ACROSS into a `gradient_v1` row before being dropped, so an
-- environment that already ran that migration keeps its seeded palettes.

CREATE TABLE IF NOT EXISTS "home_shortcut_variants" (
  "id"                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "home_shortcut_id"           UUID NOT NULL REFERENCES "home_shortcuts"("id") ON DELETE CASCADE,
  "variant"                    TEXT NOT NULL,
  "label"                      TEXT,
  "icon_url"                   TEXT,
  "theme_background_from"      TEXT,
  "theme_background_from_stop" DOUBLE PRECISION,
  "theme_background_to"        TEXT,
  "theme_background_to_stop"   DOUBLE PRECISION,
  "theme_label_color"          TEXT,
  "created_at"                 TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"                 TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "home_shortcut_variants_home_shortcut_id_variant_key"
  ON "home_shortcut_variants" ("home_shortcut_id", "variant");

-- Carry any palette seeded by the previous migration into a `gradient_v1` row.
-- Guarded on the column still existing so this is a no-op on a database that
-- never ran it (a fresh one, which migrates in a single pass).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'home_shortcuts' AND column_name = 'theme_background_from'
  ) THEN
    INSERT INTO "home_shortcut_variants" (
      "home_shortcut_id", "variant",
      "theme_background_from", "theme_background_from_stop",
      "theme_background_to", "theme_background_to_stop", "theme_label_color"
    )
    SELECT
      s."id", 'gradient_v1',
      s."theme_background_from", s."theme_background_from_stop",
      s."theme_background_to", s."theme_background_to_stop", s."theme_label_color"
    FROM "home_shortcuts" s
    WHERE s."theme_background_from" IS NOT NULL
    ON CONFLICT ("home_shortcut_id", "variant") DO NOTHING;
  END IF;
END $$;

ALTER TABLE "home_shortcuts"
  DROP COLUMN IF EXISTS "theme_background_from",
  DROP COLUMN IF EXISTS "theme_background_from_stop",
  DROP COLUMN IF EXISTS "theme_background_to",
  DROP COLUMN IF EXISTS "theme_background_to_stop",
  DROP COLUMN IF EXISTS "theme_label_color";
