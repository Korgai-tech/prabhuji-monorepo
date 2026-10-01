-- TAM-46: Paywall remote-config source (CMS tables + seed + cache).
--
-- Adds six normalized tables that hold the *source* of paywall configuration
-- served to the mobile client at boot (TAM-45 endpoint reads through the
-- PaywallConfigProvider — never Prisma directly). Chosen over external CMS
-- and JSONB blobs to keep ops simple and let ops teams edit per-locale rows.
--
--   paywall_configs             — one row per paywallId; global toggles + defaults.
--   paywall_plans               — subscription plans (week/month/quarter); one per row.
--   paywall_plan_translations   — per-locale plan copy (label / price / detail / trial).
--   paywall_benefits            — VIP benefits (icon + sort order).
--   paywall_benefit_translations— per-locale benefit name.
--   paywall_translations        — per-locale paywall shell copy (title/video/CTAs).
--   paywall_legal_links         — per-locale privacy / terms / refund URLs.
--
-- CMS ownership boundary: writes come from ops / a future admin UI (Phase 2).
-- The API only reads; cache invalidation on writes happens via the provider's
-- `invalidate({ paywallId })` hook (see services/config.provider.ts).
--
-- Rollback safety: the tables have no inbound foreign keys from existing rows
-- (User, Auth, etc. don't reference them), so `DROP TABLE ... CASCADE` on all
-- six removes them cleanly. Their own internal FKs (`paywall_plan_translations`
-- → `paywall_plans`, `paywall_benefit_translations` → `paywall_benefits`) use
-- `ON DELETE CASCADE`. This migration is additive and reversible.

-- CreateTable
CREATE TABLE "paywall_configs" (
    "id" UUID NOT NULL,
    "paywall_id" TEXT NOT NULL,
    "config_version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "default_plan_id" TEXT,
    "shimmer_enabled" BOOLEAN NOT NULL DEFAULT true,
    "has_video_locale_fallback" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paywall_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paywall_plans" (
    "id" UUID NOT NULL,
    "paywall_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trial_days" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "paywall_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paywall_plan_translations" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "localized_label" TEXT NOT NULL,
    "trial_label" TEXT NOT NULL,
    "display_price_text" TEXT NOT NULL,
    "subscription_detail_text" TEXT NOT NULL,

    CONSTRAINT "paywall_plan_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paywall_benefits" (
    "id" UUID NOT NULL,
    "paywall_id" TEXT NOT NULL,
    "benefit_id" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "paywall_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paywall_benefit_translations" (
    "id" UUID NOT NULL,
    "benefit_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "localized_name" TEXT NOT NULL,

    CONSTRAINT "paywall_benefit_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paywall_translations" (
    "id" UUID NOT NULL,
    "paywall_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "video_url" TEXT,
    "video_thumbnail_url" TEXT,
    "video_id" TEXT,
    "cancel_anytime_text" TEXT NOT NULL,
    "refund_policy_text" TEXT NOT NULL,
    "pay_now_cta" TEXT NOT NULL,

    CONSTRAINT "paywall_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paywall_legal_links" (
    "id" UUID NOT NULL,
    "paywall_id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "privacy_policy_url" TEXT NOT NULL,
    "terms_service_url" TEXT NOT NULL,
    "refund_policy_url" TEXT NOT NULL,

    CONSTRAINT "paywall_legal_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paywall_configs_paywall_id_key" ON "paywall_configs"("paywall_id");

-- CreateIndex
CREATE INDEX "paywall_plans_paywall_id_enabled_sort_order_idx" ON "paywall_plans"("paywall_id", "enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "paywall_plans_paywall_id_plan_id_key" ON "paywall_plans"("paywall_id", "plan_id");

-- CreateIndex
CREATE INDEX "paywall_plan_translations_plan_id_locale_idx" ON "paywall_plan_translations"("plan_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "paywall_plan_translations_plan_id_locale_key" ON "paywall_plan_translations"("plan_id", "locale");

-- CreateIndex
CREATE INDEX "paywall_benefits_paywall_id_enabled_sort_order_idx" ON "paywall_benefits"("paywall_id", "enabled", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "paywall_benefits_paywall_id_benefit_id_key" ON "paywall_benefits"("paywall_id", "benefit_id");

-- CreateIndex
CREATE INDEX "paywall_benefit_translations_benefit_id_locale_idx" ON "paywall_benefit_translations"("benefit_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "paywall_benefit_translations_benefit_id_locale_key" ON "paywall_benefit_translations"("benefit_id", "locale");

-- CreateIndex
CREATE INDEX "paywall_translations_paywall_id_locale_idx" ON "paywall_translations"("paywall_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "paywall_translations_paywall_id_locale_key" ON "paywall_translations"("paywall_id", "locale");

-- CreateIndex
CREATE INDEX "paywall_legal_links_paywall_id_locale_idx" ON "paywall_legal_links"("paywall_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "paywall_legal_links_paywall_id_locale_key" ON "paywall_legal_links"("paywall_id", "locale");

-- AddForeignKey
ALTER TABLE "paywall_plan_translations" ADD CONSTRAINT "paywall_plan_translations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "paywall_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paywall_benefit_translations" ADD CONSTRAINT "paywall_benefit_translations_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "paywall_benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

