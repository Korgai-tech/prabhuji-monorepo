-- TAM-47: Subscription state persistence (payment provider deferred).
--
-- Adds a single normalized `subscriptions` table with a 1:1 relationship to
-- `User` (unique `user_id`). Every new User gets a row seeded with
-- `status = 'free'` by the OTP module's user-creation path (TAM-43) — the
-- API only ever writes `'free'` in this phase and only ever READS via
-- `GET /subscription/status`. `provider` and `provider_subscription_id`
-- are nullable so the future payment-provider ticket can populate them
-- without a schema migration.
--
-- Explicitly deferred (see spec q3 resolved 2026-07-11): no `payment_intents`
-- table, no Razorpay SDK, no order-create / verify / webhook routes. The
-- write path `status → 'active'` waits for a signature-verified webhook or
-- verified `/verify` handler shipped in a follow-up ticket.
--
-- Rollback safety: the table has no inbound foreign keys from existing rows
-- and no outbound FK (the User relationship is a logical 1:1 by user_id,
-- not a DB constraint — matches the paywall CMS tables which took the same
-- shape to keep this migration additive and easy to drop).

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'free',
    "active_plan_id" TEXT,
    "active_product_id" TEXT,
    "provider" TEXT,
    "provider_subscription_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");
