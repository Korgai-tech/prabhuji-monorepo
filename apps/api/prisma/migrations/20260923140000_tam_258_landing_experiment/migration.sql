-- TAM-258: server-resolved app landing.
--
-- The ad group of the user's FIRST captured touch, written in the same
-- once-only guarded write as first_utm_reported_at. Stored raw (adgroup_name
-- verbatim); the STS/RTG code is derived on read, so renaming a code needs no
-- backfill. Nullable, no default — both columns are add-only metadata changes,
-- no table rewrite.
ALTER TABLE "User" ADD COLUMN "first_utm_group" TEXT;

-- When the one-time ad-arrival landing was served. Stamped only when a non-Home
-- module was actually served, so a lookup that resolved to Home does not spend
-- the marker.
ALTER TABLE "User" ADD COLUMN "ad_landing_consumed_at" TIMESTAMP(3);
