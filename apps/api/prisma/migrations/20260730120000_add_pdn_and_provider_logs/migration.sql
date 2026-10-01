-- TAM-141: make the asynchronous pre-debit notification representable, and give
-- the payment module an audit trail that survives the process.
--
-- ADDITIVE. New tables plus nullable columns only, so this is safe to apply while
-- the previous version's tasks are still serving (expand/contract). Unlike
-- 20260729140000 it needs no scheduler disarm for SCHEMA reasons.
--
-- The CODE deploy is a different matter: an old container presenting with the
-- mandate's `reference_id` alongside a new one presenting with
-- `gateway_presentation_ref`, against the same sequence id, is a DUPLICATE
-- PRESENTATION. Disarm `enable_billing_scheduler`, drain any in-flight billing
-- task, deploy, then re-arm. See docs/DEPLOYMENT.md.
--
-- TIMESTAMPTZ, deliberately, on every timestamp below. The rest of this schema is
-- `timestamp without time zone`, which stores a wall-clock reading with no offset
-- and so depends on every reader guessing the same zone. They do not: `node-pg`
-- parses such a column in the PROCESS timezone, so one row reads 5.5 hours apart
-- on an IST laptop and in a UTC container. `cycle_date` and `scheduled_debit_at`
-- decide when money moves; they carry the offset. The pre-existing columns are NOT
-- converted here — that is an ALTER on populated tables whose result depends on
-- the session TimeZone at migration time, and it deserves its own ticket.
--
-- ── FOR REVIEWERS OF FUTURE MIGRATIONS ────────────────────────────────────────
-- The two CHECK constraints at the bottom of this file CANNOT be expressed in
-- schema.prisma (Prisma has no CHECK support). They live only here, so every
-- subsequent `prisma migrate dev` will emit DROP statements for them, because
-- they exist in the shadow database and not in the schema.
--
-- DELETE THOSE DROPS from the generated SQL. As of this migration the list of
-- hand-written objects a future `migrate dev` will try to drop is NINE:
--   user_login_type_shape                      (20260722120000)
--   transactions_recurring_cycle_unique        (20260729140000)
--   transactions_settled_has_gateway_id        (20260729140000)
--   transactions_amount_sign                   (20260729140000)
--   transactions_recurring_shape               (20260729140000)
--   transactions_reversal_shape                (20260729140000)
--   transactions_supersede_shape               (20260729140000)
--   pdn_notifications_accepted_has_sequence_id (this file)
--   pdn_notifications_attempts_nonneg          (this file)
-- plus the DEFERRABLE re-definition of transactions_superseded_by_transaction_id_fkey.
--
-- Any change to those must ALSO be mirrored into EXTRA_CONSTRAINTS in
-- apps/api/src/shared/testing/pg.ts, or integration tests asserting them pass
-- vacuously against a `db push` database that never had them.
-- ──────────────────────────────────────────────────────────────────────────────

