import { describe, expect, it } from "vitest";
import {
  __BUCKETS_FOR_TEST,
  bucketFor,
  meetsMinVersion,
  phoneBucketDigits,
  resolvePaywallId,
} from "@api/core/paywall/services/paywall.buckets";


describe("BUCKETS map", () => {
  /**
   * The load-bearing test of the whole feature. A gap silently dumps those users
   * on the default paywall; an overlap makes `.find()` order-dependent, so
   * reordering the map — a change that looks cosmetic — would move live users
   * between variants. Neither is visible in production.
   */
  it("covers every bucket 0-99 exactly once", () => {
    const hits = Array.from(
      { length: 100 },
      (_, bucket) =>
        __BUCKETS_FOR_TEST.filter(([lo, hi]) => bucket >= lo && bucket <= hi).length
    );
    const notExactlyOnce = hits
      .map((count, bucket) => ({ bucket, count }))
      .filter(({ count }) => count !== 1);
    expect(notExactlyOnce).toEqual([]);
  });

  it("names a distinct paywall id per range", () => {
    const ids = __BUCKETS_FOR_TEST.map(([, , id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("phoneBucketDigits", () => {
  /**
   * The digits ARE the identity — if the same human ever produces a different
   * string here they silently move to a different paywall. Every one of these
   * formats has to collapse to the same value.
   */
  it.each([
    ["9876543210"],
    ["98765 43210"],
    ["98765-43210"],
    ["(98765)43210"],
    [" 9876543210 "],
  ])("normalizes %j to the same digits", (number) => {
    expect(phoneBucketDigits(number)).toBe("9876543210");
  });

  it.each([[null], [undefined], [""], ["-"], ["  "]])(
    "returns null for the unusable number %j",
    (number) => {
      expect(phoneBucketDigits(number)).toBeNull();
    }
  );

  it("keeps leading zeros — they are part of the number, not formatting", () => {
    expect(phoneBucketDigits("07911123456")).toBe("07911123456");
  });
});

describe("bucketFor — the last two digits", () => {
  it.each([
    ["9876543210", 10],
    ["9876543299", 99],
    ["9876543200", 0],
    ["9876543201", 1],
    ["9000000042", 42],
  ])("%s buckets to %i", (number, expected) => {
    expect(bucketFor(number)).toBe(expected);
  });

  it("ignores everything but the last two digits", () => {
    // Same suffix, different country code and prefix — same bucket, which is why
    // the country code is not part of the input at all.
    expect(bucketFor("9876543277")).toBe(77);
    expect(bucketFor("1115550077")).toBe(77);
  });

  it("returns null without a phone number", () => {
    expect(bucketFor(null)).toBeNull();
    expect(bucketFor("")).toBeNull();
  });

  it("stays within 0-99 for every two-digit suffix", () => {
    for (let i = 0; i < 100; i += 1) {
      const bucket = bucketFor(`98765432${String(i).padStart(2, "0")}`);
      expect(bucket).toBe(i);
    }
  });
});

describe("resolvePaywallId", () => {
  it("is deterministic — the same number always lands on the same paywall", () => {
    const first = resolvePaywallId("9876543210");
    for (let i = 0; i < 50; i += 1) {
      expect(resolvePaywallId("9876543210")).toBe(first);
    }
  });

  it("is stable across every stored FORMAT of the same number", () => {
    const expected = resolvePaywallId("9876543210");
    expect(resolvePaywallId("98765 43210")).toBe(expected);
    expect(resolvePaywallId("98765-43210")).toBe(expected);
    expect(resolvePaywallId(" 9876543210 ")).toBe(expected);
  });

  /** The map is 4 x 25, so the suffix decides the variant outright. */
  it.each([
    ["9876543200", "vip-membership-v1"],
    ["9876543224", "vip-membership-v1"],
    ["9876543225", "vip-video-bleed-v1"],
    ["9876543249", "vip-video-bleed-v1"],
    ["9876543250", "vip-icon-grid-v1"],
    ["9876543274", "vip-icon-grid-v1"],
    ["9876543275", "vip-carousel-v1"],
    ["9876543299", "vip-carousel-v1"],
  ])("%s -> %s", (number, expected) => {
    expect(resolvePaywallId(number)).toBe(expected);
  });

  it("serves the default paywall when the account has no phone", () => {
    expect(resolvePaywallId(null)).toBe("vip-membership-v1");
    expect(resolvePaywallId("")).toBe("vip-membership-v1");
  });

  it("splits an evenly-spread suffix range exactly 25/25/25/25", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i += 1) {
      const id = resolvePaywallId(`98765432${String(i).padStart(2, "0")}`);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([25, 25, 25, 25]);
    expect(counts.size).toBe(__BUCKETS_FOR_TEST.length);
  });
});

describe("meetsMinVersion", () => {
  /**
   * `0.0.0` is the column default and means NO GATE — every build has the
   * default paywall's screen. It must pass even when the app version is absent
   * or garbage, or an ungated paywall would be unreachable to exactly the
   * clients that most need a working screen.
   */
  it.each([["1.0.0"], ["0.0.1"], ["0.0.0"], [""], ["garbage"], [undefined], [null], [123]])(
    'a minimum of "0.0.0" serves the app version %j',
    (appVersion) => {
      expect(meetsMinVersion(appVersion, "0.0.0")).toBe(true);
    }
  );

  it.each([
    // at or above the gate — note the EQUAL case: `minAppVersion` is the lowest
    // version allowed, not the lowest excluded.
    ["1.1.0", true],
    ["1.1.1", true],
    ["1.2.0", true],
    ["2.0.0", true],
    ["10.0.0", true],
    ["1.1.10", true],
    // below the gate. "1.0.99" is the one that matters: a string compare says
    // it is greater than "1.1.0", a numeric tuple compare correctly says less.
    ["1.0.99", false],
    ["1.0.4", false],
    ["1.0.0", false],
    ["0.9.9", false],
    // unparseable or absent — every one of these is reachable in production
    // (`DeviceContext.appVersion` degrades to `''`, pre-header builds send
    // nothing) and every one must land on the default paywall.
    ["", false],
    ["1.1", false],
    ["1", false],
    ["1.1.0.1", false],
    ["1.1.0-beta", false],
    ["v1.1.0", false],
    ["1.1.x", false],
    ["1..0", false],
    ["abc", false],
  ])('meetsMinVersion(%j, "1.1.0") === %s', (appVersion, expected) => {
    expect(meetsMinVersion(appVersion, "1.1.0")).toBe(expected);
  });

  it.each([[undefined], [null], [123], [{}], [["1.1.0"]]])(
    "rejects the non-string app version %j against a real minimum",
    (appVersion) => {
      expect(meetsMinVersion(appVersion, "1.1.0")).toBe(false);
    }
  );

  /**
   * The minimum is CMS-entered free text now, so a typo is a live failure mode.
   * It must DENY — sending users to the default paywall is recoverable; handing
   * them a layout their build cannot draw is a blank screen in front of the
   * purchase flow. Note `"0.0"` and `"0"`: an unparseable value that merely
   * looks like the no-gate default must not be read as one.
   */
  it.each([["1.1"], ["v1.1.0"], ["1.1.0-beta"], ["1.1.0.1"], ["1.1.x"], [""], ["abc"], ["0.0"], ["0"]])(
    "an unparseable minimum %j denies even a very new client",
    (minAppVersion) => {
      expect(meetsMinVersion("99.99.99", minAppVersion)).toBe(false);
    }
  );

  it("tolerates surrounding whitespace on both sides", () => {
    expect(meetsMinVersion("  1.1.0  ", "  1.1.0  ")).toBe(true);
  });

  /**
   * The whole point of moving the gate into the CMS: one build can be above one
   * paywall's minimum and below another's. The old single constant could not
   * express this without cutting off the layouts that were already shipped.
   */
  it("gates each paywall independently — the same build passes one and fails another", () => {
    expect(meetsMinVersion("1.1.0", "1.1.0")).toBe(true);
    expect(meetsMinVersion("1.1.0", "1.3.0")).toBe(false);
  });
});
