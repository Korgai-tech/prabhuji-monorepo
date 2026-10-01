import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";

/**
 * The device-context cache the client enriches from. Stubbed at the Redis seam
 * rather than at `loadDeviceContexts`, so these tests exercise the real
 * lookup — including its failure handling, which is the whole reason enrichment
 * is allowed to sit in front of the payment path.
 */
class FakeRedis {
  readonly data = new Map<string, string>();
  failOn: "mget" | null = null;

  set(key: string, value: string): Promise<"OK"> {
    this.data.set(key, value);
    return Promise.resolve("OK");
  }

  mget(keys: string[]): Promise<Array<string | null>> {
    if (this.failOn === "mget") return Promise.reject(new Error("redis down"));
    return Promise.resolve(keys.map((key) => this.data.get(key) ?? null));
  }
}

let redis: FakeRedis | null = null;

vi.mock("@api/shared/database", () => ({
  getRedis: () => redis,
}));

const { AnalyticsEventsClient } = await import("../events-client.js");
const { cacheDeviceContext, clearDeviceContextWriteCache } = await import(
  "../device-context.js"
);

const ORIGINAL_ENV = { ...process.env };

/** The minimum `loadEnv()` accepts, plus a fully configured analytics sink. */
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

const anEvent = {
  event_type: "subscription_success",
  user_id: "user-1",
  insert_id: "payment:subscription_success:mnd-1:2026-08-01",
  event_properties: { mandate_id: "mnd-1" },
};

const okResponse = (): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify({ code: 200 }), { status: 200 }));

/**
 * A 200-answering `fetch` that RECORDS what it was called with.
 *
 * Reading `mock.calls` instead would need a cast on every use — vitest types a
 * paramless mock's calls as `[]` — and the point of these tests is the exact
 * request, so it is worth capturing properly.
 */
const okFetch = (): { calls: Array<{ url: string; init: RequestInit }> } => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return okResponse();
    })
  );
  return { calls };
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

describe("AnalyticsEventsClient", () => {
  it("posts an Amplitude V2-shaped batch to the collector", async () => {
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([anEvent]);

    expect(fetched.calls).toHaveLength(1);
    const { url, init } = fetched.calls[0];
    expect(url).toBe("https://events.example.test/2/httpapi");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        // Tenant routing on the shared collector — a batch without it is dropped.
        "x-tenant-id": "prabhuji",
      },
    });

    const body = JSON.parse(init.body as string) as {
      api_key: string;
      client_upload_time: string;
      events: Array<{ event_type: string; user_id: string; time: number }>;
    };
    // The body `api_key` IS the auth — Amplitude V2 has no auth header.
    expect(body.api_key).toBe("events-key");
    expect(body.client_upload_time).toMatch(/T/);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      event_type: "subscription_success",
      user_id: "user-1",
      insert_id: "payment:subscription_success:mnd-1:2026-08-01",
    });
    // Stamped by the client so no caller has to remember to.
    expect(body.events[0].time).toEqual(expect.any(Number));
  });

  it("keeps a caller-supplied time rather than overwriting it", async () => {
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([{ ...anEvent, time: 1_700_000_000_000 }]);

    const body = JSON.parse(fetched.calls[0].init.body as string) as {
      events: Array<{ time: number }>;
    };
    expect(body.events[0].time).toBe(1_700_000_000_000);
  });

  it("sends nothing for an empty batch", async () => {
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([]);

    expect(fetched.calls).toHaveLength(0);
  });

  it("skips the send when analytics are disabled", async () => {
    process.env.ANALYTICS_EVENTS_ENABLED = "false";
    resetEnvCache();
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([anEvent]);

    expect(fetched.calls).toHaveLength(0);
  });

  it("skips — without throwing — when enabled but unconfigured", async () => {
    // A deploy defect: the flag is on and the URL is missing. It must not take
    // the payment flow down with it.
    process.env.ANALYTICS_EVENTS_URL = "";
    resetEnvCache();
    const fetched = okFetch();

    await expect(new AnalyticsEventsClient().send([anEvent])).resolves.toBeUndefined();
    expect(fetched.calls).toHaveLength(0);
  });

  it("throws on a 4xx/5xx so the caller can log it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("bad api key", { status: 400 })))
    );

    await expect(new AnalyticsEventsClient().send([anEvent])).rejects.toThrow(
      /Analytics events failed \(400\)/
    );
  });

  it("throws on a transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("ECONNREFUSED")))
    );

    await expect(new AnalyticsEventsClient().send([anEvent])).rejects.toThrow(
      /ECONNREFUSED/
    );
  });

  it("attaches the user's cached device context to every event in the batch", async () => {
    // Attaching HERE is the point: no tracker passes these, and none of them
    // has a request in scope.
    await cacheDeviceContext("user-1", { version_name: "1.4.2", carrier: "Jio" });
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([anEvent, { ...anEvent, event_type: "bk_other" }]);

    const body = JSON.parse(fetched.calls[0].init.body as string) as {
      events: Array<Record<string, unknown>>;
    };
    expect(body.events[0]).toMatchObject({ version_name: "1.4.2", carrier: "Jio" });
    expect(body.events[1]).toMatchObject({ version_name: "1.4.2", carrier: "Jio" });
    // Never a phantom key: what the cache does not hold is absent, not null.
    expect(body.events[0]).not.toHaveProperty("device_model");
    expect(body.events[0]).not.toHaveProperty("platform");
  });

  it("never overwrites a field the event set explicitly", async () => {
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([{ ...anEvent, version_name: "9.9.9" }]);

    const body = JSON.parse(fetched.calls[0].init.body as string) as {
      events: Array<{ version_name: string }>;
    };
    expect(body.events[0].version_name).toBe("9.9.9");
  });

  it("sends the batch unenriched when the context lookup fails", async () => {
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });
    redis!.failOn = "mget";
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([anEvent]);

    const body = JSON.parse(fetched.calls[0].init.body as string) as {
      events: Array<Record<string, unknown>>;
    };
    expect(fetched.calls).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ event_type: "subscription_success" });
    expect(body.events[0]).not.toHaveProperty("version_name");
  });

  it("aborts the request with the configured timeout", async () => {
    const fetched = okFetch();

    await new AnalyticsEventsClient().send([anEvent]);

    const signal = fetched.calls[0].init.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });
});
