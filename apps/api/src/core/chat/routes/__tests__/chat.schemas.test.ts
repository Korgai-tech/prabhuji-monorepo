import { describe, expect, test } from "vitest";

import CONTENT_ID_MAP from "@api/core/chat/assets/content-id-map.json";
import { ContentItem } from "@api/core/chat/routes/chat.schemas";

/**
 * The wire schema has to accept every id the repository can actually produce.
 *
 * `ContentItem.id` was `.uuid()`, which held only while horoscope was silently
 * resolving to nothing. The moment it started returning rows for real, every
 * rashifal turn 500ed — in RESPONSE serialization, after the handler had
 * already succeeded, so the log said `FST_ERR_RESPONSE_SERIALIZATION` and
 * named no content id. A schema stricter than the data is a 500 that waits for
 * the feature to start working.
 */
describe("ContentItem.id accepts every id the content map can resolve to", () => {
  const MAP = CONTENT_ID_MAP as Record<string, { type: string; id: string }>;

  function item(id: string) {
    return { id, title: "Aries", playUrl: null, icon: "https://cdn.test/a.webp" };
  }

  test("accepts a zodiac slug", () => {
    expect(ContentItem.safeParse(item("aries")).success).toBe(true);
  });

  test("accepts a uuid, which the other five types use", () => {
    expect(
      ContentItem.safeParse(item("3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607")).success
    ).toBe(true);
  });

  test("every id in the content map survives the wire schema", () => {
    // The map IS the set of ids the repository is asked for, so an id it can
    // hold and the schema cannot serialize is a 500 waiting to happen.
    for (const entry of Object.values(MAP)) {
      expect(ContentItem.safeParse(item(entry.id)).success).toBe(true);
    }
  });

  test("still rejects an empty id", () => {
    expect(ContentItem.safeParse(item("")).success).toBe(false);
  });
});
