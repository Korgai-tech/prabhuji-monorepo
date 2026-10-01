import { describe, expect, it } from "vitest";
import { weave } from "@api/shared/rotation";
import { STATUS_ALL_SLOTS, STATUS_POOL } from "@api/core/status/services/status.slots";

/**
 * TAM-175 — the status "All" tab's slot map, asserted against the product
 * spec's table rather than against the implementation.
 */

const MAIN_SLOTS = [1, 2, 3, 5, 7, 9, 11, 13, 15, 17];
const SECOND_SLOTS = [4, 10, 14, 18];
const ANY_SLOTS = [6, 8, 12, 16, 19, 20];

describe("STATUS_ALL_SLOTS", () => {
  it("covers slots 1..20", () => {
    expect(STATUS_ALL_SLOTS.slots).toHaveLength(20);
  });

  it("matches the spec's 10 main / 4 second / 6 any split", () => {
    const at = (slot: number) => STATUS_ALL_SLOTS.slots[slot - 1];
    for (const slot of MAIN_SLOTS) expect(at(slot)).toBe(STATUS_POOL.MAIN);
    for (const slot of SECOND_SLOTS) expect(at(slot)).toBe(STATUS_POOL.SECOND);
    for (const slot of ANY_SLOTS) expect(at(slot)).toBe(STATUS_POOL.ANY);
    expect(MAIN_SLOTS.length + SECOND_SLOTS.length + ANY_SLOTS.length).toBe(20);
  });

  it("places the pools exactly where the spec says when all are full", () => {
    const ids = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
    const main = ids("m", 30);
    const second = ids("s", 30);
    const any = [...ids("a", 30), ...main, ...second];

    const out = weave(
      STATUS_ALL_SLOTS,
      new Map<string, readonly string[]>([
        [STATUS_POOL.MAIN, main],
        [STATUS_POOL.SECOND, second],
        [STATUS_POOL.ANY, any],
      ])
    );

    for (const slot of MAIN_SLOTS) expect(out[slot - 1]).toMatch(/^m\d+$/);
    for (const slot of SECOND_SLOTS) expect(out[slot - 1]).toMatch(/^s\d+$/);
    for (const slot of ANY_SLOTS) expect(out[slot - 1]).toMatch(/^a\d+$/);
  });

  it("gives a user with no preference the plain rotation, in order", () => {
    const rotation = Array.from({ length: 40 }, (_, i) => `a${i + 1}`);
    const out = weave(
      STATUS_ALL_SLOTS,
      new Map<string, readonly string[]>([
        [STATUS_POOL.MAIN, []],
        [STATUS_POOL.SECOND, []],
        [STATUS_POOL.ANY, rotation],
      ])
    );
    expect(out).toEqual(rotation);
  });

  it("leaves no gap when the second god has only one status", () => {
    const main = Array.from({ length: 30 }, (_, i) => `m${i + 1}`);
    const any = [...main, "s1", ...Array.from({ length: 20 }, (_, i) => `a${i + 1}`)];
    const out = weave(
      STATUS_ALL_SLOTS,
      new Map<string, readonly string[]>([
        [STATUS_POOL.MAIN, main],
        [STATUS_POOL.SECOND, ["s1"]],
        [STATUS_POOL.ANY, any],
      ])
    );
    expect(out.slice(0, 20).every((id) => typeof id === "string")).toBe(true);
    expect(new Set(out).size).toBe(out.length);
    // Slot 4 takes the one second-god item; slots 10/14/18 fall through to main.
    expect(out[3]).toBe("s1");
    expect(out[9]).toMatch(/^m\d+$/);
  });
});
