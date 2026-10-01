# QA Validation — TAM-46 (Paywall Remote-Config Source — CMS Tables + Seed + Provider + Cache)

## Independence declaration

Fresh `qas` subagent; no shared context with the implementer. All checks
executed independently against the working tree.

## Spec under test

- `specs/TAM-46-paywall-remote-config-source.md`
- Branch: `feature/onboarding`
- Scope: seven Prisma models + one migration + one seed script + a new
  `core/paywall` module (repository + services + api facade). NO HTTP routes —
  TAM-45 owns the mobile-facing endpoint and consumes the provider through
  the `IPaywallApi` facade.

## Files reviewed

New:
- `apps/api/prisma/migrations/20260711100000_add_paywall_cms_tables/migration.sql`
- `apps/api/prisma/seeds/paywall-config.seed.ts`
- `apps/api/src/core/paywall/types.ts`
- `apps/api/src/core/paywall/index.ts`
- `apps/api/src/core/paywall/api/paywall.api.ts`
- `apps/api/src/core/paywall/api/paywall.api.impl.ts`
- `apps/api/src/core/paywall/api/index.ts`
- `apps/api/src/core/paywall/services/config.provider.ts`
- `apps/api/src/core/paywall/services/config.types.ts`
- `apps/api/src/core/paywall/services/cache.ts`
- `apps/api/src/core/paywall/services/index.ts`
- `apps/api/src/core/paywall/services/__tests__/config.provider.test.ts`
- `apps/api/src/core/paywall/repositories/paywall-config.repository.ts`
- `apps/api/src/core/paywall/repositories/index.ts`
- `apps/api/src/core/paywall/repositories/__tests__/paywall-config.repository.integration.test.ts`

Modified:
- `apps/api/prisma/schema.prisma` (7 new models)
- `apps/api/package.json` (added `lru-cache@^11.0.0` + `seed:paywall` script)
- `apps/api/src/bootstrap.ts` (init the paywall module)
- `apps/api/src/shared/workspace/context.ts` (`paywall: IPaywallApi` in `GlobalServiceMap`)
- `arch-boundaries.json` (allowTypeOnly `@api/core/paywall/api` in `shared/`)
- `pnpm-lock.yaml` (lru-cache 11)

`git status` confirms **no unrelated changes** — everything modified is
required by the ticket. No `apps/api/src/core/paywall/routes/` directory
exists (confirmed via `ls`) — matches "no HTTP routes in this ticket".

## Static gates

| Gate | Result |
| --- | --- |
| `pnpm run verify` (arch boundaries + OpenAPI drift + typecheck + lint + unit tests, all Node projects) | PASS — 5 projects green, 15 unit-test files / 70 tests + admin 2/2 + events 44/44 |
| `pnpm nx test api --configuration=integration` (testcontainers Postgres) | PASS — 11 files / 50 tests. New `paywall-config.repository.integration.test.ts`: 11/11 tests. Prisma applies both migrations cleanly to every fresh test container |
| `pnpm check:arch-boundaries` (explicit run) | PASS — `✅ No architecture boundary violations` |
| OpenAPI drift (subsumed by `verify`) | PASS — `apps/api/openapi.json` has zero diff (no route changes; expected) |
| `pnpm nx run api:typecheck` / `api:lint` | Both subsumed and green under `pnpm verify` (`✔ All files pass linting`) |

Pre-existing admin lint warnings (`react-refresh/only-export-components` in
`auth-context.tsx:43` and `button.tsx:61`) are unchanged from TAM-42/43/44 —
unrelated to this ticket and not blockers.

## Migration correctness

Read `apps/api/prisma/migrations/20260711100000_add_paywall_cms_tables/migration.sql`:

- **Docs comment (AC line: "Docs comment in migration SQL explains the CMS ownership boundary")** — lines 1–24 explicitly document:
  - Purpose of each of the 7 tables.
  - **CMS ownership boundary**: writes come from ops / a future admin UI; API only reads; cache invalidation hook is `services/config.provider.ts` `invalidate({ paywallId })`.
  - **Rollback safety**: no inbound FKs from `User`/`Auth`; `DROP TABLE … CASCADE` is a clean rollback; internal FKs (translations → parents) use `ON DELETE CASCADE`.
  - Migration is additive and reversible. **PASS**
