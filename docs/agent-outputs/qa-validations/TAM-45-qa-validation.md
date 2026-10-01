# QA Validation — TAM-45 (Paywall Config Endpoint)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree on branch
`feature/onboarding`.

## Spec under test

- `specs/TAM-45-subscription-status-and-paywall-config-endpoints.md`
- Scope after 2026-07-11 q3 resolution: **paywall-config endpoint only**.
  The subscription-status endpoint was moved to TAM-47 and is intentionally
  NOT expected in this ticket. Spec Status left untouched.

## Files reviewed

New (untracked):

- `apps/api/src/core/paywall/routes/paywall.routes.ts`
- `apps/api/src/core/paywall/routes/paywall.schemas.ts`
- `apps/api/src/core/paywall/routes/index.ts`
- `apps/api/src/core/paywall/routes/__tests__/paywall.routes.integration.test.ts`
- `apps/api/src/core/paywall/controllers/paywall.controller.ts`
- `apps/api/src/core/paywall/controllers/index.ts`
- `apps/api/src/core/paywall/services/paywall.service.ts`
- `apps/api/src/core/paywall/services/__tests__/paywall.service.test.ts`

Modified:

- `apps/api/src/core/paywall/index.ts` — composition root wires the new
  `PaywallService` + response cache and mounts the routes under `/paywall`.
- `apps/api/src/core/paywall/api/paywall.api.ts` + `paywall.api.impl.ts` —
  facade extended with `invalidateResponseCache` and a `invalidate` helper
  that clears BOTH the raw-row (TAM-46) and composed-response (TAM-45)
  caches.
- `apps/api/src/core/paywall/services/index.ts` — re-exports for the new
  service + display types.
- `apps/api/scripts/openapi-doc.ts` — `initPaywallModule` added so the
  emitted `openapi.json` includes the new route.
- `apps/api/openapi.json` — regenerated with `/paywall/config`, the
  `X-Paywall-Config-Version` response header, and the Paywall{Config,
  Plan, Benefit, LegalLinks} component schemas.
- `packages/api-client/src/types.ts` — regenerated (24 `Paywall` symbols
  now present).

`git status` confirms no unrelated changes (`rough_plan/` is scratch, out
of scope).

## Static gates

