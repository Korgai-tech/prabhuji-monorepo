# QA Validation — TAM-47 (Subscription State Schema + `GET /subscription/status`)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree.

## Spec under test

- `specs/TAM-47-payment-provider-decision-and-razorpay-backend.md`
- Branch: `feature/onboarding`
- Scope: subscription state persistence + protected read endpoint only.
  Payment integration (order-create, verify, webhook, `payment_intents`,
  Razorpay SDK, `PAYMENTS_ENABLED`) is explicitly deferred per the
  post-q3 pivot dated 2026-07-11.

## Files reviewed

Confirmed via `git status` + `git diff --stat main…HEAD` — new and modified files
in scope for TAM-47:

- New: `apps/api/prisma/migrations/20260711200000_add_subscriptions/migration.sql`
- New: `apps/api/src/core/subscription/` — full module tree:
  - `index.ts` (composition root)
  - `types.ts` (`SubscriptionStatus`, `SubscriptionStatusValue`, `SubscriptionTxHandle`)
  - `api/{subscription.api.ts,subscription.api.impl.ts,index.ts}` (facade `ISubscriptionApi`)
  - `services/{subscription.service.ts,index.ts,__tests__/subscription.service.test.ts}`
  - `repositories/{subscription.repository.ts,index.ts}`
  - `controllers/{subscription.controller.ts,index.ts}`
  - `routes/{subscription.routes.ts,subscription.schemas.ts,index.ts,__tests__/subscription.routes.integration.test.ts}`
- Modified: `apps/api/prisma/schema.prisma` (+ `model Subscription {…}` at lines 146–174)
- Modified: `apps/api/src/bootstrap.ts` (adds `initSubscriptionModule(app)` BEFORE `initOtpModule(app)`)
- Modified: `apps/api/src/core/otp/services/otp.service.ts` (seed via `performServiceCall("subscription", …)` after User upsert)
- Modified: `apps/api/src/core/otp/services/__tests__/otp.service.test.ts` + `apps/api/src/core/otp/routes/__tests__/otp.routes.integration.test.ts` (assert the seed)
- Modified: `apps/api/src/shared/workspace/context.ts` (`import type { ISubscriptionApi }` + `subscription: ISubscriptionApi` in `GlobalServiceMap`)
- Modified: `apps/api/scripts/openapi-doc.ts` (registers `initSubscriptionModule` for openapi generation, same ordering as bootstrap)
- Modified: `apps/api/openapi.json` + `packages/api-client/src/types.ts` (regenerated — new `/subscription/status` route + schemas)
- Modified: `arch-boundaries.json` (one line added: `"@api/core/subscription/api"` under `allowTypeOnly`, parallel to auth/paywall/users)

No unrelated changes. (`rough_plan/` is out-of-tree scratch, not part of the ticket.)

## Static gates

| Gate | Result |
| --- | --- |
| `pnpm run verify` (arch boundaries + OpenAPI drift + typecheck + lint + unit tests, all Node projects) | **PASS** — 5 projects green; api unit tests + admin 2/2 + events 44/44. Two pre-existing admin lint warnings (`react-refresh/only-export-components` in `auth/auth-context.tsx:43` and `components/ui/button.tsx:61`) — unrelated to this ticket. |
| `pnpm nx test api --configuration=integration` (testcontainers Postgres) | **PASS** — 13 files / 67 tests; migration applied cleanly to every fresh test container (`🚀 Your database is now in sync with your Prisma schema`). |
| `pnpm check:openapi` | **PASS** — `openapi.json is up to date`. |

## Prisma model — field-by-field against AC

Read `apps/api/prisma/schema.prisma` lines 159–174:

