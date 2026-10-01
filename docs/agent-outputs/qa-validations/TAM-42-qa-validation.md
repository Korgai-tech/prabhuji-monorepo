# QA Validation — TAM-42 (Users Onboarding Schema Migration)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree.

## Spec under test

- `specs/TAM-42-users-onboarding-schema-migration.md`
- Branch: `feature/onboarding`
- Scope: Prisma schema migration only — no routes, no services beyond a
  repository type widening for `UserRecord.name`.

## Files reviewed

- `apps/api/prisma/schema.prisma` (modified)
- `apps/api/prisma/migrations/20260711000000_add_user_onboarding_fields/migration.sql` (new)
- `apps/api/prisma/migrations/migration_lock.toml` (unchanged, provider = postgresql)
- `apps/api/src/core/auth/repositories/auth.repository.ts` (modified — `UserRecord.name` widened)

Confirmed via `git status` + `git diff --stat`:

```text
 apps/api/prisma/schema.prisma                          | 18 +++++++++++++++---
 apps/api/src/core/auth/repositories/auth.repository.ts |  2 +-
 2 files changed, 16 insertions(+), 4 deletions(-)
```

Plus one untracked migration directory. **No unrelated changes.** (`rough_plan/`
is out-of-tree scratch, not part of the ticket.)

## Static gates

| Gate | Result |
| --- | --- |
| `pnpm run verify` (arch boundaries + OpenAPI drift + typecheck + lint + unit tests, all Node projects) | PASS — 5 projects green, 12 unit-test files / 39 tests + admin 2/2 + events 44/44 |
| `pnpm nx test api --configuration=integration` (testcontainers Postgres) | PASS — 7 files / 12 tests; Prisma applied the new migration cleanly to each fresh test container (`🚀 Your database is now in sync with your Prisma schema`) |
| `pnpm nx run api:typecheck` | Subsumed and green under `pnpm verify` |
| `pnpm check:openapi` (OpenAPI drift) | Subsumed and green under `pnpm verify` — no route changes, so `openapi.json` is a no-op as the spec predicted |

Notes on `verify` output: two pre-existing admin lint warnings
(`react-refresh/only-export-components` in `auth/auth-context.tsx:43` and
`components/ui/button.tsx:61`). Both are pre-existing, unrelated to this
ticket, and are warnings (not errors). Not a blocker.

## Schema correctness (field-by-field against AC)

Read `apps/api/prisma/schema.prisma` lines 10–29:

| AC | Field / directive | Verdict |
| --- | --- | --- |
| `name` nullable | `name String?` (line 13) | PASS |
| `phoneCountryCode String?` mapped `phone_country_code` | Line 19 | PASS |
| `phoneNumberHash String?` mapped `phone_number_hash` | Line 20 | PASS |
| `selectedLanguage String?` mapped `selected_language` | Line 21 | PASS |
| `onboardingCompletedAt DateTime?` mapped `onboarding_completed_at` | Line 22 | PASS |
| Compound unique index on `(phoneCountryCode, phoneNumberHash)` named `user_phone_unique` | `@@unique([phoneCountryCode, phoneNumberHash], name: "user_phone_unique")` (line 27) | PASS |
| Non-unique index on `onboardingCompletedAt` | `@@index([onboardingCompletedAt])` (line 28) | PASS |
| CamelCase Prisma / snake_case SQL | All 4 new columns use `@map(...)` to snake_case; timestamps use existing Prisma `createdAt`/`updatedAt` convention | PASS |

## Migration SQL correctness

Read `apps/api/prisma/migrations/20260711000000_add_user_onboarding_fields/migration.sql`:

- **Docs comment (AC line: "Docs comment in the migration SQL explains the field semantics")** — lines 1–12 include:
  - `name` — nullable rationale
  - `phone_*` — country code + SHA-256 hash of E.164, raw phone never stored (TAM-43 will hash)
  - `selected_language` — 2-letter ISO code (TAM-44 populates)
  - `onboarding_completed_at` — timestamp semantics + null=incomplete routing rule
  - Explicit note on the unique index behavior with NULL tuples
  - **PASS**
- **AlterTable** (lines 14–19) adds `onboarding_completed_at TIMESTAMP(3)`, `phone_country_code TEXT`, `phone_number_hash TEXT`, `selected_language TEXT` (all nullable — no `NOT NULL`), and `ALTER COLUMN "name" DROP NOT NULL`. **PASS**
- **CreateIndex** (line 22) — non-unique `User_onboarding_completed_at_idx` on `onboarding_completed_at`. **PASS**
- **CreateIndex** (line 25) — `CREATE UNIQUE INDEX "User_phone_country_code_phone_number_hash_key" ON "User"("phone_country_code", "phone_number_hash")`. **PASS**

