import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyticsEventsClient,
  PROFILE_ANALYTICS_EVENT as E,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { FirebaseTokenAnalyticsService } from "../firebase-tokens-analytics.service.js";

const send = vi.spyOn(analyticsEventsClient, "send");
const sent = (): AnalyticsEventInput => {
  const batch = send.mock.calls.at(-1)?.[0] ?? [];
  expect(batch.length).toBe(1);
  return batch[0];
};

const service = new FirebaseTokenAnalyticsService();
const input = {
  userId: "019a7f2e-3c1d-7b4a-9e5f-1a2b3c4d5e6f",
  token: "fcm-token-AAAA".padEnd(163, "x"), // real tokens are ~163 chars
  deviceId: "dev-1",
  platform: "android" as const,
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
});

describe("bk_user_profile_update", () => {
  /**
   * The name is a contract, not a convention: audience-campaign's profile
   * consumer matches EXACTLY this string and projects `fcm_token` into the
   * table push delivery reads. Its constant must move with this one.
   */
  it("emits the shared event name, verbatim", async () => {
    await service.trackTokenRegistered(input);
    expect(sent().event_type).toBe("bk_user_profile_update");
  });

  it("prefixes the event with bk_ like every other backend event", () => {
    expect(E.USER_PROFILE_UPDATE).toMatch(/^bk_/);
  });

  it("carries the token under the key the profile consumer lifts", async () => {
    await service.trackTokenRegistered(input);
    expect(sent().user_id).toBe(input.userId);
    expect(sent().event_properties).toEqual({
      fcm_token: input.token,
      device_id: "dev-1",
      platform: "android",
    });
  });

  it("never sends phone_number — the profile is keep-if-absent", async () => {
    await service.trackTokenRegistered(input);
    expect(sent().event_properties).not.toHaveProperty("phone_number");
  });

  describe("insert_id, the collector's idempotency key", () => {
    it("changes when the token changes, so a refreshed token is not deduped as a replay", async () => {
      await service.trackTokenRegistered(input);
      const first = sent().insert_id;
      await service.trackTokenRegistered({ ...input, token: "fcm-token-BBBB".padEnd(163, "y") });
      expect(sent().insert_id).not.toBe(first);
    });

    it("is stable for the same device and token, so a repeat IS deduped", async () => {
      await service.trackTokenRegistered(input);
      const first = sent().insert_id;
      await service.trackTokenRegistered(input);
      expect(sent().insert_id).toBe(first);
    });

    it("stays under the 200-char envelope cap and never embeds the raw token", async () => {
      await service.trackTokenRegistered(input);
      const id = sent().insert_id ?? "";
      expect(id.length).toBeLessThanOrEqual(200);
      expect(id).not.toContain(input.token);
      expect(id.startsWith("bk_user_profile_update:")).toBe(true);
    });
  });

  it("swallows a send failure — a token registration must never fail on analytics", async () => {
    send.mockRejectedValueOnce(new Error("collector down"));
    await expect(service.trackTokenRegistered(input)).resolves.toBeUndefined();
  });
});
