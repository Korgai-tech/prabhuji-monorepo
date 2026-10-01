import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import CONTENT_ID_MAP from "@api/core/chat/assets/content-id-map.json";
import { ContentRepository } from "@api/core/chat/repositories";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";

/**
 * The id-map join contract, against real Postgres.
 *
 * `ChatService` resolves the agent's tags into row ids through
 * `content-id-map.json`, asks the repository for those ids, then joins the rows
 * BACK onto the ids it asked for (`byId.get(id)`). That join is keyed on
 * `ContentRow.id`, so a repository that returns a different identifier than the
 * one it was queried by drops every row of that type — silently, because a
 * missing recommendation is indistinguishable from an agent that suggested
 * nothing.
 *
 * Horoscope is the ONE type where the map holds a stable slug ("aries") rather
 * than a primary key, because `zodiac_sign` rows are seeded with generated
 * uuids that differ per environment. It returned `id` (the uuid) while being
 * queried by `zodiacId` (the slug), so `content.horoscope` was empty on every
 * turn — confirmed live on stage, with the agent correctly emitting `hor_0001`.
 *
 * This test asserts the contract that was broken: what comes back is keyed by
 * what was asked for.
 */

const MAP = CONTENT_ID_MAP as Record<string, { type: string; id: string }>;

let repo: ContentRepository;

beforeAll(async () => {
  await startTestDb();
  repo = new ContentRepository();

  // A real row, with a uuid primary key that is deliberately NOT the slug —
  // exactly the shape the seed produces, and the shape that hid the bug.
  await getPrisma().zodiacSign.create({
    data: {
      id: randomUUID(),
      zodiacId: "aries",
      displayName: "Aries",
      localizedDisplayName: { en: "Aries", hi: "मेष" },
      iconAssetUrl: "https://cdn.test/zodiac/aries.webp",
      sortOrder: 0,
      enabled: true,
    },
  });
}, 120_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

describe("ContentRepository — horoscope rows join on the id they were queried by", () => {
  test("returns the zodiac slug as the row id, not the primary key", async () => {
    const rows = await repo.findByTypeAndIds(new Map([["horoscope", ["aries"]]]));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    // The whole defect in one assertion: ask for "aries", get back "aries".
    expect(row?.id).toBe("aries");
    expect(row?.type).toBe("horoscope");
    // A fixed CTA, not the sign's name — the card is a door into the
    // horoscope screen, and `id` is what identifies the sign.
    expect(row?.title).toBe("Aaj ka Rashifal");
    // A sign has nothing to play, and the grid is deliberately free.
    expect(row?.playUrl).toBeNull();
    expect(row?.gated).toBe(false);
  });

  test("the id map's horoscope ids are the ones the repository can actually be queried by", async () => {
    // Guards the other half: a map entry pointing at a uuid (or a renamed
    // slug) would resolve to nothing, and the only symptom would be an empty
    // recommendation.
    const mapped = Object.values(MAP)
      .filter((e) => e.type === "horoscope")
      .map((e) => e.id);
    expect(mapped).toHaveLength(12);

    const known = await getPrisma().zodiacSign.findMany({ select: { zodiacId: true } });
    // Only `aries` is seeded in this test db, so assert the shape rather than
    // full coverage: every mapped id must look like a slug, never a uuid.
    for (const id of mapped) {
      expect(id).toMatch(/^[a-z]+$/);
    }
    expect(known.map((r) => r.zodiacId)).toContain(mapped[0]);
  });

  test("a disabled sign is not recommended", async () => {
    await getPrisma().zodiacSign.create({
      data: {
        id: randomUUID(),
        zodiacId: "taurus",
        displayName: "Taurus",
      localizedDisplayName: { en: "Taurus", hi: "वृषभ" },
        iconAssetUrl: "https://cdn.test/zodiac/taurus.webp",
        sortOrder: 1,
        enabled: false,
      },
    });

    const rows = await repo.findByTypeAndIds(new Map([["horoscope", ["taurus"]]]));
    expect(rows).toHaveLength(0);
  });
});
