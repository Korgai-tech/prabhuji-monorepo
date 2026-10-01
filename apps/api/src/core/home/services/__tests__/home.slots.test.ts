import { describe, expect, it } from "vitest";
import { weave } from "@api/shared/rotation";
import {
  HOME_FEED_SLOTS,
  HOME_OTHER_CONTENT_TYPES,
  HOME_POOL,
} from "@api/core/home/services/home.slots";

/** TAM-175 — the home feed's 10-slot map, asserted against the spec's table. */

describe("HOME_FEED_SLOTS", () => {
  it("covers slots 1..10", () => {
    expect(HOME_FEED_SLOTS.slots).toHaveLength(10);
  });

  it("matches the spec: statusMain 1,2,5,8 · statusSecond 3,6 · otherMain 4,7,9 · any 10", () => {
    const at = (slot: number) => HOME_FEED_SLOTS.slots[slot - 1];
    for (const slot of [1, 2, 5, 8]) expect(at(slot)).toBe(HOME_POOL.STATUS_MAIN);
    for (const slot of [3, 6]) expect(at(slot)).toBe(HOME_POOL.STATUS_SECOND);
    for (const slot of [4, 7, 9]) expect(at(slot)).toBe(HOME_POOL.OTHER_MAIN);
    expect(at(10)).toBe(HOME_POOL.ANY);
  });

  it("treats every non-status content type as an 'other module'", () => {
    expect([...HOME_OTHER_CONTENT_TYPES].sort()).toEqual(
      ["aarti", "mantra", "ringtone", "wallpaper"].sort()
    );
    expect(HOME_OTHER_CONTENT_TYPES).not.toContain("status");
  });

  it("lays a full catalogue out exactly as the spec's table", () => {
    const sm = ["sm1", "sm2", "sm3", "sm4", "sm5"];
    const ss = ["ss1", "ss2", "ss3"];
    const om = ["om1", "om2", "om3", "om4"];
    const any = [...sm, ...ss, ...om, "x1", "x2", "x3"];

    const out = weave(
      HOME_FEED_SLOTS,
      new Map<string, readonly string[]>([
        [HOME_POOL.STATUS_MAIN, sm],
        [HOME_POOL.STATUS_SECOND, ss],
        [HOME_POOL.OTHER_MAIN, om],
        [HOME_POOL.ANY, any],
      ])
    );

    expect(out.slice(0, 10)).toEqual([
      "sm1", "sm2",          // 1, 2  status main
      "ss1",                 // 3     status second
      "om1",                 // 4     other, main god
      "sm3",                 // 5     status main
      "ss2",                 // 6     status second
      "om2",                 // 7     other, main god
      "sm4",                 // 8     status main
      "om3",                 // 9     other, main god
      // Slot 10 is "any", which is the WHOLE catalogue in its own order — so it
      // serves `sm5`, the first id there that nothing has taken. It is not
      // "an item outside the deity pools"; `any` deliberately includes them.
      "sm5",                 // 10    any
    ]);
  });

  it("gives a user with no preference the plain interleaved rotation", () => {
    const rotation = Array.from({ length: 25 }, (_, i) => `r${i + 1}`);
    const out = weave(
      HOME_FEED_SLOTS,
      new Map<string, readonly string[]>([[HOME_POOL.ANY, rotation]])
    );
    expect(out).toEqual(rotation);
  });

  it("never leaves a slot empty when only the main god has content", () => {
    const sm = ["sm1", "sm2"];
    const any = [...sm, "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9"];
    const out = weave(
      HOME_FEED_SLOTS,
      new Map<string, readonly string[]>([
        [HOME_POOL.STATUS_MAIN, sm],
        [HOME_POOL.STATUS_SECOND, []],
        [HOME_POOL.OTHER_MAIN, []],
        [HOME_POOL.ANY, any],
      ])
    );
    expect(out.slice(0, 10)).toHaveLength(10);
    expect(out.slice(0, 10).every((id) => id !== undefined)).toBe(true);
    expect(new Set(out).size).toBe(out.length);
  });
});
