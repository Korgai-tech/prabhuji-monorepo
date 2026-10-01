import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createModuleLogger } from '@api/shared/logs';

const log = createModuleLogger('testing:pg');

let container: StartedPostgreSqlContainer | undefined;

/**
 * DDL that lives ONLY in migration SQL, replayed here after `db push`.
 *
 * `db push` applies what the Prisma schema can express, and the schema language
 * has no way to declare a CHECK constraint — so without this the integration
 * database is missing constraints that production has, and any test asserting
 * one would pass vacuously. That is worse than having no test: the whole reason
 * to put an invariant in the database is that it holds even when the code is
 * wrong, and an untested structural guarantee is not one.
 *
 * Duplicated from the migration rather than shared, because a Prisma migration
 * is a self-contained immutable .sql file and cannot import. Keep the two in
 * step by hand; the migration that owns each statement is named above it.
 */
const EXTRA_CONSTRAINTS = `
-- 20260722120000_add_login_type_and_phone_number
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "user_login_type_shape";
ALTER TABLE "User" ADD CONSTRAINT "user_login_type_shape" CHECK (
  (login_type = 'email'
     AND email IS NOT NULL
     AND "passwordHash" IS NOT NULL
     AND phone_number IS NULL)
  OR
  (login_type = 'otp'
     AND phone_country_code IS NOT NULL
     AND phone_number IS NOT NULL
     AND email IS NULL
     AND "passwordHash" IS NULL)
);

-- 20260729140000_unify_transactions_ledger
--
-- The partial unique index is here for a second reason beyond CHECKs: Prisma's
-- schema language has no WHERE on @@unique either, so db push builds no index
-- at all for it. Without this block the anti-double-charge guard simply does
-- not exist in the integration database, and every test asserting "the second
-- claim is refused" would pass by never being tested.
-- Deferred to COMMIT to break the cycle between the partial index (which
-- refuses to insert the replacement while the old row is live) and
-- transactions_supersede_shape (which refuses to release the old row without
-- naming its replacement). See the migration for the full reasoning.
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_superseded_by_transaction_id_fkey";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_superseded_by_transaction_id_fkey"
  FOREIGN KEY ("superseded_by_transaction_id") REFERENCES "transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

DROP INDEX IF EXISTS "transactions_recurring_cycle_unique";
CREATE UNIQUE INDEX "transactions_recurring_cycle_unique"
  ON "transactions" ("mandate_id", "cycle_date")
  WHERE "kind" = 'recurring_debit'
    AND "superseded_at" IS NULL
    AND "mandate_id" IS NOT NULL
    AND "cycle_date" IS NOT NULL;

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_settled_has_gateway_id";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_settled_has_gateway_id" CHECK (
  "status" <> 'succeeded' OR "gateway_payment_id" IS NOT NULL
);

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_amount_sign";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign" CHECK (
  ("kind" = 'initial_deposit' AND "amount_paise" >= 0)
  OR ("kind" IN ('one_time', 'recurring_debit') AND "amount_paise" > 0)
  OR ("kind" IN ('refund', 'chargeback') AND "amount_paise" < 0)
);

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_recurring_shape";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_shape" CHECK (
  "kind" <> 'recurring_debit'
  OR ("mandate_id" IS NOT NULL AND "cycle_date" IS NOT NULL)
);

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_reversal_shape";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_shape" CHECK (
  "kind" NOT IN ('refund', 'chargeback') OR "parent_transaction_id" IS NOT NULL
);

ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_supersede_shape";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supersede_shape" CHECK (
  ("superseded_at" IS NULL AND "superseded_by_transaction_id" IS NULL)
  OR ("superseded_at" IS NOT NULL AND "superseded_by_transaction_id" IS NOT NULL)
);

-- 20260730120000_add_pdn_and_provider_logs
--
-- ACCEPTED MEANS ADDRESSABLE. The presentation path dereferences the sequence
-- id, and the only thing that lets a row reach that line is its notification
-- being accepted -- so "accepted with no sequence id" is the state that would
-- either crash a billing run or present a debit NPCI cannot match to a
-- notification. Asserted by pdn.repository.integration.test.ts, which is why it
-- has to exist here and not only in the migration.
--
-- (No backticks anywhere in this template literal: they would terminate it.)
ALTER TABLE "pdn_notifications" DROP CONSTRAINT IF EXISTS "pdn_notifications_accepted_has_sequence_id";
ALTER TABLE "pdn_notifications" ADD CONSTRAINT "pdn_notifications_accepted_has_sequence_id" CHECK (
  "status" <> 'accepted' OR "presentation_sequence_id" IS NOT NULL
);

ALTER TABLE "pdn_notifications" DROP CONSTRAINT IF EXISTS "pdn_notifications_attempts_nonneg";
ALTER TABLE "pdn_notifications" ADD CONSTRAINT "pdn_notifications_attempts_nonneg" CHECK ("attempts" >= 0);

-- 20260801120000_add_subscription_cancellation_requests
--
-- Same reason as the transactions index above: a WHERE clause on a unique index
-- is not expressible in Prisma schema syntax, so db push builds no index for it
-- and the integration database had NO defence against two concurrent cancel
-- requests. The service's SELECT-FOR-UPDATE is the primary gate, but FOR UPDATE
-- on a row that does not exist yet locks nothing — so with the index missing,
-- whether "one 201, one 409" holds came down to how the two injected requests
-- happened to interleave. It passed locally and failed on CI.
DROP INDEX IF EXISTS "subscription_cancellation_requests_one_pending_per_user";
CREATE UNIQUE INDEX "subscription_cancellation_requests_one_pending_per_user"
  ON "subscription_cancellation_requests" ("user_id")
  WHERE "status" = 'pending';

-- 20260814120000_tam160_cms_curated_sections
--
-- TAM-160 replaced the plain @unique on section_type with a PARTIAL unique
-- index (built-in types capped at one row each; 'curated' exempt so an editor
-- can create many). Prisma cannot express a WHERE on a unique index, so the
-- schema now declares NO index at all and db push builds none -- which would
-- silently let a second 'newly_added' section be created here while production
-- 409s. Replayed so the "one row per built-in type" invariant is under test.
-- (No backticks anywhere in this template literal: they would terminate it.)
DROP INDEX IF EXISTS "homepage_sections_builtin_type_key";
CREATE UNIQUE INDEX "homepage_sections_builtin_type_key"
  ON "homepage_sections" ("section_type")
  WHERE "section_type" <> 'curated';

DROP INDEX IF EXISTS "mantra_homepage_sections_builtin_type_key";
CREATE UNIQUE INDEX "mantra_homepage_sections_builtin_type_key"
  ON "mantra_homepage_sections" ("section_type")
  WHERE "section_type" <> 'curated';

-- 20260908120000_pinned_content
--
-- Same reason as the other partial-unique indexes above: Prisma cannot express
-- a WHERE on a unique index, so db push builds NO index for it. Without this
-- the "second concurrent write to (surface, deity_slug, pin_position) 409s"
-- guarantee is untestable — the migration in production has it, the integration
-- database does not, and the collision test passes vacuously.
--
-- Same for the CHECK constraint enforcing the surface⇔deity_slug shape:
-- schema-language limitation, replayed here so a write violating the invariant
-- is refused by the integration Postgres too.
DROP INDEX IF EXISTS "pinned_content_position_uq";
CREATE UNIQUE INDEX "pinned_content_position_uq"
  ON "pinned_content" ("surface", "deity_slug", "pin_position")
  NULLS NOT DISTINCT
  WHERE "deleted_at" IS NULL;

ALTER TABLE "pinned_content" DROP CONSTRAINT IF EXISTS "pinned_content_deity_slug_shape";
ALTER TABLE "pinned_content" ADD CONSTRAINT "pinned_content_deity_slug_shape" CHECK (
  (surface = 'status_deity' AND deity_slug IS NOT NULL)
  OR
  (surface <> 'status_deity' AND deity_slug IS NULL)
);
`;

