-- TAM-125: user-initiated cancellation request queue.
--
-- Purely additive — one new table, no backfill and no constraint changes on
-- existing data, so old containers keep serving traffic against the new schema
-- during a rolling deploy (docs/DEPLOYMENT.md, "Write additive migrations").
--
-- The row is a REQUEST, not a state change: creating one does NOT flip
-- `subscriptions.status` or `mandates.state`. Ops fulfills at the provider
-- off-band; a future worker ticket will read `status='pending'` and drive
-- `MandateService.cancelForUser`.
--
-- The partial unique index is defence-in-depth against duplicate `pending`
-- requests per user. The service check inside a SELECT-FOR-UPDATE tx is the
-- primary gate (clean 409 response); this partial index catches races and any
-- hypothetical write path that bypasses the service. Not expressible in Prisma
-- schema syntax — hence the raw SQL below.
--
-- Rollback: no inbound FKs from existing tables and no outbound FK to `users`
-- or `subscriptions` (the link is logical via `user_id` / `subscription_id`,
-- matching `subscriptions` and `mandates`), so the whole table can be dropped
-- independently.

-- CreateTable
CREATE TABLE "subscription_cancellation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "notes" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "processed_at" TIMESTAMPTZ(6),
    "processed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "subscription_cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_cancellation_requests_user_id_requested_at_idx"
    ON "subscription_cancellation_requests" ("user_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_cancellation_requests_status_requested_at_idx"
    ON "subscription_cancellation_requests" ("status", "requested_at");

-- Defence-in-depth against duplicate `pending` requests per user. The service
-- check inside a SELECT-FOR-UPDATE tx is the primary gate (clean 409 response);
-- this partial index catches races and any hypothetical write path that
-- bypasses the service. Not expressible in Prisma schema syntax.
CREATE UNIQUE INDEX "subscription_cancellation_requests_one_pending_per_user"
    ON "subscription_cancellation_requests" ("user_id")
    WHERE "status" = 'pending';
