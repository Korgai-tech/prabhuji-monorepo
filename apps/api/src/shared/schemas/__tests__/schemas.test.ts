import { describe, expect, test } from "vitest";
import { mediaUrl } from "../media.js";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  paginationQuery,
} from "../pagination.js";
import { engagementContentType } from "../engagement.js";

describe("mediaUrl", () => {
  test("accepts an https URL", () => {
    expect(mediaUrl.safeParse("https://cdn.example.com/a.png").success).toBe(
      true
    );
  });

  test("rejects a non-https (http) URL", () => {
    expect(mediaUrl.safeParse("http://cdn.example.com/a.png").success).toBe(
      false
    );
  });

  test("rejects a non-URL string", () => {
    expect(mediaUrl.safeParse("not a url").success).toBe(false);
  });
});

describe("paginationQuery", () => {
  test("defaults limit to 20 and cursor to undefined", () => {
    const parsed = paginationQuery.parse({});
    expect(parsed.limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(parsed.cursor).toBeUndefined();
  });

  test("coerces a string limit from the querystring", () => {
    expect(paginationQuery.parse({ limit: "5" }).limit).toBe(5);
  });

  test("rejects a limit above the max", () => {
    expect(paginationQuery.safeParse({ limit: MAX_PAGE_LIMIT + 1 }).success).toBe(
      false
    );
  });

  test("rejects a non-positive limit", () => {
    expect(paginationQuery.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("engagementContentType", () => {
  test("accepts every Phase-1 token", () => {
    for (const t of [
      "aarti",
      "mantra",
      "ringtone",
      "wallpaper",
      "status",
      "home_item",
    ]) {
      expect(engagementContentType.safeParse(t).success).toBe(true);
    }
  });

  test("rejects an unknown token", () => {
    expect(engagementContentType.safeParse("book").success).toBe(false);
  });
});
