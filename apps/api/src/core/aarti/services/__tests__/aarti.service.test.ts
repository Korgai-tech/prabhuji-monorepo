import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import {
  fakeSubscriptionApi,
  freeStatus,
  proStatus,
} from "@api/shared/testing";
import { ValidationError } from "@api/shared/errors";
import { encodeCursor } from "@api/shared/pagination";
import type {
  AartiRepository,
  AudioRow,
} from "../../repositories/aarti.repository.js";
import { AartiService } from "../aarti.service.js";

/**
 * Unit coverage for `AartiService` (TAM-63). The repo is mocked; the
 * subscription / engagement / deity FACADES are registered into
 * `GlobalServiceMap` as fakes so `performServiceCall` resolves them. The focus
 * is the #EXPORT_CRITICAL entitlement gate + section/listing/play logic.
 */

interface RepoMock {
  findActiveSections: Mock;
  findActiveCategories: Mock;
  findCategoriesByIds: Mock;
  findAudioById: Mock;
  findAudioGateById: Mock;
  findAudioPage: Mock;
  findRecentlyPlayedPage: Mock;
  findSectionItemsPage: Mock;
  hasPlaybackHistory: Mock;
  recordPlay: Mock;
}

function makeRepo(): RepoMock {
  return {
    findActiveSections: vi.fn().mockResolvedValue([]),
    findActiveCategories: vi.fn().mockResolvedValue([]),
    findCategoriesByIds: vi.fn().mockResolvedValue([]),
    findAudioById: vi.fn().mockResolvedValue(null),
    findAudioGateById: vi.fn().mockResolvedValue(null),
    findAudioPage: vi.fn().mockResolvedValue([]),
    findRecentlyPlayedPage: vi.fn().mockResolvedValue([]),
    findSectionItemsPage: vi.fn().mockResolvedValue([]),
    hasPlaybackHistory: vi.fn().mockResolvedValue(false),
    recordPlay: vi.fn(),
  };
}

function audioRow(overrides: Partial<AudioRow> = {}): AudioRow {
  return {
    id: overrides.id ?? "aud-1",
    title: overrides.title ?? "Jai Ganesh",
    coverImageUrl: overrides.coverImageUrl ?? "https://cdn.example.com/c.png",
    audioStreamUrl:
      overrides.audioStreamUrl ?? "https://cdn.example.com/aud-1.mp3",
    singerName: overrides.singerName ?? "Singer",
    composerNames: overrides.composerNames ?? "Composer",
    languages: overrides.languages ?? ["hi"],
    description: overrides.description ?? null,
    publishedAt: overrides.publishedAt ?? new Date("2026-06-01T00:00:00.000Z"),
    createdAt: overrides.createdAt ?? new Date("2026-05-01T00:00:00.000Z"),
    playCount: overrides.playCount ?? 0,
    isFeatured: overrides.isFeatured ?? false,
    isPrabhujiOriginal: overrides.isPrabhujiOriginal ?? false,
    isActive: overrides.isActive ?? true,
    categoryIds: overrides.categoryIds ?? [],
    deitySlug: overrides.deitySlug ?? null,
  };
}

let engagementCounts: Record<
  string,
  { contentId: string; likeCount: number; viewCount: number; shareCount: number }
> = {};
let likedIds: string[] = [];
let deityCards: {
  slug: string;
  displayName: string;
  iconUrl: string;
  sortOrder: number;
}[] = [];
const likeCalls: string[] = [];

/** Register fake facades; `status` drives the entitlement decision. */
function registerFacades(status: "free" | "active" | "throws"): void {
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      getStatus: () => {
        if (status === "throws") throw new Error("subscription down");
        // The gate reads `isEntitled`, not `status` — `trialing` and in-grace
        // `past_due` are entitled too, and a lapsed `active` is not.
        return Promise.resolve(status === "active" ? proStatus() : freeStatus());
      },
    })
  );
  registerGlobalService("engagement", {
    getCounts: () => Promise.resolve(engagementCounts),
    getUserLikes: () => Promise.resolve(likedIds),
    like: (p: { contentId: string }) => {
      likeCalls.push(`like:${p.contentId}`);
      return Promise.resolve({ liked: true, likeCount: 1 });
    },
    unlike: (p: { contentId: string }) => {
      likeCalls.push(`unlike:${p.contentId}`);
      return Promise.resolve({ liked: false, likeCount: 0 });
    },
    recordView: () => Promise.resolve({ viewCount: 1 }),
    recordShare: () => Promise.resolve({ shareCount: 1 }),
  });
  registerGlobalService("deity", {
    getActiveDeities: () => Promise.resolve(deityCards),
    getBySlug: () => Promise.resolve(null),
  });
}

