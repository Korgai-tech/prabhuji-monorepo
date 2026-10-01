-- FirebaseToken: FCM device-token registry.
--
-- ADDITIVE — no existing row is touched. Every column is either NOT NULL with a
-- server-side default (uuid, timestamps) or is required at insert (userId,
-- token, deviceId, platform). The token itself is UNIQUE globally so a device
-- handed off between users can only be registered under one owner at a time;
-- the app registers via UPSERT ON CONFLICT so a re-register from a new user
-- moves ownership rather than 409-ing.
--
-- Rollback (safe — nothing references this table):
--   DROP TABLE "firebase_tokens";
--   DROP TYPE "firebase_platform";

-- CreateEnum
CREATE TYPE "firebase_platform" AS ENUM ('ios', 'android');

-- CreateTable
CREATE TABLE "firebase_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" "firebase_platform" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firebase_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firebase_tokens_token_key" ON "firebase_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "firebase_token_user_device_unique" ON "firebase_tokens"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "firebase_tokens_user_id_idx" ON "firebase_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "firebase_tokens" ADD CONSTRAINT "firebase_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
