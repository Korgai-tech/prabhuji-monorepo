import { describe, expect, it } from "vitest";

import { analyzeAmplitudeEvent, toAnalyticsEvent } from "../handlers/click-events.handler";

function amplitudeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_type: "chat_room_entered",
    user_id: "2123059",
    device_id: "device-abc123",
    pseudo_id: "pseudo-abc123",
    time: 1_750_000_000_000,
    session_id: 1_750_000_000_001,
    insert_id: "e-1",
    attempts: 0,
    event_properties: {
      room_id: "room-7",
      entry_point: "home_banner",
      free_disk: 242_286_034_944, // number — must survive as a number
    },
    user_properties: { name: "test", plan: "premium", source: "unknown" },
    groups: { workspace: "62646" },
    // auto-collected context (top-level Amplitude fields)
    platform: "Android",
    os_name: "android",
    os_version: "14",
    version_name: "337",
    device_brand: "google",
    device_model: "Pixel 7",
    device_manufacturer: "Google",
    carrier: "airtel",
    country: "IN",
    language: "English",
    library: "amplitude-flutter/4.6.0",
    ip: "10.0.0.1",
    adid: "03828fde-d4cc-42ce-9e4f-50831175a668",
    ...overrides,
  };
}

describe("toAnalyticsEvent (Amplitude V2 -> scoped AnalyticsEvent)", () => {
  it("maps a full event, keeping the scopes separate", () => {
    const event = toAnalyticsEvent(amplitudeEvent());
    expect(event).toEqual({
      eventId: "e-1",
      eventName: "chat_room_entered",
      userId: "2123059",
      deviceId: "device-abc123",
      pseudoId: "pseudo-abc123",
      sessionId: 1_750_000_000_001,
      eventSeqId: 0,
      clientTsMs: 1_750_000_000_000,
      clientUploadTimeMs: 0,
      eventProperties: {
        room_id: "room-7",
        entry_point: "home_banner",
        free_disk: 242_286_034_944, // number preserved
      },
      userProperties: { name: "test", plan: "premium", source: "unknown" },
      groups: { workspace: "62646" },
      groupProperties: {},
      context: {
        platform: "Android",
        osName: "android",
        osVersion: "14",
        appVersion: "337",
        deviceBrand: "google",
        deviceModel: "Pixel 7",
        deviceManufacturer: "Google",
        carrier: "airtel",
        country: "IN",
        language: "English",
        library: "amplitude-flutter/4.6.0",
        ip: "10.0.0.1",
        adid: "03828fde-d4cc-42ce-9e4f-50831175a668",
      },
      attempts: 0,
      retryCount: 0,
    });
  });

  it("maps Amplitude event_id to eventSeqId (0 when absent)", () => {
    expect(toAnalyticsEvent(amplitudeEvent({ event_id: 42 }))?.eventSeqId).toBe(42);
    expect(toAnalyticsEvent(amplitudeEvent())?.eventSeqId).toBe(0);
  });

  it("skips $identify (no downstream consumer; would pollute the events table)", () => {
    const event = toAnalyticsEvent(
      amplitudeEvent({
        event_type: "$identify",
        event_properties: undefined,
        user_properties: { $set: { plan: "premium" }, $setOnce: { source: "cpc" } },
      })
    );
    expect(event).toBeNull();
  });

  it("prefers user_id; falls back to event_properties.player_id transitionally", () => {
    const viaPlayerId = toAnalyticsEvent(
      amplitudeEvent({ user_id: undefined, event_properties: { player_id: "2123059" } })
    );
    expect(viaPlayerId?.userId).toBe("2123059");
    expect(viaPlayerId?.eventProperties).toEqual({ player_id: "2123059" }); // kept in the bag

    const anon = toAnalyticsEvent(amplitudeEvent({ user_id: undefined, event_properties: {} }));
    expect(anon?.userId).toBe("");
    expect(anon?.deviceId).toBe("device-abc123");
  });

  it("does not promote a player_id shorter than Amplitude's 5-char minimum", () => {
    const event = toAnalyticsEvent(
      amplitudeEvent({ user_id: undefined, event_properties: { player_id: "0" } })
    );
    expect(event?.userId).toBe(""); // stays anonymous (deviceId identifies)
    expect(event?.deviceId).toBe("device-abc123");
  });

  it("drops property keys containing quotes/backslashes/control chars (JSON poison guard)", () => {
    const event = toAnalyticsEvent(
      amplitudeEvent({
        event_properties: { good: 1, 'bad"key': 2, "bad\\key": 3, "bad\nkey": 4 },
        user_properties: { plan: "premium", 'evil"': "x" },
        groups: { workspace: "62646", 'w"s': "y" },
      })
    );
    expect(event?.eventProperties).toEqual({ good: 1 });
    expect(event?.userProperties).toEqual({ plan: "premium" });
    expect(event?.groups).toEqual({ workspace: "62646" });
  });

  it("caps groupProperties like the other bags", () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 150; i++) big[`k${i}`] = i;
    const event = toAnalyticsEvent(amplitudeEvent({ group_properties: big }));
    expect(Object.keys(event?.groupProperties ?? {})).toHaveLength(100);
  });

  it("rejects out-of-range delivery counters (UInt16 warehouse bound)", () => {
    expect(toAnalyticsEvent(amplitudeEvent({ attempts: -1 }))).toBeNull();
    expect(toAnalyticsEvent(amplitudeEvent({ retry_count: 70000 }))).toBeNull();
  });

  it("rejects events with no identity at all", () => {
    expect(
      toAnalyticsEvent(
        amplitudeEvent({
          user_id: undefined,
          device_id: undefined,
          pseudo_id: undefined,
          event_properties: {},
        })
      )
    ).toBeNull();
  });

  it("clamps identity fields below Amplitude's 5-char minimum to empty (per-field, not per-event)", () => {
    // user_id "u-1" is too short AND no device_id / pseudo_id → no identity → null.
    expect(
      toAnalyticsEvent(
        amplitudeEvent({ user_id: "u-1", device_id: undefined, pseudo_id: undefined })
      )
    ).toBeNull();
    // A too-short pseudo_id NO LONGER kills the event when another identity is
    // valid — it's simply clamped to "". Under the old (Zod min-5) rule this
    // whole event was dropped even though user_id + device_id were fine, which
    // is exactly the bug the schema change fixes (pre-login events with a real
    // device_id but a stray short/null identity field were silently discarded).
    const clamped = toAnalyticsEvent(amplitudeEvent({ pseudo_id: "x" }));
    expect(clamped?.userId).toBe("2123059");
    expect(clamped?.deviceId).toBe("device-abc123");
    expect(clamped?.pseudoId).toBe("");
  });

  it("stringifies non-string group values", () => {
    const event = toAnalyticsEvent(amplitudeEvent({ groups: { workspace: 62646, orgs: ["a", "b"] } }));
    expect(event?.groups).toEqual({ workspace: "62646", orgs: '["a","b"]' });
  });

  it("defaults absent context fields to empty strings", () => {
    const event = toAnalyticsEvent(
      amplitudeEvent({
        platform: undefined,
        carrier: undefined,
        ip: undefined,
      })
    );
    expect(event?.context.platform).toBe("");
    expect(event?.context.carrier).toBe("");
  });

  it("generates an eventId when insert_id is absent and defaults time/session", () => {
    const event = toAnalyticsEvent(
      amplitudeEvent({ insert_id: undefined, time: undefined, session_id: undefined })
    );
    expect(event?.eventId).toMatch(/[0-9a-f-]{36}/);
    expect(event?.clientTsMs).toBeGreaterThan(0);
    expect(event?.sessionId).toBe(-1);
  });

  it("accepts `timestamp` as an alias for `time`", () => {
    const event = toAnalyticsEvent(amplitudeEvent({ time: undefined, timestamp: 1_783_346_810_070 }));
    expect(event?.clientTsMs).toBe(1_783_346_810_070);
  });

  it("captures client delivery diagnostics; defaults the counters", () => {
    const withDiag = toAnalyticsEvent(amplitudeEvent({ attempts: 2, retry_count: 1 }));
    expect(withDiag?.attempts).toBe(2);
    expect(withDiag?.retryCount).toBe(1);

    const without = toAnalyticsEvent(amplitudeEvent({ attempts: undefined, retry_count: undefined }));
    expect(without?.attempts).toBe(0);
    expect(without?.retryCount).toBe(0);
  });

  it("rejects garbage", () => {
    expect(toAnalyticsEvent("not-an-object")).toBeNull();
    expect(toAnalyticsEvent(null)).toBeNull();
    expect(toAnalyticsEvent({})).toBeNull();
  });

  // Regression: amplitude_flutter serialises un-set fields as explicit JSON
  // `null` rather than stripping them; Zod v4 `.optional()` (== `T | undefined`)
  // would reject ANY null and kill the whole event. The schema uses `.nullish()`
  // so pre-login events with `user_id: null` (and any other null'd optional)
  // still ingest via device_id.
  it("survives explicit null on every optional field when device_id identifies", () => {
    const event = toAnalyticsEvent({
      event_type: "app_opened",
      device_id: "device-abc123",
      user_id: null,
      pseudo_id: null,
      time: null,
      timestamp: null,
      session_id: null,
      insert_id: null,
      event_id: null,
      platform: null,
      os_name: null,
      os_version: null,
      version_name: null,
      device_brand: null,
      device_model: null,
      device_manufacturer: null,
      carrier: null,
      country: null,
      language: null,
      library: null,
      ip: null,
      adid: null,
      attempts: null,
      retry_count: null,
      event_properties: null,
      user_properties: null,
      groups: null,
      group_properties: null,
    });
    expect(event).not.toBeNull();
    expect(event?.deviceId).toBe("device-abc123");
    expect(event?.userId).toBe("");
    expect(event?.pseudoId).toBe("");
  });
});