let repo: RepoMock;
let service: AartiService;

beforeEach(() => {
  engagementCounts = {};
  likedIds = [];
  deityCards = [];
  likeCalls.length = 0;
  repo = makeRepo();
  // The public `AartiService` uses only the read methods mocked here; the
  // TAM-90 admin write methods on the real repo are not exercised by these
  // tests, so a double-assert keeps the mock focused (mirrors the deity exemplar).
  service = new AartiService(repo as unknown as AartiRepository);
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

describe("#EXPORT_CRITICAL entitlement gate on audioStreamUrl", () => {
  test("a FREE user NEVER receives audioStreamUrl (null on detail, listing, and section previews)", async () => {
    registerFacades("free");
    const row = audioRow({ id: "aud-1" });
    repo.findAudioById.mockResolvedValue(row);
    repo.findAudioPage.mockResolvedValue([row]);
    repo.findActiveSections.mockResolvedValue([
      { sectionType: "most_played", title: "Most Played", sortOrder: 4 },
    ]);

    // detail
    const detail = await service.getAudioDetail("aud-1", "free-user");
    expect(detail.audioStreamUrl).toBeNull();

    // listing
    const list = await service.listAudios({ userId: "free-user", limit: 20 });
    expect(list.items[0]?.audioStreamUrl).toBeNull();

    // section preview
    const main = await service.getMain("free-user");
    const items = main.sections[0]?.items ?? [];
    const preview = items[0];
    expect(preview && "audioStreamUrl" in preview ? preview.audioStreamUrl : "x").toBeNull();
  });

  test("a PRO user receives the audioStreamUrl on detail and listing", async () => {
    registerFacades("active");
    const row = audioRow({ id: "aud-1", audioStreamUrl: "https://cdn.example.com/aud-1.mp3" });
    repo.findAudioById.mockResolvedValue(row);
    repo.findAudioPage.mockResolvedValue([row]);

    const detail = await service.getAudioDetail("aud-1", "pro-user");
    expect(detail.audioStreamUrl).toBe("https://cdn.example.com/aud-1.mp3");

    const list = await service.listAudios({ userId: "pro-user", limit: 20 });
    expect(list.items[0]?.audioStreamUrl).toBe("https://cdn.example.com/aud-1.mp3");
  });

  test("entitlement service failure FAILS CLOSED (treated as free — no stream URL)", async () => {
    registerFacades("throws");
    const row = audioRow({ id: "aud-1" });
    repo.findAudioById.mockResolvedValue(row);
    const detail = await service.getAudioDetail("aud-1", "user");
    expect(detail.audioStreamUrl).toBeNull();
  });
});

describe("getMain section assembly", () => {
  test("omits recently_played when the user has no history", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { sectionType: "recently_played", title: "Recently Played", sortOrder: 0 },
      { sectionType: "most_played", title: "Most Played", sortOrder: 4 },
    ]);
    repo.findRecentlyPlayedPage.mockResolvedValue([]); // no history
    repo.findAudioPage.mockResolvedValue([audioRow({ id: "aud-1" })]);

    const main = await service.getMain("user");
    expect(main.sections.map((s) => s.sectionType)).toEqual(["most_played"]);
  });

  test("includes recently_played when history exists", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { sectionType: "recently_played", title: "Recently Played", sortOrder: 0 },
    ]);
    repo.findRecentlyPlayedPage.mockResolvedValue([
      { ...audioRow({ id: "aud-9" }), lastPlayedAt: new Date() },
    ]);
    const main = await service.getMain("user");
    expect(main.sections.map((s) => s.sectionType)).toEqual(["recently_played"]);
    expect(main.sections[0]?.items).toHaveLength(1);
  });

  test("omits empty sections (fail-soft) and preserves repo order", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { sectionType: "deities", title: "Deities", sortOrder: 1 },
      { sectionType: "browse_categories", title: "Browse", sortOrder: 2 },
      { sectionType: "newly_added", title: "Newly Added", sortOrder: 3 },
    ]);
    deityCards = []; // deities empty → omitted
    repo.findActiveCategories.mockResolvedValue([]); // categories empty → omitted
    repo.findAudioPage.mockResolvedValue([audioRow({ id: "aud-1" })]); // newly_added has content
    const main = await service.getMain("user");
    expect(main.sections.map((s) => s.sectionType)).toEqual(["newly_added"]);
  });

  test("resolves deities + categories sections into typed cards", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { sectionType: "deities", title: "Deities", sortOrder: 1 },
      { sectionType: "browse_categories", title: "Browse", sortOrder: 2 },
    ]);
    deityCards = [
      { slug: "shiva", displayName: "Shiva", iconUrl: "https://x/s.png", sortOrder: 0 },
    ];
    repo.findActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "aarti", name: "Aarti", imageUrl: null, description: null, displayColor: null, sortOrder: 0 },
    ]);
    const main = await service.getMain("user");
    expect(main.sections[0]?.items[0]).toMatchObject({ kind: "deity", slug: "shiva" });
    expect(main.sections[1]?.items[0]).toMatchObject({ kind: "category", slug: "aarti" });
  });
});

