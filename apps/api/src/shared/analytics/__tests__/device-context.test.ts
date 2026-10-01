import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ACTOR_ID } from "../events.js";

/**
 * The per-user device/app context cache — the thing that lets a server event
 * carry `version_name`/`device_model`/… without any tracker touching a request.
 *
 * The failure behaviour is as load-bearing as the happy path: this sits in
 * front of the OTP and payment funnels, and a Redis outage must degrade to
 * "events send unenriched", never to a failed login or an unhandled rejection.
 */

/** Minimal ioredis stand-in: just the two calls `device-context` makes. */
class FakeRedis {
  readonly data = new Map<string, string>();
  failOn: "set" | "mget" | null = null;
  /** Simulates a SICK server: commands queue forever instead of refusing. */
  hang = false;
  readonly setCalls: Array<[string, string]> = [];

  set(key: string, value: string): Promise<"OK"> {
    if (this.hang) return new Promise(() => {});
    if (this.failOn === "set") return Promise.reject(new Error("redis down"));
    this.setCalls.push([key, value]);
    this.data.set(key, value);
    return Promise.resolve("OK");
  }

  mget(keys: string[]): Promise<Array<string | null>> {
    if (this.hang) return new Promise(() => {});
    if (this.failOn === "mget") return Promise.reject(new Error("redis down"));
    return Promise.resolve(keys.map((key) => this.data.get(key) ?? null));
  }
}

let redis: FakeRedis | null = null;

vi.mock("@api/shared/database", () => ({
  getRedis: () => redis,
}));

const {
  cacheDeviceContext,
  clearDeviceContextWriteCache,
  loadDeviceContexts,
  readDeviceContext,
} = await import("../device-context.js");

/** Exactly what `deviceHeaderInterceptor` sends today. */
const clientHeaders = {
  app_version: "1.4.2",
  device_model: "Pixel 7",
  device_brand: "google",
  android_version: "14",
  network_operator: "Jio",
  device_language: "hi",
};

beforeEach(() => {
  redis = new FakeRedis();
  clearDeviceContextWriteCache();
});

describe("readDeviceContext", () => {
  it("maps every client header onto its top-level event field", () => {
    expect(readDeviceContext({ ...clientHeaders, os_name: "Android", platform: "android" })).toEqual(
      {
        version_name: "1.4.2",
        device_model: "Pixel 7",
        device_brand: "google",
        os_version: "14",
        carrier: "Jio",
        language: "hi",
        os_name: "Android",
        platform: "android",
      }
    );
  });

  it("omits the fields the client does not send rather than nulling them", () => {
    // `os_name` and `platform` are absent from every real request today — the
    // interceptor never adds them. A null would become a phantom key the
    // warehouse drops at ingest, so the field must simply not exist.
    const context = readDeviceContext(clientHeaders);
    expect(context).not.toHaveProperty("os_name");
    expect(context).not.toHaveProperty("platform");
    expect(context?.version_name).toBe("1.4.2");
  });

  it("treats an empty header as unknown", () => {
    // The client sends fields it could not resolve as "" rather than omitting
    // them, so empty must be indistinguishable from absent.
    const context = readDeviceContext({ ...clientHeaders, network_operator: "  " });
    expect(context).not.toHaveProperty("carrier");
  });

  it("returns null when a request carries no device headers at all", () => {
    expect(readDeviceContext({ authorization: "Bearer x" })).toBeNull();
  });

  it("takes the first value of a repeated header and caps its length", () => {
    const context = readDeviceContext({
      app_version: ["1.0.0", "9.9.9"],
      device_model: "x".repeat(200),
    });
    expect(context?.version_name).toBe("1.0.0");
    expect(context?.device_model).toHaveLength(64);
  });
});

describe("cacheDeviceContext", () => {
  it("stores the context under the user id with a TTL", async () => {
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });

    expect(redis?.data.get("analytics:device-ctx:user-1")).toBe('{"version_name":"1.4.2"}');
  });

  it("skips a repeat write of an unchanged context", async () => {
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });
    // Changed — must reach Redis.
    await cacheDeviceContext("user-1", { version_name: "1.5.0" });

    expect(redis?.setCalls).toHaveLength(2);
  });

  it("swallows a Redis failure", async () => {
    redis!.failOn = "set";

    await expect(cacheDeviceContext("user-1", { version_name: "1.4.2" })).resolves.toBeUndefined();
  });

  it("is a no-op when Redis is disabled", async () => {
    redis = null;

    await expect(cacheDeviceContext("user-1", { version_name: "1.4.2" })).resolves.toBeUndefined();
  });

  it("gives up on a hung Redis rather than stalling the login", async () => {
    // THE login-path bound. `verifyOtp` AWAITS this write (it must land before
    // the OTP events read the cache), so a sick Redis — one that queues a
    // command forever instead of refusing it, which is ioredis' default with an
    // offline queue and 20 retries — would otherwise hold a user on the OTP
    // screen indefinitely. The 200ms ceiling is what makes the await safe.
    redis!.hang = true;

    await expect(cacheDeviceContext("user-1", { version_name: "1.4.2" })).resolves.toBeUndefined();
  });
});

describe("loadDeviceContexts", () => {
  it("reads one key per distinct user, however many events share it", async () => {
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });
    const mget = vi.spyOn(redis!, "mget");

    const contexts = await loadDeviceContexts(["user-1", "user-1", "user-1"]);

    expect(mget).toHaveBeenCalledTimes(1);
    expect(mget.mock.calls[0][0]).toEqual(["analytics:device-ctx:user-1"]);
    expect(contexts.get("user-1")).toEqual({ version_name: "1.4.2" });
  });

  it("skips synthetic producers — there is no device behind them", async () => {
    // `bk_feed_refresh_triggered` is sent as `SYSTEM_ACTOR_ID.FEED_ROTATION`;
    // looking it up would be a guaranteed miss on every refresh.
    const mget = vi.spyOn(redis!, "mget");

    const contexts = await loadDeviceContexts([SYSTEM_ACTOR_ID.FEED_ROTATION]);

    expect(mget).not.toHaveBeenCalled();
    expect(contexts.size).toBe(0);
  });

  it("returns an empty map on a Redis failure", async () => {
    await cacheDeviceContext("user-1", { version_name: "1.4.2" });
    redis!.failOn = "mget";

    await expect(loadDeviceContexts(["user-1"])).resolves.toEqual(new Map());
  });

  it("gives up on a hung Redis rather than stalling the send", async () => {
    redis!.hang = true;

    // Well under the 200ms ceiling would fail here; the point is that it
    // resolves at all.
    await expect(loadDeviceContexts(["user-1"])).resolves.toEqual(new Map());
  });

  it("ignores a stored blob that is not a context", async () => {
    redis!.data.set("analytics:device-ctx:user-1", "not json");
    redis!.data.set("analytics:device-ctx:user-2", '{"evil":"x","version_name":"1.0.0"}');

    const contexts = await loadDeviceContexts(["user-1", "user-2"]);

    expect(contexts.has("user-1")).toBe(false);
    // Only known fields survive — the blob is spread onto an outbound event.
    expect(contexts.get("user-2")).toEqual({ version_name: "1.0.0" });
  });
});
