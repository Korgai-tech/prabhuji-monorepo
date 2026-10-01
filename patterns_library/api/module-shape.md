# Pattern: API Feature Module Shape

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/api/src/core/auth/`.

## Use Case

Adding a new feature module to `apps/api` (e.g. `users`, `billing`). Every module follows the same layered shape — the arch gate (`pnpm check:arch-boundaries`) fails PRs that violate it.

## Structure

```text
apps/api/src/core/<mod>/
├── api/            # Public facade: I<Mod>Api type + impl (the ONLY cross-module surface)
├── controllers/    # HTTP orchestration; imports services only
├── middleware/     # Module-scoped Fastify middleware (optional)
├── repositories/   # Prisma lives HERE and only here
├── routes/         # Route registration + <mod>.schemas.ts (Zod at the boundary)
├── services/       # Business logic; imports repositories only
├── types.ts        # Module-internal types
├── index.ts        # Composition root
└── __tests__/      # Colocated per layer: *.test.ts (unit) / *.integration.test.ts
```

Layering: Route → Controller → Service → Repository → DB. A layer imports only the one below it plus `shared/`.

## Composition Root (`index.ts`)

```typescript
import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { AuthRepository } from "@api/core/auth/repositories";
import { AuthService } from "@api/core/auth/services";
import { AuthApi } from "@api/core/auth/api";
import { registerAuthRoutes } from "@api/core/auth/routes";

export function initAuthModule(app: FastifyInstance): void {
  const repo = new AuthRepository();
  const service = new AuthService(repo);
  const api = new AuthApi(service);
  registerGlobalService("auth", api);
  void app.register(
    (scoped) => {
      registerAuthRoutes(scoped, service);
    },
    { prefix: "/auth" },
  );
}
```

## Checklist for a New Module

1. [ ] Create the directory shape above; wire `init<Mod>Module(app)` from `src/bootstrap.ts`
2. [ ] Publish the facade type `I<Mod>Api` in `api/` and add one line to `GlobalServiceMap` (`src/shared/workspace/context.ts`)
3. [ ] Zod schemas in `routes/<mod>.schemas.ts` — no separate runtime validation lib
4. [ ] Responses only via `sendSuccess`/`sendError` (`{success,message,data}` envelope); errors via `AppError`/`ValidationError`
5. [ ] Logging via `createModuleLogger("<mod>:<sublayer>")` — never `console.log`
6. [ ] Unit tests (mocked deps) + integration tests (testcontainers) in `__tests__/`
7. [ ] Regenerate the contract chain (see [contract-codegen-chain](../ci/contract-codegen-chain.md))
8. [ ] `pnpm verify` green

## Related

- [Cross-Module Call](./cross-module-call.md) — how other modules consume the facade
- `apps/api/CLAUDE.md` — full module conventions