-- CreateTable: THE pre-debit notification. One row per (mandate, billing day),
-- for the notification's whole life including re-arms. See the model docblock for
-- why this is a table and not a column on `transactions`.
CREATE TABLE "pdn_notifications" (
    "id" UUID NOT NULL,
    "mandate_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cycle_date" DATE NOT NULL,
    "reference_id" TEXT NOT NULL,
    "presentation_sequence_id" TEXT,
    "amount_paise" INTEGER NOT NULL,
    "scheduled_debit_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "raw_create_response" JSONB,
    "raw_latest_status" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pdn_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: the integration ledger. Every request we send a gateway and
-- whatever came back. Append-only; nothing reads it on a hot path.
CREATE TABLE "payment_provider_api_logs" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "operation" TEXT NOT NULL,
    "http_method" TEXT,
    "request_url" TEXT,
    "request_headers" JSONB,
    "request_body" JSONB,
    "response_status" INTEGER,
    "response_body" JSONB,
    "provider_status" TEXT,
    "provider_message" TEXT,
    "provider_response_code" TEXT,
    "reference_id" TEXT,
    "provider_transaction_id" TEXT,
    -- The gateway's OWN correlation id, when it returns one. Cashfree's
    -- `x-request-id` is what their support keys tickets on, and handing it over
    -- used to require still having the CloudWatch log.
    "provider_request_id" TEXT,
    "user_id" UUID,
    "mandate_id" UUID,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "duration_ms" INTEGER,
    "result" TEXT NOT NULL DEFAULT 'success',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_provider_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: THE inbox for inbound callbacks, superseding
-- `payment_callback_events` (which stays for history and takes no new writes).
-- Exactly one inbox, because two would mean two dedupe ledgers.
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'decentro',
    "kind" TEXT NOT NULL,
    "event_type" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "reference_id" TEXT,
    "provider_mandate_id" TEXT,
    "presentation_sequence_id" TEXT,
    "callback_attempt" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL,
    "related_mandate_id" UUID,
    "related_pdn_id" UUID,
    "related_transaction_id" UUID,
    "source_ip" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- AlterTable: link a money row to the notification it was presented under, and
-- give the presentation its own per-attempt reference. `gateway_request_id`
-- cannot serve as the latter: it is deterministic per cycle (that is what makes
-- "did my call land?" answerable) and reused across re-presentations, while
-- Decentro rejects a reused `reference_id`.
ALTER TABLE "transactions" ADD COLUMN "pdn_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "gateway_presentation_ref" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pdn_notifications_reference_id_key" ON "pdn_notifications"("reference_id");

-- CreateIndex: ONE notification lineage per billing day. A FULL unique index,
-- unlike `transactions_recurring_cycle_unique` — a re-arm rotates this row in
-- place, so it never needs a second row and therefore never needs a supersede
-- escape hatch.
CREATE UNIQUE INDEX "pdn_notifications_mandate_id_cycle_date_key" ON "pdn_notifications"("mandate_id", "cycle_date");

-- CreateIndex: two cycles of one mandate can never share a sequence id — that
-- would be a debit charged against the wrong month. NULLs are distinct in
-- Postgres, so many un-sequenced rows per mandate stay legal.
CREATE UNIQUE INDEX "pdn_notifications_mandate_id_presentation_sequence_id_key" ON "pdn_notifications"("mandate_id", "presentation_sequence_id");

-- CreateIndex
CREATE INDEX "pdn_notifications_presentation_sequence_id_idx" ON "pdn_notifications"("presentation_sequence_id");

-- CreateIndex: serves the sweep that polls for a sequence id which never arrived.
CREATE INDEX "pdn_notifications_status_updated_at_idx" ON "pdn_notifications"("status", "updated_at");

-- CreateIndex
CREATE INDEX "payment_provider_api_logs_provider_operation_created_at_idx" ON "payment_provider_api_logs"("provider", "operation", "created_at");

-- CreateIndex
CREATE INDEX "payment_provider_api_logs_reference_id_idx" ON "payment_provider_api_logs"("reference_id");

-- CreateIndex
CREATE INDEX "payment_provider_api_logs_mandate_id_created_at_idx" ON "payment_provider_api_logs"("mandate_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_provider_api_logs_result_created_at_idx" ON "payment_provider_api_logs"("result", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_dedupe_key_key" ON "webhook_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "webhook_events_reference_id_idx" ON "webhook_events"("reference_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "webhook_events_presentation_sequence_id_idx" ON "webhook_events"("presentation_sequence_id");

-- CreateIndex
CREATE INDEX "webhook_events_related_pdn_id_idx" ON "webhook_events"("related_pdn_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_gateway_presentation_ref_key" ON "transactions"("gateway_presentation_ref");

-- CreateIndex
CREATE INDEX "transactions_pdn_id_idx" ON "transactions"("pdn_id");

-- AddForeignKey
ALTER TABLE "pdn_notifications" ADD CONSTRAINT "pdn_notifications_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: a ledger that loses its notification trail is not a ledger.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pdn_id_fkey" FOREIGN KEY ("pdn_id") REFERENCES "pdn_notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- HAND-WRITTEN and invisible to schema.prisma. See the reviewer banner at the
-- top of this file before running `prisma migrate dev` again.
--
-- Both target a table created moments ago and therefore empty, so both are added
-- VALID — no `NOT VALID` grandfathering, unlike `user_login_type_shape`.
-- ─────────────────────────────────────────────────────────────────────────────

-- `accepted` MEANS ADDRESSABLE. This is the one predicate that earns a CHECK: it
-- makes unrepresentable the row that would otherwise take down a billing run.
-- The presentation path dereferences the sequence id, and the ONLY thing that
-- lets a row reach that line is its notification being `accepted` — so "accepted
-- with no sequence id" is exactly the state that would either crash the run or,
-- worse, present a debit NPCI cannot match to a notification.
ALTER TABLE "pdn_notifications" ADD CONSTRAINT "pdn_notifications_accepted_has_sequence_id" CHECK (
  "status" <> 'accepted' OR "presentation_sequence_id" IS NOT NULL
);

-- A negative attempt count means the re-arm path read a stale row. Cheap, and it
-- fails the write rather than silently resetting the retry budget.
ALTER TABLE "pdn_notifications" ADD CONSTRAINT "pdn_notifications_attempts_nonneg" CHECK ("attempts" >= 0);
