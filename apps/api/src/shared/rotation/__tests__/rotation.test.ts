import { describe, expect, it } from "vitest";
import {
  currentRefreshEpoch,
  epochStartIso,
  epochStartMs,
  interleaveByType,
  orderByPlan,
  refreshEpochOf,
  rotate,
  NEW_BOOST_CYCLES,
  NEW_BOOST_MAX,
  REFRESH_INTERVAL_MS,
  type RotationCandidate,
} from "../rotation.js";

/** A frozen 100-item catalogue: no engagement, all published long ago. */
function catalogue(size = 100, epoch = 40_000): RotationCandidate[] {
  // `epochStartMs` is the real inverse of `refreshEpochOf`. Deriving the
  // timestamp as `epoch * REFRESH_INTERVAL_MS` instead only round-trips while
  // the IST offset is smaller than one interval — false at the shipped 2h
  // (offset 5h30m) and at any shortened test interval.
  const oldEnough = epochStartMs(epoch) - 365 * 24 * 60 * 60 * 1000;
  return Array.from({ length: size }, (_, i) => ({
    id: `item-${String(i).padStart(3, "0")}`,
    createdAtMs: oldEnough,
    score: 0,
  }));
}

const EPOCH = 40_000;

describe("refresh epoch", () => {
  it("ticks over at midnight IST and every interval after", () => {
    // 2026-08-04T00:00:00+05:30 === 2026-08-03T18:30:00Z. Midnight IST is a
    // boundary for any interval that divides 24h, so this holds at the shipped
    // 2h setting and at a shortened test interval alike.
    const midnightIst = Date.parse("2026-08-03T18:30:00.000Z");
    expect(refreshEpochOf(midnightIst - 1)).toBe(refreshEpochOf(midnightIst) - 1);
    expect(refreshEpochOf(midnightIst)).toBe(refreshEpochOf(midnightIst + 1));
    // one interval later is the next epoch
    expect(refreshEpochOf(midnightIst + REFRESH_INTERVAL_MS)).toBe(
      refreshEpochOf(midnightIst) + 1
    );
    expect(epochStartIso(refreshEpochOf(midnightIst))).toBe("2026-08-03T18:30:00.000Z");
    expect(currentRefreshEpoch(new Date(midnightIst))).toBe(refreshEpochOf(midnightIst));
  });
});

