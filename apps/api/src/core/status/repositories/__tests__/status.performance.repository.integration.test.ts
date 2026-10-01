import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { STATUS_PERFORMANCE_NO_DEITY } from "@api/core/status/types";
import { StatusPerformanceRepository } from "../status.performance.repository.js";

/**
 * Integration coverage for the CMS half of the status-performance report
 * (TAM-256) — real Postgres via testcontainers.
 *
 * These behaviours are only provable against a real database, and each one is a
 * place where a plausible-looking implementation is silently wrong:
 *
 *  - the alias map joins two tables by a NULLABLE column with no foreign key,
 *    so "which rows does this actually match" is a question about data, not
 *    types;
 *  - the pin lookup's "active" predicate is four conditions (surface,
 *    not-deleted, started, not-ended) and dropping any one of them still
 *    returns plausible rows — just the wrong ones;
 *  - `pinned_content.content_id` means a DIFFERENT table depending on surface,
 *    which no type in the codebase expresses.
 *
 * The unit tests cover derivation; this covers the reads.
 */

let repo: StatusPerformanceRepository;

const ADMIN = randomUUID();

/**
 * The one instant the pin tests evaluate against. The default pin window below
 * is anchored to it rather than to `Date.now()`: a wall-clock window around a
 * fixed `now` stops covering it a day later, and every build after that fails.
 *
 * Observed exactly that way — the three default-window cases passed before
 * 12:00 UTC on 2026-09-23 and failed for good after it.
 */
const NOW = new Date("2026-09-22T12:00:00.000Z");

