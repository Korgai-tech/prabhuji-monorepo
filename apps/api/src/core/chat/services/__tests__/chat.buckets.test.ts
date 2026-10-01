import { describe, expect, test } from "vitest";

import {
  __CHAT_BUCKETS_FOR_TEST as BUCKETS,
  chatBucketFor,
  resolveChatVariant,
} from "../chat.buckets.js";
import { VARIANT_AGENTS } from "../chat.constants.js";

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

  // An arm naming a variant with no agent behaves exactly as control, which is
  // a silent 25% loss of the experiment rather than an error anywhere.
  test("every named arm resolves to a real agent", () => {
    for (const [, , variant] of BUCKETS) {
      if (variant === null) continue;
      expect(VARIANT_AGENTS[variant], `${variant} has no agent`).toBeDefined();
    }
  });

  test("keeps exactly one control arm", () => {
    expect(BUCKETS.filter(([, , v]) => v === null)).toHaveLength(1);
  });
});

describe("chatBucketFor", () => {
  test("is stable for the same id", () => {
    expect(chatBucketFor("user-1")).toBe(chatBucketFor("user-1"));
  });

  test("stays inside 0–99 across many ids", () => {
    for (let i = 0; i < 500; i++) {
      const b = chatBucketFor(`u-${i}`);
      expect(b).not.toBeNull();
      expect(b!).toBeGreaterThanOrEqual(0);
      expect(b!).toBeLessThanOrEqual(99);
    }
  });

  test("has no id to bucket on when the id is empty or blank", () => {
    expect(chatBucketFor("")).toBeNull();
    expect(chatBucketFor("   ")).toBeNull();
    expect(chatBucketFor(null)).toBeNull();
    expect(chatBucketFor(undefined)).toBeNull();
  });
});

describe("resolveChatVariant", () => {
  test("falls to control rather than throwing when there is no id", () => {
    expect(resolveChatVariant(null)).toBeNull();
    expect(resolveChatVariant("")).toBeNull();
  });

  // Not a statistics test — a rough check that the hash spreads. A skew this
  // wide would mean the arms are not comparable, which no downstream analysis
  // would reveal.
  test("splits roughly evenly across the four arms", () => {
    const counts = new Map<string, number>();
    const N = 8000;
    for (let i = 0; i < N; i++) {
      const key = resolveChatVariant(`00000000-0000-7000-8000-${String(i).padStart(12, "0")}`) ?? "control";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(BUCKETS.length);
    for (const [arm, n] of counts) {
      const pct = (100 * n) / N;
      expect(pct, `${arm} at ${pct.toFixed(1)}%`).toBeGreaterThan(20);
      expect(pct, `${arm} at ${pct.toFixed(1)}%`).toBeLessThan(30);
    }
  });
});
