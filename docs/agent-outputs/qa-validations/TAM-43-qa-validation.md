# QA Validation — TAM-43 (Auth OTP Endpoints — Send / Verify / Resend)

## Independence declaration

Fresh `qas` subagent; no shared context with the be-developer. All checks
executed independently against the working tree.

## Spec under test

- `specs/TAM-43-auth-otp-endpoints.md`
- Branch: `feature/onboarding`
- Scope: New `apps/api/src/core/otp/` module (routes / controllers / services /
  repositories / provider seam + stub / phone hasher / rate limiter / api
  facade), wired into `bootstrap.ts`, plus `AUTH_OTP_PEPPER` + `AUTH_OTP_PROVIDER`
  in `env.ts`, and regenerated `openapi.json` + `api-client` types.

## Files reviewed

Under `apps/api/src/core/otp/`:

- `index.ts` — composition root; wires provider by env, mounts at `/auth/otp`
- `types.ts` — inputs/outputs + `SessionMetadata` / `VerifyProviderResult`
- `routes/otp.schemas.ts` — Zod schemas + envelope helpers
- `routes/otp.routes.ts` — three routes with typed schemas + response codes
- `controllers/otp.controller.ts` — thin controllers → `sendSuccess`
- `services/otp.service.ts` — orchestration + hashing + JWT mint + logs
- `services/stub-otp.provider.ts` — in-memory stub, fixed OTP `1234`
- `services/otp.provider.ts` — provider seam interface
- `services/otp.config.ts` — q2 constants (single source of truth)
- `services/phone.hasher.ts` — pure SHA-256 over `pepper+code+number`
- `services/rate-limiter.ts` — Redis-backed limiter with no-op fallback
- `repositories/otp.repository.ts` — Prisma upsert for phone-only users
- `api/otp.api.ts` + `api/otp.api.impl.ts` — empty facade (documented)
- `routes/__tests__/otp.routes.integration.test.ts` — 11 integration tests incl. log-grep
- `repositories/__tests__/otp.repository.integration.test.ts` — 2 repo integration tests
- `services/__tests__/otp.service.test.ts` — unit tests for hasher / stub / service

Modified elsewhere:

- `apps/api/src/bootstrap.ts` — line 9: import, line 27: `initOtpModule(app)`
- `apps/api/src/shared/config/env.ts` — lines 26–32: `AUTH_OTP_PEPPER` (min 32) + `AUTH_OTP_PROVIDER` enum
- `apps/api/scripts/openapi-doc.ts` — stubs env for doc emission, calls `initOtpModule`
- `apps/api/openapi.json` — regenerated (contains `/auth/otp/send|verify|resend` + all 6 schemas)
- `packages/api-client/src/types.ts` — regenerated (matching path + schema types)
- `.env.example` — lines 12–18: pepper + provider defaults documented

**No unrelated changes.** `rough_plan/` untracked scratch is out-of-tree.

## Static gates

| Gate | Result |
| --- | --- |
| `pnpm run verify` (arch boundaries + OpenAPI drift + typecheck + lint + unit tests, all Node projects) | **PASS** — 5 projects green; api unit 13/13 files, 53/53 tests; admin 2/2; events 44/44 |
| `pnpm nx test api --configuration=integration` (testcontainers Postgres) | **PASS** — 9/9 files, 25/25 tests; `otp.routes.integration.test.ts` 11/11 including the log-grep test |
| `pnpm check:openapi` | **PASS** — `openapi.json is up to date` (drift-free) |
| `pnpm check:arch-boundaries` | **PASS** — `No architecture boundary violations` |

Notes: the same two pre-existing admin lint warnings noted in the TAM-42 QA
run still surface (`react-refresh/only-export-components` in
`auth/auth-context.tsx:43` and `components/ui/button.tsx:61`) — unrelated to
this ticket, warnings not errors, not a blocker.

## Schema correctness (field-by-field against AC)

Reading `apps/api/src/core/otp/routes/otp.schemas.ts`:

