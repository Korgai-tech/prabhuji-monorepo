---
name: migration-patterns
description: Prisma database migration creation with ARCHitect approval workflow. Use when creating migrations, adding tables or indexes, or updating the Prisma schema.
disable-model-invocation: true
allowed-tools: Read, Bash, Grep, Glob
---

# Migration Patterns Skill

## Purpose

Guide database migration creation for the Prisma (Postgres) schema at `apps/api/prisma/schema.prisma`, following the layered architecture and approval workflow.

## When This Skill Applies

Invoke this skill when:

- Creating database migrations
- Adding new tables, columns, or indexes
- Updating the Prisma schema
- Schema impact analysis
- Data migration planning

## Stop-the-Line Conditions

### FORBIDDEN Patterns

```bash
# FORBIDDEN: prisma db push against a shared/dev database
# db push is ONLY for the testcontainers helper (src/shared/testing/pg.ts).
# Real schema changes go through migrations.
pnpm prisma db push --schema apps/api/prisma/schema.prisma

# FORBIDDEN: Resolve applied migrations to bypass verification
pnpm prisma migrate resolve --applied "migration_name"

# FORBIDDEN: Editing an already-committed migration file
# Create a new migration instead.

# FORBIDDEN: Schema changes without ARCHitect approval
# All migrations require approval before PR.
```

```prisma
// FORBIDDEN: Missing index on frequently-filtered foreign keys
model Payment {
  id     String @id @default(uuid())
  userId String
  // Missing: @@index([userId])
}
```

```prisma
// FORBIDDEN: surrogate id / FK column left as bare String (TEXT).
// `String` maps to Postgres TEXT — a real id MUST be native `uuid`.
model Payment {
  id     String @id @default(uuid())   // ❌ no @db.Uuid → TEXT column
  userId String                        // ❌ FK to User.id but TEXT, won't match uuid
}
```

### STRICT RULE: every id is a native `uuid`

Non-negotiable, enforced in review:

- Every surrogate primary key `id` **MUST** be `String @id @default(uuid(…)) @db.Uuid`.
  The version is **not** a free choice — `uuid(7)` for identity + payment tables
  (the 11 in `docs/UUID-V7-MIGRATION.md`), `uuid()` (v4) for everything else.
  Content tables use `ORDER BY id ASC` as their product shuffle, so v7 there
  turns discovery grids into oldest-first. Details:
  `patterns_library/database/uuid-ids.md#which-version`.
- Every foreign-key column that references such an `id` (whether via a Prisma
  `@relation` or a logical link like `subscriptions.user_id`) **MUST** carry
  `@db.Uuid` too — Postgres requires both sides of a FK to share a type, and a
  `uuid` vs `text` mismatch breaks joins/constraints.
- **Business / external identifiers** that merely end in `Id` are NOT uuids and
  **MUST stay plain `String` (TEXT)**: e.g. `paywallId` (`"vip-membership-v1"`),
  `planId` (`"week"`), `productId`, `providerSubscriptionId`. Do not blindly
  `@db.Uuid` every `*Id` — check whether the column stores a generated uuid or a
  human/vendor slug.

Rationale: native `uuid` is 16 bytes vs ~37 for TEXT (smaller/faster indexes),
rejects malformed values at the DB, and compares/sorts binary. This is the
repo-wide convention (`apps/api/prisma/schema.prisma` header comment).

### CORRECT Patterns

