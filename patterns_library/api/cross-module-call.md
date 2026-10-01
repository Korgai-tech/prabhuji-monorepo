# Pattern: Cross-Module Service Call

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/api/src/shared/workspace/context.ts`.

## Use Case

Module A needs functionality from module B (e.g. `users` verifying a token via `auth`). Modules NEVER import each other's internals — the arch gate forbids it. The only cross-module surface is the `api/` facade, consumed through `performServiceCall`.

## The Mechanism

Each module registers its facade at init; consumers call through the registry:

```typescript
// Provider side (module composition root)
registerGlobalService("auth", new AuthApi(service));

// Facade interface published from core/auth/api/
export interface IAuthApi {
  verifyToken(token: string): Promise<AuthUser>;
}
```

```typescript
// Consumer side — anywhere in another module's service layer
import { performServiceCall } from "@api/shared/workspace";

const user = await performServiceCall(
  "auth", // key in GlobalServiceMap
  (auth) => auth.verifyToken(token), // typed op against the facade
  "users:service", // context for error messages
  "Failed to verify token", // failure message
);
```

## Why `performServiceCall` (not `getGlobalService`)

It wraps the registry lookup with the two failure modes handled uniformly:

- Service not registered → throws `AppError(..., 500, "SERVICE_UNAVAILABLE")`
- Op throws a non-`AppError` → wrapped as `AppError(..., 500, "SERVICE_CALL_FAILED")` with your context; `AppError`s pass through untouched

## Adding a New Facade

1. [ ] Define `I<Mod>Api` in `core/<mod>/api/` — keep it minimal; it's a public contract
2. [ ] Add the key to `GlobalServiceMap` in `src/shared/workspace/context.ts` (the single place `shared/` may reference module `api/` types, type-only)
3. [ ] Register in the module's `init<Mod>Module` via `registerGlobalService`
4. [ ] Consumers use `performServiceCall("<key>", op, ctx, msg)` — never a direct import

## Anti-Patterns

- ❌ `import { AuthService } from "@api/core/auth/services"` from another module (arch gate fails)
- ❌ Fat facades — if the interface grows past a handful of methods, the module boundary is probably wrong
