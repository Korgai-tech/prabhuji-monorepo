-- TAM-73: Horoscope module. Five CMS-owned tables backing a `HoroscopeProvider`
-- interface whose Phase-1 impl (`CmsHoroscopeProvider`) serves seeded rows only
-- (no external API, no runtime LLM). DETERMINISM: daily_horoscope_result has a
-- UNIQUE (zodiac_id, mode_id, date_ist, language_code) — same sign + IST civil
-- date + language → the same stored row (PRD §6.9). date_ist is a "YYYY-MM-DD"
-- string in Asia/Kolkata (never UTC). STEPS ARE DATA: horoscope_step_config is
-- the editable step catalogue (the 8 Figma steps are seeded examples). Results
-- are Pro-gated AT THE API, not the DB. Reversible: DROP TABLE media_assets,
-- daily_horoscope_result, horoscope_step_config, horoscope_mode, zodiac_sign.

-- CreateTable
CREATE TABLE "zodiac_sign" (
    "id" UUID NOT NULL,
    "zodiac_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "localized_display_name" JSONB NOT NULL,
    "icon_asset_url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zodiac_sign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horoscope_mode" (
    "id" UUID NOT NULL,
    "mode_id" TEXT NOT NULL,
    "mode_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "phase" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horoscope_mode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horoscope_step_config" (
    "id" UUID NOT NULL,
    "step_id" TEXT NOT NULL,
    "mode_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "localized_title" JSONB NOT NULL,
    "order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "content_type" TEXT NOT NULL,
    "provider_mapping" TEXT NOT NULL,
    "tts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "safety_category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horoscope_step_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_horoscope_result" (
    "id" UUID NOT NULL,
    "zodiac_id" TEXT NOT NULL,
    "mode_id" TEXT NOT NULL,
    "date_ist" TEXT NOT NULL,
    "language_code" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "provider_name" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content_safety_status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_horoscope_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "asset_key" TEXT NOT NULL,
    "result_background_video_url" TEXT NOT NULL,
    "result_background_static_fallback_url" TEXT NOT NULL,
    "asset_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zodiac_sign_zodiac_id_key" ON "zodiac_sign"("zodiac_id");

-- CreateIndex
CREATE INDEX "zodiac_sign_enabled_sort_order_idx" ON "zodiac_sign"("enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "horoscope_mode_mode_id_key" ON "horoscope_mode"("mode_id");

-- CreateIndex
CREATE INDEX "horoscope_mode_enabled_idx" ON "horoscope_mode"("enabled");

-- CreateIndex
CREATE INDEX "horoscope_step_config_mode_id_order_enabled_idx" ON "horoscope_step_config"("mode_id", "order", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "horoscope_step_config_mode_id_step_id_key" ON "horoscope_step_config"("mode_id", "step_id");

-- CreateIndex
CREATE INDEX "daily_horoscope_result_zodiac_id_date_ist_language_code_idx" ON "daily_horoscope_result"("zodiac_id", "date_ist", "language_code");

-- CreateIndex
CREATE UNIQUE INDEX "daily_horoscope_result_zodiac_id_mode_id_date_ist_language__key" ON "daily_horoscope_result"("zodiac_id", "mode_id", "date_ist", "language_code");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_asset_key_key" ON "media_assets"("asset_key");

-- AddForeignKey
ALTER TABLE "horoscope_step_config" ADD CONSTRAINT "horoscope_step_config_mode_id_fkey" FOREIGN KEY ("mode_id") REFERENCES "horoscope_mode"("mode_id") ON DELETE CASCADE ON UPDATE CASCADE;