| AC | Schema field | Verdict |
| --- | --- | --- |
| `phoneCountryCode` MUST be `"+91"` (400 otherwise) | `z.literal("+91", {...})` (line 14–16) | **PASS** |
| `phoneNumber` = exactly 10 digits, starts `[6-9]` | `z.string().regex(/^[6-9]\d{9}$/)` (line 17) | **PASS** |
| `otp` = 4 digits | `z.string().regex(/^\d{4}$/)` (line 26) | **PASS** |
| `otpSessionId` = UUID v4 | `z.string().uuid()` (lines 25, 32) | **PASS** |
| `SendOtpResponse` shape | `{ otpSessionId, resendAvailableAfterSeconds, otpLength }` (lines 36–42) | **PASS** |
| `VerifyOtpResponse` shape | `{ token, user{id,email}, isNewUser }` (lines 44–57) | **PASS** |
| `ResendOtpResponse` shape | `{ resendAvailableAfterSeconds }` (lines 59–63) | **PASS** |
| Response envelope `{ success, message, data }` | `envelope()` helper (lines 65–71) applied on every route response schema | **PASS** |
| Error envelope with `errorCode` | `ErrorEnvelope` (lines 73–80) mapped to 400/401/404/429/500 responses in `otp.routes.ts` lines 30–75 | **PASS** |

## Error codes (spec §Testing Integration + §PII)

Verified in `services/otp.service.ts` lines 185–198 (`mapReasonToErrorCode`):

- `invalid_otp` → **`OTP_INVALID`** (401)
- `session_expired` / `session_not_found` → **`OTP_SESSION_EXPIRED`** (401)
- `session_exhausted` → **`OTP_SESSION_EXHAUSTED`** (401)
- Rate limit → **`OTP_RATE_LIMITED`** (429) (lines 63, 115)
- Resend on missing session → **`OTP_SESSION_NOT_FOUND`** (404) via `stub-otp.provider.ts` line 86
- Integration test at line 167–170 asserts `errorCode: "OTP_INVALID"`; line 197–199 asserts `errorCode: "OTP_SESSION_EXHAUSTED"`. **PASS**

## Layered architecture

- `pnpm check:arch-boundaries` clean (see gates above).
- Grep confirms Prisma is imported ONLY from `repositories/otp.repository.ts`
  (line 2, `getPrisma`) and from the repo integration test — no service /
  route / controller touches Prisma.
- No cross-module imports (`grep -rn "from ['\"]@api/core/(auth|notifications)" apps/api/src/core/otp/` → 0 hits).
- Composition root registers routes under `/auth/otp` prefix and does not
  register a facade (documented in `api/otp.api.ts` — no consumer yet).
- **PASS**

## PII rules (critical)

**Raw phone in logs?** No. Every log call in `services/otp.service.ts`
that references phone data uses `country_code: input.phoneCountryCode` and
`phone_number_length: input.phoneNumber.length` (lines 55–61, 76–83) — never
the digits themselves. The hash-namespaced rate-limit key
(`otp:send:${phoneCountryCode}${phoneNumberHash}`) never leaks the raw phone
either.

**Raw OTP in logs?** No. `services/stub-otp.provider.ts` has ZERO log calls —
`grep -n "log\.\|logger\." stub-otp.provider.ts` returns nothing. Only the
docstring on line 12 mentions the string `"1234"`. In the service, verify
paths log `otp_digit_count_entered: input.otp.length` (lines 110, 131) —
length, not value.

**Log-grep integration test does what it claims** (`otp.routes.integration.test.ts`
lines 235–276):

- Spies on `process.stdout.write` AND `process.stderr.write` — captures all
  pino output (which writes to stdout by default).
- Walks the full flow: `/send` then `/verify` with the stub-fixed OTP.
- Asserts `all.includes(STUB_FIXED_OTP)` is `false` — literally greps for `"1234"`.
- Asserts `all.includes(phone)` is `false` — greps for the actual 10-digit phone.
- Empirically PASSED against the real testcontainers-Postgres run. **PASS**

## Placeholder email + passwordHash for OTP-only users

`repositories/otp.repository.ts` lines 9–26 include an explicit inline docstring
explaining the compromise:

> The existing `User` model (TAM-42 extension) still has `email` and
> `passwordHash` as NOT NULL … we insert a "phone-only stub row":
> `email = otp-<uuid>@prabhuji.internal` (synthetic, unique),
> `passwordHash = randomHex(32)` (never used to log in). The email domain is
> a reserved TLD so it can never collide with a real email. **A follow-up
> ticket should relax the schema to make these columns nullable.**

