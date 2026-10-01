import { afterEach, expect, test, vi } from "vitest";
import {
  registerGlobalService,
  getGlobalService,
  clearGlobalServices,
  performServiceCall,
} from "../context.js";
import type { AuthUser } from "@api/core/auth/types";

const fakeUser: AuthUser = { id: "u1", email: "a@b.com" };
const fakeAuth = { verifyToken: vi.fn(() => Promise.resolve(fakeUser)) };

afterEach(() => {
  clearGlobalServices();
  vi.clearAllMocks();
});

test("register + get round-trips a service", () => {
  registerGlobalService("auth", fakeAuth);
  expect(getGlobalService("auth")).toBe(fakeAuth);
});

test("get returns null when unregistered", () => {
  expect(getGlobalService("auth")).toBeNull();
});

test("performServiceCall invokes the op on the registered service", async () => {
  registerGlobalService("auth", fakeAuth);
  const user = await performServiceCall("auth", (s) => s.verifyToken("t"), "test", "verify failed");
  expect(user).toEqual(fakeUser);
});

test("performServiceCall throws AppError(500) when service missing", async () => {
  await expect(
    performServiceCall("auth", (s) => s.verifyToken("t"), "test", "verify failed")
  ).rejects.toMatchObject({ statusCode: 500 });
});