/** A status item. Ids are generated so every test owns its own rows. */
async function makeStatus(over: Partial<{
  id: string;
  slug: string;
  title: string;
  deitySlug: string | null;
  mediaType: string;
  isActive: boolean;
  createdAt: Date;
}> = {}) {
  const id = over.id ?? randomUUID();
  const slug = over.slug ?? `status-${id.slice(0, 8)}`;
  await getPrisma().statusItem.create({
    data: {
      id,
      slug,
      title: over.title ?? `Title ${slug}`,
      mediaType: over.mediaType ?? "image",
      imageUrl: "https://cdn.test/i.jpg",
      thumbnailUrl: "https://cdn.test/t.jpg",
      overlaySafeArea: { top: 0.1, bottom: 0.1, left: 0.05, right: 0.05 },
      deitySlug: over.deitySlug === undefined ? "hanuman" : over.deitySlug,
      languages: [],
      isActive: over.isActive ?? true,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
  return { id, slug };
}

/** A home-feed card. `ctaContentId: null` models a hand-authored CMS card. */
async function makeHomeCard(statusId: string | null, createdAt?: Date) {
  const id = randomUUID();
  await getPrisma().homeFeedItem.create({
    data: {
      id,
      slug: `feed-${id.slice(0, 8)}`,
      contentType: "status",
      module: "status",
      title: "Card",
      heroImageUrl: "https://cdn.test/h.jpg",
      ctaLabel: "View",
      ctaDestinationType: "content_detail",
      ctaDestinationValue: "x",
      ctaContentId: statusId,
      headerDestinationModule: "status",
      shareTitle: "t",
      shareText: "x",
      shareDeepLink: "https://x.test",
      ...(createdAt ? { createdAt } : {}),
    },
  });
  return id;
}

async function makePin(
  surface: "home" | "status_all_gods" | "status_deity",
  contentId: string,
  pinPosition: number,
  window: { startAt: Date; endAt: Date; deletedAt?: Date | null } = {
    startAt: new Date(NOW.getTime() - 86_400_000),
    endAt: new Date(NOW.getTime() + 86_400_000),
  },
) {
  await getPrisma().pinnedContent.create({
    data: {
      surface,
      contentId,
      pinPosition,
      startAt: window.startAt,
      endAt: window.endAt,
      deletedAt: window.deletedAt ?? null,
      createdBy: ADMIN,
      updatedBy: ADMIN,
      ...(surface === "status_deity" ? { deitySlug: "hanuman" } : {}),
    },
  });
}

beforeAll(async () => {
  process.env.ENABLE_REDIS = "false";
  await startTestDb();
  repo = new StatusPerformanceRepository();
}, 120_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().pinnedContent.deleteMany({});
  await getPrisma().homeFeedItem.deleteMany({});
  await getPrisma().statusItem.deleteMany({});
});

describe("listCatalogue", () => {
  test("returns every matching row, not a page — the report sorts after the join", async () => {
    for (let i = 0; i < 30; i += 1) await makeStatus();

    const rows = await repo.listCatalogue({});

    // Paging here would page by createdAt, but the report sorts by share rate.
    // Page 1 of the wrong ordering is not page 1 of the right one.
    expect(rows).toHaveLength(30);
  });

  test("the (no deity) sentinel selects unmapped items, and only those", async () => {
    await makeStatus({ deitySlug: "hanuman" });
    await makeStatus({ deitySlug: null });
    await makeStatus({ deitySlug: null });

    const unmapped = await repo.listCatalogue({ deitySlug: STATUS_PERFORMANCE_NO_DEITY });
    const hanuman = await repo.listCatalogue({ deitySlug: "hanuman" });

    expect(unmapped).toHaveLength(2);
    expect(unmapped.every((r) => r.deitySlug === null)).toBe(true);
    expect(hanuman).toHaveLength(1);
  });

  test("an unknown deity slug returns nothing rather than everything", async () => {
    await makeStatus({ deitySlug: "hanuman" });

    // A filter that silently degrades to "no filter" is worse than an empty
    // result: the editor believes they are looking at one deity's content.
    const rows = await repo.listCatalogue({ deitySlug: "not-a-real-deity" });
    expect(rows).toEqual([]);
  });

  test("search matches title and slug, case-insensitively", async () => {
    await makeStatus({ slug: "ganesh-morning", title: "Morning Blessing" });
    await makeStatus({ slug: "hanuman-evening", title: "Evening Chalisa" });

    expect(await repo.listCatalogue({ q: "MORNING" })).toHaveLength(1);
    expect(await repo.listCatalogue({ q: "hanuman" })).toHaveLength(1);
    expect(await repo.listCatalogue({ q: "chalisa" })).toHaveLength(1);
  });

  test("inactive items are included unless explicitly filtered out", async () => {
    await makeStatus({ isActive: true });
    await makeStatus({ isActive: false });

    // Retired content's past numbers are the point of a performance report.
    expect(await repo.listCatalogue({})).toHaveLength(2);
    expect(await repo.listCatalogue({ isActive: false })).toHaveLength(1);
  });
});

describe("buildHomeFeedAliasMap", () => {
  test("indexes both directions from one read", async () => {
    const s = await makeStatus();
    const cardId = await makeHomeCard(s.id);

    const map = await repo.buildHomeFeedAliasMap([s.id]);

    expect(map.homeFeedIdToStatusId.get(cardId)).toBe(s.id);
    expect(map.statusIdToHomeFeedId.get(s.id)).toBe(cardId);
  });

  test("hand-authored cards carry no status id and are absent from the map", async () => {
    const s = await makeStatus();
    await makeHomeCard(null); // the CMS-authored shape

    const map = await repo.buildHomeFeedAliasMap([s.id]);

    // Their shares stay unattributable. That surfaces as partialAttribution,
    // never as a silently smaller share count.
    expect(map.homeFeedIdToStatusId.size).toBe(0);
    expect(map.statusIdToHomeFeedId.size).toBe(0);
  });

  test("only status cards are mapped, never other content types", async () => {
    const s = await makeStatus();
    const cardId = await makeHomeCard(s.id);
    // A wallpaper card that happens to point at the same uuid must not match.
    await getPrisma().homeFeedItem.update({
      where: { id: await makeHomeCard(s.id) },
      data: { contentType: "wallpaper" },
    });

    const map = await repo.buildHomeFeedAliasMap([s.id]);

    expect([...map.homeFeedIdToStatusId.keys()]).toEqual([cardId]);
  });

  test("an empty id list does no query and returns empty maps", async () => {
    const map = await repo.buildHomeFeedAliasMap([]);
    expect(map.homeFeedIdToStatusId.size).toBe(0);
  });

  test("when an item somehow has two cards, the oldest wins the inverse map", async () => {
    const s = await makeStatus();
    const older = await makeHomeCard(s.id, new Date("2026-01-01T00:00:00Z"));
    await makeHomeCard(s.id, new Date("2026-06-01T00:00:00Z"));

    const map = await repo.buildHomeFeedAliasMap([s.id]);

    // Both forward-map (either card's shares belong to this item), but "on
    // homepage since" must not jump forward because a second card appeared.
    expect(map.homeFeedIdToStatusId.size).toBe(2);
    expect(map.statusIdToHomeFeedId.get(s.id)).toBe(older);
  });
});

describe("findHomeFeedCardDates", () => {
  test("reports the oldest card's date per item", async () => {
    const s = await makeStatus();
    await makeHomeCard(s.id, new Date("2026-06-01T00:00:00Z"));
    await makeHomeCard(s.id, new Date("2026-01-01T00:00:00Z"));

    const dates = await repo.findHomeFeedCardDates([s.id]);

    expect(dates.get(s.id)?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  test("an item with no card has no entry — blank does not mean 'not on the homepage'", async () => {
    const s = await makeStatus();
    const dates = await repo.findHomeFeedCardDates([s.id]);
    expect(dates.has(s.id)).toBe(false);
  });
});

describe("findActivePinPositions", () => {
  test("reads status pins by status id and home pins through the alias map", async () => {
    const s = await makeStatus();
    const cardId = await makeHomeCard(s.id);
    const alias = await repo.buildHomeFeedAliasMap([s.id]);

    await makePin("status_all_gods", s.id, 3);
    await makePin("home", cardId, 7); // NB: the CARD's id, not the item's

    const pins = await repo.findActivePinPositions([s.id], alias, NOW);

    // pinned_content.content_id means a different table per surface — the one
    // thing about this table that no type in the codebase expresses.
    expect(pins.get(s.id)?.statusAllGods).toBe(3);
    expect(pins.get(s.id)?.home).toBe(7);
  });

  test("keeps the two status surfaces in separate fields", async () => {
    const s = await makeStatus();
    const alias = await repo.buildHomeFeedAliasMap([s.id]);

    await makePin("status_all_gods", s.id, 2);
    await makePin("status_deity", s.id, 9);

    const pins = await repo.findActivePinPositions([s.id], alias, NOW);

    // An item can hold both at once; collapsing them would lose one silently.
    expect(pins.get(s.id)?.statusAllGods).toBe(2);
    expect(pins.get(s.id)?.statusDeity).toBe(9);
  });

  test("a soft-deleted pin is not active", async () => {
    const s = await makeStatus();
    const alias = await repo.buildHomeFeedAliasMap([s.id]);
    await makePin("status_all_gods", s.id, 4, {
      startAt: new Date(NOW.getTime() - 86_400_000),
      endAt: new Date(NOW.getTime() + 86_400_000),
      deletedAt: new Date(NOW.getTime() - 3600_000),
    });

    expect(await repo.findActivePinPositions([s.id], alias, NOW)).toEqual(new Map());
  });

  test("a pin that has not started, or has already ended, is not active", async () => {
    const future = await makeStatus();
    const past = await makeStatus();
    const alias = await repo.buildHomeFeedAliasMap([future.id, past.id]);

    // Distinct positions: `pinned_content_position_uq` forbids two live pins at
    // the same position on a surface, which is itself worth knowing — the
    // "lowest position wins" tiebreak below is for DIFFERENT positions only.
    await makePin("status_all_gods", future.id, 11, {
      startAt: new Date(NOW.getTime() + 86_400_000),
      endAt: new Date(NOW.getTime() + 172_800_000),
    });
    await makePin("status_all_gods", past.id, 12, {
      startAt: new Date(NOW.getTime() - 172_800_000),
      endAt: new Date(NOW.getTime() - 86_400_000),
    });

    // An expired pin must render blank, not stale — "where is this pinned
    // today" is the question the column answers.
    expect(await repo.findActivePinPositions([future.id, past.id], alias, NOW)).toEqual(new Map());
  });

  test("`now` is honoured, so the whole report evaluates against one instant", async () => {
    const s = await makeStatus();
    const alias = await repo.buildHomeFeedAliasMap([s.id]);
    const start = new Date("2026-09-22T10:00:00.000Z");
    const end = new Date("2026-09-22T11:00:00.000Z");
    await makePin("status_all_gods", s.id, 5, { startAt: start, endAt: end });

    const during = await repo.findActivePinPositions([s.id], alias, new Date("2026-09-22T10:30:00.000Z"));
    const after = await repo.findActivePinPositions([s.id], alias, new Date("2026-09-22T11:30:00.000Z"));

    expect(during.get(s.id)?.statusAllGods).toBe(5);
    expect(after.size).toBe(0);
  });

  test("the lowest position wins when one surface holds two live pins", async () => {
    const s = await makeStatus();
    const alias = await repo.buildHomeFeedAliasMap([s.id]);
    await makePin("status_all_gods", s.id, 8);
    await makePin("status_all_gods", s.id, 2);

    const pins = await repo.findActivePinPositions([s.id], alias, NOW);
    expect(pins.get(s.id)?.statusAllGods).toBe(2);
  });

  test("an item with no home card cannot pick up a home pin", async () => {
    const s = await makeStatus();
    const orphanCardId = await makeHomeCard(null);
    const alias = await repo.buildHomeFeedAliasMap([s.id]);
    await makePin("home", orphanCardId, 1);

    const pins = await repo.findActivePinPositions([s.id], alias, NOW);
    expect(pins.get(s.id)?.home ?? null).toBeNull();
  });
});