| Gate | Result |
| --- | --- |
| `pnpm check:arch-boundaries` | PASS — "✅ No architecture boundary violations" |
| `pnpm check:openapi` | PASS — "openapi.json is up to date" |
| `pnpm run verify` (arch boundaries + OpenAPI drift + typecheck + lint + unit tests for every Node project) | PASS — 5 projects green; api unit suite: 16 files / 83 tests (includes `paywall.service.test.ts` 15 tests + `config.provider.test.ts`); admin 2/2; events 44/44. Two pre-existing admin lint warnings (unrelated to this ticket). |
| `pnpm nx test api --configuration=integration` (testcontainers Postgres) | PASS — 12 files / 58 tests; `paywall.routes.integration.test.ts` 8/8 |

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| `GET /paywall/config?locale=<code>` protected via `authMiddleware` | PASS | `routes/paywall.routes.ts:44` (`preHandler: authMiddleware`). Integration: 401 tests for missing & invalid JWT (`describe("auth gate")`). |
| Response shape matches spec (paywallId, configVersion, enabled, localeRequested, localeServed, fallbackUsed, fallbackFrom, missingFields, title, videoUrl, videoThumbnailUrl, videoId, defaultPlanId, plans[], benefits[], legalLinks, cancelAnytimeText, refundPolicyText, payNowCta, shimmerEnabled) | PASS | `routes/paywall.schemas.ts:78-101` (`PaywallConfigData` Zod schema — every field present with the right type). Integration happy-path asserts every top-level field. |
| Empty plans → HTTP 200 with `plans: []` (NOT 404) | PASS | Service returns the same 200 payload with an empty array when the enabled-plan filter or the per-plan translation lookup produce nothing (`services/paywall.service.ts:220-249`). Integration test `describe("empty-plans contract")` asserts `statusCode === 200` and `body.data.plans === []`. Unit tests cover both "no plans returned by provider" and "plan exists but no translation in any locale → filtered + missingFields entry". |
| `locale` Zod-validated against shared `LanguageCodeSchema` (8 codes) → invalid → 400 | PASS | `routes/paywall.schemas.ts:2,28-30` imports `LanguageCodeSchema` from `@api/shared/language.schema` (NOT duplicated). Integration test asserts 400 for `locale=xx` and 400 for missing query param. |
| Server-side fallback chain `requested → hi → en`; `localeServed` reflects served locale; `fallbackUsed`/`fallbackFrom` correct | PASS | `uniqueFallbackChain` (service:361-371) + `resolveWithFallback` (per slice). Unit tests: `uniqueFallbackChain('mr')→['mr','hi','en']`, `('hi')→['hi','en']`; happy path (no fallback); `mr→hi`; `mr→en` (final fallback); per-plan fallback where different plans resolve to different locales. Integration mirrors `mr→hi` end-to-end. |
| `X-Paywall-Config-Version` header mirrors `data.configVersion` | PASS | `controllers/paywall.controller.ts:34` sets `x-paywall-config-version` BEFORE `sendSuccess` (correct — Fastify freezes headers on send). Integration asserts `res.headers["x-paywall-config-version"] === String(body.data.configVersion)`. |
| Server-side response cached with 5-min TTL keyed on `(paywallId, locale)` | PASS | `services/cache.ts:26` — `PAYWALL_CACHE_TTL_MS = 5 * 60 * 1000`; `keyForResponse(paywallId, locale)` in `services/paywall.service.ts:415-417`. LRU capacity 256 (headroom over 1 paywall × 8 locales). Response cache is a SEPARATE instance from TAM-46's raw-row cache (see `index.ts`) — key namespaces (`response:…` vs `provider raw keys`) do not collide. Unit test asserts no additional provider calls on the second `service.getPaywallConfig` invocation. Integration mutates the DB behind a cached response and confirms the second request returns the pre-mutation body. |
| Layered architecture — Prisma only in repositories, `performServiceCall` for cross-module | PASS | `grep '@prisma/client'` on `routes/`, `controllers/`, `services/`, `api/` — zero hits (Prisma stays inside `repositories/paywall-config.repository.ts` owned by TAM-46). `PaywallService` consumes TAM-46's provider directly (intra-module, no cross-module hop needed — spec's #PATH_DECISION explicitly allows this). Facade for cross-module callers stays intact. |
| `openapi.json` + `api-client` regenerated + committed | PASS | `openapi.json` updated: `/paywall/config` GET operation at line 1724 with `parameters.query.locale` referencing `LanguageCode`; `PaywallConfigResponse` under `200` and `X-Paywall-Config-Version` in the response headers. `packages/api-client/src/types.ts` regenerated with `PaywallConfigData`, `PaywallPlanDisplay`, `PaywallBenefitDisplay`, `PaywallLegalLinks` and their `*Input` twins. `pnpm check:openapi` confirms no drift. Files are staged/untracked in the working tree — will be included in the PR. |
| `pnpm verify` + integration tests green | PASS | See "Static gates" above. |

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS |
| `pnpm verify` green | PASS |
| Integration tests green | PASS |
| `openapi.json` + `api-client` regenerated | PASS |
| PR references this spec | OUT-OF-SCOPE for local QA (RTE will confirm at PR creation) — **not a QA blocker** |

## Shared code reuse

- `LanguageCodeSchema` — reused (imported from `@api/shared/language.schema`),
  NOT duplicated inside the paywall module. **PASS**
- `authMiddleware` — reused (imported from `@api/core/auth/middleware`),
  no bespoke middleware added. **PASS**

## PII / security check

- Log lines (`services/paywall.service.ts:136-148` cache hit,
  `318-332` miss) include ONLY content keys: `source`, `paywall_id`,
  `config_version`, `locale_requested`, `locale_served`, `fallback_used`,
  `fallback_from`, `missing_fields`, `plan_count`, `benefit_count`. No
  `sub` / `email` / `userId` / `req.user.*` in any log payload
  (`grep` confirmed). **PASS**
- Controller reads `req.user` ONLY as a truthiness check to keep types
  honest after `authMiddleware`; the user is never propagated into the
  service call or the response. **PASS**