describe("curated sections (TAM-160)", () => {
  /** A curated section row as `findActiveSections` returns it. */
  function curatedSection(id: string, title: string, sortOrder: number) {
    return { id, sectionType: "curated", title, sortOrder, translations: [] };
  }

  test("assembles a curated section in the saved order and carries sectionId", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      curatedSection("sec-1", "Top Aartis listened to by 80s kids", 3),
    ]);
    repo.findSectionItemsPage.mockResolvedValue([
      { ...audioRow({ id: "aud-b" }), position: 0 },
      { ...audioRow({ id: "aud-a" }), position: 1 },
    ]);

    const main = await service.getMain("user");
    expect(repo.findSectionItemsPage).toHaveBeenCalledWith({
      sectionId: "sec-1",
      limit: 10,
    });
    expect(main.sections).toHaveLength(1);
    expect(main.sections[0]).toMatchObject({
      sectionId: "sec-1",
      sectionType: "curated",
      title: "Top Aartis listened to by 80s kids",
    });
    // Saved `position` order, NOT id order.
    expect(main.sections[0]?.items.map((i) => ("id" in i ? i.id : ""))).toEqual([
      "aud-b",
      "aud-a",
    ]);
  });

  test("sectionId rides through on EVERY section, not just curated ones", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { id: "sec-np", sectionType: "newly_added", title: "Newly Added", sortOrder: 3 },
    ]);
    repo.findAudioPage.mockResolvedValue([audioRow({ id: "aud-1" })]);
    const main = await service.getMain("user");
    expect(main.sections[0]?.sectionId).toBe("sec-np");
  });

  test("the preview is capped at 10 (the repo over-fetches limit + 1)", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([curatedSection("sec-1", "Big", 1)]);
    repo.findSectionItemsPage.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => ({
        ...audioRow({ id: `aud-${i}` }),
        position: i,
      }))
    );
    const main = await service.getMain("user");
    expect(main.sections[0]?.items).toHaveLength(10);
  });

  test("a curated section with zero items is omitted (hide-when-empty)", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      curatedSection("sec-empty", "Empty", 1),
      { id: "sec-na", sectionType: "newly_added", title: "Newly Added", sortOrder: 2 },
    ]);
    repo.findSectionItemsPage.mockResolvedValue([]);
    repo.findAudioPage.mockResolvedValue([audioRow({ id: "aud-1" })]);

    const main = await service.getMain("user");
    expect(main.sections.map((s) => s.sectionId)).toEqual(["sec-na"]);
  });

  test("two curated sections both render, in the repo's sortOrder order", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      curatedSection("sec-1", "First", 1),
      curatedSection("sec-2", "Second", 2),
    ]);
    repo.findSectionItemsPage
      .mockResolvedValueOnce([{ ...audioRow({ id: "aud-1" }), position: 0 }])
      .mockResolvedValueOnce([{ ...audioRow({ id: "aud-2" }), position: 0 }]);

    const main = await service.getMain("user");
    expect(main.sections.map((s) => s.sectionId)).toEqual(["sec-1", "sec-2"]);
    expect(main.sections.map((s) => s.sortOrder)).toEqual([1, 2]);
  });

  test("#EXPORT_CRITICAL — curated previews are gated: null for free, present for Pro", async () => {
    const items = [{ ...audioRow({ id: "aud-1" }), position: 0 }];
    const sections = [curatedSection("sec-1", "Curated", 1)];

    registerFacades("free");
    repo.findActiveSections.mockResolvedValue(sections);
    repo.findSectionItemsPage.mockResolvedValue(items);
    const free = (await service.getMain("free-user")).sections[0]?.items[0];
    expect(free && "audioStreamUrl" in free ? free.audioStreamUrl : "x").toBeNull();

    clearGlobalServices();
    registerFacades("active");
    const pro = (await service.getMain("pro-user")).sections[0]?.items[0];
    expect(pro && "audioStreamUrl" in pro ? pro.audioStreamUrl : null).toBe(
      "https://cdn.example.com/aud-1.mp3"
    );
  });

  test("listAudios({sectionId}) pages the curated list keyed on (position, id)", async () => {
    registerFacades("free");
    repo.findSectionItemsPage.mockResolvedValue([
      { ...audioRow({ id: "aud-a" }), position: 0 },
      { ...audioRow({ id: "aud-b" }), position: 1 },
      { ...audioRow({ id: "aud-c" }), position: 2 },
    ]);
    const page = await service.listAudios({
      userId: "user",
      sectionId: "sec-1",
      limit: 2,
    });
    expect(repo.findSectionItemsPage).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "sec-1", limit: 2 })
    );
    expect(repo.findAudioPage).not.toHaveBeenCalled();
    expect(page.items.map((i) => i.id)).toEqual(["aud-a", "aud-b"]);
    // The curated keyset is the editor's saved `position`, id as the tiebreak.
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: 1, id: "aud-b" }));
  });

  test("sectionId + categoryId → ValidationError INVALID_FILTER_COMBINATION, no read", async () => {
    registerFacades("free");
    await expect(
      service.listAudios({
        userId: "user",
        sectionId: "22222222-2222-2222-2222-222222222222",
        categoryId: "11111111-1111-1111-1111-111111111111",
        limit: 20,
      })
    ).rejects.toMatchObject({ errorCode: "INVALID_FILTER_COMBINATION" });
    expect(repo.findSectionItemsPage).not.toHaveBeenCalled();
  });
});

