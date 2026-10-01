import { describe, expect, test } from "vitest";
import { parseAppVersion, semverGte } from "../app-version.js";

/**
 * TAM-132 backwards-compat gate — helper coverage. Both entry points are
 * TOLERANT (never throw); a parse failure is `null`, and `semverGte`
 * degrades to "does not satisfy" so a garbled `app_version` header behaves the
 * same as a missing one.
 */

describe("parseAppVersion", () => {
  test("empty / undefined / null → null", () => {
    expect(parseAppVersion(undefined)).toBeNull();
    expect(parseAppVersion(null)).toBeNull();
    expect(parseAppVersion("")).toBeNull();
    expect(parseAppVersion("   ")).toBeNull();
  });

  test("short forms fill missing segments with zero", () => {
    expect(parseAppVersion("1")).toEqual([1, 0, 0]);
    expect(parseAppVersion("1.2")).toEqual([1, 2, 0]);
    expect(parseAppVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  test("strips a leading v and drops build / pre-release suffixes", () => {
    expect(parseAppVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseAppVersion("V1.0.4")).toEqual([1, 0, 4]);
    expect(parseAppVersion("1.2.3+42")).toEqual([1, 2, 3]);
    expect(parseAppVersion("1.2.3-rc.1")).toEqual([1, 2, 3]);
  });

  test("garbage → null", () => {
    expect(parseAppVersion("garbage")).toBeNull();
    expect(parseAppVersion("1.a.3")).toBeNull();
    expect(parseAppVersion("-1.0.0")).toBeNull();
    expect(parseAppVersion("1..3")).toBeNull();
  });
});

describe("semverGte", () => {
  test("null minimum → always true (no gate)", () => {
    expect(semverGte(undefined, null)).toBe(true);
    expect(semverGte("", null)).toBe(true);
    expect(semverGte("1.0.0", null)).toBe(true);
    expect(semverGte(null, undefined)).toBe(true);
  });

  test("null / garbage actual against a real gate → false (very old client)", () => {
    expect(semverGte(undefined, "1.1.0")).toBe(false);
    expect(semverGte("", "1.1.0")).toBe(false);
    expect(semverGte("garbage", "1.1.0")).toBe(false);
  });

  test("equal, above, below across all three components", () => {
    expect(semverGte("1.1.0", "1.1.0")).toBe(true);
    expect(semverGte("1.1.1", "1.1.0")).toBe(true);
    expect(semverGte("1.2.0", "1.1.0")).toBe(true);
    expect(semverGte("2.0.0", "1.9.9")).toBe(true);
    expect(semverGte("1.0.4", "1.1.0")).toBe(false);
    expect(semverGte("0.9.9", "1.0.0")).toBe(false);
    expect(semverGte("1.1.0", "1.1.1")).toBe(false);
  });

  test("mixed-length inputs are zero-padded before compare", () => {
    expect(semverGte("1.1", "1.1.0")).toBe(true);
    expect(semverGte("1", "1.0.0")).toBe(true);
    expect(semverGte("1", "1.0.1")).toBe(false);
  });

  test("suffix + v prefix tolerated on both sides", () => {
    expect(semverGte("v1.1.0+5", "1.1.0")).toBe(true);
    expect(semverGte("1.0.4", "v1.1.0")).toBe(false);
  });
});