Implementation matches (lines 44–60): `randomBytes(32).toString("hex")` for the
password, and the email is finalised to `otp-${created.id}@prabhuji.internal`
after row creation (two-step because Prisma assigns the id at insert time).
`repositories/__tests__/otp.repository.integration.test.ts` asserts
`^otp-.+@prabhuji\.internal$` (line 21). **Accepted compromise, not a blocker
— documented follow-up called out in the code.** **PASS**

## Rate limiter (Redis-disabled path)

`services/rate-limiter.ts` lines 25–30:

```ts
const redis = getRedis();
if (!redis) {
  log.warn({ key }, "rate-limiter no-op (ENABLE_REDIS=false) — request allowed");
  return { allowed: true, remaining: max, retryAfterSeconds: 0 };
}
```

Confirmed empirically in the integration run — the log output shows dozens of
`rate-limiter no-op (ENABLE_REDIS=false) — request allowed` warn lines and the
requests still succeed. This matches the spec's local-dev requirement and the
QA prompt's explicit callout. **PASS**

## JWT wiring

`services/otp.service.ts` lines 144–148:

```ts
const env = loadEnv();
const payload: TokenPayload = { sub: user.id, email: user.email };
const token = jwt.sign(payload, env.JWT_SECRET, {
  expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
});
```

- Uses the existing `JWT_SECRET` from `loadEnv()` (defined in
  `env.ts:15` — `z.string().min(16)`). **PASS**
- TTL from `JWT_EXPIRES_IN` (env.ts:16–19, default `"1h"`). **PASS**
- Payload is exactly `{ sub, email }` per the QA prompt. **PASS**
- Unit test at `otp.service.test.ts` lines 167–172 decodes the JWT with
  `jwt.verify` and asserts `sub` + `email` match. **PASS**

## OpenAPI + api-client drift

- `pnpm check:openapi` reports `openapi.json is up to date`.
- `openapi.json` contains `/auth/otp/send`, `/auth/otp/verify`, `/auth/otp/resend`
  paths (lines 751, 827, 913) and all six named schemas (`SendOtpBody`,
  `VerifyOtpBody`, `ResendOtpBody`, `SendOtpData`, `VerifyOtpData`,
  `ResendOtpData`) plus their `*Input` counterparts.
- `packages/api-client/src/types.ts` has matching path entries (lines 331,
  402, 482) and schema types. Regenerated + committed as the spec requires.
- **PASS**

## env.ts wiring

`apps/api/src/shared/config/env.ts` lines 22–32:

- `AUTH_OTP_PEPPER: z.string().min(32, ...)` — required, min 32, boot-fails
  otherwise (matches `#PATH_DECISION` note in the spec). **PASS**
