-- TAM-42: Extend User with Prabhuji onboarding fields.
--
-- name           — display name; now nullable because the OTP flow creates a User row
--                  before the name+language screen runs.
-- phone_*        — country code + SHA-256 hash of the E.164 number (raw phone never
--                  stored). Populated at OTP verify (TAM-43).
-- selected_lang  — 2-letter ISO code (`hi`, `mr`, ...). Populated at profile save (TAM-44).
-- onboarding_*   — timestamp of when name + language were saved. Null = onboarding
--                  incomplete; drives §6.1 splash-orchestrator routing.
-- Unique index on (phone_country_code, phone_number_hash) — one account per verified
-- number. Postgres treats NULL tuples as distinct, so pre-onboarding rows with null
-- phone don't collide.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "phone_country_code" TEXT,
ADD COLUMN     "phone_number_hash" TEXT,
ADD COLUMN     "selected_language" TEXT,
ALTER COLUMN "name" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "User_onboarding_completed_at_idx" ON "User"("onboarding_completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_country_code_phone_number_hash_key" ON "User"("phone_country_code", "phone_number_hash");
