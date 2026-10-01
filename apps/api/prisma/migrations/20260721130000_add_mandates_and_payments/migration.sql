-- Recurring payments: mandate registration + the debit ledger.
--
-- Purely additive — three new tables and two defaulted columns, no backfill and
-- no constraint changes on existing data, so old containers keep serving
-- traffic against the new schema during a rolling deploy
-- (docs/DEPLOYMENT.md, "Write additive migrations").
--
-- `mandates` is deliberately NOT `upi_mandates`: Decentro runs eNACH through
-- the same four-verb lifecycle (register -> notify -> present -> manage), so
-- both instrument types share this table, discriminated by `type`.
--
-- `payment_attempts.(mandate_id, cycle_date)` is the double-charge guard. It is
-- a DATE, not a timestamp, so the constraint means "this billing month" -- with
-- a timestamp two scheduler runs an hour apart would both insert.
--
-- `payment_callback_events.dedupe_key` is unique so INSERT-first dedupe is
-- atomic: a unique violation IS the duplicate detection, with no read-then-write
-- race for two concurrent provider retries to slip through.
--
-- Rollback: no inbound FKs from existing tables and no outbound FK to `users`
-- or `subscriptions` (the link is logical via `user_id`, matching the style of
-- `subscriptions` and the paywall CMS tables), so all three can be dropped
-- independently.

-- AlterTable
ALTER TABLE "paywall_plans" ADD COLUMN     "amount_paise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR';

-- CreateTable
CREATE TABLE "mandates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'upi',
    "provider" TEXT NOT NULL DEFAULT 'decentro',
    "reference_id" TEXT NOT NULL,
    "provider_mandate_id" TEXT,
    "provider_txn_id" TEXT,
    "npci_transaction_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'initiated',
    "state_reason" TEXT,
    "plan_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "amount_rule" TEXT NOT NULL DEFAULT 'MAX',
    "rule_type" TEXT NOT NULL DEFAULT 'BEFORE',
    "rule_value" INTEGER NOT NULL DEFAULT 28,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "next_debit_date" DATE,
    "auth_url" TEXT,
    "auth_expires_at" TIMESTAMP(3),
    "payer_handle_masked" TEXT,
    "payer_name_masked" TEXT,
    "last_polled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "mandate_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cycle_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pdn_pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "is_first_debit" BOOLEAN NOT NULL DEFAULT false,
    "presentation_sequence_id" TEXT,
    "provider_txn_id" TEXT,
    "bank_reference_number" TEXT,
    "npci_transaction_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "failure_code" TEXT,
    "failure_message" TEXT,
    "pdn_sent_at" TIMESTAMP(3),
    "presentation_sent_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_callback_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'decentro',
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "reference_id" TEXT,
    "provider_mandate_id" TEXT,
    "callback_attempt" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL,
    "source_ip" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "payment_callback_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mandates_reference_id_key" ON "mandates"("reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "mandates_provider_mandate_id_key" ON "mandates"("provider_mandate_id");

-- CreateIndex
CREATE INDEX "mandates_state_next_debit_date_idx" ON "mandates"("state", "next_debit_date");

-- CreateIndex
CREATE INDEX "mandates_user_id_state_idx" ON "mandates"("user_id", "state");

-- CreateIndex
CREATE INDEX "payment_attempts_status_cycle_date_idx" ON "payment_attempts"("status", "cycle_date");

-- CreateIndex
CREATE INDEX "payment_attempts_user_id_idx" ON "payment_attempts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_mandate_id_cycle_date_key" ON "payment_attempts"("mandate_id", "cycle_date");

-- CreateIndex
CREATE UNIQUE INDEX "payment_callback_events_dedupe_key_key" ON "payment_callback_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "payment_callback_events_reference_id_idx" ON "payment_callback_events"("reference_id");

-- CreateIndex
CREATE INDEX "payment_callback_events_status_received_at_idx" ON "payment_callback_events"("status", "received_at");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "mandates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

