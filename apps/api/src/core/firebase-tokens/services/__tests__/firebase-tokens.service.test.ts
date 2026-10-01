import { describe, expect, it, vi } from "vitest";
import { FirebaseTokenService } from "../firebase-tokens.service.js";

const input = { userId: "u-1", token: "tok", deviceId: "dev-1", platform: "ios" as const };

describe("FirebaseTokenService.register", () => {
  it("stores the token, THEN tells audience-campaign about it", async () => {
    const order: string[] = [];
    const repo = {
      upsert: vi.fn(() => {
        order.push("upsert");
        return Promise.resolve();
      }),
      deleteByUserDevice: vi.fn(),
    };
    const analytics = {
      trackTokenRegistered: vi.fn(() => {
        order.push("track");
        return Promise.resolve();
      }),
    };

    await new FirebaseTokenService(repo, analytics).register(input);

    expect(order).toEqual(["upsert", "track"]);
    expect(analytics.trackTokenRegistered).toHaveBeenCalledWith(input);
  });

  /** An event claiming a token that never stored would point push at nothing. */
  it("does not emit when the upsert fails", async () => {
    const repo = {
      upsert: vi.fn(() => Promise.reject(new Error("db down"))),
      deleteByUserDevice: vi.fn(),
    };
    const analytics = { trackTokenRegistered: vi.fn(() => Promise.resolve()) };

    await expect(new FirebaseTokenService(repo, analytics).register(input)).rejects.toThrow("db down");
    expect(analytics.trackTokenRegistered).not.toHaveBeenCalled();
  });
});
