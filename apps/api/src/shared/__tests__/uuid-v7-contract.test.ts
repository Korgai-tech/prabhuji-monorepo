import { describe, expect, test } from "vitest";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

/**
 * Identity and payment ids are UUIDv7 (`@default(uuid(7))`, see
 * `docs/UUID-V7-MIGRATION.md`). This pins the two properties the rest of the
 * codebase silently assumes about them.
 *
 * It deliberately does NOT re-test the `uuid` package's own implementation —
 * version bits, entropy, monotonicity are its problem and it has its own suite.
 */
describe("uuid v7 ids satisfy the API's contracts", () => {
  /**
   * LOAD-BEARING. Zod 3's `.uuid()` pinned the version nibble to `[1-5]` and
   * would reject every v7 id we mint — including on RESPONSE schemas like
   * `CancellationRequestData.id`, which would 500 in production rather than
   * fail cleanly at the request boundary. Zod 4 widened it to `[1-8]`.
   *
   * Asserting the property directly means a Zod downgrade fails here rather
   * than in prod, which a version range in package.json cannot do.
   */
  test("the zod validators the routes use accept them", () => {
    for (let i = 0; i < 1_000; i++) {
      const id = uuidv7();
      expect(z.uuid().safeParse(id).success).toBe(true);
      // The deprecated spelling is still used by
      // `subscription-cancel-request.schemas.ts`.
      expect(z.string().uuid().safeParse(id).success).toBe(true);
    }
  });

  /**
   * Postgres compares `uuid` by byte order, which for these lowercase-hex
   * strings is the same as a lexicographic compare — so a plain string sort in
   * JS reflects the order the database will produce. Several places rely on
   * that equivalence when reasoning about id ordering.
   */
  test("string order matches the byte order Postgres sorts on", () => {
    const ids = Array.from({ length: 500 }, () => uuidv7());
    expect([...ids].sort()).toEqual(ids);
    expect(ids.every((id) => id === id.toLowerCase())).toBe(true);
  });
});