describe("listAudios query resolution", () => {
  test("rejects more than one primary filter with a ValidationError (→400)", async () => {
    registerFacades("free");
    await expect(
      service.listAudios({
        userId: "user",
        categoryId: "11111111-1111-1111-1111-111111111111",
        deityId: "shiva",
        limit: 20,
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findAudioPage).not.toHaveBeenCalled();
  });

  test("sectionType no longer drives ordering — the flat list uses the default (id) order", async () => {
    registerFacades("free");
    repo.findAudioPage.mockResolvedValue([]);
    // `most_played` survives only as a client filter; it no longer maps to a sort.
    await service.listAudios({ userId: "user", sectionType: "most_played", limit: 20 });
    expect(repo.findAudioPage).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "default" })
    );
  });

  test("sectionType=recently_played routes to the recently-played path (not findAudioPage)", async () => {
    registerFacades("free");
    repo.findRecentlyPlayedPage.mockResolvedValue([]);
    await service.listAudios({
      userId: "user",
      sectionType: "recently_played",
      limit: 20,
    });
    expect(repo.findRecentlyPlayedPage).toHaveBeenCalled();
    expect(repo.findAudioPage).not.toHaveBeenCalled();
  });

  test("the flat listing emits a nextCursor keyed on id (the numeric slot is filler)", async () => {
    registerFacades("free");
    // limit 2, repo returns 3 (over-fetch) → nextCursor present, keyed to last kept row.
    repo.findAudioPage.mockResolvedValue([
      audioRow({ id: "a" }),
      audioRow({ id: "b" }),
      audioRow({ id: "c" }),
    ]);
    const page = await service.listAudios({ userId: "user", limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    // `default` keys on the uuid id alone; the numeric slot is unused filler (0).
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: 0, id: "b" }));
  });

  test("a malformed cursor throws before hitting the repo (→400)", async () => {
    registerFacades("free");
    await expect(
      service.listAudios({ userId: "user", cursor: "@@bad@@", limit: 20 })
    ).rejects.toThrowError(/Invalid pagination cursor/);
  });
});

