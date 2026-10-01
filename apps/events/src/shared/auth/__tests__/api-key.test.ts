import { describe, expect, it } from "vitest";

import { safeKeyCompare } from "../api-key";

const API_KEY = "a-sufficiently-long-api-key";

describe("safeKeyCompare", () => {
  it("matches equal keys and rejects different-length keys without throwing", () => {
    expect(safeKeyCompare(API_KEY, API_KEY)).toBe(true);
    expect(safeKeyCompare("short", API_KEY)).toBe(false);
    expect(safeKeyCompare(`${API_KEY}x`, API_KEY)).toBe(false);
  });
});
