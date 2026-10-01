-- TAM-82: admin identity & authorization — `User.role`.
--
-- ADDITIVE / EXPAND-ONLY, and deliberately so: TAM-79 applies migrations as a
-- one-off ECS task BEFORE rolling the services, so old tasks serve traffic
-- against this new schema for the duration of the rollout. They never read
-- `role`, and the NOT NULL is satisfied by the DEFAULT, so their INSERTs into
-- "User" keep working unchanged.
--
-- Every pre-existing row backfills to 'user' via the DEFAULT => no existing
-- account becomes an admin. The ONLY writers of 'admin' are a direct DB write
-- and the boot-time bootstrap-admin path; no request input can ever set it.
--
-- Rollback (safe — nothing depends on this until the /admin/* routes land):
--   DROP INDEX "User_role_idx";
--   ALTER TABLE "User" DROP COLUMN "role";
--   DROP TYPE "user_role";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "user_role" NOT NULL DEFAULT 'user';

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");