- **7 CREATE TABLE** statements — confirmed via `grep -c '^CREATE TABLE'` → `7`. Tables: `paywall_configs`, `paywall_plans`, `paywall_plan_translations`, `paywall_benefits`, `paywall_benefit_translations`, `paywall_translations`, `paywall_legal_links`. (The ticket brief said "6 new Prisma models" but the spec's Backend Task 1 enumerates 7 models — implementation matches the spec.) **PASS**
- **Nullability + defaults per model**:
  - `paywall_configs`: `default_plan_id` nullable, `config_version DEFAULT 1`, `enabled/shimmer_enabled/has_video_locale_fallback DEFAULT true`, `created_at DEFAULT CURRENT_TIMESTAMP`, `updated_at NOT NULL` (Prisma's `@updatedAt`). ✅
  - `paywall_plans`: `sort_order DEFAULT 0`, `enabled DEFAULT true`, `trial_days DEFAULT 0`. ✅
  - `paywall_translations`: `video_url`/`video_thumbnail_url`/`video_id` nullable; all other copy fields NOT NULL. ✅
  - All other tables: PK `id TEXT NOT NULL`; text columns NOT NULL matching Prisma models. ✅
- **Indexes** — `grep -c '^CREATE .*INDEX'` → `13` (7 unique + 6 non-unique). Cross-check against Prisma model annotations:
  | Table | Unique | Non-unique | Verdict |
  | --- | --- | --- | --- |
  | `paywall_configs` | `paywall_id` | — | PASS |
  | `paywall_plans` | `(paywall_id, plan_id)` | `(paywall_id, enabled, sort_order)` | PASS |
  | `paywall_plan_translations` | `(plan_id, locale)` | `(plan_id, locale)` | PASS |
  | `paywall_benefits` | `(paywall_id, benefit_id)` | `(paywall_id, enabled, sort_order)` | PASS |
  | `paywall_benefit_translations` | `(benefit_id, locale)` | `(benefit_id, locale)` | PASS |
  | `paywall_translations` | `(paywall_id, locale)` | `(paywall_id, locale)` | PASS |
  | `paywall_legal_links` | `(paywall_id, locale)` | `(paywall_id, locale)` | PASS |
- **Foreign keys with `ON DELETE CASCADE`** — `grep -c 'ON DELETE CASCADE'` → `3` FK-level occurrences: `paywall_plan_translations.plan_id → paywall_plans.id` and `paywall_benefit_translations.benefit_id → paywall_benefits.id` (both `ON DELETE CASCADE ON UPDATE CASCADE`), plus one in the docs comment header. `PaywallTranslation` and `PaywallLegalLinks` are keyed on `paywall_id` (no FK — no `PaywallConfig` relation modelled, so no CASCADE needed), matching the schema. **PASS**
- **Only touches `paywall_*` tables** — confirmed by reading the whole file; no `ALTER TABLE "User"`, no other model touched. **PASS**
- **Migration idempotent (applied twice)** — ran `prisma migrate deploy` against the local Postgres:
  - First run: `Applying migration 20260711100000_add_paywall_cms_tables … All migrations have been successfully applied.`
  - Second run: `No pending migrations to apply.`
  Empirical proof: the integration suite (11 tests) ran `prisma migrate deploy` on new containers and applied both onboarding + paywall migrations without error. **PASS**

## Cache semantics (`services/cache.ts` + `config.provider.ts`)

- **TTL 5 min** — `PAYWALL_CACHE_TTL_MS = 5 * 60 * 1000` (`cache.ts` line 26). **PASS**
- **Cache keys**:
  - `keyForConfig(paywallId)` → `config:${paywallId}`
  - `keyForPlans(paywallId, locale)` → `plans:${paywallId}:${locale}`
  - `keyForBenefits(paywallId, locale)` → `benefits:${paywallId}:${locale}`
  - `keyForTranslation(paywallId, locale)` → `translation:${paywallId}:${locale}`
  - `keyForLegal(paywallId, locale)` → `legal:${paywallId}:${locale}`
  Spec Backend Task 6 lists `config:${paywallId}:${locale}` — the implementation drops `locale` from the config key. This is a defensible, intentional deviation: `paywall_configs` has **no locale column**, so a locale-suffixed key would just create N duplicate entries pointing to the same row. Documented in the class comment on `DbPaywallConfigProvider`: *"Locale fallback is intentionally NOT handled here — consumers own the resolution so this provider caches raw `(paywallId, locale)` reads without cache-key blow-up."* **PASS** (deviation is a correctness improvement, not a regression).
- **`invalidate({ paywallId })`** — sweeps `deleteByPrefix` over all 5 kind-prefixes (`config:<id>`, `plans:<id>:`, `benefits:<id>:`, `translation:<id>:`, `legal:<id>:`) and logs the entries cleared. Unit test `"invalidate leaves other paywall ids untouched"` proves that keys for a **different** `paywallId` survive. **PASS**
- **Cached `null` survives** — `PaywallLruCache.set` wraps every value in `{ value }` (comment lines 19–24 explain why: `lru-cache@11` constrains value type to `NonNullable<>`, so we need a sentinel to store `null`). `get` returns `undefined` on miss and `hit.value` (which can be `null`) on hit. Unit test `"caches null result (unknown paywall stays known-empty)"` verifies the second call reads the cached `null` without hitting the repo. **PASS**

## Layered architecture

- `pnpm check:arch-boundaries`: PASS.
- Prisma import (`@prisma/client` via `getPrisma()`) appears **only** in `apps/api/src/core/paywall/repositories/paywall-config.repository.ts`. The provider (`services/config.provider.ts`) is Prisma-free and imports the repo class only for the type parameter. **PASS**
- No routes directory (`apps/api/src/core/paywall/routes/` does not exist) — matches "TAM-45 owns routes". **PASS**
- `arch-boundaries.json` change: adds `"@api/core/paywall/api"` to the `shared/` `allowTypeOnly` list (line 27). Consistent with the `auth`/`users` entries and required because `shared/workspace/context.ts` imports `IPaywallApi` type-only. **PASS**
- `bootstrap.ts` wires `initPaywallModule(app)` in the correct spot (alphabetical, alongside `initOtpModule` / `initUsersModule`). **PASS**
- `GlobalServiceMap` gets `paywall: IPaywallApi` — TAM-45 will consume via `performServiceCall("paywall", …)`. **PASS**

## Facade shape (`api/paywall.api.ts` + `paywall.api.impl.ts`)

```ts
export interface IPaywallApi {
  getConfigProvider(): PaywallConfigProvider;
}

export class PaywallApi implements IPaywallApi {
  constructor(private readonly provider: PaywallConfigProvider) {}
  getConfigProvider(): PaywallConfigProvider { return this.provider; }
}
```

Passthrough handle to the module-singleton `DbPaywallConfigProvider`. TAM-45's call site will look like:

```ts
performServiceCall(
  "paywall",
  api => api.getConfigProvider().getConfig({ paywallId }),
  ctx, msg,
);
```

Matches the intent captured in the facade comment. **PASS**

## Seed idempotency (ran twice, row counts stable)

Seed script: `apps/api/prisma/seeds/paywall-config.seed.ts`. Structure:

- Wraps **every** insert in a single `prisma.$transaction(async (tx) => { … })` (line 254). Partial failure rolls back cleanly.
- Uses `upsert` keyed on each model's `@@unique` composite:
  - `paywallConfig`: `where: { paywallId }`
  - `paywallPlan`: `where: { paywall_plan_unique: { paywallId, planId } }`
  - `paywallPlanTranslation`: `where: { paywall_plan_translation_unique: { planId, locale } }`
  - `paywallBenefit`: `where: { paywall_benefit_unique: { paywallId, benefitId } }`
  - `paywallBenefitTranslation`: `where: { paywall_benefit_translation_unique: { benefitId, locale } }`
  - `paywallTranslation`: `where: { paywall_translation_unique: { paywallId, locale } }`
  - `paywallLegalLinks`: `where: { paywall_legal_links_unique: { paywallId, locale } }`
- Data volume: 1 config + 3 plans (week/month/quarter) + 8 benefits (mandir, wallpaper, ringtone, aarti_bhajans, mantras_stutis, whatsapp_status, horoscope, app_icon) + `en`/`hi` translations for every plan/benefit + 2 paywall-shell rows + 2 legal-links rows.

Empirical proof — I ran the seed twice against the local Postgres
(`monorepo-metaservice-postgres-1` at `localhost:5433`):

```
run 1: paywall seed ok: {"configs":1,"plans":3,"planTranslations":6,"benefits":8,"benefitTranslations":16,"paywallTranslations":2,"legalLinks":2}
run 2: paywall seed ok: {"configs":1,"plans":3,"planTranslations":6,"benefits":8,"benefitTranslations":16,"paywallTranslations":2,"legalLinks":2}
```

DB row counts after each run (identical):

```
 configs | plans | pl_t | benefits | b_t | t | legal
---------+-------+------+----------+-----+---+-------
       1 |     3 |    6 |        8 |  16 | 2 |     2
```

38 rows total. No duplication. **PASS**

## Spec Acceptance Criteria — coverage

| AC | Status | Evidence |
| --- | --- | --- |
| Postgres tables + `PaywallConfigProvider` interface for TAM-45 | PASS | 7 tables + `services/config.provider.ts` published via `IPaywallApi` facade |
| `PaywallConfigProvider` methods — `getConfig`, `getEnabledPlans`, `getEnabledBenefits`, `invalidate` | PASS (spec-plus) | All four present; interface also adds `getTranslation` + `getLegalLinks` which TAM-45 needs for the video/CTA + legal URLs. Extension, not a regression. Note: `getConfig` takes `{ paywallId }` only — `paywall_configs` has no locale column so `locale` would be dead weight (documented in the class comment). Reasonable deviation. |
| Seed: 1 config (`vip-membership-v1`), 3 plans, 8 benefits, `hi` + `en` for each row | PASS | Verified by running the seed twice; counts match |
| Row-level `enabled` per plan/benefit; `sort_order` int; `locale` per translation row | PASS | Schema lines 62, 92, and every `*Translation` model; migration DEFAULT 0/true clauses |
| Cache: in-process LRU, 5-min TTL keyed on `(paywallId, locale)`; cleared on `invalidate` | PASS | `PAYWALL_CACHE_TTL_MS = 300_000`; `invalidate` sweeps all 5 prefixes and unit-tests confirm the semantics |
| Migration idempotent and reversible | PASS | Migrate deploy → second run "No pending migrations to apply"; docs comment documents the rollback path via `DROP TABLE … CASCADE`; internal FKs `ON DELETE CASCADE` |
| Repository layer contains all Prisma access; provider service is Prisma-free | PASS | `@prisma/client`/`getPrisma()` only in `repositories/paywall-config.repository.ts`; `services/config.provider.ts` imports repo type only |
| `pnpm verify` + integration tests green | PASS | See "Static gates" |
| Docs comment in migration SQL explains CMS ownership boundary | PASS | Migration lines 1–24 |

Deviations from the spec, all consciously documented in the code:
1. **Path**: spec says `apps/api/src/modules/paywall/...` — implementation uses `apps/api/src/core/paywall/...`. This matches `apps/api/CLAUDE.md` (`core/<mod>/{routes,controllers,services,repositories,api,middleware,types.ts,index.ts}`). The spec text pre-dates the `modules→core` rename and is stale; the implementation follows repo convention.
2. **`getConfig` signature**: spec includes `locale`; implementation drops it because `paywall_configs` has no locale column. Documented in the class comment on `DbPaywallConfigProvider`.
3. **`config:` cache key**: spec suggests `config:${paywallId}:${locale}`; implementation uses `config:${paywallId}` for the same reason. Consistent with (2).
4. **Extra methods**: `getTranslation` + `getLegalLinks` beyond the four spec'd methods — additive, needed by TAM-45.

None of these are regressions. Approving.

## Spec Definition of Done — coverage

| DoD | Status |
| --- | --- |
| All acceptance criteria met | PASS |
| `pnpm verify` green | PASS |
| Integration tests green | PASS |
| Seed runs cleanly on a fresh Postgres | PASS (proven twice) |
| PR references this spec (`Closes TAM-46`) | OUT-OF-SCOPE for local QA (RTE at PR creation time) — not a QA blocker |

## PII / Security check

- Paywall config carries **no PII** by design. `#EXPORT_CRITICAL` from the spec:
  - "Seed video URLs: MUST be a legitimately public asset OR an obvious placeholder like `about:blank`; never a Prabhuji-controlled URL that could leak into prod."
  - Seed uses `https://cdn.jsdelivr.net/gh/mediaelement/mediaelement-files@master/big_buck_bunny.mp4` (CC-BY public asset via jsDelivr CDN) and `https://placehold.co/720x1280/orange/white?text=Prabhuji` (public placeholder service). Neither is a Prabhuji-owned URL. **PASS**
- Legal links use `https://prabhuji.example.com/…`. `example.com` is IANA-reserved for documentation and cannot be a live URL — `prabhuji.example.com` is a labelled placeholder subdomain of a reserved TLD, not a Prabhuji-controlled URL. Matches the spec's q4 note that these are placeholders to replace before release. **PASS**
- No secrets committed. `pnpm-lock.yaml` change is just the `lru-cache` transitive tree. **PASS**
- No `console.log` — provider logs via `createModuleLogger("paywall:provider")` / `"paywall:bootstrap"`. Seed writes to `process.stdout` (correct for a CLI script — noted in a code comment). **PASS**

## Test coverage snapshot

- Unit (`config.provider.test.ts`, 8 tests):
  - Cache key helpers produce deterministic prefixes.
  - `getConfig` caches (2nd call is a hit).
  - `getConfig` caches `null` (unknown paywall stays known-empty).
  - Plans cached per `(paywallId, locale)`; different locale = different key.
  - Benefits + translation + legal cached independently.
  - `invalidate` clears every cached key (9 warmed → 0 after invalidate) and the next `getConfig` re-hits the repo.
  - `invalidate` leaves OTHER paywall ids untouched.
- Integration (`paywall-config.repository.integration.test.ts`, 11 tests):
  - `findConfig` returns the row shaped as `RawPaywallConfig` / returns `null` for unknown id.
  - `findEnabledPlansWithTranslations` returns only enabled, ordered by `sortOrder`, joined with the requested locale / `translation=null` for unknown locale / `[]` for unknown paywall.
  - `findEnabledBenefitsWithTranslations` excludes disabled benefits / null translation on unknown locale.
  - `findTranslation`, `findLegalLinks`: returns row for known locale, `null` otherwise.

All directly cover the spec's Unit + Integration test lists. **PASS**

## Observations (non-blocking)

- The user-facing brief said "6 new Prisma models" but the spec's Backend Task 1 enumerates 7 (`PaywallConfig`, `PaywallPlan`, `PaywallPlanTranslation`, `PaywallBenefit`, `PaywallBenefitTranslation`, `PaywallTranslation`, `PaywallLegalLinks`). Implementation ships 7 — matches the spec.
- Spec references `apps/api/src/modules/paywall/...` while the repo uses `core/`. Cosmetic drift in the spec; implementation is correct per `apps/api/CLAUDE.md`.
- Local Postgres now has the seeded paywall rows (side-effect of the idempotency verification). Not a blocker — this is the local dev DB, and the seed is idempotent so it's identical to what a developer would run per the spec's Manual Testing step.

## Overall verdict: APPROVED
