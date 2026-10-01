# apps/api

Fastify 5 + TypeScript modular monolith. Prisma (Postgres) + Zod. Single-tenant.

## Layering (CI-enforced via `pnpm check:arch-boundaries`)

Route → Controller → Service → Repository → DB. A layer imports only the one below it + `shared/`.
Prisma (`@prisma/client`) is imported ONLY in `repositories/`. Modules never import each other's internals — use `performServiceCall`.

## Coding standards (`.claude/rules/coding-standards.md`)

TS strict, no `any`, `import type`, no floating promises — enforced by `pnpm nx typecheck api`, `pnpm nx lint api` (`@repo/eslint-config`: no-any, no-floating-promises, no-console, consistent-type-imports), and `pnpm check:arch-boundaries`.

## Module shape

`core/<mod>/{routes,controllers,services,repositories,api,middleware,types.ts,index.ts}`.
`index.ts` is the composition root (`init<Mod>Module(app)`), wired from `src/bootstrap.ts`. `api/` publishes the facade type (`I<Mod>Api`) registered into `GlobalServiceMap` in `src/shared/workspace/context.ts` via `registerGlobalService`.

## Conventions

Responses: `sendSuccess`/`sendError` only → `{success,message,data}`. Errors: throw `AppError`/`ValidationError` (`src/shared/errors/`).
Logging: `createModuleLogger("mod:sublayer")` — never `console.log`.
Validation + OpenAPI: Zod schemas at the route boundary (e.g. `routes/auth.schemas.ts`), no separate runtime validation lib.

### Locale & language (one param, one list)

1. **Public read endpoints take `locale`** — never `language`. Compose the shared fragment, never hand-write the param: `paginationQuery.extend(localeQuery.shape)` (or `requiredLocaleQuery.shape` for `GET /deities` + `GET /paywall/config`, the two that must be told a locale). Defined once in `shared/schemas/locale.ts`.
2. **Read validation is TOLERANT** — `z.string().min(2).max(10)`, not `LanguageCodeSchema`. An unsupported code is a no-match that resolves to the base column, never a 400, so an app build shipping a ninth language degrades instead of losing a screen.
3. **Write paths stay STRICT** `LanguageCodeSchema` — `users.selectedLanguage`, the admin `languages[]` availability sets, `adminLocale`/translation keys. An invalid code must never reach the database.
4. **Admin list filters keep `language`** — a deliberate exception, not a miss: on the admin surface `locale` already means the translation-row key (`/admin/…/:id/translations/:locale`).
5. **The language list lives in `shared/language.schema.ts` and nowhere else.** `SUPPORTED_LANGUAGES` (codes + native/English labels + `enabled`) is THE list; `LanguageCodeSchema` is derived from it, and `core/languages` serves it at `GET /languages` (unauthenticated) so mobile hardcodes nothing. Exactly two copies exist repo-wide — this file and `apps/admin/src/lib/languages.ts` (English labels only, keyed by a `Record<LanguageCode, …>` derived from the emitted contract, so adding a language here fails the admin typecheck until its label is added). Adding a language = one row here + one label there.
6. **`enabled: false` hides a language; it does NOT retire it.** The flag filters only what `GET /languages` SERVES, so no new user can pick it. It deliberately does not narrow `LanguageCodeSchema`, because users already on that language are **grandfathered**: `PATCH /users/me` still accepts their stored code (they can edit their name without a 400) and their content still localizes from the existing translation rows. The invariant is `served ⊆ accepted`, never `served === accepted` — `languages.service.test.ts` asserts it, along with "the configured default is enabled", so disabling `DEFAULT_LANGUAGE_CODE` fails `pnpm verify` instead of serving a `defaultCode` missing from its own list. Flipping the flag is an API code change + deploy; nothing in the app or admin ships. To retire a language for real: disable, let the population drain, then delete the row.
Cross-module calls (synchronous): `performServiceCall("<key>", op, ctx, failureMessage)` from `@api/shared/workspace` — wraps `getGlobalService` with a null-check and error handling.
Cross-module events (asynchronous): the API is an **event-driven modular monolith** — modules emit **domain events** through the `shared/events/` bus that other modules consume async, decoupling producers from consumers. Each module owns its own event wiring in its composition root: the **producer** module publishes (`auth.register()` → `user.registered`), a **consumer** module registers its consumer with its own `consumerId` (`core/notifications` → `bus.addConsumer("notifications", …)`). `bootstrap.ts` only calls the module inits + `bus.start()`; it doesn't know the events. Each `consumerId` is a Kafka consumer group, so two independent consumers of the same event each receive it (they don't compete). Two transports behind one `EventBus` interface: **in-process** (default, zero infra) and **Kafka** (`ENABLE_KAFKA=true`, → MSK). Broker auth is env-gated by `KAFKA_SASL`: `none` (plaintext, local redpanda) or `aws-iam` (TLS + SASL/IAM for prod MSK, token signed from the task role, needs `AWS_REGION`). `kafkajs` lives only in `shared/events/`. Add an event: a line in `shared/events/domain-event.ts` (`AppEventMap`), `publish` from the owner, `addConsumer` from the consuming module. Design: `docs/EVENT-ARCHITECTURE.md`.

## Observability

OpenTelemetry → a ClickStack OTel collector sidecar in the same ECS task (which exports to ClickHouse Cloud), via the HyperDX SDK. `src/telemetry.ts` (sibling to `index.ts`) is **preloaded** with `node --import ./telemetry.js index.js` so auto-instrumentation hooks Fastify/pg/ioredis/kafkajs before they load; it no-ops (SDK never loaded) unless `ENABLE_TELEMETRY=true`. Traces + logs (pino, trace-correlated) + metrics. `@hyperdx/node-opentelemetry` lives only in `telemetry.ts`. Design: `docs/OBSERVABILITY.md`.

## Tests

Colocated in `__tests__/`. `*.test.ts` = unit (mocked deps). `*.integration.test.ts` = real Postgres via testcontainers (`src/shared/testing/pg.ts`).
Run: `pnpm nx test api --configuration=unit` | `pnpm nx test api --configuration=integration`.