describe("analyzeAmplitudeEvent (per-event skip reason for evt-trace logging)", () => {
  it("returns skipReason='schema-fail' with the raw identity + zodIssues on parse failure", () => {
    const result = analyzeAmplitudeEvent({
      // event_type missing → schema fails at the boundary
      device_id: "device-abc123",
      event_properties: { player_id: "2123059" },
      insert_id: "e-1",
    });
    expect(result.event).toBeNull();
    expect(result.skipReason).toBe("schema-fail");
    expect(result.zodIssues?.length ?? 0).toBeGreaterThan(0);
    expect(result.rawIdentity).toEqual({
      user_id: undefined,
      device_id: "device-abc123",
      pseudo_id: undefined,
      player_id: "2123059",
      event_type: undefined,
      insert_id: "e-1",
    });
  });

  it("returns skipReason='identify' for $identify events (no downstream consumer)", () => {
    const result = analyzeAmplitudeEvent({
      event_type: "$identify",
      user_id: "2123059",
      user_properties: { $set: { plan: "premium" } },
    });
    expect(result.event).toBeNull();
    expect(result.skipReason).toBe("identify");
  });

  it("returns skipReason='no-identity' with the raw identity when every identity clamps to empty", () => {
    const result = analyzeAmplitudeEvent({
      event_type: "app_opened",
      user_id: "u-1", // too short → clamped
      device_id: null,
      pseudo_id: "",
    });
    expect(result.event).toBeNull();
    expect(result.skipReason).toBe("no-identity");
    expect(result.rawIdentity).toEqual({
      user_id: "u-1",
      device_id: null,
      pseudo_id: "",
      player_id: undefined,
      event_type: "app_opened",
      insert_id: undefined,
    });
  });

  it("returns event + no skipReason on the happy path", () => {
    const result = analyzeAmplitudeEvent({
      event_type: "app_opened",
      device_id: "device-abc123",
    });
    expect(result.skipReason).toBeUndefined();
    expect(result.event?.deviceId).toBe("device-abc123");
  });
});