describe("engagement enrichment", () => {
  test("maps like/view/share counts + likedByMe from the engagement facade", async () => {
    registerFacades("active");
    engagementCounts = {
      "aud-1": { contentId: "aud-1", likeCount: 7, viewCount: 20, shareCount: 3 },
    };
    likedIds = ["aud-1"];
    repo.findAudioById.mockResolvedValue(audioRow({ id: "aud-1" }));
    const detail = await service.getAudioDetail("aud-1", "user");
    expect(detail.likeCount).toBe(7);
    expect(detail.viewCount).toBe(20);
    expect(detail.shareCount).toBe(3);
    expect(detail.likedByMe).toBe(true);
  });

  test("zero-fills counts for an item with no engagement row and likedByMe=false", async () => {
    registerFacades("active");
    repo.findAudioById.mockResolvedValue(audioRow({ id: "aud-2" }));
    const detail = await service.getAudioDetail("aud-2", "user");
    expect(detail.likeCount).toBe(0);
    expect(detail.likedByMe).toBe(false);
  });
});

describe("getAudioDetail unknown id", () => {
  test("throws a 404 AppError", async () => {
    registerFacades("free");
    repo.findAudioById.mockResolvedValue(null);
    await expect(service.getAudioDetail("missing", "user")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("recordPlay entitlement", () => {
  test("FREE user → 403 ForbiddenError and NO history write", async () => {
    registerFacades("free");
    await expect(
      service.recordPlay({ id: "aud-1", userId: "free-user" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.recordPlay).not.toHaveBeenCalled();
    expect(repo.findAudioGateById).not.toHaveBeenCalled();
  });

  test("PRO user → records playback and returns the new play state", async () => {
    registerFacades("active");
    repo.findAudioGateById.mockResolvedValue({ id: "aud-1" });
    repo.recordPlay.mockResolvedValue({
      playCount: 5,
      lastPlayedAt: new Date("2026-07-14T00:00:00.000Z"),
      lastPositionSeconds: 42,
    });
    const res = await service.recordPlay({
      id: "aud-1",
      userId: "pro-user",
      lastPositionSeconds: 42,
    });
    expect(repo.recordPlay).toHaveBeenCalledWith({
      userId: "pro-user",
      audioId: "aud-1",
      lastPositionSeconds: 42,
    });
    expect(res.playCount).toBe(5);
    expect(res.lastPositionSeconds).toBe(42);
  });

  test("PRO user + unknown id → 404", async () => {
    registerFacades("active");
    repo.findAudioGateById.mockResolvedValue(null);
    await expect(
      service.recordPlay({ id: "missing", userId: "pro-user" })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.recordPlay).not.toHaveBeenCalled();
  });
});

describe("toggleLike (Pro-only, via engagement facade)", () => {
  test("FREE user → 403 and no engagement call", async () => {
    registerFacades("free");
    await expect(service.toggleLike("aud-1", "free-user")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(likeCalls).toEqual([]);
    expect(repo.findAudioGateById).not.toHaveBeenCalled();
  });

  test("PRO user + unknown id → 404", async () => {
    registerFacades("active");
    repo.findAudioGateById.mockResolvedValue(null);
    await expect(service.toggleLike("missing", "pro-user")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(likeCalls).toEqual([]);
  });

  test("PRO user not-yet-liked → likes via the facade", async () => {
    registerFacades("active");
    repo.findAudioGateById.mockResolvedValue({ id: "aud-1" });
    likedIds = [];
    const res = await service.toggleLike("aud-1", "pro-user");
    expect(likeCalls).toEqual(["like:aud-1"]);
    expect(res).toEqual({ audioId: "aud-1", liked: true, likeCount: 1 });
  });

  test("PRO user already-liked → unlikes via the facade", async () => {
    registerFacades("active");
    repo.findAudioGateById.mockResolvedValue({ id: "aud-1" });
    likedIds = ["aud-1"];
    const res = await service.toggleLike("aud-1", "pro-user");
    expect(likeCalls).toEqual(["unlike:aud-1"]);
    expect(res).toEqual({ audioId: "aud-1", liked: false, likeCount: 0 });
  });
});

describe("getAudioSummary facade", () => {
  test("returns a compact summary with NO stream URL, or null when unknown", async () => {
    registerFacades("active");
    repo.findAudioById.mockResolvedValueOnce(audioRow({ id: "aud-1" }));
    const summary = await service.getAudioSummary("aud-1");
    expect(summary).toMatchObject({ id: "aud-1" });
    expect(summary && "audioStreamUrl" in summary).toBe(false);

    repo.findAudioById.mockResolvedValueOnce(null);
    expect(await service.getAudioSummary("missing")).toBeNull();
  });
});
