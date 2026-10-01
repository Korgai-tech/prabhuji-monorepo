-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('user', 'content');

-- DropForeignKey
ALTER TABLE "home_shortcut_variants" DROP CONSTRAINT "home_shortcut_variants_home_shortcut_id_fkey";

-- AlterTable
ALTER TABLE "home_shortcut_variants" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "paywall_hero_media" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pinned_content" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pinned_content_audit" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_cancellation_requests" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "type" "report_type" NOT NULL,
    "status_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reporter_email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_reported_user_id_created_at_idx" ON "reports"("reported_user_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_reporter_user_id_created_at_idx" ON "reports"("reporter_user_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_id_idx" ON "reports"("status_id");

-- AddForeignKey
ALTER TABLE "home_shortcut_variants" ADD CONSTRAINT "home_shortcut_variants_home_shortcut_id_fkey" FOREIGN KEY ("home_shortcut_id") REFERENCES "home_shortcuts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "firebase_token_user_device_unique" RENAME TO "firebase_tokens_user_id_device_id_key";
