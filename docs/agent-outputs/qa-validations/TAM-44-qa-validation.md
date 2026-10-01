# QA Validation — TAM-44 (Profile Save Endpoint — `PATCH /users/me` + `GET /users/me`)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. Every check
executed independently against the working tree (`feature/onboarding`).

## Spec under test

- `specs/TAM-44-profile-save-endpoint.md`
- Branch: `feature/onboarding`
- Scope: new `core/users` module (routes / controller / service / repository /
  facade + colocated unit + integration tests) + a shared Zod language enum
  reused by TAM-45 / TAM-52. No new DB migration (uses columns added in TAM-42).

## Files reviewed

New (untracked):

- `apps/api/src/core/users/index.ts` (composition root)
- `apps/api/src/core/users/types.ts`
- `apps/api/src/core/users/api/{index.ts,users.api.ts,users.api.impl.ts}`
- `apps/api/src/core/users/controllers/{index.ts,users.controller.ts}`
- `apps/api/src/core/users/services/{index.ts,users.service.ts,__tests__/users.service.test.ts}`
- `apps/api/src/core/users/repositories/{index.ts,users.repository.ts}`
- `apps/api/src/core/users/routes/{index.ts,users.routes.ts,users.schemas.ts,__tests__/users.routes.integration.test.ts}`
- `apps/api/src/shared/language.schema.ts`

Modified:

- `apps/api/openapi.json` (regenerated)
- `apps/api/scripts/openapi-doc.ts` (+`initUsersModule`)
- `apps/api/src/bootstrap.ts` (+`initUsersModule`)
- `apps/api/src/shared/workspace/context.ts` (+`users: IUsersApi` in `GlobalServiceMap`)
- `arch-boundaries.json` (adds `@api/core/users/api` to shared `allowTypeOnly`)
- `packages/api-client/src/types.ts` (regenerated)

`git diff --stat` shows 6 modified + 2 untracked directories; no unrelated
edits. (`rough_plan/` is out-of-tree scratch.)

## Static gates

| Gate | Result |
| --- | --- |
| `pnpm check:arch-boundaries` | PASS — no violations |
| `pnpm check:openapi` (drift) | PASS — `openapi.json is up to date` |
| `pnpm run verify` (arch + openapi + typecheck + lint + unit for every Node project) | PASS — 5 projects, cache + fresh runs green |
| `pnpm nx test api --configuration=integration` (testcontainers Postgres) | PASS — 10 files, **39 tests** including the new `users.routes.integration.test.ts` (14 tests) |

Notes: only pre-existing warnings from `admin` (`react-refresh/only-export-components`,
2 hits) surface — unrelated to this ticket, not new, not errors.

## Module shape (against `core/otp` + `core/auth` conventions)

Layout matches the layered pattern exactly:

```text
core/users/
├── api/{index.ts, users.api.ts (IUsersApi), users.api.impl.ts (UsersApi)}
├── controllers/{index.ts, users.controller.ts}
├── index.ts                              (composition root — mirrors core/otp)
├── repositories/{index.ts, users.repository.ts}
├── routes/{index.ts, users.routes.ts, users.schemas.ts, __tests__/…}
├── services/{index.ts, users.service.ts, __tests__/…}
└── types.ts
```

Composition root (`core/users/index.ts`): wires `UsersRepository → UsersService →
UsersApi`, calls `registerGlobalService("users", api)`, mounts routes under
`/users`. Same shape as `core/otp/index.ts`. **PASS**

## Layered architecture (Prisma isolation)

- `@prisma/client` / `getPrisma` referenced ONLY in
  `core/users/repositories/users.repository.ts`. Service imports `UsersRepository`
  as a type only (`import type … from "@api/core/users/repositories"`). Route
  layer never touches Prisma. **PASS**
- `pnpm check:arch-boundaries` confirms no violations across the whole tree.

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| `PATCH /users/me` — protected route, requires JWT (`authMiddleware`) | PASS | `routes/users.routes.ts` L54: `preHandler: authMiddleware` (imports the existing `@api/core/auth/middleware`); integration test "PATCH … without a JWT returns 401" green |
| Request body `{ name?, selectedLanguage? }` (both optional; at least one required) | PASS | `routes/users.schemas.ts` L31–41: `UpdateMeRequest.refine(atLeastOne, …)`; integration test "empty body … is 400" green |
| `name` validation — 1..64 chars, trimmed; rejects empty-after-trim | PASS | `NameSchema = z.string().trim().min(1).max(64)`; integration tests "  Ram   → Ram" (persisted), "   → 400", "a×65 → 400" green |
| `selectedLanguage` validation — enum of 8 Phase-1 codes | PASS | `LanguageCodeSchema` in `shared/language.schema.ts` — `["hi","mr","gu","bn","or","ta","te","kn"]`, meta id `LanguageCode`; integration "xx → 400" green |
| On save with both `name` + `selectedLanguage` (now or previously) AND current `onboardingCompletedAt === null`, service sets `onboardingCompletedAt = now()` | PASS | `services/users.service.ts` L52–63 (see § Server-owned onboarding flip below); unit + integration coverage green |
| `GET /users/me` — protected route, returns current user shape | PASS | `routes/users.routes.ts` L25–40; response shape asserted by integration test |
| Response envelope `{ success, message, data: { user } }` | PASS | `controllers/users.controller.ts` uses `sendSuccess(reply, { user }, …)`; integration body assertions confirm |
| Never returns `phoneNumberHash` (nor `email`, `passwordHash`) | PASS | See § PII hygiene |
| `openapi.json` regenerated + committed | PASS | Modified in this diff; `LanguageCode`, `UpdateMeRequest`, `UsersPublicUser`, `UsersMeResponse` components + `/users/me` GET/PATCH ops present. `pnpm check:openapi` clean. |
| `api-client` regenerated | PASS | `packages/api-client/src/types.ts` contains `/users/me`, `UsersPublicUser`, `UsersPublicUserInput` — regenerated |
| `pnpm verify` green | PASS | See § Static gates |
| `pnpm nx test api --configuration=integration` green | PASS | 39/39 |

## Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All AC met | PASS |
| `pnpm verify` + integration tests green | PASS |
| `openapi.json` + `api-client` regenerated + committed | PASS (present, untracked/modified — pending PR commit) |
| PR references this spec | OUT-OF-SCOPE for local QA (RTE confirms at `gh pr create`) — not a QA blocker |

## Server-owned onboarding-complete flip

Service code (`services/users.service.ts` L47–63):

```ts
const nextName = patch.name ?? current.name;
const nextLanguage = patch.selectedLanguage ?? current.selectedLanguage;
const shouldFlip =
  current.onboardingCompletedAt === null &&
  nextName !== null &&
  nextLanguage !== null;

const updated = await this.repo.updateById(userId, {
  ...(patch.name !== undefined ? { name: patch.name } : {}),
  ...(patch.selectedLanguage !== undefined ? { selectedLanguage: patch.selectedLanguage } : {}),
  ...(shouldFlip ? { onboardingCompletedAt: new Date() } : {}),
});
```

Matches the spec's `#EXPORT_CRITICAL` semantics exactly:

- Precondition: `currentOnboardingCompletedAt === null` — once non-null, flip
  cannot fire again. **PASS (idempotency)**
- Both resulting fields non-null (either from the current row OR from the
  patch). **PASS**
- Client cannot influence the timestamp — the `updateById` spread only writes
  `onboardingCompletedAt` when `shouldFlip` fires; the DTO type on the repo
  (`updateById` `data.onboardingCompletedAt?: Date`) also does not accept a
  client-supplied value.

**Injection defense**: `UpdateMeRequest` uses `.strict()` (schemas.ts L36) so
Fastify + fastify-type-provider-zod reject any unknown key at 400 (integration
test "client-supplied `onboardingCompletedAt` is rejected (strict schema)" —
also asserts nothing was persisted). **PASS**

**Idempotency proof**: unit test "idempotency — already-complete user with
same values does NOT move onboardingCompletedAt" + "second patch after
completion never rewrites …" + integration test
"onboardingCompletedAt is stable across subsequent reads/writes" — all green.

## Shared language enum

- `apps/api/src/shared/language.schema.ts` — exports `LanguageCodeSchema`
  (`z.enum(["hi","mr","gu","bn","or","ta","te","kn"]).meta({ id: "LanguageCode" })`)
  + `LanguageCode` inferred type. Single source of truth. **PASS**
- No duplicate `z.enum([...])` with the same codes anywhere else in
  `apps/api/src/` (grep confirmed).
- Consumers: `core/users/routes/users.schemas.ts` uses `LanguageCodeSchema`
  for both `UpdateMeRequest.selectedLanguage` (optional) and
  `PublicUserSchema.selectedLanguage` (nullable). Ready for TAM-45 / TAM-52.

## PII hygiene

- `PublicUserSchema` (schemas.ts L55–66) has exactly:
  `id`, `name`, `selectedLanguage`, `onboardingCompletedAt`,
  `phoneCountryCode`. **Excludes** `email`, `passwordHash`, `phoneNumberHash`
  by omission. **PASS**
- Repository `SELECT` (users.repository.ts L18–24) also does NOT select
  `email`, `passwordHash`, `phoneNumberHash` — the sensitive fields never
  leave the DB layer for this module. Defence-in-depth. **PASS**
- Integration test "response shape is exactly PublicUser — never leaks
  phoneNumberHash / email / passwordHash" asserts both structurally
  (`Object.keys(...).sort()`) AND on the raw response body
  (`res.body` `.not.toContain("phoneNumberHash" / "passwordHash")`). **PASS**
- Log calls grepped (`log.info|error|debug|warn` under `core/users/`):
  - `services/users.service.ts` L65–73: logs `user_id`, `patched_name`
    (boolean), `patched_language` (boolean), `onboarding_completed_flipped`
    (boolean). **No name / language values.** **PASS**
  - `index.ts` L24: `log.info("users module initialised")`. **PASS**
