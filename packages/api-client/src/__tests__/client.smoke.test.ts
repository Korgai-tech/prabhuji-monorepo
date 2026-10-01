import { expect, test } from "vitest";
import { createApiClient } from "../client.js";

test("client is constructible and typed against the real contract", () => {
  const client = createApiClient("http://localhost:3000");
  expect(client).toBeDefined();

  // compile-time: a correctly-shaped call must typecheck
  const good = (): unknown =>
    client.POST("/auth/register", { body: { email: "a@b.com", name: "A", password: "password1" } });
  expect(typeof good).toBe("function");

  // @ts-expect-error — a body missing required fields must be a compile error
  const bad = (): unknown => client.POST("/auth/register", { body: { email: "a@b.com" } });
  expect(typeof bad).toBe("function");
});
