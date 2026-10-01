// HTTP round trip via fastify's inject (no sockets, no Docker): the real
// server assembled by buildServer, the sink replaced by a spy repository.
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { EventsRepository, StoredEvent } from "../core/events/repositories/events.repository";
import { EventsService } from "../core/events/services/events.service";
import { buildServer } from "../server";

const API_KEY = "round-trip-test-api-key";

const stored: StoredEvent[] = [];
const repository: EventsRepository = {
  addMany: (events) => stored.push(...events),
  flush: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

const app: FastifyInstance = buildServer({
  service: new EventsService(repository),
  apiKey: API_KEY,
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  stored.length = 0;
});

function analyticsEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_type: "chat_room_entered",
    user_id: "user-42",
    insert_id: "e-1",
    time: 1_750_000_000_000,
    session_id: 1_750_000_000_000,
    event_properties: { room_id: "room-7" },
    user_properties: { plan: "premium" },
    groups: { workspace: "62646" },
    os_version: "14",
    ...overrides,
  };
}

interface V2Response {
  code: number;
  error?: string;
  events_ingested?: number;
  payload_size_bytes?: number;
  server_upload_time?: number;
}

function post(payload: unknown) {
  return app.inject({ method: "POST", url: "/2/httpapi", payload: payload as object });
}

