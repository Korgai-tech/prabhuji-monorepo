import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { initAllModules } from "@api/modules";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";

/**
 * The BEHAVIOURAL half of the admin-guard invariant (TAM-82 AC (b)/(c)), against
 * real Postgres. Its sibling `admin-route-guard.contract.test.ts` proves every
 * `/admin/*` route is *wired* with the guard; this one proves the guard actually
 * *denies*, by driving every route the live table exposes.
 *
 * Table-driven over the enumerated route table — NOT a hand-written list of
 * urls. A module ticket that adds `/admin/aarti/items` gets it exercised here
 * for free, and an unguarded one fails.
 */

/**
 * The methods this test knows how to drive through `app.inject`. An admin route
 * using anything else THROWS below rather than being skipped — a guard test
 * that silently ignores routes it doesn't understand is exactly the hole this
 * whole exercise exists to close.
 */
const INJECTABLE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type InjectMethod = (typeof INJECTABLE_METHODS)[number];

interface AdminRoute {
  method: InjectMethod;
  url: string;
}

let app: FastifyInstance;
let adminRoutes: AdminRoute[];
let nonAdminToken: string;

function toInjectMethod(method: string): InjectMethod {
  const found = INJECTABLE_METHODS.find((m) => m === method.toUpperCase());
  if (!found) {
    throw new Error(
      `admin route uses HTTP method '${method}', which this guard test cannot drive. ` +
        `Add it to INJECTABLE_METHODS — do NOT skip the route.`
    );
  }
  return found;
}

/** Fill `:param` placeholders — the guard runs long before the handler ever
 * looks at them, so any syntactically valid value reaches the same decision. */
function concreteUrl(url: string): string {
  return url.replace(/:[^/]+/g, "00000000-0000-4000-8000-000000000000");
}

beforeAll(async () => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER ??= "guard-integration-stub-pepper-32chars!";
  await startTestDb();

  app = await buildApp();
  const captured: AdminRoute[] = [];
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/admin")) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) captured.push({ method: toInjectMethod(method), url: route.url });
  });
  initAllModules(app);
  await app.ready();
  adminRoutes = captured;

  // A perfectly ordinary user: registered through the public endpoint, so its
  // role is whatever /auth/register actually produces — not a fixture we set.
  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "not-an-admin@e.com", name: "Regular", password: "password1" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "not-an-admin@e.com", password: "password1" },
  });
  const body: { data: { token: string } } = login.json();
  nonAdminToken = body.data.token;
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

test("the enumeration found admin routes to drive", () => {
  expect(adminRoutes.length).toBeGreaterThan(0);
  expect(nonAdminToken).toBeTruthy();
});

test("EVERY /admin/* route rejects a request with NO token (401)", async () => {
  const failures: string[] = [];
  for (const route of adminRoutes) {
    const res = await app.inject({ method: route.method, url: concreteUrl(route.url) });
    if (res.statusCode !== 401) {
      failures.push(`${route.method} ${route.url} -> ${res.statusCode} (expected 401)`);
    }
  }
  expect(failures, "unauthenticated requests reached an admin route").toEqual([]);
});

test("EVERY /admin/* route rejects a valid NON-ADMIN token (403)", async () => {
  const failures: string[] = [];
  for (const route of adminRoutes) {
    const res = await app.inject({
      method: route.method,
      url: concreteUrl(route.url),
      headers: { authorization: `Bearer ${nonAdminToken}` },
    });
    if (res.statusCode !== 403) {
      failures.push(`${route.method} ${route.url} -> ${res.statusCode} (expected 403)`);
    }
  }
  expect(failures, "a non-admin reached an admin route").toEqual([]);
});

test("EVERY /admin/* route rejects a malformed/garbage token (401)", async () => {
  const failures: string[] = [];
  for (const route of adminRoutes) {
    const res = await app.inject({
      method: route.method,
      url: concreteUrl(route.url),
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    if (res.statusCode !== 401) {
      failures.push(`${route.method} ${route.url} -> ${res.statusCode} (expected 401)`);
    }
  }
  expect(failures).toEqual([]);
});
