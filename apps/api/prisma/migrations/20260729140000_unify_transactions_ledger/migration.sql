-- TAM-133: one `transactions` table as the single source of truth for money.
--
-- NOT ADDITIVE. This migration DROPS `payment_attempts`, a table old containers
-- still read, so it must not run while the billing scheduler is armed. The
-- deploy sequence (disarm `enable_billing_scheduler`, drain any in-flight
-- billing task, then migrate) is in docs/DEPLOYMENT.md. Prod carried two rows,
-- both `pdn_failed`, both carrying no money; they are dropped, not migrated.
--
-- ── FOR REVIEWERS OF FUTURE MIGRATIONS ────────────────────────────────────────
-- The partial unique index and the CHECK constraints at the bottom of this file
-- CANNOT be expressed in schema.prisma (Prisma has no `where` on @@unique and no
-- CHECK support). They therefore live only here, and every subsequent
-- `prisma migrate dev` will helpfully emit DROP statements for them, because
-- they exist in the shadow database and not in the schema.
--
-- DELETE THOSE DROPS from the generated SQL. The same already applies to
-- `user_login_type_shape` (20260722120000) — this is the established house
-- pattern, not a new hazard.
-- ──────────────────────────────────────────────────────────────────────────────

-- DropTable: the cycle-keyed scheduler that could only ever hold recurring
-- debits. Its FK to `mandates` goes with it.
DROP TABLE "payment_attempts";

-- AlterTable: the trial deposit amount stops living in a TypeScript constant.
-- DEFAULT 0 means "no deposit"; a plan with trial_days > 0 and 0 here is refused
-- at purchase time rather than silently authorizing nothing.
ALTER TABLE "paywall_plans" ADD COLUMN "initial_deposit_paise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mandate_id" UUID,
    "amount_paise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "charge_phase" TEXT NOT NULL,
    "cycle_date" DATE,
    "is_first_debit" BOOLEAN NOT NULL DEFAULT false,
    "attempt_no" INTEGER NOT NULL DEFAULT 1,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "presentation_sequence_id" TEXT,
    "gateway_payment_id" TEXT,
    "gateway_request_id" TEXT,
    "bank_reference_number" TEXT,
    "npci_transaction_id" TEXT,
    "notified_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "failure_phase" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "parent_transaction_id" UUID,
    "superseded_at" TIMESTAMP(3),
    "superseded_by_transaction_id" UUID,
    "plan_id" TEXT,
    "product_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_gateway_payment_id_key" ON "transactions"("gateway_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_gateway_request_id_key" ON "transactions"("gateway_request_id");

-- CreateIndex
CREATE INDEX "transactions_mandate_id_kind_status_idx" ON "transactions"("mandate_id", "kind", "status");

-- CreateIndex
CREATE INDEX "transactions_status_cycle_date_idx" ON "transactions"("status", "cycle_date");

-- CreateIndex
CREATE INDEX "transactions_status_submitted_at_idx" ON "transactions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_created_at_idx" ON "transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_parent_transaction_id_idx" ON "transactions"("parent_transaction_id");

-- CreateIndex
CREATE INDEX "transactions_gateway_payment_id_idx" ON "transactions"("gateway_payment_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_parent_transaction_id_fkey" FOREIGN KEY ("parent_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_superseded_by_transaction_id_fkey" FOREIGN KEY ("superseded_by_transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Everything below is HAND-WRITTEN and invisible to schema.prisma. See the
-- reviewer note in the header before regenerating any future migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- The supersede self-FK must be DEFERRABLE, and the reason is a genuine
-- circular dependency between two guards that are each individually correct:
--
--   * the partial unique index below refuses to INSERT the replacement while
--     the old row is still live, and
--   * `transactions_supersede_shape` refuses to mark the old row superseded
--     without naming its replacement.
--
-- So neither write can go first under immediate constraint checking. Deferring
-- to COMMIT lets `supersedeCycleClaim` release the cycle and insert the
-- replacement inside one transaction, with the reference validated once both
-- exist. Nothing is weakened: an unmatched reference still aborts the commit.
--
-- `parent_transaction_id` is deliberately NOT deferred — a refund's parent
-- always exists first, so there is no cycle to break there.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_superseded_by_transaction_id_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_superseded_by_transaction_id_fkey"
  FOREIGN KEY ("superseded_by_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- THE anti-double-charge guard. Partial, and every clause is load-bearing.
--
--   kind = 'recurring_debit'   initial_deposit / one_time / refund rows have no
--                              cycle to contend for and must not collide with
--                              each other on (NULL, NULL).
--   superseded_at IS NULL      The ONLY escape. A row whose notification failed
--                              in transport can be replaced, but only after
--                              BillingCycleService's recovery stage asked the
--                              gateway and got a definitive "no such payment".
--                              Nothing else in the codebase writes this column.
--
-- Note what is deliberately NOT excluded: `status = 'failed'`. A bank-declined,
-- retries-exhausted cycle stays INSIDE this index forever, so no code path can
-- ever mint a second claim on a cycle that actually reached the bank. Excluding
-- `failed` would reopen exactly the hole this index exists to close.
CREATE UNIQUE INDEX "transactions_recurring_cycle_unique"
  ON "transactions" ("mandate_id", "cycle_date")
  WHERE "kind" = 'recurring_debit'
    AND "superseded_at" IS NULL
    AND "mandate_id" IS NOT NULL
    AND "cycle_date" IS NOT NULL;

-- All four CHECKs are added VALID, not NOT VALID: the table was just created and
-- is empty, so there is nothing to grandfather. (`user_login_type_shape` in
-- 20260722120000 uses NOT VALID because it constrained a populated table — that
-- reason does not apply here.)

-- Money that moved must be traceable. A row may be pending/notified/submitted
-- without the gateway's id — it is written before dispatch on purpose — but it
-- can never reach `succeeded` without one, which is what makes a dispute
-- answerable from this table alone.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settled_has_gateway_id" CHECK (
  "status" <> 'succeeded' OR "gateway_payment_id" IS NOT NULL
);

-- The sign is a fact about the KIND, so the database owns it rather than every
-- writer remembering. `initial_deposit` allows 0: Decentro's registration moves
-- nothing (is_downpayment:false), and that zero row is the record of it.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign" CHECK (
  ("kind" = 'initial_deposit' AND "amount_paise" >= 0)
  OR ("kind" IN ('one_time', 'recurring_debit') AND "amount_paise" > 0)
  OR ("kind" IN ('refund', 'chargeback') AND "amount_paise" < 0)
);

-- A recurring debit without a mandate or a cycle is not a recurring debit, and
-- would silently fall OUT of the partial unique index above — i.e. it would be
-- an unguarded charge. Unrepresentable beats caught-in-review.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_shape" CHECK (
  "kind" <> 'recurring_debit'
  OR ("mandate_id" IS NOT NULL AND "cycle_date" IS NOT NULL)
);

-- A reversal must say what it reverses, or it is just money leaving.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_shape" CHECK (
  "kind" NOT IN ('refund', 'chargeback') OR "parent_transaction_id" IS NOT NULL
);

-- Being superseded is a two-column fact; half of it is a corrupt row that the
-- partial index would silently mis-file.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supersede_shape" CHECK (
  ("superseded_at" IS NULL AND "superseded_by_transaction_id" IS NULL)
  OR ("superseded_at" IS NOT NULL AND "superseded_by_transaction_id" IS NOT NULL)
);
