-- Per-ad-group paywall overrides, CMS-managed.
--
-- The campaigns are authored in the CMS and live here; nothing is migrated
-- across, because no environment has ever served one.
--
-- Purely additive: a new table, no column added to and no constraint placed on
-- anything that already exists. `GET /paywall/config` is byte-identical for
-- every caller until an ENABLED row is inserted — with none, the paywall skips
-- the attribution lookup entirely, which is also how a campaign is switched
-- off: clear `enabled`, and the endpoint is back to its pre-feature behaviour.
--
-- `utm_group` is UNIQUE because a match must be deterministic. Two rows for one
-- ad group would make "which treatment ran" depend on row order, and the loser
-- would be invisible rather than reported — the exact failure the old file
-- needed a unit test to catch, now a database guarantee.
--
-- `overrides` is JSONB, not JSON: the read path looks the whole document up by
-- key, JSONB stores it parsed (no re-parse per read) and is the only one of the
-- two that could ever be indexed if a query on the blob is ever needed.
CREATE TABLE "paywall_utm_overrides" (
  "id"         UUID         NOT NULL,
  "utm_group"  TEXT         NOT NULL,
  "enabled"    BOOLEAN      NOT NULL DEFAULT true,
  "overrides"  JSONB        NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "paywall_utm_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paywall_utm_overrides_utm_group_key"
  ON "paywall_utm_overrides" ("utm_group");

-- The read path loads every ENABLED row in one pass and indexes them in memory,
-- so this supports the only query there is. It stays useful at any table size a
-- CMS will realistically produce, and costs nothing at these write volumes.
CREATE INDEX "paywall_utm_overrides_enabled_idx"
  ON "paywall_utm_overrides" ("enabled");