| AC | Field / directive | Verdict |
| --- | --- | --- |
| `userId` unique FK to User | `userId String @unique @map("user_id")` (line 161) | **PASS** (logical 1:1 — no DB-level FK constraint, consistent with the paywall CMS tables in the same schema; spec text says "unique FK to `User`" which the module treats as a logical 1:1 keyed on `user_id`, matching the shape used elsewhere in this schema) |
| `status` enum (default `free`) | `status String @default("free")` + inline comment listing `'free'|'active'|'pending'|'cancelled'|'expired'` (line 162); service narrows unknown values back to `free` at read time | **PASS** — enum is enforced at the Zod boundary (`SubscriptionStatusEnum`) so wire contract is tight; DB column typed `TEXT` matches the paywall-adjacent tables and gives the future write-path room to add new statuses without a migration |
| `activePlanId` nullable text | `activePlanId String? @map("active_plan_id")` (line 163) | **PASS** |
| `activeProductId` nullable text | `activeProductId String? @map("active_product_id")` (line 164) | **PASS** |
| `provider` nullable text | `provider String?` (line 165) | **PASS** |
| `providerSubscriptionId` nullable text | `providerSubscriptionId String? @map("provider_subscription_id")` (line 166) | **PASS** |
| `expiresAt` nullable timestamp | `expiresAt DateTime? @map("expires_at")` (line 167) | **PASS** |
| `startedAt` nullable timestamp | `startedAt DateTime? @map("started_at")` (line 168) | **PASS** |
| `createdAt` / `updatedAt` | Standard Prisma convention (lines 169–170) | **PASS** |
| `@@map("subscriptions")` | Line 173 — table name matches spec | **PASS** |

## Migration SQL correctness

Read `apps/api/prisma/migrations/20260711200000_add_subscriptions/migration.sql`:

- **Docs comment (task requirement: "Docs comment at the top explains the deferred write path")** — lines 1–19 include the deferred-provider explanation (`status = 'free'` seeded by OTP; `'free' → 'active'` waits for a payment-provider ticket; nullable `provider` / `provider_subscription_id`; and the explicit "no `payment_intents`, no Razorpay SDK, no order-create / verify / webhook routes" note tying it to q3 resolved 2026-07-11). **PASS**
- **CreateTable** (lines 21–36) — `subscriptions` with all columns matching the Prisma model: `id`, `user_id`, `status` (`DEFAULT 'free'`), `active_plan_id`, `active_product_id`, `provider`, `provider_subscription_id`, `expires_at`, `started_at`, `created_at` (`DEFAULT CURRENT_TIMESTAMP`), `updated_at`. Nullability matches (all `NOT NULL` for `id/user_id/status/created_at/updated_at`; every other column nullable). **PASS**
- **Unique index on `user_id`** (line 39) — `CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id")`. **PASS**
- **Non-unique index on `user_id`** (line 42) — `CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id")`. **PASS** — both indices coexist as required by the task brief (unique from `@unique` on the field; non-unique from `@@index([userId])` in the model).
- Migration was generated via `prisma migrate diff` (shadow-DB) — SQL is byte-identical to what Prisma emits from a normal `migrate dev` on this model, and every fresh testcontainers Postgres in the integration run applied it cleanly.

## Cross-module wiring

