import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance, RouteOptions } from "fastify";
import { buildApp } from "@api/app";
import { initAllModules } from "@api/modules";
import { adminMiddleware, authMiddleware } from "@api/core/auth/middleware";
import { ADMIN_TAG } from "@api/core/auth/routes";
import { clearGlobalServices } from "@api/shared/workspace";

/**
 * THE STRUCTURAL GATE for every `/admin/*` route in the app (TAM-82 AC (c);
 * ADR §B2). This is the contract with ~10 downstream module tickets.
 *
 * It is deliberately NOT a hand-maintained list of admin routes. It enumerates
 * the LIVE route table of the real app — every module, via the same
 * `initAllModules` that `bootstrap.ts` runs — and asserts the invariant over
 * whatever it finds. A route added in TAM-90 or TAM-104 without
 * `registerAdminRoute` shows up here on its own and fails this test. That is
 * the entire point: a guard that is merely *available* gets forgotten on route
 * #47, and #47 is the one that ships unauthenticated.
 *
 * DO NOT weaken this to a convention, a lint rule, or a list. If it fails, the
 * route is wrong — not the test.
 *
 * The behavioural half of the invariant (no token → 401, non-admin token → 403)
 * is asserted over the same enumeration in `admin-route-guard.integration.test.ts`.
 */

interface CapturedRoute {
  method: string;
  url: string;
  guards: string[];
  tags: string[];
}

let app: FastifyInstance;
let adminRoutes: CapturedRoute[];
let allRoutes: CapturedRoute[];

/**
 * The admin guard pair is attached at `onRequest` (TAM-84) — deliberately, so it
 * runs BEFORE Zod body/query validation and an unauthenticated request is denied
 * with 401 rather than a validation 400. So this reads `onRequest`, not
 * `preHandler`, to prove the pair is wired.
 */
function guardNames(route: RouteOptions): string[] {
  const hooks = route.onRequest;
  if (!hooks) return [];
  const list = Array.isArray(hooks) ? hooks : [hooks];
  return list.map((fn) => fn.name);
}

beforeAll(async () => {
  process.env.JWT_SECRET ??= "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER ??= "contract-test-stub-pepper-not-used-32ch";
  process.env.DATABASE_URL ??= "postgres://stub:stub@localhost:5432/stub";

  app = await buildApp();
  const captured: CapturedRoute[] = [];
  // `onRoute` fires for every route registered after this hook, including
  // inside each module's encapsulated scope, and `routeOptions.url` is the
  // FULL path with the module's prefix already applied — so this sees exactly
  // what the router serves. Registered before initAllModules for that reason.
  app.addHook("onRoute", (route) => {
    captured.push({
      method: String(route.method),
      url: route.url,
      guards: guardNames(route),
      tags: (route.schema?.tags as string[] | undefined) ?? [],
    });
  });
  initAllModules(app);
  await app.ready();

  allRoutes = captured;
  adminRoutes = captured.filter((r) => r.url.startsWith("/admin/") || r.url === "/admin");
});

afterAll(async () => {
  await app.close();
  clearGlobalServices();
});

test("the live route table actually contains /admin/* routes (guards the guard)", () => {
  // Without this, every assertion below would vacuously pass if the enumeration
  // silently broke (a renamed hook, a changed url shape) — and a broken gate
  // that reports green is worse than no gate.
  expect(allRoutes.length).toBeGreaterThan(0);
  expect(adminRoutes.length).toBeGreaterThan(0);
  expect(adminRoutes.map((r) => `${r.method} ${r.url}`)).toContain("GET /admin/session");
});

describe("every /admin/* route in the live route table", () => {
  test("carries BOTH guards, in order: authMiddleware then adminMiddleware", () => {
    const offenders = adminRoutes.filter(
      (r) => r.guards[0] !== authMiddleware.name || r.guards[1] !== adminMiddleware.name
    );
    expect(
      offenders.map((r) => `${r.method} ${r.url} -> onRequest: [${r.guards.join(", ")}]`),
      "admin routes missing the guard pair — register them with registerAdminRoute(), never a bare r.get('/admin/…')"
    ).toEqual([]);
  });

  test("carries the 'admin' OpenAPI tag", () => {
    // Load-bearing: TAM-85 builds openapi.public.json (the mobile Dart codegen
    // input) by dropping every operation with this tag. An untagged admin route
    // ships admin schemas into the APK.
    const offenders = adminRoutes.filter((r) => !r.tags.includes(ADMIN_TAG));
    expect(
      offenders.map((r) => `${r.method} ${r.url} -> tags: [${r.tags.join(", ")}]`),
      `admin routes missing the '${ADMIN_TAG}' tag — registerAdminRoute() applies it centrally`
    ).toEqual([]);
  });
});

test("the 'admin' tag and the /admin/ path prefix select the same routes", () => {
  // Belt and braces for TAM-85: the public-doc filter selects by TAG, this test
  // and the router select by PATH. If the two selectors ever disagree, the
  // failure must be a red test here — not admin schemas quietly shipping in the
  // mobile binary, or a public route accidentally hidden from it.
  const taggedAdmin = allRoutes.filter((r) => r.tags.includes(ADMIN_TAG));
  const pathAdmin = adminRoutes;
  const key = (r: CapturedRoute): string => `${r.method} ${r.url}`;
  expect(taggedAdmin.map(key).sort()).toEqual(pathAdmin.map(key).sort());
});

test("no NON-admin route carries the admin guard or tag", () => {
  // The inverse mistake: guarding a public route makes it unreachable for the
  // mobile app, and tagging it would delete it from the mobile client entirely.
  const offenders = allRoutes
    .filter((r) => !r.url.startsWith("/admin"))
    .filter((r) => r.guards.includes(adminMiddleware.name) || r.tags.includes(ADMIN_TAG));
  expect(offenders.map((r) => `${r.method} ${r.url}`)).toEqual([]);
});
