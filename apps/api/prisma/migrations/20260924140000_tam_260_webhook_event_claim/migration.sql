-- TAM-260: acknowledge Razorpay webhooks first, process them after.
--
-- `webhook_events` becomes the durable inbox a callback worker drains: the
-- row the controller already INSERTs before the 200 is the queue item. These
-- three columns let a worker claim a row under a lease and rebuild its
-- `CallbackRef` from columns alone.
--
--   claimed_at                 lease start of the latest claim; NULL = never
--                              claimed (every inline-processed and legacy row).
--   attempts                   claims so far; the re-driver fails the row via
--                              `markFailed` at the cap.
--   notification_delivered_at  Razorpay `order.notification.delivered` time,
--                              lifted at ingest (D1: a column, so the worker
--                              never depends on redaction sparing a routing
--                              field). Routing input only, never state.
--
-- ADDITIVE ONLY, and safe on the live table (this runs against PRODUCTION on
-- merge to `main`). On Postgres >= 11 (RDS is 18) both nullable columns and
-- `NOT NULL DEFAULT 0` are catalogue-only: a constant default is stored once
-- as the column's missing value, not written into each row. No table rewrite,
-- no scan, no backfill. The ACCESS EXCLUSIVE lock is held for milliseconds.
--
-- NO NEW INDEX. The re-driver's claim scan filters `status` first
-- (`received` older than N seconds, or `processing` with an expired lease), so
-- the existing ("status", "received_at") index serves it. `processing` rows
-- are bounded by worker concurrency x tasks, so filtering them on `claimed_at`
-- needs no index of its own. Leaving it out also avoids a non-concurrent
-- CREATE INDEX (Prisma runs migrations in a transaction) on a live table.
-- `status` is free TEXT, so the new 'processing' value needs no migration.

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "claimed_at" TIMESTAMPTZ(6),
ADD COLUMN     "notification_delivered_at" TIMESTAMPTZ(6);
