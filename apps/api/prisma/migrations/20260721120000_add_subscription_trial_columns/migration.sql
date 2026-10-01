-- Subscription trial + dunning columns, ahead of the UPI Autopay write path.
--
-- Three nullable columns, no backfill, no constraint changes — purely additive
-- so old containers keep serving traffic against the new schema during a
-- rolling deploy (docs/DEPLOYMENT.md, "Write additive migrations").
--
--   trial_ends_at     — end of the 3-day free trial. `status = 'trialing'`
--                       grants entitlement only while now() < this.
--   trial_consumed_at — stamped once, never cleared. NPCI auto-revokes a
--                       mandate whose FIRST debit fails, so a user can legally
--                       re-register; this column is what stops that second
--                       mandate from granting a second free trial.
--   grace_until       — dunning window. While `status = 'past_due'` the user
--                       stays entitled until this instant, so a retryable bank
--                       failure doesn't instantly revoke paid-for access.
--
-- The `status` column stays TEXT (no enum, no CHECK), so the two new values
-- 'trialing' and 'past_due' need no DDL — they are introduced in the
-- application's Zod schema + status union only.

-- AlterTable
ALTER TABLE "subscriptions"
    ADD COLUMN "trial_ends_at" TIMESTAMP(3),
    ADD COLUMN "trial_consumed_at" TIMESTAMP(3),
    ADD COLUMN "grace_until" TIMESTAMP(3);
