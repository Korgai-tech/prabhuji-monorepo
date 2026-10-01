-- UUIDv7 for identity + payment ids (docs/UUID-V7-MIGRATION.md).
--
-- This is the ONLY SQL the change needs. Prisma's `@default(uuid(7))` is
-- client-side — the id is minted in Node and sent in the INSERT — so the other
-- ten in-scope tables produce no schema diff at all.
--
-- `subscription_cancellation_requests` is the exception: its CREATE TABLE was
-- hand-written (20260801120000) and gave `id` a Postgres-level
-- `DEFAULT gen_random_uuid()`. Prisma always supplies `id`, so that default is
-- unreachable through the ORM — but a raw insert, or an `INSERT ... DEFAULT`,
-- would silently mint a v4 into a table this change declares v7. Repoint it.
--
-- `uuidv7()` is native in Postgres 18 (both the compose image and RDS
-- `engine_version = "18"`); no extension required.
--
-- Catalog-only: no table rewrite, no index rebuild, no backfill. Existing rows
-- keep their v4 ids and stay valid — mixed v4/v7 in one `uuid` column is the
-- expected end state, not drift. Ids are never rewritten.
ALTER TABLE "subscription_cancellation_requests"
  ALTER COLUMN "id" SET DEFAULT uuidv7();