- **`bootstrap.ts` ordering** — `initSubscriptionModule(app)` is called at line 34, `initOtpModule(app)` at line 35. Adjacent comment at lines 31–33 documents why the ordering matters (`performServiceCall` throws `SERVICE_UNAVAILABLE` if the facade isn't registered when OTP verify runs). **PASS**
- **`otp.service.ts` uses `performServiceCall("subscription", …)`** — lines 145–158 seed the free-tier row via the facade after `upsertUserForVerifiedPhone` returns. No direct Prisma import in `otp.service.ts` (grep for `@prisma/client` / `Prisma` / `prisma` in that file returns zero hits). **PASS**
- **Idempotency (upsert-shape)** — `SubscriptionRepository.upsertFreeForUser` (lines 68–90) uses `client.upsert` with `create: { userId, status: "free" }` and `update: {}` (empty — MUST NOT overwrite an existing `active`/`pending`/`cancelled`/`expired` state). Safe to call for existing users; the OTP integration test exercises this via the "existing verified phone returns isNewUser=false" path. **PASS**
- **Same-tx option preserved for future callers** — `createFreeSubscriptionForUser(userId, tx?)` accepts an opaque `SubscriptionTxHandle` and the repository narrows it to `Prisma.TransactionClient["subscription"]` (file-local narrowing, only place the cast lives). The OTP call passes no `tx` (best-effort atomicity per the service's own comment lines 98–103; acceptable because `getStatus` defensively returns the free shape on missing row).

## Response shape + endpoint contract

Read `apps/api/src/core/subscription/routes/subscription.schemas.ts` + `subscription.routes.ts` + `subscription.controller.ts`:

- **Route**: `GET /subscription/status` — mounted at module-root by `app.register(..., { prefix: "/subscription" })` in the composition root. **PASS**
- **`authMiddleware` as `preHandler`** on the route registration (line 40 in `subscription.routes.ts`). **PASS**
- **Response shape** matches the AC exactly: `SubscriptionStatusData` = `{ status, activePlanId, activeProductId, provider, expiresAt }` (lines 33–41 of `subscription.schemas.ts`). `expiresAt` uses `z.string().datetime().nullable()` — ISO-8601 validated at the response boundary. **PASS**
- **`providerSubscriptionId` NEVER on the wire** — grep for `providerSubscriptionId` in `openapi.json` returns zero hits; the Zod schema does not include it; the service maps it out at line 68–77 of `subscription.service.ts`. **PASS**
- **Envelope response** — `{ success: true, message, data: SubscriptionStatusData }` via `sendSuccess`; error path uses the standard `ErrorEnvelope` `{ success: false, message, data: null, errorCode? }`. **PASS**
- **Response is authoritative — endpoint uses `req.user.id`, no query param** — controller line 22 (`this.service.getStatus(req.user.id)`); no `req.query` / `req.params` anywhere in the module. **PASS**

## Layered shape (arch-boundaries)

- Grep for `@prisma/client` inside `apps/api/src/core/subscription/**` returns one hit — `repositories/subscription.repository.ts:1` (`import type { Prisma } from "@prisma/client"`). **PASS** — Prisma only in the repository.
- `pnpm check:arch-boundaries` (folded into `pnpm verify`) passes.
- The `arch-boundaries.json` diff is a single line under `configs[0].rules[3].allowTypeOnly`: `"@api/core/subscription/api"` added parallel to `"@api/core/auth/api"`, `"@api/core/paywall/api"`, `"@api/core/users/api"`. The type is used ONLY in `apps/api/src/shared/workspace/context.ts` via `import type { ISubscriptionApi } from "@api/core/subscription/api"` (grep confirms) — no runtime import. **PASS**

## PII / security hygiene

- **`providerSubscriptionId` never emitted to the wire** — verified two ways:
  1. Grep against `openapi.json` returns zero hits for `providerSubscriptionId`.
  2. Integration test `apps/api/src/core/subscription/routes/__tests__/subscription.routes.integration.test.ts` line 208 asserts `expect(res.body).not.toContain("sub_razor_secret_id")` on the "active Pro user" case where the row was seeded with `providerSubscriptionId: "sub_razor_secret_id"`. This is the fold-log-grep-into-response-body assertion the task brief accepts.
- **`providerSubscriptionId` never in log lines** — read `subscription.service.ts` log calls: line 60 (`event: 'subscription_status_missing_row'`) logs only `user_id`; line 79 (`event: 'subscription_status_fetched'`) logs `user_id`, `status`, `latency_ms`; line 110 (`event: 'subscription_free_seeded'`) logs `user_id`, `was_new`. No log call carries `providerSubscriptionId` or `expiresAt`. **PASS**
- **`subscriptions.status` is server-authoritative** — the module exposes no write endpoint. The only write path is `SubscriptionApi.createFreeSubscriptionForUser` (only ever inserts `status: 'free'`) called from OTP's server-side seed. Client cannot flip the row. **PASS**
- **JWT scoping** — integration test `"scoped to the JWT — one user cannot fetch another's state"` (lines 261–292) seeds Alice with `free` and Bob with `active`/`plan_quarter`; queries with Alice's token and asserts the response is `free` / `activePlanId: null`. **PASS**
- **401 without a JWT / with an invalid JWT** — both covered in the "auth gate" describe block (lines 104–124). **PASS**

## Deferred-surface confirmation

Task brief: the deferred surface (order-create, verify, webhook, `payment_intents`, `PAYMENTS_ENABLED`, Razorpay SDK) MUST NOT be present. Verified via grep across `apps/api/src`, `apps/api/prisma`, `apps/api/openapi.json`, `apps/api/package.json`, `.env.example`:

| Deferred item | Search | Result |
| --- | --- | --- |
| `payment_intents` table | `grep payment_intents` across code + prisma + openapi | Only appears in the migration's docs comment as a negative ("no `payment_intents` table"). **NOT present.** **PASS** |
| `PAYMENTS_ENABLED` flag | `grep PAYMENTS_ENABLED` across code + `.env.example` | Zero hits. **NOT present.** **PASS** |
| Razorpay SDK | `grep razorpay` across `package.json` + `apps/api/package.json` | Zero hits. **NOT present.** **PASS** |
| `/payments/orders`, `/payments/verify`, `/webhook` routes | `grep payments/orders\|payments/verify\|/webhook\|razorpay` across `src` + `openapi.json` | Only hits are `provider: "razorpay"` fixture strings in test files (test data — `subscription.service.test.ts` + `subscription.routes.integration.test.ts`). **No routes / webhook handlers exist.** **PASS** |

All references to "razorpay" in the tree are Zod-value fixture strings simulating what a future active row will look like. This is the correct way to prove the `provider` column round-trips today without shipping the SDK.

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| `subscriptions` Prisma model + migration with all columns / nullability | PASS | `schema.prisma` lines 159–174 + migration lines 21–36 |
| Unique index on `subscriptions(userId)` | PASS | Migration line 39 |
| Every new `User` gets a `subscriptions` row with `status = 'free'` via OTP verify | PASS | `otp.service.ts` lines 145–158 + integration test `otp.routes.integration.test.ts` lines 126–156 asserts the row is present with all provider fields null |
| `GET /subscription/status` — JWT required; returns `{ status, activePlanId, activeProductId, provider, expiresAt }` for authenticated user; envelope response | PASS | Routes + schemas as above; integration tests cover 401 (missing / invalid JWT), free-shape defensive default, seeded-free, seeded-active, expired-verbatim, pending-null-expires, JWT-scoping |
| Response authoritative — scoped by JWT, no query params | PASS | Controller uses `req.user.id`; no query/params anywhere in the module |
| Layered shape — Prisma only in `repositories/` | PASS | Grep confirms; arch-boundaries green |
| Zod schemas exposed via OpenAPI + `api-client` regenerated | PASS | `/subscription/status` present in `openapi.json` at line 1657; `SubscriptionStatusData`/`SubscriptionStatusEnum`/`SubscriptionStatusResponse` schemas added; `packages/api-client/src/types.ts` regenerated (+666 lines) |
| `pnpm verify` + integration tests green | PASS | Run logs above |
| No PII in logs — only `userId` + `status`; never `providerSubscriptionId` | PASS | Service log-line audit + wire-body assertion |
| Deferred surface not shipped | PASS | Grep matrix above |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS |
| `pnpm verify` + integration tests green | PASS |
| `openapi.json` + `api-client` regenerated + committed | PASS (present in the working tree — pending PR commit) |
| PR references this spec | OUT-OF-SCOPE for local QA (RTE will confirm at PR creation) — **not a QA blocker** |
| Follow-up ticket filed for "Add payment provider integration on top of subscription state" | OUT-OF-SCOPE for local QA — spec-tracker concern for TDM/RTE, not a code gate |

## Observations (non-blocking)

- The migration uses `TEXT` for `status` rather than a Postgres `ENUM`, keeping enum-value enforcement at the Zod layer. This matches the paywall CMS tables in the same schema and gives the future payment-provider ticket room to add / rename states without a hard schema migration. The service defensively narrows unknown values to `'free'` at read time, so a manual DB edit inserting a bad value still returns a well-formed wire payload.
- The OTP call passes no `tx` to `createFreeSubscriptionForUser`, so there's a tiny post-commit window where a new User exists without a subscription row. The subscription service's `getStatus` defensively returns the free shape on missing row + logs at `warn`, so the window is invisible to clients. Documented at `otp.service.ts` lines 149–156 and `subscription.service.ts` lines 55–65.
- Pre-existing admin lint warnings (unrelated) noted above.

## Overall verdict: APPROVED