- Controllers / repositories / API facade have **zero** log calls. **PASS**

## Auth middleware wiring

Both routes use `preHandler: authMiddleware` imported directly from
`@api/core/auth/middleware`. No new middleware invented. Middleware
populates `req.user: AuthUser` (`{ id, email }`) via the auth facade —
controller reads `req.user.id` (the auth service already maps JWT `sub`
→ `id`, so the spec's "`req.user.sub`" note is honored in effect: the
handler indexes into the identity the middleware supplies, never a
body-provided userId). Integration test proves: unauthenticated → 401,
invalid JWT → 401, valid JWT → 200. **PASS**

## `arch-boundaries.json` change

Diff:

```json
-  "allowTypeOnly": ["@api/core/auth/api"]
+  "allowTypeOnly": ["@api/core/auth/api", "@api/core/users/api"]
```

Narrow, symmetric with the existing auth allowance — permits `shared/` to
reference **only** the users facade module path, type-only. Not a broad
bypass of the `shared → core` ban.

Grep confirms the only shared-side use is a single `import type` line in
`apps/api/src/shared/workspace/context.ts:2`:

```ts
import type { IUsersApi } from "@api/core/users/api";
```

Used solely inside `interface GlobalServiceMap { users: IUsersApi }` — the
Nx generator's documented one-line pattern. **PASS**

## Bootstrap + openapi-doc wiring

- `apps/api/src/bootstrap.ts`: `import { initUsersModule } from "@api/core/users"`
  + `initUsersModule(app)` call — mirrors `initOtpModule`. **PASS**
- `apps/api/scripts/openapi-doc.ts`: same insertion so the OpenAPI generator
  registers the module and emits `/users/me` ops. **PASS**

## OpenAPI + api-client

- `openapi.json` contains:
  - Schema components: `LanguageCode`, `UpdateMeRequest`, `UsersPublicUser`,
    `UsersMeResponse`, plus the `*Input` mirror set that
    fastify-type-provider-zod emits.
  - Path `/users/me` with `get` and `patch` ops referencing the components.
- `packages/api-client/src/types.ts` regenerated: `/users/me` path type +
  `UsersPublicUser` / `UsersPublicUserInput` components. Downstream mobile /
  admin can consume without a manual edit. **PASS**
- `pnpm check:openapi` reports "openapi.json is up to date" — no drift.

## Testing Strategy — coverage

Unit (`services/__tests__/users.service.test.ts`) — 10 tests covering:
- Flips onboarding when both patched (fresh user)
- Name-only patch on user without prior language → still null
- Language-only patch on user with prior name → flips
- Idempotency: already-complete user + same values → no flip write
- Second patch after completion never rewrites the stamp
- Public shape has only the 5 allowed fields
- `selectedLanguage` narrowing for unknown DB values → null (defensive)
- ISO-8601 serialization of `onboardingCompletedAt`
- `getMe` + `updateMe` throw 401/UNAUTHORIZED when the row is gone

Integration (`routes/__tests__/users.routes.integration.test.ts`) — 14 tests
across three describes:
- **auth gate**: GET/PATCH without JWT → 401, invalid JWT → 401
- **happy paths**: both fields flip stamp; trimmed name persists; name-only
  keeps null; stamp stable across writes + subsequent GET
- **validation**: empty body → 400; unknown language → 400; whitespace-only
  name → 400; over-64 → 400; client-supplied `onboardingCompletedAt` → 400
  (strict) + nothing persisted
- **public shape**: exact key set + no `phoneNumberHash`/`email`/`passwordHash`
  in body/text; ISO-8601 timestamp on the wire

Every unit + integration bullet in the spec's Testing Strategy has a
corresponding assertion. **PASS**

## Security considerations (spec §)

- `authMiddleware` on both routes. **PASS**
- User can only patch their own row — service uses `req.user.id`
  (middleware-set), never a body userId. **PASS**
- `phoneNumberHash` never returned + never SELECTed. **PASS**
- `name` never logged. **PASS**
- Zod at boundary; `name` trimmed + length-clamped; `selectedLanguage`
  enum-checked; `.strict()` rejects unknown keys. **PASS**

## Observations (non-blocking)

- `services/users.service.ts` L101–116 defines a local `KNOWN_LANGUAGES:
  readonly LanguageCode[]` array duplicating the 8 codes for defensive
  narrowing of untrusted DB reads (`narrowLanguage`). The Zod source of
  truth is untouched — this is a runtime narrowing helper, not a validation
  duplicate. If the shared enum grows a code and this local array is not
  updated, DB rows carrying the new code would be narrowed to `null`.
  Using `LanguageCodeSchema.safeParse(value).success` or
  `LanguageCodeSchema.options.includes(value as LanguageCode)` would avoid
  the drift risk. Non-blocking (typed `LanguageCode[]`, defensive-only path,
  spec's "do not duplicate" intent is about validation source, not runtime
  narrowing).
- Pre-existing admin lint warnings noted under Static gates — unrelated.

## Overall verdict: APPROVED
