import { describe, expect, it, vi } from "vitest";

import { InProcessEventBus } from "../in-process-event-bus.js";

describe("InProcessEventBus", () => {
  it("delivers a published event to a consumer's handler with name, payload, and a timestamp", async () => {
    const bus = new InProcessEventBus();
    const received: unknown[] = [];
    bus.addConsumer("notifications", (on) => {
      on("user.registered", (event) => {
        received.push(event);
      });
    });

    await bus.publish("user.registered", { userId: "u1", email: "a@b.com" });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      name: "user.registered",
      payload: { userId: "u1", email: "a@b.com" },
    });
    expect((received[0] as { occurredAtMs: number }).occurredAtMs).toBeGreaterThan(0);
  });

  it("delivers every event to every consumer independently (per-group semantics)", async () => {
    const bus = new InProcessEventBus();
    const audit = vi.fn();
    const notifications = vi.fn();
    bus.addConsumer("audit", (on) => on("user.registered", audit));
    bus.addConsumer("notifications", (on) => on("user.registered", notifications));

    await bus.publish("user.registered", { userId: "u1", email: "a@b.com" });

    expect(audit).toHaveBeenCalledOnce();
    expect(notifications).toHaveBeenCalledOnce();
  });

  it("isolates handler failures — a throwing consumer does not break others or the emitter", async () => {
    const bus = new InProcessEventBus();
    const good = vi.fn();
    bus.addConsumer("bad", (on) =>
      on("user.registered", () => {
        throw new Error("consumer blew up");
      })
    );
    bus.addConsumer("good", (on) => on("user.registered", good));

    await expect(
      bus.publish("user.registered", { userId: "u1", email: "a@b.com" })
    ).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledOnce();
  });

  it("is a no-op when nothing consumes the event", async () => {
    const bus = new InProcessEventBus();
    bus.addConsumer("noop", () => {
      /* subscribes to nothing */
    });
    await expect(
      bus.publish("user.registered", { userId: "u1", email: "a@b.com" })
    ).resolves.toBeUndefined();
  });
});
