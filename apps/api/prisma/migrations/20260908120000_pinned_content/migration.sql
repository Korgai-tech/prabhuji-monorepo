-- TAM-173: CMS-controlled pinned content.
--
-- Additive: two new tables + two new enums, no changes to existing tables, no
-- backfill. Rolling deploy safe — old containers keep serving traffic against
-- the new schema (docs/DEPLOYMENT.md, "Write additive migrations").
--
-- Two tables:
--   pinned_content        — one row per pin. Soft-deleted (`deleted_at`), never
--                           hard-deleted, because the partial-unique index on
--                           `(surface, deity_slug, pin_position)` keys off the
--                           tombstone.
--   pinned_content_audit  — append-log of creates / updates / deletes / restores.
--                           No FK to pinned_content: the audit trail survives
--                           even a hypothetical future hard delete.
--
-- Two invariants NOT expressible in the Prisma schema language (replayed in
-- `src/shared/testing/pg.ts` so integration tests see them):
--
--   1. A partial unique index on `(surface, deity_slug, pin_position)` restricted
--      to live rows (`WHERE deleted_at IS NULL`). Prisma's `@@unique` can't
--      express a WHERE — same reason `subscription_cancellation_requests_one_pending_per_user`
--      lives in raw SQL — so without this the second concurrent write would land
--      silently instead of 409ing.
--
--   2. A CHECK constraint enforcing the surface⇔deity_slug shape rule:
--      `surface = 'status_deity' ⇔ deity_slug IS NOT NULL`. Defence-in-depth
--      against a write path that bypasses the service validator.
--
-- Rollback: no inbound FKs and no outbound FKs (deity_slug + content_id are
-- LOGICAL references), so both tables + both enums drop independently.

-- CreateEnum
CREATE TYPE "pin_surface" AS ENUM ('home', 'status_all_gods', 'status_deity');

-- CreateEnum
CREATE TYPE "pin_audit_action" AS ENUM ('create', 'update', 'delete', 'restore');

-- CreateTable
CREATE TABLE "pinned_content" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "surface" "pin_surface" NOT NULL,
    "deity_slug" TEXT,
    "content_id" UUID NOT NULL,
    "pin_position" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pinned_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinned_content_active_lookup"
    ON "pinned_content" ("surface", "deity_slug", "start_at", "end_at");

-- Partial unique index: at most ONE live pin per (surface, deity_slug, position).
-- Restricted to live rows so a soft-deleted row does not block a re-use of its
-- slot. Not expressible in Prisma schema syntax — hence raw SQL.
--
-- `NULLS NOT DISTINCT` is LOAD-BEARING: `home` and `status_all_gods` pins have
-- `deity_slug = NULL`, and Postgres treats NULLs as DISTINCT by default in
-- UNIQUE indexes. Without this clause, two `(home, NULL, 1)` rows would both
-- pass the constraint (NULL ≠ NULL) — silently defeating the partial unique
-- and making `pin_position_taken` unreachable on `home`/`status_all_gods`.
-- Requires Postgres 15+ (this repo runs 18 — see engine_version in RDS).
CREATE UNIQUE INDEX "pinned_content_position_uq"
    ON "pinned_content" ("surface", "deity_slug", "pin_position")
    NULLS NOT DISTINCT
    WHERE "deleted_at" IS NULL;

-- Shape invariant: only a `status_deity` pin carries a `deity_slug`; the other
-- two surfaces MUST have a NULL slug. Defence-in-depth against a write path
-- that bypasses the service validator.
ALTER TABLE "pinned_content"
    ADD CONSTRAINT "pinned_content_deity_slug_shape" CHECK (
        (surface = 'status_deity' AND deity_slug IS NOT NULL)
        OR
        (surface <> 'status_deity' AND deity_slug IS NULL)
    );

-- CreateTable
CREATE TABLE "pinned_content_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pinned_content_id" UUID NOT NULL,
    "action" "pin_audit_action" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_content_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinned_content_audit_pinned_content_id_created_at_idx"
    ON "pinned_content_audit" ("pinned_content_id", "created_at");

-- CreateIndex
CREATE INDEX "pinned_content_audit_actor_user_id_created_at_idx"
    ON "pinned_content_audit" ("actor_user_id", "created_at");
