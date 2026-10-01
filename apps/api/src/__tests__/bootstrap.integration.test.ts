import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { bootstrap } from "@api/bootstrap";

let ctx: Awaited<ReturnType<typeof bootstrap>>;
beforeAll(async () => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.ENABLE_REDIS = "false";
  await startTestDb();
  ctx = await bootstrap();
}, 120_000);
afterAll(async () => {
  await ctx.shutdown();
  await stopTestDb();
});

test("bootstrap wires a working app with the auth module registered", async () => {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "boot@e.com", name: "B", password: "password1" },
  });
  expect(res.statusCode).toBe(201);
});