export async function startTestDb(): Promise<string> {
  container = await new PostgreSqlContainer('public.ecr.aws/docker/library/postgres:18-alpine').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  const env = { ...process.env, DATABASE_URL: url };
  execSync('pnpm prisma db push --skip-generate --schema apps/api/prisma/schema.prisma', {
    stdio: 'inherit',
    env,
  });
  execSync('pnpm prisma db execute --stdin --schema apps/api/prisma/schema.prisma', {
    input: EXTRA_CONSTRAINTS,
    stdio: ['pipe', 'inherit', 'inherit'],
    env,
  });
  return url;
}

/**
 * Tear down the suite's container. NEVER throws.
 *
 * This is a deploy gate, so a teardown that can fail is a deploy that can fail
 * for a reason that has nothing to do with the code being deployed. It already
 * did: a stage build finished `490 passed / 0 failed` and still failed the
 * PRE_BUILD phase, because this `afterAll` rejected and Vitest counts a
 * rejected hook as a failed SUITE.
 *
 * The race is in testcontainers 12's default stop path:
 *
 *   stop({ t: toSeconds(timeout ?? 0) })  ->  remove({ v: removeVolumes })
 *
 * `timeout` defaults to 0, so Docker is asked to SIGKILL with no grace period
 * and returns as soon as it has signalled. `remove` is then called WITHOUT
 * `force`, so if the daemon has not finished reaping the process yet it answers
 *
 *   (HTTP code 409) cannot remove container "...": container is running
 *
 * and testcontainers rethrows it. It surfaces on whichever suite is slowest to
 * shut down — on a loaded CodeBuild box running 43 suites' containers in
 * parallel, that was `billing-cycle.integration.test.ts`, the largest file.
 *
 * Two changes, both needed:
 *
 *  1. A real grace period, so Postgres gets a clean shutdown and the daemon has
 *     settled the container's state before `remove` is issued. This makes the
 *     409 rare rather than impossible — it is a race, not a deadline.
 *  2. Swallowing the failure, which is what actually makes it non-blocking. A
 *     leaked container is not worth a red build: these are per-run throwaways,
 *     testcontainers' Ryuk reaper force-removes anything left behind by session
 *     label, and CodeBuild's box is torn down after the run regardless.
 *
 * Logged rather than silent, so a genuine change in teardown behaviour is still
 * visible in the build output instead of being hidden by the fix for the flake.
 */
export async function stopTestDb(): Promise<void> {
  const started = container;
  // Cleared BEFORE the await: a rejected stop must not leave a handle that a
  // later call would try to stop a second time.
  container = undefined;
  if (started === undefined) return;

  try {
    await started.stop({ timeout: 10_000 });
  } catch (err) {
    log.warn(
      { err },
      'ignoring test-container teardown failure — the reaper owns it from here'
    );
  }
}