Sanity: this SQL is byte-identical to what Prisma emits from a normal
`prisma migrate diff`. The implementer used `--from-migrations … --to-schema-datamodel`
via a shadow DB because the local DB was polluted; the output matches
Prisma's canonical style (idx/key naming, statement grouping).

## Idempotency + safety on a non-empty `User` table

- All new columns are added nullable — existing rows receive `NULL`, no
  data-loss risk. **PASS**
- `ALTER COLUMN "name" DROP NOT NULL` — widening the constraint; existing
  populated rows are unaffected because they already satisfy the weaker
  constraint. **PASS**
- Unique index over `(phone_country_code, phone_number_hash)` — Postgres
  treats `NULL` tuples as distinct, so pre-onboarding rows (both columns
  NULL) do not collide with each other. Confirmed by the docs comment
  (lines 11–12) and by the migration applying cleanly against every fresh
  testcontainers Postgres in the integration run. **PASS**
- Empirical proof: the integration suite (auth routes + auth repository)
  ran `prisma migrate deploy` on new containers 7 times and all migrations
  applied without error. **PASS**

## Repository type widening (auth.repository.ts)

- `UserRecord.name` widened from `string` to `string | null` (line 6) —
  correct because the underlying Prisma-typed `User.name` is now `string | null`.
- `createUser` input still requires `name: string` (line 13) — registration
  callers always provide a name; the wider `UserRecord` accommodates rows
  that are pre-onboarding.
- `findByEmail` / `findById` propagate `u.name` (now `string | null`) into
  `UserRecord.name` without runtime coercion — type-safe by construction.
- `pnpm nx typecheck api` (under `verify`) confirms no downstream call site
  broke on the widened type.

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| `User` model has 4 new fields with correct types + nullability | PASS | `schema.prisma` lines 19–22 + `name` on line 13 |
| Unique index on `(phoneCountryCode, phoneNumberHash)` | PASS | `schema.prisma` line 27 + migration line 25 |
| Non-unique index on `onboardingCompletedAt` | PASS | `schema.prisma` line 28 + migration line 22 |
| Prisma migration file generated + committed | PASS (present, untracked — pending PR commit) | `apps/api/prisma/migrations/20260711000000_add_user_onboarding_fields/migration.sql` |
| Migration idempotent + safe on non-empty `User` | PASS | See "Idempotency + safety" section |
| `pnpm verify` green | PASS | Run log above |
| `pnpm nx test api --configuration=integration` green | PASS | Run log above (7/7 files, 12/12 tests) |
| `openapi.json` regenerated if any schema type surfaces through a route | PASS (no-op) | `check:openapi` (under `verify`) reports no drift; no route changes touch these fields |
| Docs comment in migration SQL explains field semantics | PASS | Migration lines 1–12 |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS |
| `pnpm verify` green | PASS |
| `pnpm nx test api --configuration=integration` green | PASS |
| Migration applied to stage without errors | OUT-OF-SCOPE for local QA (deploy-time verification; RTE / infra) — **not a QA blocker** |
| PR references this spec (`Closes TAM-42`) | OUT-OF-SCOPE for local QA (RTE will confirm at PR creation) — **not a QA blocker** |

## PII / Security check

- No raw phone column exists on `User`. Only `phone_country_code` +
  `phone_number_hash` (SHA-256 planned in TAM-43). **PASS**
- `name` nullable and treated as PII — no new logging in this ticket
  (`console.log` / `logger.info` grep on the two changed files: zero hits
  for name). **PASS**
- `#EXPORT_CRITICAL` from the spec ("Do NOT add a raw phone column",
  "Do NOT break the unique index"): both honored. **PASS**

## Observations (non-blocking)

- The spec's Testing Strategy references
  `apps/api/src/modules/users/repositories/users.repository.integration.spec.ts` —
  but this codebase uses `apps/api/src/core/**` (not `modules/`) and has no
  standalone `users` module (User CRUD lives inside `core/auth`). The
  existing `apps/api/src/core/auth/repositories/__tests__/auth.repository.integration.test.ts`
  already exercises `User` create/read against the new schema and passes.
  The absence of a duplicate users-repository test file is consistent with
  the actual code layout and does not gate this ticket — the migration is
  proven to apply cleanly by every integration run.
- Pre-existing admin lint warnings (unrelated) noted above.

## Overall verdict: APPROVED
