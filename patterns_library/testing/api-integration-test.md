# Pattern: API Integration Test (Vitest + Testcontainers)

> Repo-specific pattern (monorepo-boilerplate). Source of truth: `apps/api/src/core/auth/routes/__tests__/auth.routes.integration.test.ts` + helper `apps/api/src/shared/testing/pg.ts`.

## Use Case

Testing a feature module against a REAL Postgres (started in Docker via testcontainers) — route flows through the full stack (Route → Controller → Service → Repository → DB), or a repository against the real schema. Unit vs integration split (`apps/api/CLAUDE.md`): `*.test.ts` = unit (mocked deps), `*.integration.test.ts` = real Postgres. Both live colocated in `__tests__/`.

## The Helper (`src/shared/testing/pg.ts`)

Already exists — never write container code in a test. `startTestDb()` starts `postgres:18-alpine`, sets `process.env.DATABASE_URL`, and applies the schema via `prisma db push`:

```typescript
import { startTestDb, stopTestDb } from "@api/shared/testing";
```

## Route-Level Test (full stack, Fastify inject)

```typescript
// apps/api/src/core/<mod>/routes/__tests__/<mod>.routes.integration.test.ts
import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { initAuthModule } from "@api/core/auth";

let app: FastifyInstance;
beforeAll(async () => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  await startTestDb(); // testcontainers Postgres + prisma db push
  app = await buildApp();
  initAuthModule(app); // wire only the module(s) under test
  await app.ready();
}, 120_000); // container pull/start needs the long timeout
afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

test("register -> login -> me happy path", async () => {
  const reg = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "flow@e.com", name: "Flow", password: "password1" },
  });
  expect(reg.statusCode).toBe(201);
  expect(reg.json()).toMatchObject({ success: true, data: { email: "flow@e.com" } });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "flow@e.com", password: "password1" },
  });
  expect(login.statusCode).toBe(200);
  const { data } = login.json<{ data: { token: string } }>();

  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${data.token}` },
  });
  expect(me.statusCode).toBe(200);
});

test("me without a token is 401", async () => {
  const res = await app.inject({ method: "GET", url: "/auth/me" });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toMatchObject({ success: false, data: null });
});
```

## Repository-Level Test (real schema, no HTTP)

```typescript
// apps/api/src/core/<mod>/repositories/__tests__/<mod>.repository.integration.test.ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma } from "@api/shared/database";
import { AuthRepository } from "../auth.repository.js";

const repo = new AuthRepository();
beforeAll(async () => {
  await startTestDb();
}, 120_000);
afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

test("createUser then findByEmail returns the row", async () => {
  const created = await repo.createUser({ email: "r@e.com", name: "R", passwordHash: "ph" });
  const found = await repo.findByEmail("r@e.com");
  expect(found).toMatchObject({ id: created.id, email: "r@e.com" });
});
```

## Rules

- One container per file (`beforeAll`/`afterAll`), NOT per test — starting Postgres is expensive. Tests in a file share the DB, so use unique identifiers (`test-${Date.now()}@example.com`) to avoid pollution between tests.
- Always tear down in this order: `app.close()` → `clearGlobalServices()` → `disconnectPrisma()` → `stopTestDb()` — otherwise Vitest hangs on open handles.
- Requests go through `app.inject()` — no real network, no supertest. Assert the `{success, message, data}` envelope.
- Set required env (e.g. `JWT_SECRET`) in `beforeAll` before `buildApp()`; `startTestDb()` owns `DATABASE_URL`.
- Never point integration tests at a local/dev database — the helper's throwaway container is the only DB.
- Cover 401 (no/bad token) and 400 (Zod rejection at the route boundary) alongside the happy path.
- `apps/api/vitest.config.ts` selects the file by name (`*.integration.test.ts` → `integration` project, 120s timeouts). Naming the file correctly IS the registration — no extra config.

## Running

Docker must be running (testcontainers pulls `postgres:18-alpine`):

```bash
pnpm nx test api --configuration=integration   # integration only
pnpm nx test api --configuration=unit          # unit only (no Docker)
pnpm verify                                    # CI gate: boundaries + openapi + typecheck + lint + unit
```

## Related

- [API Feature Module Shape](../api/module-shape.md) — the layers the route test exercises
- [Prisma Transaction](../database/prisma-transaction.md) — atomicity belongs in an integration test
- `apps/api/CLAUDE.md` — unit vs integration conventions
