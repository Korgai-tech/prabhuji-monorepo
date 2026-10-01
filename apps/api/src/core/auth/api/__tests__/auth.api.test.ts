import { expect, test, vi } from "vitest";
import { AuthApi } from "../auth.api.impl.js";
import type { AuthService } from "@api/core/auth/services";

test("AuthApi.verifyToken delegates to the service", async () => {
  const verifyToken = vi.fn(() => Promise.resolve({ id: "u1", email: "a@b.com" }));
  const service = { verifyToken } as unknown as AuthService;
  const api = new AuthApi(service);
  const user = await api.verifyToken("t");
  expect(user).toEqual({ id: "u1", email: "a@b.com" });
  expect(verifyToken).toHaveBeenCalledWith("t");
});
