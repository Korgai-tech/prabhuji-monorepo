import { describe, expect, test } from "vitest";
import { resolveDateIst } from "../date-ist.js";

/**
 * IST is UTC+5:30 with no DST, so the civil day rolls at 18:30 UTC. That
 * instant is the only boundary a UTC-based implementation gets wrong, and it is
 * the one every cap in `core/modals` depends on.
 */
describe("resolveDateIst", () => {
  test("18:29:59 UTC is still the same IST day", () => {
    expect(resolveDateIst(new Date("2026-09-11T18:29:59.000Z"))).toBe("2026-09-11");
  });

  test("18:30:00 UTC is already the next IST day", () => {
    expect(resolveDateIst(new Date("2026-09-11T18:30:00.000Z"))).toBe("2026-09-12");
  });

  test("midnight UTC is the same calendar day in IST", () => {
    expect(resolveDateIst(new Date("2026-09-11T00:00:00.000Z"))).toBe("2026-09-11");
  });

  test("crosses a month and a year boundary", () => {
    expect(resolveDateIst(new Date("2026-12-31T18:30:00.000Z"))).toBe("2027-01-01");
  });
});
