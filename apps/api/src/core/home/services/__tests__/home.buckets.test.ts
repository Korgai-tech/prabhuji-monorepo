import { describe, expect, test } from "vitest";

import {
  __HOME_GRID_BUCKETS_FOR_TEST as BUCKETS,
  HOME_GRID_VARIANT_GRADIENT,
  homeGridBucketFor,
  resolveHomeGridVariant,
} from "../home.buckets.js";
import { chatBucketFor } from "../../../chat/services/chat.buckets.js";

/**
 * The map invariants. A gap silently drops users into control and an overlap
 * makes the lookup order-dependent — both invisible in production, which is
 * why these are tests rather than a comment asking you to be careful.
 */
describe("bucket map", () => {
  test("covers 0–99 exactly once", () => {
    const seen = new Array<number>(100).fill(0);
    for (const [low, high] of BUCKETS) {
      for (let i = low; i <= high; i++) seen[i] = (seen[i] ?? 0) + 1;
    }
    expect(seen.filter((n) => n === 0)).toHaveLength(0);
    expect(seen.filter((n) => n > 1)).toHaveLength(0);
  });

  test("keeps exactly one control arm", () => {
    expect(BUCKETS.filter(([, , v]) => v === null)).toHaveLength(1);
  });

  test("is a 50/50 split — the product decision, asserted so a nudge is visible", () => {
    const width = ([low, high]: readonly [number, number, string | null]): number =>
      high - low + 1;
    const control = BUCKETS.filter(([, , v]) => v === null).reduce((n, b) => n + width(b), 0);
    const gradient = BUCKETS.filter(([, , v]) => v !== null).reduce((n, b) => n + width(b), 0);
    expect(control).toBe(50);
    expect(gradient).toBe(50);
  });
});

describe("homeGridBucketFor", () => {
  test("is stable for the same id", () => {
    expect(homeGridBucketFor("user-1")).toBe(homeGridBucketFor("user-1"));
  });

  test("stays inside 0–99 across many ids", () => {
    for (let i = 0; i < 500; i++) {
      const b = homeGridBucketFor(`u-${i}`);
      expect(b).not.toBeNull();
      expect(b!).toBeGreaterThanOrEqual(0);
      expect(b!).toBeLessThanOrEqual(99);
    }
  });

  test("has no id to bucket on when the id is empty or blank", () => {
    expect(homeGridBucketFor("")).toBeNull();
    expect(homeGridBucketFor("   ")).toBeNull();
    expect(homeGridBucketFor(null)).toBeNull();
    expect(homeGridBucketFor(undefined)).toBeNull();
  });

  /**
   * A GOLDEN, and the most important test in this file.
   *
   * Stickiness is the one promise this experiment makes to a user: the grid
   * they saw yesterday is the grid they see today. Nothing enforces it at
   * runtime — it holds only while the salt, the hash and the derivation all
   * stay put. Any of those changing silently re-randomises every live user
   * mid-experiment and voids the result, with no error anywhere.
   *
   * So these values are pinned. If this test fails, the question is not "what
   * are the new numbers" — it is whether you meant to re-bucket the world.
   */
  test("pins the derivation — a change here re-buckets every live user", () => {
    expect(homeGridBucketFor("019f5f4c-793c-7358-aec3-f7941d852db6")).toBe(57);
    expect(homeGridBucketFor("019f5f4c-793c-7358-aec3-f7941d852db8")).toBe(45);
    expect(homeGridBucketFor("019f5f4c-793c-7358-aec3-f7941d852db9")).toBe(16);
    expect(homeGridBucketFor("user-1")).toBe(13);
    expect(homeGridBucketFor("user-2")).toBe(96);
  });

  /**
   * The reason this module hashes with its OWN salt rather than reusing chat's.
   *
   * Sharing a salt would align the two experiments' arms — every user in chat
   * arm A would also be in grid arm A — and neither result could then be read
   * without conditioning on the other. Nothing would look wrong; the numbers
   * would just quietly mean something else.
   */
  test("buckets independently of the chat experiment", () => {
    let agreements = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const id = `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`;
      if (homeGridBucketFor(id) === chatBucketFor(id)) agreements += 1;
    }
    // Independent 0–99 draws agree ~1% of the time. A shared salt would be 100%.
    expect(agreements / N).toBeLessThan(0.05);
  });
});

describe("resolveHomeGridVariant", () => {
  test("falls to control rather than throwing when there is no id", () => {
    expect(resolveHomeGridVariant(null)).toBeNull();
    expect(resolveHomeGridVariant("")).toBeNull();
    expect(resolveHomeGridVariant(undefined)).toBeNull();
  });

  test("resolves each arm from a known bucket", () => {
    // 57 and 96 — gradient; 45 and 16 — control. See the golden above.
    expect(resolveHomeGridVariant("019f5f4c-793c-7358-aec3-f7941d852db6")).toBe(
      HOME_GRID_VARIANT_GRADIENT
    );
    expect(resolveHomeGridVariant("user-2")).toBe(HOME_GRID_VARIANT_GRADIENT);
    expect(resolveHomeGridVariant("019f5f4c-793c-7358-aec3-f7941d852db8")).toBeNull();
    expect(resolveHomeGridVariant("019f5f4c-793c-7358-aec3-f7941d852db9")).toBeNull();
  });

  // Not a statistics test — a rough check that the hash spreads. A skew this
  // wide would mean the arms are not comparable, which no downstream analysis
  // would reveal.
  test("splits roughly evenly across the two arms", () => {
    const counts = new Map<string, number>();
    const N = 8000;
    for (let i = 0; i < N; i++) {
      const key =
        resolveHomeGridVariant(`00000000-0000-7000-8000-${String(i).padStart(12, "0")}`) ??
        "control";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(BUCKETS.length);
    for (const [arm, n] of counts) {
      const pct = (100 * n) / N;
      expect(pct, `${arm} at ${pct.toFixed(1)}%`).toBeGreaterThan(45);
      expect(pct, `${arm} at ${pct.toFixed(1)}%`).toBeLessThan(55);
    }
  });
});
