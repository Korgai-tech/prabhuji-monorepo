-- TAM-132 backwards-compat follow-up — adds a nullable `min_app_version` column
-- to `home_shortcuts` and gates the two NEW tiles (`set_status`, `horoscope`)
-- introduced by 20260812091304 behind the next mobile release.
--
-- WHY: pre-TAM-132 app builds don't have bundled PNGs for these two `iconKey`s
-- and render a blank slot (SizedBox.shrink()). The server-side filter in
-- `HomeService.getShortcuts` uses the mobile-sent `app_version` request header
-- to drop rows whose `min_app_version` is not yet satisfied, so old-build users
-- see the pre-refresh 4-tile grid until they update.
--
-- The default value ("1.0.5") means: any client whose `app_version` header
-- parses as strictly greater than the current live release (1.0.4) gets the
-- two new tiles. Any client on 1.0.4 or older (or with a missing/unparseable
-- header) continues to see the pre-refresh 4-tile grid. Ops can override this
-- per-row via CMS/SQL if the upcoming release ships under a different version.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` + a guarded `UPDATE` (`WHERE ... AND
-- min_app_version IS NULL`). A re-run is a no-op on rows already populated —
-- so re-applying this migration will NOT clobber an ops-tweaked value.

ALTER TABLE "home_shortcuts"
  ADD COLUMN IF NOT EXISTS "min_app_version" TEXT NULL;

UPDATE "home_shortcuts"
   SET "min_app_version" = '1.0.5',
       "updated_at"      = NOW()
 WHERE "key" IN ('set_status', 'horoscope')
   AND "min_app_version" IS NULL;
