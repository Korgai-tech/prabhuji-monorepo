import { describe, expect, it, vi } from "vitest";

import type { EventsRepository, StoredEvent } from "../repositories/events.repository";
import { EventsService } from "../services/events.service";

function spyRepository(): EventsRepository & { stored: StoredEvent[] } {
  const stored: StoredEvent[] = [];
  return {
    stored,
    addMany: (events) => stored.push(...events),
    flush: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
}

function analyticsEvent(id: string) {
  return {
    eventId: id,
    eventName: "chat_room_entered",
    userId: "2123059",
    deviceId: "",
    pseudoId: "",
    sessionId: 1_750_000_000_000,
    eventSeqId: 0,
    clientTsMs: 1_750_000_000_000,
    clientUploadTimeMs: 0,
    eventProperties: { room_id: "room-7" },
    userProperties: { plan: "premium" },
    groups: {},
    groupProperties: {},
    context: {
      platform: "",
      osName: "",
      osVersion: "",
      appVersion: "",
      deviceBrand: "",
      deviceModel: "",
      deviceManufacturer: "",
      carrier: "",
      country: "",
      language: "",
      library: "",
      ip: "",
      adid: "",
    },
    attempts: 0,
    retryCount: 0,
  };
}

describe("EventsService", () => {
  it("stamps reqGuid + receivedAtMs and forwards to the repository", () => {
    const repo = spyRepository();
    const service = new EventsService(repo);
    const before = Date.now();

    const accepted = service.ingest([analyticsEvent("e-1"), analyticsEvent("e-2")], "req-1");

    expect(accepted).toBe(2);
    expect(repo.stored).toHaveLength(2);
    expect(repo.stored[0].eventId).toBe("e-1");
    expect(repo.stored[0].reqGuid).toBe("req-1");
    expect(repo.stored[0].receivedAtMs).toBeGreaterThanOrEqual(before);
    // unique + batch-order-preserving: warehouse op-ordering depends on it
    expect(repo.stored[1].receivedAtMs).toBe(repo.stored[0].receivedAtMs + 1);
  });

  it("does not touch the repository for an empty batch", () => {
    const repo = spyRepository();
    const service = new EventsService(repo);
    expect(service.ingest([], "req-2")).toBe(0);
    expect(repo.stored).toHaveLength(0);
  });
});