```prisma
// CORRECT: uuid id + uuid FK + index, then a generated migration
model Payment {
  id        String   @id @default(uuid(7)) @db.Uuid  // payment table → v7
  userId    String   @db.Uuid
  amount    Int
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

```bash
# CORRECT: Generate the migration from the schema change (always with --schema)
pnpm prisma migrate dev --name add_payments --schema apps/api/prisma/schema.prisma
```

New tables are accessed ONLY through a module's `repositories/` layer — never add Prisma calls in routes, controllers, or services.

## Migration Workflow (MANDATORY)

### Step 1: Get ARCHitect Approval

Before ANY schema change:

```text
1. Document proposed changes in the spec file (specs/TAM-N-*.md)
2. Get ARCHitect approval
3. Only proceed after explicit approval
```

### Step 2: Update the Schema

Edit `apps/api/prisma/schema.prisma` (models, relations, indexes).

### Step 3: Generate the Migration

```bash
# Requires local Postgres: docker compose up -d
pnpm prisma migrate dev --name descriptive_name --schema apps/api/prisma/schema.prisma

# Verify migration file created
ls apps/api/prisma/migrations/
```

### Step 4: Verify Locally

```bash
# Repository/integration tests run against a REAL Postgres via testcontainers
pnpm nx test api --configuration=integration

# Full gate
pnpm verify
```

If the API surface changed with the schema (new routes/Zod schemas), run the codegen chain and commit the results: `pnpm nx run api:openapi` → `pnpm nx run api-client:generate` → `pnpm nx run mobile:generate`.

### Step 5: Update Documentation

After successful migration:

- [ ] Record schema-change rationale and evidence in the spec file
- [ ] Update any affected module `types.ts` / Zod schemas
- [ ] Commit the migration directory together with the schema change

## Migration Checklist

Before PR:

- [ ] ARCHitect approval obtained
- [ ] Migration generated with `pnpm prisma migrate dev --schema apps/api/prisma/schema.prisma`
- [ ] Every surrogate `id` PK and every FK column referencing one is `@db.Uuid` (native `uuid`); business/slug `*Id` columns left as `String` — see **STRICT RULE: every id is a native `uuid`**
- [ ] Indexes added for frequently-filtered columns / foreign keys
- [ ] Repository layer updated (Prisma access only in `repositories/`)
- [ ] Integration tests pass (`pnpm nx test api --configuration=integration`)
- [ ] Codegen chain run if API contract changed
- [ ] Evidence recorded in the spec file

## Destructive Migration Requirements

For migrations that drop/rename tables or columns:

- [ ] ARCHitect explicitly approves the destructive step
- [ ] Rollback plan documented in the spec file
- [ ] Data integrity checks planned (row counts, spot checks)
- [ ] Two-step deprecation preferred (add new → backfill → remove old)

## Applying migrations to a deployed environment (stage / prod)

You do NOT run this by hand on the happy path. Both envs auto-deploy from a branch
(`stage` → stage, `main` → prod), and each build applies migrations itself: a one-off
`api` Fargate task with a `npx prisma migrate deploy` command override, run after the
images are pushed and **before** the services roll (TAM-79). A failed migration fails
the build and no service rolls. So: **merge the branch, and the migration ships with
the code.**

The command underneath is `prisma migrate deploy --schema ./prisma/schema.prisma`
(inside the api image). It runs as a task because RDS is `publicly_accessible = false`
and admits 5432 only from the api-tasks SG — CodeBuild is outside the VPC and cannot
reach it.

Break-glass / bootstrap (no image in ECR yet, or the pipeline is wedged):
`pnpm deploy:infra <stage|prod>` runs the same task from your machine as step 5
(`SKIP_MIGRATE=1` opts out).

**Consequence for how you write migrations**: because the schema is migrated while the
previous version's tasks are still serving, expand/contract is mandatory, not advisory
— see **Destructive Migration Requirements** above. An additive migration is safe; a
`DROP`/rename in the same deploy as the code that stops using it is not.

## Authoritative References

- **Schema**: `apps/api/prisma/schema.prisma` (single source of truth)
- **Transaction pattern**: `patterns_library/database/prisma-transaction.md`
- **Layering rules**: `apps/api/CLAUDE.md` (Prisma only in `repositories/`)
- **Integration test DB**: `apps/api/src/shared/testing/pg.ts` (testcontainers + `prisma db push`)