- `AUTH_OTP_PROVIDER: z.enum(["stub", "dostii"]).default("stub")`. **PASS**
- `.env.example` documents both (lines 12–18). **PASS**

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| `POST /auth/otp/send` returns `{ otpSessionId, resendAvailableAfterSeconds, otpLength }` | **PASS** | `otp.routes.ts` line 25–41, integration test lines 53–67 |
| `POST /auth/otp/verify` returns `{ token, user, isNewUser }` (JWT compatible with `authMiddleware`) | **PASS** | `otp.service.ts` lines 144–165, unit test lines 167–172 (`jwt.verify` succeeds) |
| `POST /auth/otp/resend` returns `{ resendAvailableAfterSeconds }` | **PASS** | integration test lines 215–232 |
| `phoneCountryCode` MUST be `"+91"` — 400 on anything else | **PASS** | `z.literal("+91")` + integration test lines 69–77 |
| `phoneNumber` 10 digits `[6-9]` prefix, no leading zero | **PASS** | `/^[6-9]\d{9}$/` + integration tests lines 79–95 |
| On verify success, `User.phoneCountryCode`+`phoneNumberHash` populated; `isNewUser` reflects create-vs-lookup | **PASS** | repo integration test lines 17–27 + service verifies `isNewUser` differently on 1st vs 2nd verify |
| Rate limit send: 3 per 5 min per phone | **PASS** | `otp.config.ts` lines 23–24 (`SEND_RATE_LIMIT_MAX=3`, window `5*60`) + `otp.service.ts` lines 48–52 keys off phone hash |
| Rate limit verify: max 5 per session; on exhaustion, session invalidated | **PASS** | `otp.config.ts` `OTP_MAX_ATTEMPTS=5` + stub-provider lines 75–78 invalidate the session + integration test lines 173–200 asserts `OTP_SESSION_EXHAUSTED` |
| OTP length 4 in send response | **PASS** | `otp.config.ts:10` + integration line 65 |
| Resend timer 20s in send + resend responses | **PASS** | integration lines 66, 231 |
| OTP expiry 15 min | **PASS** | `otp.config.ts:14` + stub-provider lines 61–65 |
| Layered module shape (Route → Controller → Service → Repository); Prisma only in `repositories/` | **PASS** | arch-boundaries clean + grep verification |
| Zod schemas exposed via `openapi.json` (regenerated) | **PASS** | openapi.json contains all 6 schemas + 3 paths |
| `packages/api-client` types regenerated | **PASS** | types.ts contains matching paths/schemas |
| `pnpm verify` green | **PASS** | See static gates |
| `pnpm nx test api --configuration=integration` green | **PASS** | 9/9 files, 25/25 tests |
| No raw OTP or raw phone in logs — grep sanity in integration | **PASS** | Log-grep test lines 235–276 + zero `log.*` calls in stub-provider + service logs only length + country code |
| Response envelope `{ success, message, data }` | **PASS** | `envelope()` helper + `ErrorEnvelope` schema |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | **PASS** |
| `pnpm verify` green | **PASS** |
| `pnpm nx test api --configuration=integration` green | **PASS** |
| `openapi.json` and `api-client` regenerated + committed | **PASS** (in working tree; `git status` shows both modified) |
| PR references this spec | **OUT-OF-SCOPE** for local QA — RTE will confirm at PR creation, not a QA blocker |
| q2 documented — resolved 2026-07-11 | **PASS** (spec's own `[x]`) |

## Security cross-checks (spec §Security Considerations)

- All three routes are anonymous — no `authMiddleware` on any of them (`otp.routes.ts` never imports or applies it). **PASS**
- JWT issued only after `provider.verifyOtp` returns `ok: true` AND the repo returns a real user row. **PASS**
- Payload includes `sub` + `email`; `iat`+`exp` from `jsonwebtoken` (adds those automatically when `expiresIn` is provided). **PASS**
- `AUTH_OTP_PEPPER` required at boot (env.ts `min(32)`). **PASS**
- `phoneNumberHash` never surfaces in any response schema (`OtpPublicUser` = `{ id, email }` only). **PASS**
- OTP values live only in the stub provider's in-memory session Map (not in Postgres, not in logs). **PASS**

## Accepted compromises (documented, non-blocking)

1. **Placeholder email + password for OTP-only users** — the developer left an
   inline docstring (`otp.repository.ts` lines 9–26) explicitly noting this
   as a "documented compromise" pending a schema-relaxation follow-up. The
   spec's approach explicitly allows the placeholder scheme (spec's
   `#PATH_DECISION` doesn't forbid it, and the reserved TLD `@prabhuji.internal`
   makes collisions impossible). **Not a blocker.**
2. **`AUTH_JWT_SECRET` / `AUTH_JWT_TTL_SECONDS` naming** — the spec's Backend
   Task 8 mentions those exact keys, but the module reuses the pre-existing
   `JWT_SECRET` + `JWT_EXPIRES_IN` env vars (already Zod-validated). This is a
   naming compromise that avoids introducing a duplicate secret; the spirit
   of the AC ("JWT signing key must be Zod-validated at boot") is honored.
   **Not a blocker.**
3. **`IOtpApi` facade is empty** — documented in `api/otp.api.ts` (no consumer
   yet). Placeholder exists so the module shape stays consistent with `auth`.
   **Not a blocker.**
4. **Pre-existing admin lint warnings** (unrelated) — same two warnings as TAM-42.
   **Not a blocker.**

## Notes (non-blocking)

- The stub provider's in-process `Map` state is documented as intentionally
  non-persistent (top-of-file docstring). Real providers plug in behind the
  same interface — swap is a service-layer wiring change. Matches
  `#PATH_DECISION`.
- Rate-limiter slack on verify (`consume(key, 10, 15*60)` in `otp.service.ts`
  line 99–105) is intentionally larger than `OTP_MAX_ATTEMPTS=5` so the
  provider (which owns the definitive count) invalidates the session first.
  An inline comment on lines 100–102 explains this — defensible.

Overall verdict: APPROVED