- Response payload contains no user identifier — every URL in the seed
  is `example.com` / `prabhuji.example.com` (per TAM-46's contract). **PASS**
- `#EXPORT_CRITICAL` from the spec — "No user-identifying data on
  paywall-config log lines" — honored. **PASS**

## Empty-plans contract (spec's other #EXPORT_CRITICAL)

Integration test `empty-plans contract > all plans disabled → HTTP 200
with plans: [] (NOT 404)`:

- Seeds one plan with `enabled: false` (translations still present so
  the provider path is exercised — this is the exact "everything filtered
  out at the enable flag" state, per PRD §6.8 / `paywall_no_valid_plans`).
- Asserts `statusCode === 200`.
- Asserts `body.data.plans === []`.
- Asserts `body.data.enabled === true` (the config itself is still enabled
  — the empty array is the routing cue, not the disabled flag).
- Asserts `body.data.title === "VIP सदस्यता"` (the rest of the payload is
  intact — the empty-plans path doesn't strip content).

**PASS** — mobile has the required 200 + empty-array to trigger the
`paywall_no_valid_plans` analytics + Home routing.

## Cache correctness

**Two independent LRU instances** in the composition root (`core/paywall/index.ts:34-36`):

- `rawCache` → `DbPaywallConfigProvider` (TAM-46 raw-row cache).
- inside `PaywallService` → `responseCache` (TAM-45 composed-response
  cache, key namespace `response:…`).

Both share `PaywallLruCache` (5-min TTL, 256-entry cap), but they are
DIFFERENT instances with disjoint key spaces — one cannot poison the
other.

Facade `invalidate(paywallId)` clears both, in the right order (response
cache first, then raw-row cache — so a request that arrives mid-invalidate
misses on the response cache and either hits or misses on the raw-row
cache, never returns a stale composed body assembled from stale rows).

Unit tests explicitly cover:

- Second call hits the response cache (no additional `getConfig` /
  `getTranslation` / `getLegalLinks` calls on the mocked provider).
- `invalidateResponseCache()` forces the next call to re-fetch
  (`getConfig` called 2× after invalidation).
- Different locales are cached under different keys (`hi` and `mr` each
  trigger their own miss).

Integration test verifies: the response cache is stable even when the
underlying DB row is mutated between two sequential requests — the
mutated title never appears on the wire until the cache is invalidated.

**PASS**

## Locale fallback correctness

Integration test `locale fallback > mr requested with no mr content -> hi
served, fallbackUsed=true`:

- `localeRequested === "mr"`, `localeServed === "hi"`,
  `fallbackUsed === true`, `fallbackFrom === "mr"`.
- `missingFields` includes `translation`, `legalLinks`,
  `plans[week].translation`, `benefits[mandir].translation`.
- Content-facing assertions confirm the served body carries the `hi`
  content (`title === "VIP सदस्यता"`, plan label `साप्ताहिक`).

Unit tests additionally cover:

- `mr → en` (final fallback when `hi` is also empty).
- Per-plan fallback where two plans resolve to different locales
  (`week` from `hi`, `month` from `en`) — `missingFields` contains only
  the mis-resolved plan, not the correctly-resolved one.

**PASS**

## `missingFields` correctness

Service logic (`services/paywall.service.ts:192-273`):

- Top-level translation → miss recorded when served locale != requested.
- Legal links → miss recorded when served locale != requested.
- Per-plan → miss recorded when a plan's translation resolves in a
  different locale OR is entirely absent.
- Per-benefit → same as plan.
- Ordering is deterministic (top-level slots first, then per-plan, then
  per-benefit).

Unit test coverage exercises the top-level fallback (`translation` +
`legalLinks` in `missingFields`), the per-plan miss for an orphan plan,
and the per-plan case where only one of two plans falls through — all
pass.

The one minor asymmetry the unit tests document (line 260-263 of the
service test): `legalLinks` is NOT recorded as a miss when it was `null`
in every fallback locale (because the top-level translation
`legalResolved.locale` stays `null` — the `resolved !== requestedLocale`
check trips only when a NON-null value came from a fallback locale). This
is a documented, tested behavior — the empty-string wire shape is the
client's cue, not the `missingFields` marker. **Not a blocker** — the
spec's `missingFields` semantics ("populated when the served slice
differs from the requested locale") match this exactly.

**PASS**

## Observations (non-blocking)

- Two pre-existing admin lint warnings
  (`react-refresh/only-export-components` on `auth-context.tsx:43` and
  `components/ui/button.tsx:61`) — unrelated to this ticket, still
  warnings (not errors), noted in the TAM-42 report too. Not a blocker.
- The seed helper in the integration test (`seedPaywall`) constructs
  content-rich fixtures for every code path exercised — including
  translation-only-in-one-locale + benefit-only-in-one-locale + partial
  legal links. Good coverage discipline.
- `en` is deliberately NOT accepted from clients (not in
  `LanguageCodeSchema`) but IS the final server-side fallback — the
  service's `uniqueFallbackChain('en')` unit test documents the
  symmetric behavior even though the client path can't reach it.

## Overall verdict: APPROVED
