import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeRotationCursor } from "@api/shared/pagination";
import { clearPlanCache } from "../plan-cache.js";
import { rotationPage, NO_DEITY_PAIR } from "../page.js";
import { currentRefreshEpoch } from "../rotation.js";

/**
 * `rotationPage` is the seam every rotated listing shares, so the things worth
 * pinning down here are the ones a single module's tests can't see: the plan is
 * built ONCE per epoch (not per request), the epoch a client sends is clamped
 * rather than trusted, and an unreadable cursor restarts instead of throwing.
 */

const ROWS = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

function page(cursor?: string, plan = ROWS.map((r) => r.id)) {
  const buildPlan = vi.fn().mockResolvedValue(plan);
  const hydrate = vi.fn((ids: string[]) =>
    Promise.resolve(ids.map((id) => ({ id })).reverse())
  );
  return {
    buildPlan,
    hydrate,
    run: (c = cursor) => rotationPage({ key: "test", cursor: c, limit: 2, buildPlan, hydrate }),
  };
}

beforeEach(() => {
  clearPlanCache();
});

describe("rotationPage", () => {
  it("pages the plan in order, hydrating only the slice", async () => {
    const p = page();
    const first = await p.run();
    expect(first.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(p.hydrate).toHaveBeenCalledWith(["a", "b"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await p.run(first.nextCursor ?? undefined);
    expect(second.items.map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("builds the plan once per epoch, however many pages are served", async () => {
    const p = page();
    const first = await p.run();
    await p.run(first.nextCursor ?? undefined);
    expect(p.buildPlan).toHaveBeenCalledTimes(1);
  });

  it("returns a null cursor at the end of the plan and skips hydration past it", async () => {
    const p = page();
    const last = await rotationPage({
      key: "test",
      cursor: encodeRotationCursor({ epoch: currentRefreshEpoch(), offset: 10 }),
      limit: 2,
      buildPlan: p.buildPlan,
      hydrate: p.hydrate,
    });
    expect(last.items).toEqual([]);
    expect(last.nextCursor).toBeNull();
    expect(p.hydrate).not.toHaveBeenCalled();
  });

  it("clamps a client-supplied epoch instead of building a plan for it", async () => {
    const p = page();
    const forged = encodeRotationCursor({
      epoch: currentRefreshEpoch() + 5_000,
      offset: 0,
    });
    const result = await p.run(forged);
    // served from the LIVE epoch's plan, not the one the cursor asked for
    expect(result.epoch).toBe(currentRefreshEpoch());
    // TAM-175 — a surface that passes no `deities` still receives the pair
    // argument, as a pair of nulls, so its plan builder can ignore it.
    expect(p.buildPlan).toHaveBeenCalledWith(currentRefreshEpoch(), NO_DEITY_PAIR);
  });

  it("restarts on an unreadable cursor rather than throwing", async () => {
    const p = page();
    const result = await p.run("@@not-a-cursor@@");
    expect(result.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.epoch).toBe(currentRefreshEpoch());
  });

  // TAM-173 — two-plan overload: pins prepend rotation head, deduped, and the
  // cursor pages the rotation-only plan so pin churn cannot shift the offset.
  describe("with pinnedIds (TAM-173 overlay)", () => {
    it("empty pinnedIds → response byte-identical to the single-plan path", async () => {
      const buildPlan = vi.fn().mockResolvedValue(["a", "b", "c", "d", "e"]);
      const hydrate = vi.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id })))
      );
      const first = await rotationPage({
        key: "test",
        cursor: undefined,
        limit: 2,
        buildPlan,
        hydrate,
        pinnedIds: [],
      });
      expect(first.items.map((i) => i.id)).toEqual(["a", "b"]);
    });

    it("prepends pin block on page 1, then rotation ids", async () => {
      const buildPlan = vi.fn().mockResolvedValue(["a", "b", "c", "d", "e"]);
      const hydrate = vi.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id })))
      );
      const first = await rotationPage({
        key: "pin-test-1",
        cursor: undefined,
        limit: 4,
        buildPlan,
        hydrate,
        pinnedIds: ["p1", "p2"],
      });
      expect(first.items.map((i) => i.id)).toEqual(["p1", "p2", "a", "b"]);
    });

    it("dedupes a pin that also appears in the rotation catalogue", async () => {
      const buildPlan = vi.fn().mockResolvedValue(["a", "b", "c"]);
      const hydrate = vi.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id })))
      );
      const first = await rotationPage({
        key: "pin-dedupe",
        cursor: undefined,
        limit: 4,
        buildPlan,
        hydrate,
        // `b` is both a pin AND in the rotation — it should appear ONCE, at
        // the pin position, never in its rotation slot.
        pinnedIds: ["b"],
      });
      expect(first.items.map((i) => i.id)).toEqual(["b", "a", "c"]);
    });

    it("cursor pages the rotation-only plan (pin churn cannot shift the offset)", async () => {
      const buildPlan = vi.fn().mockResolvedValue(["a", "b", "c", "d", "e"]);
      const hydrate = vi.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id })))
      );
      // Page 1 WITH pins.
      const first = await rotationPage({
        key: "pin-cursor",
        cursor: undefined,
        limit: 3,
        buildPlan,
        hydrate,
        pinnedIds: ["p1"],
      });
      expect(first.items.map((i) => i.id)).toEqual(["p1", "a", "b"]);
      expect(first.nextCursor).not.toBeNull();

      // Page 2 with the same cursor — but pins were REMOVED between requests.
      const second = await rotationPage({
        key: "pin-cursor",
        cursor: first.nextCursor ?? undefined,
        limit: 3,
        buildPlan,
        hydrate,
        pinnedIds: [],
      });
      // The cursor offset is `2` (limit - pin_count = 3 - 1 = 2), so page 2
      // starts at rotation index 2 = "c". No gap, no duplicate.
      expect(second.items.map((i) => i.id)).toEqual(["c", "d", "e"]);
      expect(second.nextCursor).toBeNull();
    });

    it("cursor stable when pins CHANGE between page 1 and page 2", async () => {
      const buildPlan = vi.fn().mockResolvedValue(["a", "b", "c", "d", "e"]);
      const hydrate = vi.fn((ids: string[]) =>
        Promise.resolve(ids.map((id) => ({ id })))
      );
      const first = await rotationPage({
        key: "pin-churn",
        cursor: undefined,
        limit: 3,
        buildPlan,
        hydrate,
        pinnedIds: ["p1"],
      });
      const second = await rotationPage({
        key: "pin-churn",
        cursor: first.nextCursor ?? undefined,
        limit: 3,
        buildPlan,
        hydrate,
        // Different pins added — page 2 should still pick up at rotation
        // offset 2, so the session sees `c, d, e` (rotation) instead of a
        // gap or duplicate. Whether pins appear on page 2 or not, the
        // rotation half stays session-stable.
        pinnedIds: ["p2", "p3"],
      });
      // Page 2 is beyond page 1 — no pins appear on it. Slice starts at
      // rotation offset 2 = "c".
      expect(second.items.map((i) => i.id)).toEqual(["c", "d", "e"]);
    });
  });
});
