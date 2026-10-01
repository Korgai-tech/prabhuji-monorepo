-- TAM-174 — backwards-compat gate on an A/B arm.
--
-- An arm's artwork and copy are authored for the layout that ships WITH it.
-- `gradient_v1`'s assets are transparent 104×68 band exports sized for the new
-- card; a build predating TAM-174 would paint them bottom-anchored inside the
-- old 103×117 card and look wrong — on phones already in the wild, which is
-- exactly the population an experiment must not damage.
--
-- With a gate set, a client below it is served the arm's overrides NOT AT ALL
-- and falls back to the base `home_shortcuts` row — byte-for-byte what it
-- renders today. An old build is therefore never in a new arm as far as it can
-- tell, and the API change cannot break it.
--
-- NULL ⇒ no gate, so this migration is inert until ops (or the seed) sets a
-- value. It is deliberately NOT backfilled: the correct minimum is the version
-- that first ships the new grid, which is not known at migration time.

ALTER TABLE "home_shortcut_variants"
  ADD COLUMN IF NOT EXISTS "min_app_version" TEXT;
