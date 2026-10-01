import { describe, expect, it } from "vitest";
import { slotsFromMap, weave, type WeaveSpec } from "@api/shared/rotation";

/**
 * TAM-175 — the slot weave.
 *
 * The behaviours worth pinning are the ones a wrong implementation still
 * produces a plausible-looking feed for: dedupe across overlapping pools,
 * fall-through when a pool runs dry, and the "no preference" path collapsing to
 * exactly the unpersonalised order.
 */

const SPEC: WeaveSpec = {
  slots: slotsFromMap({ main: [1, 2, 4], second: [3], any: [5] }),
  priority: ["main", "second", "any"],
  tail: "any",
};

function pools(entries: Record<string, readonly string[]>) {
  return new Map<string, readonly string[]>(Object.entries(entries));
}

describe("slotsFromMap", () => {
  it("lays pool keys out by slot number, slot 1 first", () => {
    expect(slotsFromMap({ main: [1, 2, 4], second: [3] })).toEqual([
      "main",
      "main",
      "second",
      "main",
    ]);
  });

  it("rejects a slot claimed by two pools", () => {
    expect(() => slotsFromMap({ main: [1, 2], second: [2] })).toThrow(
      /slot 2 claimed by both/
    );
  });

  it("rejects a gap, so a mistyped map fails the boot rather than the feed", () => {
    expect(() => slotsFromMap({ main: [1, 2], second: [4] })).toThrow(
      /slot 3 is not assigned/
    );
  });

  it("rejects a non-positive position", () => {
    expect(() => slotsFromMap({ main: [0] })).toThrow(/positive integers/);
  });
});

describe("weave", () => {
  it("fills each slot from its own pool", () => {
    const out = weave(SPEC, pools({
      main: ["m1", "m2", "m3"],
      second: ["s1", "s2"],
      any: ["m1", "m2", "m3", "s1", "s2", "a1", "a2"],
    }));
    // slots: main main second main any
    // Slot 5 is an "any" slot and "any" means EVERY item — so it serves `s2`,
    // the first id in that pool nothing has taken yet. It is not restricted to
    // items outside the deity pools, and must not be: `any` is the whole
    // catalogue, which is exactly what makes it a safe last resort.
    expect(out.slice(0, 5)).toEqual(["m1", "m2", "s1", "m3", "s2"]);
  });

  it("lets an `any` slot serve a deity item the slot map has not reached", () => {
    // The same rule, stated on its own because it is easy to 'fix' by mistake:
    // filtering the any-pool down to non-deity items would strand content and
    // break the never-empty guarantee.
    const out = weave(SPEC, pools({
      main: ["m1", "m2", "m3"],
      second: ["s1", "s2", "s3"],
      any: ["m1", "s1", "m2", "s2", "m3", "s3"],
    }));
    expect(out.slice(0, 5)).toEqual(["m1", "m2", "s1", "m3", "s2"]);
    expect(out).toContain("s3");
  });

  it("never repeats an id, even though every pool is a subset of `any`", () => {
    const out = weave(SPEC, pools({
      main: ["m1", "m2", "m3"],
      second: ["s1", "s2"],
      any: ["m1", "s1", "m2", "a1", "m3", "s2", "a2"],
    }));
    expect(new Set(out).size).toBe(out.length);
  });

  it("continues past the slot map with the tail pool, in the tail's own order", () => {
    const out = weave(SPEC, pools({
      main: ["m1", "m2", "m3"],
      second: ["s1"],
      any: ["a1", "a2", "m1", "a3", "s1", "m2", "a4", "m3"],
    }));
    // Slots take m1 m2 s1 m3 a1; the tail then continues through `any`
    // skipping everything already placed.
    expect(out).toEqual(["m1", "m2", "s1", "m3", "a1", "a2", "a3", "a4"]);
  });

  it("falls through to the next pool when a slot's own pool is spent", () => {
    // `main` has ONE item but owns three slots (1, 2, 4).
    const out = weave(SPEC, pools({
      main: ["m1"],
      second: ["s1", "s2", "s3"],
      any: ["m1", "s1", "s2", "s3", "a1", "a2"],
    }));
    // slot1 main->m1 | slot2 main spent -> second s1 | slot3 second s2
    // slot4 main spent -> second s3 | slot5 any -> a1
    expect(out.slice(0, 5)).toEqual(["m1", "s1", "s2", "s3", "a1"]);
  });

  it("falls all the way through to `any` when both deity pools are spent", () => {
    const out = weave(SPEC, pools({
      main: [],
      second: [],
      any: ["a1", "a2", "a3", "a4", "a5", "a6"],
    }));
    expect(out).toEqual(["a1", "a2", "a3", "a4", "a5", "a6"]);
  });

  it("serves EXACTLY the unpersonalised order when the user has no deity at all", () => {
    // Requirement 6, and it must hold without a special branch anywhere.
    const rotation = ["a1", "a2", "a3", "a4", "a5", "a6", "a7"];
    const noPreference = weave(SPEC, pools({ any: rotation }));
    expect(noPreference).toEqual(rotation);
  });

  it("treats an absent pool exactly like an empty one", () => {
    const withEmpty = weave(SPEC, pools({ main: [], second: [], any: ["a1", "a2"] }));
    const withAbsent = weave(SPEC, pools({ any: ["a1", "a2"] }));
    expect(withAbsent).toEqual(withEmpty);
  });

  it("returns an empty feed for an empty catalogue rather than throwing", () => {
    expect(weave(SPEC, pools({ main: [], second: [], any: [] }))).toEqual([]);
  });

  it("stops cleanly when the catalogue is smaller than the slot map", () => {
    const out = weave(SPEC, pools({ main: ["m1"], second: [], any: ["m1", "a1"] }));
    expect(out).toEqual(["m1", "a1"]);
  });

  it("is deterministic — the same inputs always give the same order", () => {
    const input = () =>
      pools({
        main: ["m1", "m2"],
        second: ["s1"],
        any: ["a1", "m1", "s1", "a2", "m2", "a3"],
      });
    expect(weave(SPEC, input())).toEqual(weave(SPEC, input()));
  });

  it("does not let a duplicate inside one pool produce a duplicate slot", () => {
    const out = weave(SPEC, pools({
      main: ["m1", "m1", "m2"],
      second: ["s1"],
      any: ["m1", "m2", "s1", "a1"],
    }));
    expect(new Set(out).size).toBe(out.length);
    expect(out.slice(0, 3)).toEqual(["m1", "m2", "s1"]);
  });
});
