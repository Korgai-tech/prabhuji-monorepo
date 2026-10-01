-- TAM-187: admin-created QA accounts that log in with the env's fixed TEST_OTP.
-- A constant default is a metadata-only change in Postgres 11+ — no table
-- rewrite, so this is safe on the live users table.
ALTER TABLE "User" ADD COLUMN "is_test_user" BOOLEAN NOT NULL DEFAULT false;

-- The abtesting bucket a test user was last pinned to (recorded after the
-- service accepts it). Nullable, no default: catalogue-only.
ALTER TABLE "User" ADD COLUMN "test_bucket" INTEGER;