describe("rotate", () => {
  it("is deterministic — same inputs, same order on any instance", () => {
    const a = rotate(catalogue(), EPOCH);
    const b = rotate([...catalogue()].reverse(), EPOCH);
    expect(a).toEqual(b);
  });

  it("shows ~65% of the catalogue and holds the rest back", () => {
    const shown = rotate(catalogue(), EPOCH);
    expect(shown).toHaveLength(65);
    expect(new Set(shown).size).toBe(65);
  });

  it("swaps ~20 items and reshuffles between consecutive refreshes", () => {
    const midnight = rotate(catalogue(), EPOCH);
    const noon = rotate(catalogue(), EPOCH + 1);
    const dropped = midnight.filter((id) => !noon.includes(id));
    expect(dropped.length).toBe(20);
    // the ones that stayed are not in the same places
    expect(noon.slice(0, 20)).not.toEqual(midnight.slice(0, 20));
  });

  it("surfaces every item within a few days of refreshes", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      for (const id of rotate(catalogue(), EPOCH + i)) seen.add(id);
    }
    expect(seen.size).toBe(100);
  });

  it("shows a small catalogue whole, only reshuffled", () => {
    const small = catalogue(12);
    const shown = rotate(small, EPOCH);
    expect(shown).toHaveLength(12);
    expect(rotate(small, EPOCH + 1)).not.toEqual(shown);
  });

  it("resurfaces high-engagement items near the top, rotating which ones", () => {
    const items = catalogue();
    // give the last 20 items a descending engagement score
    items.slice(-20).forEach((item, i) => {
      item.score = 100 - i;
    });
    const first = rotate(items, EPOCH).slice(0, 2);
    const second = rotate(items, EPOCH + 1).slice(0, 2);
    const proven = new Set(items.filter((i) => i.score > 0).map((i) => i.id));
    for (const id of [...first, ...second]) expect(proven.has(id)).toBe(true);
    expect(second).not.toEqual(first);
  });

  it("keeps the head moving when only a few items have engagement", () => {
    // The regression: `start = epoch * RESURFACE_COUNT` only reaches even
    // offsets, so an even pool alternates between fixed pairs and a pool of two
    // never moves at all — the top of a young catalogue's grid froze.
    for (const proven of [2, 4, 6]) {
      const items = catalogue();
      items.slice(-proven).forEach((item, i) => {
        item.score = 100 - i;
      });
      const heads = new Set(
        Array.from({ length: 8 }, (_, i) => rotate(items, EPOCH + i).slice(0, 2).join(","))
      );
      expect(heads.size).toBeGreaterThan(1);
    }
  });

  it("never resurfaces items with no engagement history", () => {
    const items = catalogue();
    const head = rotate(items, EPOCH).slice(0, 2);
    // with zero scores everywhere the head is just the window — a later epoch
    // must be free to move those ids, i.e. nothing is pinned.
    expect(rotate(items, EPOCH + 1).slice(0, 2)).not.toEqual(head);
  });

  it("guarantees new items a top slot, capped, for their boost window", () => {
    const items = catalogue();
    const fresh: RotationCandidate[] = [
      { id: "fresh-a", createdAtMs: epochStartMs(EPOCH), score: 0 },
      { id: "fresh-b", createdAtMs: epochStartMs(EPOCH) - 1, score: 0 },
      { id: "fresh-c", createdAtMs: epochStartMs(EPOCH) - 2, score: 0 },
    ];
    const ordered = rotate([...items, ...fresh], EPOCH);
    expect(ordered.slice(0, NEW_BOOST_MAX)).toEqual(["fresh-a", "fresh-b"]);
    // the cap holds — the third new item does not also jump the queue
    expect(ordered.indexOf("fresh-c")).toBeGreaterThanOrEqual(NEW_BOOST_MAX);

    // ...and once its boost window has passed it competes like everything else
    const later = rotate([...items, ...fresh], EPOCH + NEW_BOOST_CYCLES);
    expect(later.slice(0, NEW_BOOST_MAX)).not.toContain("fresh-a");
  });

  it("returns nothing for an empty catalogue", () => {
    expect(rotate([], EPOCH)).toEqual([]);
  });
});

describe("interleaveByType", () => {
  const byType = new Map<string, string[]>([
    ["aarti", ["a1", "a2", "a3"]],
    ["mantra", ["m1", "m2", "m3"]],
    ["ringtone", ["r1", "r2", "r3"]],
    ["status", ["s1", "s2", "s3"]],
    ["wallpaper", ["w1", "w2", "w3"]],
  ]);
  const typeOf = (id: string): string => id[0] ?? "";

  it("never puts two of a type back to back while other types have items", () => {
    const merged = interleaveByType(byType, EPOCH);
    expect(merged).toHaveLength(15);
    for (let i = 1; i < merged.length; i += 1) {
      expect(typeOf(merged[i] ?? "")).not.toBe(typeOf(merged[i - 1] ?? ""));
    }
  });

  it("rotates which type leads each block, and per epoch", () => {
    const merged = interleaveByType(byType, EPOCH);
    expect(typeOf(merged[0] ?? "")).not.toBe(typeOf(merged[5] ?? ""));
    expect(interleaveByType(byType, EPOCH + 1)[0]).not.toBe(merged[0]);
  });

  it("keeps every item and drops exhausted types from later blocks", () => {
    const lopsided = new Map<string, string[]>([
      ["aarti", ["a1"]],
      ["wallpaper", ["w1", "w2", "w3"]],
    ]);
    const merged = interleaveByType(lopsided, EPOCH);
    expect([...merged].sort()).toEqual(["a1", "w1", "w2", "w3"]);
  });

  it("handles an empty map", () => {
    expect(interleaveByType(new Map(), EPOCH)).toEqual([]);
  });
});

describe("orderByPlan", () => {
  it("restores plan order and drops rows that vanished", () => {
    const rows = [{ id: "b" }, { id: "a" }];
    expect(orderByPlan(rows, ["a", "gone", "b"])).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
