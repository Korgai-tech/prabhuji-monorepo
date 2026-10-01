-- TAM-174 — per-tile shortcut gradients + the 50/50 rollout's kill switch.
--
-- Two additions, both inert on deploy:
--
--   1. `home_settings.shortcut_grid_gradient_enabled` — the experiment's master
--      switch, DEFAULT FALSE. Until ops flips it, nobody is bucketed, the abtest
--      service is never consulted, and every user is served `theme: null` (today's
--      grid). So this migration can ship well ahead of the mobile release.
--
--   2. Five nullable `theme_*` columns on `home_shortcuts`, seeded with the six
--      palettes from Figma node 3760:28482 ("Colored Feature Cards", 3744:27938).
--
-- WHY THE PALETTES ARE SEEDED HERE rather than left for ops to type: they are
-- design output, not merchandising copy — six hand-tuned gradients with
-- per-tile label colours, transcribed from the node tree. Hand-entering 30
-- values into a CMS form is a typo surface with no upside, and the CMS can
-- still override any of them afterwards.
--
-- STOPS ARE NOT CLAMPED TO [0,1]. `set_wallpaper` is authored 0.14734 → 1.4734
-- (its gradient handles extend past the card's bottom edge). That is faithfully
-- stored; the client maps stops to `Alignment`, which accepts out-of-range
-- values, rather than to Flutter's `stops`, which rejects them.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` throughout, and the seed is an UPDATE
-- keyed on the stable `key` slug, so a re-run rewrites the same values and a row
-- ops has since retuned is... also rewritten. That is the intended behaviour for
-- a migration that is the palettes' source of truth; ops overrides applied AFTER
-- this migration has run once are never re-clobbered, because migrations run once.

-- 1. The kill switch. NOT NULL + DEFAULT FALSE, so the existing singleton row
--    picks up `false` without a separate backfill.
ALTER TABLE "home_settings"
  ADD COLUMN IF NOT EXISTS "shortcut_grid_gradient_enabled" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. The palette columns. All nullable: NULL is both "pre-TAM-174" and "not yet
--    themed", and the client renders the shipped flat gradient for either.
ALTER TABLE "home_shortcuts"
  ADD COLUMN IF NOT EXISTS "theme_background_from"      TEXT,
  ADD COLUMN IF NOT EXISTS "theme_background_from_stop" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "theme_background_to"        TEXT,
  ADD COLUMN IF NOT EXISTS "theme_background_to_stop"   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "theme_label_color"          TEXT;

-- 3. Seed the six palettes. `UPDATE … FROM (VALUES …)` rather than an upsert:
--    the rows already exist (TAM-132 seeded them) and this migration has no
--    business creating a shortcut. A key that is absent simply matches nothing.
UPDATE "home_shortcuts" AS s
SET
  "theme_background_from"      = v.bg_from,
  "theme_background_from_stop" = v.bg_from_stop,
  "theme_background_to"        = v.bg_to,
  "theme_background_to_stop"   = v.bg_to_stop,
  "theme_label_color"          = v.label_color,
  "updated_at"                 = NOW()
FROM (
  VALUES
    -- key,              bg_from,     from_stop,  bg_to,       to_stop,  label_color
    ('set_status',     '#EAF4FF', 0.10::float8,  '#3896E9', 1.00::float8,    '#1261A8'),
    ('set_ringtone',   '#FFE3E4', 0.10::float8,  '#FF8888', 1.00::float8,    '#7C0303'),
    ('set_wallpaper',  '#E8F8F5', 0.14734::float8, '#1DC0AE', 1.4734::float8, '#08776D'),
    ('aarti_bhajans',  '#FFF0D9', 0.00::float8,  '#FFA742', 1.00::float8,    '#C96800'),
    ('mantras_stutis', '#FFEFFB', 0.10::float8,  '#FF90E3', 1.00::float8,    '#951A77'),
    ('horoscope',      '#EDE8FF', 0.10::float8,  '#6249DC', 1.00::float8,    '#3E327F')
) AS v(key, bg_from, bg_from_stop, bg_to, bg_to_stop, label_color)
WHERE s."key" = v.key;
