-- TAM-186 Phase 1: WHY a payment died, in our vocabulary rather than the gateway's.
--
-- `failure_code` carries the provider's own string and cannot answer the only
-- question anyone asks of it: Razorpay replies GATEWAY_ERROR to 91.9% of
-- declines, and behind that one bucket sit at least fifteen distinct reasons —
-- 91% of them "insufficient balance". Read off `failure_code`, a user who
-- simply had no money is indistinguishable from a bank outage.
--
-- ADDITIVE AND NULLABLE, on purpose. `transactions` is the append-only money
-- ledger: this migration must not rewrite a single existing row, and it must
-- not hold a lock on the table while a deploy waits. Adding a nullable column
-- with no default is a catalogue-only change in Postgres — no table rewrite,
-- no backfill scan.
--
-- HISTORY IS DELIBERATELY NOT BACKFILLED. Rows written before this migration
-- keep a NULL sub-code for good; the series starts at the deploy. Classifying
-- them would mean matching their `failure_message` copy — the one mechanism
-- the live path forbids — and every reader already treats NULL as "unknown",
-- which is the honest answer for a row we never classified.
--
-- Bare TEXT like `kind` and `status`, so adding a value needs no migration.
-- The canonical vocabulary lives in `apps/api/src/core/payment/failure-sub-code.ts`,
-- which is also the only place allowed to decide one.
ALTER TABLE "transactions" ADD COLUMN "failure_sub_code" TEXT;

-- Plain, not partial. A partial index (WHERE failure_sub_code IS NOT NULL) is
-- the tighter fit — only failed rows ever carry one — but Prisma cannot express
-- it, so the schema and the migration would disagree forever and every drift
-- check would report a false positive. A slightly larger index is the better
-- trade than permanent drift.
CREATE INDEX "transactions_failure_sub_code_idx"
  ON "transactions" ("failure_sub_code");
