-- Two login types, and real phone numbers.
--
-- The app authenticates with phone + OTP; the admin CMS with email + password.
-- Until now that distinction was implicit — `email` and `passwordHash` were NOT
-- NULL, so every phone signup fabricated an `otp-<id>@prabhuji.internal` address
-- and 32 random bytes of hex to satisfy them. And the phone itself was stored
-- only as a peppered SHA-256, which made it impossible to notify anyone about a
-- failed debit and meant no real SMS provider could ever be wired in.
--
-- Every statement here is additive, relaxing, or NOT VALID, so tasks running the
-- OLD code keep serving normally while the deployment rolls. `phone_number_hash`
-- is deliberately NOT dropped — see the note above the CHECK.

CREATE TYPE "login_type" AS ENUM ('otp', 'email');

ALTER TABLE "User" ADD COLUMN "phone_number" TEXT;

-- DEFAULT 'email' covers rows written by old tasks mid-rollout: they always
-- supply email + passwordHash, so they satisfy the email branch of the CHECK.
-- Both live creation paths set this column explicitly.
ALTER TABLE "User" ADD COLUMN "login_type" "login_type" NOT NULL DEFAULT 'email';

-- Note the quoting: `passwordHash` is camelCase in Postgres because that field
-- carries no @map, unlike the snake_cased phone columns beside it.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Classify the existing rows while `phone_number_hash` is still here to tell us
-- which ones came from the OTP flow. After this the column has no readers.
UPDATE "User" SET "login_type" = 'otp' WHERE "phone_number_hash" IS NOT NULL;

-- The lookup key moves from the hash to the number. Dropping the old INDEX (not
-- the column) is safe for in-flight old code: Prisma's findUnique compiles to a
-- plain two-column WHERE, which still resolves — just without an index to help.
DROP INDEX "User_phone_country_code_phone_number_hash_key";
CREATE UNIQUE INDEX "User_phone_country_code_phone_number_key"
  ON "User"("phone_country_code", "phone_number");

-- Make the login-type invariant structural rather than conventional: buggy code
-- cannot write an `otp` row carrying a password, nor an `email` row without one.
--
-- NOT VALID is load-bearing, not a shortcut. The rows just backfilled to 'otp'
-- hold a phone HASH and no `phone_number`, so they violate the otp branch by
-- construction — validating immediately would fail this migration outright. NOT
-- VALID enforces the constraint on every future INSERT and UPDATE while
-- grandfathering those legacy rows, and it avoids taking a full-table lock. The
-- follow-up that drops `phone_number_hash` removes exactly those rows' reason to
-- exist and can then run VALIDATE CONSTRAINT.
-- Each branch states BOTH what must be present and what must be absent. Listing
-- only the required columns would let an `otp` row carry a password and still
-- satisfy the constraint — which is precisely the state this exists to forbid.
--
-- Exclusivity is keyed on `phone_number`, not `phone_country_code`: legacy rows
-- and rows written by old tasks mid-rollout hold a country code with no number,
-- and they must stay valid under the `email` branch.
ALTER TABLE "User" ADD CONSTRAINT "user_login_type_shape" CHECK (
  (login_type = 'email'
     AND email IS NOT NULL
     AND "passwordHash" IS NOT NULL
     AND phone_number IS NULL)
  OR
  (login_type = 'otp'
     AND phone_country_code IS NOT NULL
     AND phone_number IS NOT NULL
     AND email IS NULL
     AND "passwordHash" IS NULL)
) NOT VALID;
