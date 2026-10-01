-- TAM-132 — CMS-driven shortcut grid: adds a nullable `icon_url` column to
-- `home_shortcuts` and refreshes the seed to the six-tile 3×2 layout from
-- TAM-131's Card→destination table (paint order: aarti_bhajans, mantras_stutis,
-- set_wallpaper, set_status, horoscope, set_ringtone; sort_order 0..5;
-- destination_value ∈ {aarti, mantras, wallpaper, status, horoscope, ringtone};
-- icon_key ∈ {aarti, mantras, wallpaper, status, horoscope, ringtone}).
--
-- The client's fallback ladder for the icon is (`icon_url` → bundled `icon_key`
-- asset → nothing) — see `apps/mobile/lib/features/home/presentation/home_shortcut_grid.dart`
-- (`_kShortcutArt` map). Seeding `icon_url = NULL` for every row here is
-- deliberate: (a) ops will populate real S3 URLs via the CMS post-deploy per
-- the spec's Blocker mitigation, and (b) NULL cleanly triggers the client's
-- bundled-iconKey fallback in the meantime (an unreachable placeholder URL
-- would flip every card into the error-fallback path and mask real bugs).
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` + `INSERT … ON CONFLICT (key) DO UPDATE`
-- on all six rows. Style mirrors `20260811140000_rename_home_status_cta_to_share/migration.sql`.

ALTER TABLE "home_shortcuts"
  ADD COLUMN IF NOT EXISTS "icon_url" TEXT;

-- Six-tile refresh — all rows upserted so a re-run is a no-op.
INSERT INTO "home_shortcuts" ("id", "key", "label", "destination_type", "destination_value", "icon_key", "icon_url", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'aarti_bhajans',  'Aarti & Bhajans',  'linked_module', 'aarti',     'aarti',     NULL, 0, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'mantras_stutis', 'Mantras & Stutis', 'linked_module', 'mantras',   'mantras',   NULL, 1, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'set_wallpaper',  'Set Wallpaper',    'linked_module', 'wallpaper', 'wallpaper', NULL, 2, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'set_status',     'Set Status',       'linked_module', 'status',    'status',    NULL, 3, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'horoscope',      'Horoscope',        'linked_module', 'horoscope', 'horoscope', NULL, 4, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'set_ringtone',   'Set Ringtone',     'linked_module', 'ringtone',  'ringtone',  NULL, 5, TRUE, NOW(), NOW())
ON CONFLICT ("key") DO UPDATE
SET
  "label"             = EXCLUDED."label",
  "destination_type"  = EXCLUDED."destination_type",
  "destination_value" = EXCLUDED."destination_value",
  "icon_key"          = EXCLUDED."icon_key",
  "sort_order"        = EXCLUDED."sort_order",
  "is_active"         = EXCLUDED."is_active",
  "updated_at"        = NOW();