describe("events HTTP round trip (Amplitude V2)", () => {
  it("serves unauthenticated health checks", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>()).toEqual({ status: "ok" });
  });

  it("rejects a wrong api_key with a V2-shaped 400", async () => {
    const res = await post({ api_key: "wrong-key-wrong-key", events: [analyticsEvent()] });
    expect(res.statusCode).toBe(400);
    expect(res.json<V2Response>()).toEqual({ code: 400, error: "Invalid API key" });
    expect(stored).toHaveLength(0);
  });

  it("rejects a malformed payload", async () => {
    const res = await post({ events: [analyticsEvent()] }); // no api_key
    expect(res.statusCode).toBe(400);
    expect(res.json<V2Response>().code).toBe(400);
  });

  it("ingests a valid batch and reports events_ingested", async () => {
    const res = await post({
      api_key: API_KEY,
      events: [analyticsEvent(), analyticsEvent({ insert_id: "e-2", user_id: undefined, device_id: "device-abc" })],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<V2Response>();
    expect(body.code).toBe(200);
    expect(body.events_ingested).toBe(2);
    expect(body.server_upload_time).toBeGreaterThan(0);
    expect(stored.map((e) => e.eventId)).toEqual(["e-1", "e-2"]);
    expect(stored[0].receivedAtMs).toBeGreaterThan(0);
    expect(stored[0].reqGuid).not.toBe("");
    // scopes arrive separated
    expect(stored[0].eventProperties).toEqual({ room_id: "room-7" });
    expect(stored[0].userProperties).toEqual({ plan: "premium" });
    expect(stored[0].groups).toEqual({ workspace: "62646" });
    expect(stored[0].context.osVersion).toBe("14");
  });

  it("skips $identify (kept at 200, never ingested — no downstream consumer)", async () => {
    const res = await post({
      api_key: API_KEY,
      events: [
        analyticsEvent({
          event_type: "$identify",
          insert_id: "id-1",
          event_properties: undefined,
          user_properties: { $set: { plan: "premium" } },
        }),
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<V2Response>().events_ingested).toBe(0);
    expect(stored).toHaveLength(0);
  });

  it("stamps the batch client_upload_time (ISO) onto every event as epoch ms", async () => {
    const res = await post({
      api_key: API_KEY,
      client_upload_time: "2026-07-10T13:21:17.049Z",
      events: [analyticsEvent(), analyticsEvent({ insert_id: "e-2" })],
    });
    expect(res.statusCode).toBe(200);
    const expected = Date.parse("2026-07-10T13:21:17.049Z");
    expect(stored).toHaveLength(2);
    expect(stored[0].clientUploadTimeMs).toBe(expected);
    expect(stored[1].clientUploadTimeMs).toBe(expected);
  });

  it("skips identity-less/garbage events but still returns 200 (no SDK queue poisoning)", async () => {
    const res = await post({
      api_key: API_KEY,
      events: [
        analyticsEvent(),
        { event_type: "app_background" }, // no user_id/device_id/pseudo_id -> skipped
        "garbage",
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<V2Response>().events_ingested).toBe(1);
    expect(stored).toHaveLength(1);
  });

  it("returns 200 with zero ingested when no event in the batch has an identity", async () => {
    const res = await post({
      api_key: API_KEY,
      events: [{ event_type: "session_start" }], // no identity
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<V2Response>().events_ingested).toBe(0);
    expect(stored).toHaveLength(0);
  });
});

describe("forwarding (ANALYTICS_EVENTS_URL)", () => {
  const DESTINATION = "https://api-monorepo-common-staging.krutyug.ai/events/2/httpapi";

  const forwardingApp = (over: Record<string, unknown> = {}): FastifyInstance =>
    buildServer({
      service: new EventsService({
        addMany: () => {},
        flush: () => Promise.resolve(),
        close: () => Promise.resolve(),
      }),
      apiKey: API_KEY,
      forwardUrl: DESTINATION,
      forwardApiKey: "destination-key",
      ...over,
    });

  const batch = {
    api_key: API_KEY,
    events: [{ event_type: "app_opened", user_id: "2123059", insert_id: "fwd-1" }],
  };

  /** Records every fetch and answers with `respond()`. `restore` puts back the real one. */
  const stubFetch = (
    respond: () => Promise<Response>
  ): { calls: Array<{ url: string; init: RequestInit }>; restore: () => void } => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond();
    }) as unknown as typeof fetch;
    return { calls, restore: () => (globalThis.fetch = original) };
  };

  const ok = (): Promise<Response> => Promise.resolve(new Response("{}", { status: 200 }));

  it("mirrors the batch with the DESTINATION's key and the tenant header", async () => {
    const fetched = stubFetch(ok);
    const app = forwardingApp();

    const res = await app.inject({ method: "POST", url: "/2/httpapi", payload: batch });

    fetched.restore();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(fetched.calls).toHaveLength(1);
    expect(fetched.calls[0].url).toBe(DESTINATION);
    // The destination routes on x-tenant-id — dropping it is a silent misroute.
    expect(fetched.calls[0].init.headers).toMatchObject({
      "content-type": "application/json",
      "x-tenant-id": "prabhuji",
    });
    const sent = JSON.parse(fetched.calls[0].init.body as string) as Record<string, unknown>;
    // OUR key must never leave: it is baked into every released APK.
    expect(sent.api_key).toBe("destination-key");
    expect(sent.events).toHaveLength(1);
  });

  it("still returns 200 when the destination is unreachable", async () => {
    const fetched = stubFetch(() => Promise.reject(new Error("destination down")));
    const app = forwardingApp();

    const res = await app.inject({ method: "POST", url: "/2/httpapi", payload: batch });

    fetched.restore();
    await app.close();

    // A 4xx/5xx here would poison the SDK's retry queue, exactly as a Kinesis
    // outage must not.
    expect(res.statusCode).toBe(200);
    expect(fetched.calls).toHaveLength(1);
  });

  it("still returns 200 when the destination REJECTS the batch", async () => {
    // The wrong-key case: every batch 400s at the destination and, with the
    // Kinesis sink off, every event is lost. The SDK must not be told.
    const fetched = stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 400, error: "Invalid API key" }), { status: 400 })
      )
    );
    const app = forwardingApp();

    const res = await app.inject({ method: "POST", url: "/2/httpapi", payload: batch });

    fetched.restore();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(fetched.calls).toHaveLength(1);
  });

  it("forwards nothing when only one half is configured", async () => {
    // env.ts refuses to boot in this state; the handler guards it anyway so a
    // batch can never go out carrying our own api_key.
    const fetched = stubFetch(ok);
    const app = forwardingApp({ forwardApiKey: undefined });

    const res = await app.inject({ method: "POST", url: "/2/httpapi", payload: batch });

    fetched.restore();
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(fetched.calls).toHaveLength(0);
  });

  it("forwards nothing when no destination is configured", async () => {
    const fetched = stubFetch(ok);
    const app = forwardingApp({ forwardUrl: undefined });

    await app.inject({ method: "POST", url: "/2/httpapi", payload: batch });

    fetched.restore();
    await app.close();

    expect(fetched.calls).toHaveLength(0);
  });
});
