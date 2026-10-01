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
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  await app.ready();
}, 120_000);
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
  const loginBody: { data: { token: string } } = login.json();
  const token = loginBody.data.token;
  expect(token).toBeTruthy();

  const me = await app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(me.statusCode).toBe(200);
  expect(me.json()).toMatchObject({ success: true, data: { email: "flow@e.com" } });
});

test("me without a token is 401", async () => {
  const res = await app.inject({ method: "GET", url: "/auth/me" });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toMatchObject({ success: false, data: null });
});

test("register with an invalid email is 400", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "not-an-email", name: "X", password: "password1" },
  });
  expect(res.statusCode).toBe(400);
});

// The user list moved to GET /admin/users. It used to be GET /auth/users behind
// `authMiddleware` alone — authentication with no authorization — so any
// phone-OTP user could enumerate every account, ids and emails, admins
// included. These two cases pin the fix from both sides: the old public path is
// gone, and the new one is not reachable by an ordinary user.
//
// The happy path is deliberately NOT re-created here. `/admin/users` goes
// through `registerAdminRoute`, so its guard wiring is asserted by
// admin-route-guard.contract.test.ts and its denial behaviour by the
// table-driven admin-route-guard.integration.test.ts — both of which pick the
// route up automatically. Re-asserting it here would duplicate that and add a
// second place to update.

test("GET /auth/users is GONE — enumeration is not a public-auth capability", async () => {
  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "a@e.com", name: "A", password: "password1" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "a@e.com", password: "password1" },
  });
  const loginBody: { data: { token: string } } = login.json();

  const res = await app.inject({
    method: "GET",
    url: "/auth/users",
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  expect(res.statusCode).toBe(404);
});

test("GET /admin/users denies an ordinary authenticated user", async () => {
  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "b@e.com", name: "B", password: "password1" },
  });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "b@e.com", password: "password1" },
  });
  const loginBody: { data: { token: string } } = login.json();

  // 403, not 404: the caller IS authenticated, they simply are not an admin.
  const res = await app.inject({
    method: "GET",
    url: "/admin/users",
    headers: { authorization: `Bearer ${loginBody.data.token}` },
  });
  expect(res.statusCode).toBe(403);
});

test("GET /admin/users without a token is 401", async () => {
  const res = await app.inject({ method: "GET", url: "/admin/users" });
  expect(res.statusCode).toBe(401);
});
