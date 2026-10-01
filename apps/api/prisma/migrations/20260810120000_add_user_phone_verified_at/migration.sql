-- TAM-154 — when the phone proved it was reachable.
--
-- ADDITIVE: one nullable column plus a backfill. No existing column changes type
-- or nullability, so an OLD task rolling alongside a NEW one keeps working — it
-- simply never writes this column.
--
-- WHY: until now a `User` row was only INSERTed after a successful OTP verify, so
-- "a row exists" WAS the proof the number was verified. That left every drop-off
-- invisible: someone who requested a code and never came back stored nothing at
-- all, and there was no userId or number to follow up on. The row is now written
-- at SEND time, which means the old invariant is gone and this column has to
-- carry it instead. NULL = a lead who never verified.
--
-- It is also what `isNewUser` on /auth/otp/verify is computed from now, since
-- "the row did not exist" no longer means "first login".
--
-- BACKFILL: required, not cosmetic. Every otp row that exists today was INSERTed
-- BY the verify handler, so it is verified by construction and `createdAt` IS the
-- verify timestamp — not an approximation. Without this line every user who has
-- not logged in since the deploy looks identical to a drop-off, which is the one
-- question the column exists to answer.
--
-- Not indexed: nothing filters on it yet. Add one when a lead list does.

ALTER TABLE "User" ADD COLUMN "phone_verified_at" TIMESTAMP(3);

-- The WHERE spells out the otp branch of `user_login_type_shape` instead of just
-- `login_type = 'otp'`, and that is LOAD-BEARING, not defensive noise.
--
-- The legacy rows described in `20260727120000_drop_phone_number_hash` are still
-- here: `login_type = 'otp'` carrying a fabricated `otp-<id>@prabhuji.internal`
-- address, a junk passwordHash and NO phone number. They violate the otp branch
-- by construction, which is precisely why the constraint was left NOT VALID — and
-- NOT VALID only skips the one-time full-table validation. It still fires on
-- every UPDATE. A blanket `WHERE login_type = 'otp'` therefore touches those rows
-- and aborts the whole migration with a 23514, which is how this was found: 14 of
-- them sit in the local dev database. Restricting the update to rows that already
-- satisfy the constraint makes tripping it impossible.
--
-- Skipping them loses nothing. They have no phone number, so they are unreachable
-- by definition — they cannot log in, no lead query can ever match them, and the
-- next OTP verify for that person mints a fresh row.
--
-- `createdAt` has no @map in the Prisma schema, so the column is camelCase in
-- Postgres and must stay double-quoted — same as "passwordHash" below.
UPDATE "User"
SET "phone_verified_at" = "createdAt"
WHERE "login_type" = 'otp'
  AND "phone_country_code" IS NOT NULL
  AND "phone_number" IS NOT NULL
  AND "email" IS NULL
  AND "passwordHash" IS NULL;
