---
name: testing-patterns
description: Testing patterns for Vitest (unit + testcontainers integration) and Flutter tests. Use when writing tests, setting up test fixtures, or validating the layered architecture. Routes to existing test conventions and provides evidence templates.
allowed-tools: Read, Bash, Grep, Glob
---

# Testing Patterns Skill

## Purpose

Guide consistent and effective testing. Routes to existing test conventions and provides evidence templates for the spec file (`specs/TAM-N-*.md`).

## When This Skill Applies

Invoke this skill when:

- Writing new unit tests (Vitest or `flutter test`)
- Creating integration tests (real Postgres via testcontainers)
- Setting up test fixtures
- Running test suites
- Packaging test evidence into the spec file

## Critical Rules

### ❌ FORBIDDEN Patterns

```typescript
// FORBIDDEN: Real Prisma/DB access in *unit* tests (unit = mocked deps)
const user = await prisma.user.findUnique({ where: { id } });

// FORBIDDEN: Shared mutable test state (causes flaky tests)
let sharedUser: User;
beforeAll(() => {
  sharedUser = createUser();
});

// FORBIDDEN: Hard-coded IDs/emails reused across tests (test pollution)
const email = "test@example.com";

// FORBIDDEN: Integration tests against a developer's local database
// (use the testcontainers helper — it starts an isolated Postgres)
```

### ✅ CORRECT Patterns

```typescript
// CORRECT: Unit tests mock the layer below (repository) with vi.fn()
function makeRepo(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    createUser: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    listUsers: vi.fn(),
    ...overrides,
  };
}
const svc = new AuthService(
  makeRepo({ findByEmail: vi.fn(() => Promise.resolve(null)) }),
);

// CORRECT: Isolated state per test
beforeEach(() => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  resetEnvCache();
});

// CORRECT: Unique identifiers
const email = `test-${Date.now()}@example.com`;

// CORRECT: Integration tests use the container lifecycle helpers
beforeAll(async () => {
  await startTestDb(); /* buildApp() ... */
}, 120_000);
afterAll(async () => {
  await app.close();
  await disconnectPrisma();
  await stopTestDb();
});
```

## Test Layout

Tests are colocated per project — there is no central `__tests__/` tree:

```text
apps/api/src/**/__tests__/*.test.ts              # unit (mocked deps)
apps/api/src/**/__tests__/*.integration.test.ts  # real Postgres (testcontainers)
apps/api/src/shared/testing/pg.ts                # startTestDb/stopTestDb helper
apps/admin/src/features/<feature>/*.test.tsx     # Testing Library (jsdom), colocated
apps/mobile/test/                                # flutter unit + widget tests
apps/mobile/integration_test/                    # flutter integration test (emulator + running API)
```

## Configuration Files

- **API Vitest config**: `apps/api/vitest.config.ts` (unit vs integration configurations)
- **Testcontainers helper**: `apps/api/src/shared/testing/pg.ts`
- **Admin tests**: Vitest + Testing Library, jsdom environment

## Integration Testing with Testcontainers

`*.integration.test.ts` files run against a REAL Postgres started in Docker; the helper pushes the Prisma schema before tests run:

```typescript
import { beforeAll, afterAll, expect, test } from "vitest";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma } from "@api/shared/database";
import { initAuthModule } from "@api/core/auth";

let app: FastifyInstance;
beforeAll(async () => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  await startTestDb(); // testcontainers Postgres + prisma db push
  app = await buildApp();
  initAuthModule(app);
  await app.ready();
}, 120_000);
afterAll(async () => {
  await app.close();
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
  expect(reg.json()).toMatchObject({
    success: true,
    data: { email: "flow@e.com" },
  });
});
```

### Test Isolation

Use unique identifiers to prevent test pollution:

```typescript
const uniqueEmail = `test-${Date.now()}@example.com`;
const uniqueId = crypto.randomUUID();
```

## Test Commands

```bash
# API unit tests (mocked deps)
pnpm nx test api --configuration=unit

# API integration tests (real Postgres via testcontainers; Docker required)
pnpm nx test api --configuration=integration

# Admin tests (Testing Library, jsdom)
pnpm nx test admin

# Mobile tests (from apps/mobile, needs Flutter SDK)
flutter test

# Run specific test file
pnpm exec vitest run path/to/my-component.test.tsx

# Run tests matching a name
pnpm exec vitest run -t "should handle"

# All Node projects
pnpm nx run-many -t test --exclude=mobile
```

E2E is REAL on both surfaces:

- **Web (Playwright)**: `pnpm e2e:web` — drives the admin SPA against the real API + Postgres. Playwright boots both servers itself (`apps/admin-e2e/playwright.config.ts`); the script ensures the DB is up + migrated. Specs live in `apps/admin-e2e/src/` (canonical flow: register via API → UI login → users list). CI runs this as the `e2e-web` job.
- **Android (Flutter integration_test)**: `pnpm e2e:android` — runs `integration_test/app_test.dart` against a live API (`E2E_MOBILE_API_URL`, default `http://10.0.2.2:3000` for the emulator; pick a device with `E2E_DEVICE=<id>`). Needs a running Android emulator — not part of CI.

## Common Patterns

### Component Testing (admin)

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { MyComponent } from "./my-component";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click events", () => {
    const onClickMock = vi.fn();
    render(<MyComponent onClick={onClickMock} />);

    fireEvent.click(screen.getByRole("button"));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});
```

Wrap components that use TanStack Query in a `QueryClientProvider` with a fresh `QueryClient` per test.

### Route Testing (api, via Fastify inject)

```typescript
const res = await app.inject({ method: "GET", url: "/health" });
expect(res.statusCode).toBe(200);
expect(res.json()).toMatchObject({ success: true }); // {success, message, data} envelope
```

### Mocking the Layer Below (unit tests)

Unit tests mock at constructor-injection seams — services get a mocked repository, controllers get a mocked service:

```typescript
import { vi } from "vitest";

const repo: AuthRepository = {
  createUser: vi.fn(),
  findByEmail: vi.fn(() => Promise.resolve(null)),
  findById: vi.fn(),
  listUsers: vi.fn(),
};
const svc = new AuthService(repo);
```

## Evidence Template for the Spec File

When completing test work, record this evidence block in `specs/TAM-N-*.md`:

```markdown
**Test Execution Evidence**

**Test Suite**: [unit/integration/admin/mobile]
**Files Changed**: [list files]

**Test Results:**

- Total Tests: [X]
- Passed: [X]
- Failed: [0]
- Skipped: [X]

**Commands Run:**

\`\`\`bash
pnpm nx test api --configuration=unit
pnpm nx test api --configuration=integration
\`\`\`

**Output:**
[Paste relevant test output]
```

## Pre-Push Validation

Always run before pushing:

```bash
pnpm verify        # arch boundaries + OpenAPI drift + typecheck + lint + unit tests
pnpm verify:mobile # when mobile changed
```

## Authoritative References

- **API test conventions**: `apps/api/CLAUDE.md` (unit vs integration split)
- **Testcontainers helper**: `apps/api/src/shared/testing/pg.ts`
- **Integration pattern**: `patterns_library/testing/api-integration-test.md`
- **CI gates**: root `package.json` scripts (`verify`, `check:arch-boundaries`, `check:openapi`)
