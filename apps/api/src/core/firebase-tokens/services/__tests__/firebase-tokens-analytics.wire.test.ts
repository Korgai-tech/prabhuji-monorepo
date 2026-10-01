import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";

/**
 * The bytes on the wire. The sibling test spies on `analyticsEventsClient.send`
 * and so proves what the service ASKS to send; this one lets the real client
 * run and stubs only `fetch`, so it proves what the collector actually
 * RECEIVES — URL, method, and the exact JSON body, `api_key` included.
 */
class FakeRedis {
  readonly data = new Map<string, string>();
  set(key: string, value: string): Promise<"OK"> {
    this.data.set(key, value);
    return Promise.resolve("OK");
  }
  mget(keys: string[]): Promise<Array<string | null>> {
    return Promise.resolve(keys.map((key) => this.data.get(key) ?? null));
  }
}
let redis = new FakeRedis();
vi.mock("@api/shared/database", () => ({ getRedis: () => redis }));

const { FirebaseTokenAnalyticsService } = await import("../firebase-tokens-analytics.service.js");
const { clearDeviceContextWriteCache } = await import("@api/shared/analytics/device-context.js");

const ORIGINAL_ENV = { ...process.env };
const baseEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  JWT_SECRET: "a-sufficiently-long-secret",
  MEDIA_BUCKET: "test-bucket",
  MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
  ANALYTICS_EVENTS_ENABLED: "true",
  ANALYTICS_EVENTS_URL: "https://events.example.test/2/httpapi",
  ANALYTICS_EVENTS_API_KEY: "events-key",
  ANALYTICS_EVENTS_TIMEOUT_MS: "1234",
};
const input = {
  userId: "019a7f2e-3c1d-7b4a-9e5f-1a2b3c4d5e6f",
  token: "fcm-token-AAAA".padEnd(163, "x"),
  deviceId: "dev-1",
  platform: "android" as const,
};
type Recorded = { url: string; init: RequestInit };
const stubFetch = (): Recorded[] => {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ code: 200 }), { status: 200 }));
    })
  );
  return calls;
};
type WireBody = {
  api_key: string;
  events: Array<{ event_type: string; user_id: string; insert_id: string; time: number; event_properties: Record<string, unknown> }>;
};
// The client always sends a JSON string; anything else is a test failure, not
// something to stringify into "[object Object]" and parse.
const bodyOf = (call: Recorded): WireBody => {
  const { body } = call.init;
  if (typeof body !== "string") throw new Error("expected a JSON string body");
  return JSON.parse(body) as WireBody;
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...baseEnv };
  resetEnvCache();
  redis = new FakeRedis();
  clearDeviceContextWriteCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  resetEnvCache();
});

describe("bk_user_profile_update on the wire", () => {
  it("POSTs one Amplitude-V2 batch to the collector with the token in event_properties", async () => {
    const calls = stubFetch();
    await new FirebaseTokenAnalyticsService().trackTokenRegistered(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://events.example.test/2/httpapi");
    expect(calls[0].init.method).toBe("POST");

    const body = bodyOf(calls[0]);
    expect(body.api_key).toBe("events-key"); // the body key IS the auth — V2 has no header
    expect(body.events).toHaveLength(1);
    const [event] = body.events;
    expect(event.event_type).toBe("bk_user_profile_update");
    expect(event.user_id).toBe(input.userId);
    expect(event.event_properties.fcm_token).toBe(input.token);
    expect(event.insert_id.startsWith("bk_user_profile_update:")).toBe(true);
    expect(typeof event.time).toBe("number");
  });

  /** The operational prerequisite, made visible: with the flag off nothing leaves the process. */
  it("sends nothing at all when ANALYTICS_EVENTS_ENABLED is false", async () => {
    process.env.ANALYTICS_EVENTS_ENABLED = "false";
    resetEnvCache();
    const calls = stubFetch();
    await new FirebaseTokenAnalyticsService().trackTokenRegistered(input);
    expect(calls).toHaveLength(0);
  });
});
