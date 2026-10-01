# Pattern Library

> **Copy-paste-ready patterns for agent-driven development.** Check here BEFORE implementing — the pattern-discovery skill routes through this library.

Every pattern is grounded in the monorepo-boilerplate stack (Nx + pnpm, Fastify 5 + Prisma + Zod, React 19 + Vite, Flutter). The two `config/` patterns keep a few `{{TOKEN}}` placeholders you fill when instantiating; everything else is directly usable.

## Pattern Index

### Architecture (check these FIRST)

| Pattern                                                  | File                          | Use Case                             |
| -------------------------------------------------------- | ----------------------------- | ------------------------------------ |
| [API Feature Module Shape](./api/module-shape.md)        | Layered Fastify module        | Any new feature module in `apps/api` |
| [Cross-Module Service Call](./api/cross-module-call.md)  | `performServiceCall` + facade | Module A consuming module B          |
| [Zod Validation API](./api/zod-validation-api.md)        | Request/response validation   | Any route boundary (schemas → OpenAPI) |
| [Contract Codegen Chain](./ci/contract-codegen-chain.md) | OpenAPI → TS + Dart clients   | Any API route/schema change          |

### Database

| Pattern                                                | File                                   | Use Case                 |
| ------------------------------------------------------ | -------------------------------------- | ------------------------ |
| [UUID ids](./database/uuid-ids.md)                     | `@db.Uuid` on ids + FKs (STRICT)       | Any model / migration    |
| [Prisma Transaction](./database/prisma-transaction.md) | `$transaction` in the repository layer | Multi-step atomic writes |

### Security

| Pattern                                                | File                                     | Use Case            |
| ------------------------------------------------------ | ---------------------------------------- | ------------------- |
| [Secrets Management](./security/secrets-management.md) | Env-based secrets, Zod-validated at boot | Any new credential  |
| [Input Sanitization](./security/input-sanitization.md) | XSS/injection prevention                 | User input handling |
| [Rate Limiting](./security/rate-limiting.md)           | API rate limiting (Redis)                | Abuse prevention    |

### Configuration

| Pattern                                              | File                          | Use Case          |
| ---------------------------------------------------- | ----------------------------- | ----------------- |
| [Environment Config](./config/environment-config.md) | Typed environment loading     | App configuration |
| [Structured Logging](./config/structured-logging.md) | JSON logging with correlation | Observability     |

### UI

| Pattern                                                | File                                    | Use Case                        |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------------- |
| [Form with Validation](./ui/form-with-validation.md)  | Zod-gated form + TanStack Query mutation | Any create/edit form            |
| [Data Table](./ui/data-table.md)                       | Query hook + loading/error/empty states  | Any listing page                |
| [Flutter Feed Screen](./ui/flutter-feed-screen.md)     | CMS-driven mixed-content screen (Flutter) | Feed/home screens in `apps/mobile` |

### Testing

| Pattern                                                        | File                                | Use Case                        |
| --------------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| [API Integration Test](./testing/api-integration-test.md)      | Vitest + Testcontainers Postgres     | Any data-touching route/repo    |
| [Flutter Layout-Intent Test](./testing/flutter-layout-intent.md) | Widget test at 600/800/1200 dp asserting pinned/flex zones | Any Flutter screen whose spec has a **Layout intent** block (pinned bars, flex-fill zone, fixed header) |
| [Flutter Multi-Size Smoke Test](./testing/flutter-multi-size-smoke.md) | Widget test at 3 widths × 3 heights asserting no `RenderFlex` overflow | Every non-trivial Flutter screen — the cheap catch-80% guardrail against layout exceptions on off-baseline device sizes |

## How to Use

1. Find a matching pattern above; read it fully.
2. Copy the skeleton, adapt names/fields to your module.
3. Follow its checklist (most patterns end with one).
4. Validate: `pnpm verify` (+ integration tests for data-touching work).

## Contributing Patterns

- **In a project**: add project-specific patterns under `patterns_library/` there — harness installs never delete them.
- **Promote to the harness** when a pattern generalizes: add the file here, list it in this index, re-install into projects.
- Owner: System Architect validates new patterns; BSA extracts them from proven implementations.

---

**Maintained by**: Tamasha (adapted from bybren-llc/safe-agentic-workflow)
