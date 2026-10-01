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
  MantraRow,
  MantrasRepository,
} from "../../repositories/mantras.repository.js";
import { MantrasService } from "../mantras.service.js";

/**
 * Unit coverage for `MantrasService` (TAM-65). The repo is mocked; the
 * subscription / engagement / deity FACADES are registered into
 * `GlobalServiceMap` as fakes so `performServiceCall` resolves them. Focus: the
 * #EXPORT_CRITICAL entitlement gate on `audioUrl`, section/listing logic,
 * playlist assembly, mantraText line-break preservation, the like/recently-
 * played Pro gate, and the counter-preference enum.
 */

interface RepoMock {
  findActiveSections: Mock;
  findActiveCategories: Mock;
  findCategoriesByIds: Mock;
  findCategoryById: Mock;
  findItemById: Mock;
  findItemGateById: Mock;
  findItemPage: Mock;
  findSectionItemsPage: Mock;
  findRecentlyPlayedPage: Mock;
  hasRecentlyPlayed: Mock;
  findPlaylistByDeity: Mock;
  findPlaylistByCategory: Mock;
  findPlaylistBySort: Mock;
  findRecentlyPlayedPlaylist: Mock;
  recordRecentlyPlayed: Mock;
  getCounterPreference: Mock;
  setCounterPreference: Mock;
}

function makeRepo(): RepoMock {
  return {
    findActiveSections: vi.fn().mockResolvedValue([]),
    findActiveCategories: vi.fn().mockResolvedValue([]),
    findCategoriesByIds: vi.fn().mockResolvedValue([]),
    findCategoryById: vi.fn().mockResolvedValue(null),
    findItemById: vi.fn().mockResolvedValue(null),
    findItemGateById: vi.fn().mockResolvedValue(null),
    findItemPage: vi.fn().mockResolvedValue([]),
    findSectionItemsPage: vi.fn().mockResolvedValue([]),
    findRecentlyPlayedPage: vi.fn().mockResolvedValue([]),
    hasRecentlyPlayed: vi.fn().mockResolvedValue(false),
    findPlaylistByDeity: vi.fn().mockResolvedValue([]),
    findPlaylistByCategory: vi.fn().mockResolvedValue([]),
    findPlaylistBySort: vi.fn().mockResolvedValue([]),
    findRecentlyPlayedPlaylist: vi.fn().mockResolvedValue([]),
    recordRecentlyPlayed: vi.fn(),
    getCounterPreference: vi.fn().mockResolvedValue(null),
    setCounterPreference: vi.fn(),
  };
}

const SAMPLE_TEXT = "पंक्ति एक (नमूना)\nपंक्ति दो (नमूना)\nपंक्ति तीन (नमूना)";

function itemRow(overrides: Partial<MantraRow> = {}): MantraRow {
  return {
    id: overrides.id ?? "item-1",
    title: overrides.title ?? "Ganesha Mantra (Sample)",
    type: overrides.type ?? "mantra",
    artworkUrl: overrides.artworkUrl ?? "https://cdn.example.com/a.png",
    audioUrl: overrides.audioUrl ?? "https://cdn.example.com/item-1.mp3",
    singerName: overrides.singerName ?? "Sample Vocalist",
    composerName: overrides.composerName ?? "Traditional (Placeholder)",
    mantraText: overrides.mantraText ?? SAMPLE_TEXT,
    transliterationText: overrides.transliterationText ?? "line one\nline two",
    languages: overrides.languages ?? [],
    description: overrides.description ?? null,
    deepLinkUrl: overrides.deepLinkUrl ?? "https://example.com/m/item-1",
    publishedAt: overrides.publishedAt ?? new Date("2026-06-01T00:00:00.000Z"),
    createdAt: overrides.createdAt ?? new Date("2026-05-01T00:00:00.000Z"),
    playCount: overrides.playCount ?? 0,
    isFeatured: overrides.isFeatured ?? false,
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
    getBySlug: (slug: string) =>
      Promise.resolve(
        deityCards.some((d) => d.slug === slug)
          ? { id: `d-${slug}`, slug, iconUrl: "https://x/i.png", sortOrder: 0, active: true }
          : null
      ),
  });
}

let repo: RepoMock;
let service: MantrasService;

beforeEach(() => {
  engagementCounts = {};
  likedIds = [];
  deityCards = [];
  likeCalls.length = 0;
  repo = makeRepo();
  // `MantrasService` only touches the public read/write methods above; the admin
  // methods (TAM-92) live on the same repo but are exercised by their own
  // surface, so the mock stays minimal via a double assertion.
  service = new MantrasService(repo as unknown as MantrasRepository);
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

describe("#EXPORT_CRITICAL entitlement gate on audioUrl", () => {
  test("a FREE user NEVER receives audioUrl (null on detail, listing, sections, playlist)", async () => {
    registerFacades("free");
    const row = itemRow({ id: "item-1", deitySlug: "ganesha" });
    repo.findItemById.mockResolvedValue(row);
    repo.findItemPage.mockResolvedValue([row]);
    repo.findPlaylistBySort.mockResolvedValue([row]);
    repo.findPlaylistByDeity.mockResolvedValue([row]);
    repo.findActiveSections.mockResolvedValue([
      { id: "sec-new", sectionType: "newly_added", title: "Newly Added", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 3 },
    ]);
    deityCards = [{ slug: "ganesha", displayName: "Ganesha", iconUrl: "https://x/g.png", sortOrder: 0 }];

    // detail
    const detail = await service.getItemDetail({ id: "item-1", userId: "free" });
    expect(detail.item.audioUrl).toBeNull();
    for (const p of detail.playlist) expect(p.audioUrl).toBeNull();

    // listing
    const list = await service.listItems({ userId: "free", limit: 20 });
    expect(list.items[0]?.audioUrl).toBeNull();

    // section preview
    const sections = await service.getSections("free");
    const preview = sections.sections[0]?.items[0];
    expect(preview && "audioUrl" in preview ? preview.audioUrl : "x").toBeNull();

    // deity playlist
    const pl = await service.getDeityPlaylist("ganesha", "free");
    expect(pl.firstItem?.audioUrl).toBeNull();
    for (const p of pl.playlist) expect(p.audioUrl).toBeNull();
  });

  test("a PRO user receives the audioUrl on detail, listing and playlist", async () => {
    registerFacades("active");
    const row = itemRow({ id: "item-1", audioUrl: "https://cdn.example.com/item-1.mp3", deitySlug: "ganesha" });
    repo.findItemById.mockResolvedValue(row);
    repo.findItemPage.mockResolvedValue([row]);
    repo.findPlaylistBySort.mockResolvedValue([row]);
    repo.findPlaylistByDeity.mockResolvedValue([row]);
    deityCards = [{ slug: "ganesha", displayName: "Ganesha", iconUrl: "https://x/g.png", sortOrder: 0 }];

    const detail = await service.getItemDetail({ id: "item-1", userId: "pro" });
    expect(detail.item.audioUrl).toBe("https://cdn.example.com/item-1.mp3");

    const list = await service.listItems({ userId: "pro", limit: 20 });
    expect(list.items[0]?.audioUrl).toBe("https://cdn.example.com/item-1.mp3");

    const pl = await service.getDeityPlaylist("ganesha", "pro");
    expect(pl.firstItem?.audioUrl).toBe("https://cdn.example.com/item-1.mp3");
  });

  test("entitlement service failure FAILS CLOSED (treated as free — no audioUrl)", async () => {
    registerFacades("throws");
    repo.findItemById.mockResolvedValue(itemRow({ id: "item-1" }));
    const detail = await service.getItemDetail({ id: "item-1", userId: "u" });
    expect(detail.item.audioUrl).toBeNull();
  });
});

describe("mantraText line-break preservation (#EXPORT_CRITICAL)", () => {
  test("mantraText round-trips through the service byte-for-byte (newlines intact)", async () => {
    registerFacades("active");
    repo.findItemById.mockResolvedValue(itemRow({ id: "item-1", mantraText: SAMPLE_TEXT }));
    const detail = await service.getItemDetail({ id: "item-1", userId: "u" });
    expect(detail.item.mantraText).toBe(SAMPLE_TEXT);
    expect(detail.item.mantraText.split("\n")).toHaveLength(3);
  });
});

describe("getSections assembly", () => {
  test("omits recently_played when the user has no history", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { id: "sec-recent", sectionType: "recently_played", title: "Recently Played", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 0 },
      { id: "sec-new", sectionType: "newly_added", title: "Newly Added", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 3 },
    ]);
    repo.findRecentlyPlayedPage.mockResolvedValue([]);
    repo.findItemPage.mockResolvedValue([itemRow({ id: "item-1" })]);

    const s = await service.getSections("u");
    expect(s.sections.map((x) => x.sectionType)).toEqual(["newly_added"]);
  });

  test("includes recently_played when history exists", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { id: "sec-recent", sectionType: "recently_played", title: "Recently Played", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 0 },
    ]);
    repo.findRecentlyPlayedPage.mockResolvedValue([
      { ...itemRow({ id: "item-9" }), lastPlayedAt: new Date() },
    ]);
    const s = await service.getSections("u");
    expect(s.sections.map((x) => x.sectionType)).toEqual(["recently_played"]);
    expect(s.sections[0]?.items).toHaveLength(1);
    expect(s.sections[0]?.layoutType).toBe("horizontal_cards");
  });

  test("omits empty sections and resolves deity + category cards", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { id: "sec-deities", sectionType: "deities", title: "Deities", layoutType: "deity_row", showAllEnabled: true, sortOrder: 1 },
      { id: "sec-cats", sectionType: "categories", title: "Categories", layoutType: "category_grid", showAllEnabled: true, sortOrder: 2 },
      { id: "sec-new", sectionType: "newly_added", title: "Newly", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 3 },
    ]);
    deityCards = [{ slug: "shiva", displayName: "Shiva", iconUrl: "https://x/s.png", sortOrder: 0 }];
    repo.findActiveCategories.mockResolvedValue([
      { id: "cat-1", slug: "peace", name: "Peace", imageUrl: null, backgroundColorToken: "#000", sortOrder: 0 },
    ]);
    repo.findItemPage.mockResolvedValue([]); // newly_added empty → omitted
    const s = await service.getSections("u");
    expect(s.sections.map((x) => x.sectionType)).toEqual(["deities", "categories"]);
    expect(s.sections[0]?.items[0]).toMatchObject({ kind: "deity", slug: "shiva" });
    expect(s.sections[1]?.items[0]).toMatchObject({ kind: "category", slug: "peace" });
  });
});

describe("curated sections (TAM-160)", () => {
  /** A `curated` section row as `findActiveSections` returns it. */
  function curatedSection(id: string, title: string, sortOrder: number) {
    return {
      id,
      sectionType: "curated",
      title,
      layoutType: "horizontal_cards",
      showAllEnabled: true,
      sortOrder,
    };
  }

  test("assembles a curated section in the SAVED position order and preserves sectionId", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      curatedSection("sec-80s", "Top Mantras for 80s kids", 3),
    ]);
    // The repo returns them already ordered by `(position, itemId)`.
    repo.findSectionItemsPage.mockResolvedValue([
      { ...itemRow({ id: "c" }), position: 0 },
      { ...itemRow({ id: "a" }), position: 1 },
      { ...itemRow({ id: "b" }), position: 2 },
    ]);

    const s = await service.getSections("u");
    expect(repo.findSectionItemsPage).toHaveBeenCalledWith({
      sectionId: "sec-80s",
      limit: 10,
    });
    expect(s.sections).toHaveLength(1);
    expect(s.sections[0]).toMatchObject({
      sectionId: "sec-80s",
      sectionType: "curated",
      title: "Top Mantras for 80s kids",
      // The editor's `layoutType` / `showAllEnabled` ride through unchanged.
      layoutType: "horizontal_cards",
      showAllEnabled: true,
    });
    expect(s.sections[0]?.items.map((i) => ("id" in i ? i.id : null))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  test("sectionId is present on EVERY section, not just curated ones", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      { id: "sec-new", sectionType: "newly_added", title: "Newly", layoutType: "horizontal_cards", showAllEnabled: true, sortOrder: 0 },
      curatedSection("sec-80s", "Curated", 1),
    ]);
    repo.findItemPage.mockResolvedValue([itemRow({ id: "n1" })]);
    repo.findSectionItemsPage.mockResolvedValue([
      { ...itemRow({ id: "c1" }), position: 0 },
    ]);

    const s = await service.getSections("u");
    expect(s.sections.map((x) => x.sectionId)).toEqual(["sec-new", "sec-80s"]);
  });

  test("a curated section with zero items is omitted (hide-when-empty)", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      curatedSection("sec-empty", "Empty", 1),
      curatedSection("sec-full", "Full", 2),
    ]);
    repo.findSectionItemsPage.mockImplementation(
      (p: { sectionId: string }) =>
        Promise.resolve(
          p.sectionId === "sec-full"
            ? [{ ...itemRow({ id: "c1" }), position: 0 }]
            : []
        )
    );

    const s = await service.getSections("u");
    expect(s.sections.map((x) => x.sectionId)).toEqual(["sec-full"]);
  });

  test("two curated sections both render, in the repo's sortOrder order", async () => {
    registerFacades("active");
    repo.findActiveSections.mockResolvedValue([
      curatedSection("sec-a", "First", 1),
      curatedSection("sec-b", "Second", 2),
    ]);
    repo.findSectionItemsPage.mockImplementation(
      (p: { sectionId: string }) =>
        Promise.resolve([
          { ...itemRow({ id: `${p.sectionId}-item` }), position: 0 },
        ])
    );

    const s = await service.getSections("u");
    expect(s.sections.map((x) => x.sectionId)).toEqual(["sec-a", "sec-b"]);
    expect(s.sections.map((x) => x.sortOrder)).toEqual([1, 2]);
  });

  test("#EXPORT_CRITICAL audioUrl is null on a curated preview for a FREE user, present for Pro", async () => {
    repo.findActiveSections.mockResolvedValue([curatedSection("sec-a", "C", 1)]);
    repo.findSectionItemsPage.mockResolvedValue([
      { ...itemRow({ id: "c1" }), position: 0 },
    ]);

    registerFacades("free");
    const free = await service.getSections("free-user");
    const freeItem = free.sections[0]?.items[0];
    expect(freeItem && "audioUrl" in freeItem ? freeItem.audioUrl : "x").toBeNull();

    clearGlobalServices();
    registerFacades("active");
    const pro = await service.getSections("pro-user");
    const proItem = pro.sections[0]?.items[0];
    expect(proItem && "audioUrl" in proItem ? proItem.audioUrl : null).toBe(
      "https://cdn.example.com/item-1.mp3"
    );
  });

  test("listItems({sectionId}) routes to the curated page and keysets on (position, id)", async () => {
    registerFacades("free");
    repo.findSectionItemsPage.mockResolvedValue([
      { ...itemRow({ id: "a" }), position: 0 },
      { ...itemRow({ id: "b" }), position: 1 },
      { ...itemRow({ id: "c" }), position: 2 },
    ]);

    const page = await service.listItems({
      userId: "u",
      sectionId: "22222222-2222-2222-2222-222222222222",
      limit: 2,
    });
    expect(repo.findItemPage).not.toHaveBeenCalled();
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    // The cursor carries the LAST returned row's `(position, id)`.
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: 1, id: "b" }));
  });

  test("sectionId combined with another primary filter → ValidationError (→400)", async () => {
    registerFacades("free");
    await expect(
      service.listItems({
        userId: "u",
        sectionId: "22222222-2222-2222-2222-222222222222",
        categoryId: "11111111-1111-1111-1111-111111111111",
        limit: 20,
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findSectionItemsPage).not.toHaveBeenCalled();
  });

  test("an unknown / non-curated sectionId yields an empty page, never an error", async () => {
    registerFacades("free");
    repo.findSectionItemsPage.mockResolvedValue([]);
    const page = await service.listItems({
      userId: "u",
      sectionId: "22222222-2222-2222-2222-222222222222",
      limit: 20,
    });
    expect(page).toEqual({ items: [], nextCursor: null });
  });
});

describe("listItems query resolution", () => {
  test("rejects more than one primary filter with a ValidationError (→400)", async () => {
    registerFacades("free");
    await expect(
      service.listItems({
        userId: "u",
        categoryId: "11111111-1111-1111-1111-111111111111",
        deityId: "shiva",
        limit: 20,
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findItemPage).not.toHaveBeenCalled();
  });

  test("sectionType=recently_played routes to the recently-played path (not findItemPage)", async () => {
    registerFacades("free");
    repo.findRecentlyPlayedPage.mockResolvedValue([]);
    await service.listItems({ userId: "u", sectionType: "recently_played", limit: 20 });
    expect(repo.findRecentlyPlayedPage).toHaveBeenCalled();
    expect(repo.findItemPage).not.toHaveBeenCalled();
  });

  test("default listing paging emits a nextCursor keyed on id when a page is full", async () => {
    registerFacades("free");
    // Default listing is a stable shuffle by id — the cursor keys on id alone
    // (the numeric part is a constant placeholder).
    repo.findItemPage.mockResolvedValue([
      itemRow({ id: "a" }),
      itemRow({ id: "b" }),
      itemRow({ id: "c" }),
    ]);
    const page = await service.listItems({ userId: "u", limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: 0, id: "b" }));
  });

  test("a malformed cursor throws before hitting the repo (→400)", async () => {
    registerFacades("free");
    await expect(
      service.listItems({ userId: "u", cursor: "@@bad@@", limit: 20 })
    ).rejects.toThrowError(/Invalid pagination cursor/);
  });
});

describe("playlist assembly", () => {
  test("deity playlist: firstItem is playlist[0], group id-ordered (stable shuffle)", async () => {
    registerFacades("active");
    deityCards = [{ slug: "shiva", displayName: "Shiva", iconUrl: "https://x/s.png", sortOrder: 0 }];
    repo.findPlaylistByDeity.mockResolvedValue([
      itemRow({ id: "s1" }),
      itemRow({ id: "s2" }),
      itemRow({ id: "s3" }),
    ]);
    const pl = await service.getDeityPlaylist("shiva", "u");
    expect(pl.playlistSource).toBe("deity");
    expect(pl.playlist.map((i) => i.id)).toEqual(["s1", "s2", "s3"]);
    expect(pl.firstItem?.id).toBe("s1");
  });

  test("deity playlist 404s for an unknown deity slug", async () => {
    registerFacades("active");
    deityCards = [];
    await expect(service.getDeityPlaylist("nope", "u")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("category playlist 404s for an unknown category id", async () => {
    registerFacades("active");
    repo.findCategoryById.mockResolvedValue(null);
    await expect(
      service.getCategoryPlaylist("22222222-2222-2222-2222-222222222222", "u")
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("detail with source=deity resolves the deity group as the playlist", async () => {
    registerFacades("active");
    repo.findItemById.mockResolvedValue(itemRow({ id: "s1", deitySlug: "shiva" }));
    repo.findPlaylistByDeity.mockResolvedValue([
      itemRow({ id: "s1" }),
      itemRow({ id: "s2" }),
    ]);
    const detail = await service.getItemDetail({ id: "s1", userId: "u", source: "deity", sourceId: "shiva" });
    expect(detail.playlistSource).toBe("deity");
    expect(detail.playlist.map((i) => i.id)).toEqual(["s1", "s2"]);
    expect(repo.findPlaylistByDeity).toHaveBeenCalledWith("shiva");
  });

  test("detail with no source falls back to the default listing playlist", async () => {
    registerFacades("active");
    repo.findItemById.mockResolvedValue(itemRow({ id: "s1" }));
    repo.findPlaylistBySort.mockResolvedValue([itemRow({ id: "s1" }), itemRow({ id: "s2" })]);
    const detail = await service.getItemDetail({ id: "s1", userId: "u" });
    expect(detail.playlistSource).toBe("listing");
    expect(repo.findPlaylistBySort).toHaveBeenCalledWith("default");
  });

  // TAM-160. `source` is TOLERANT: a surface name this server does not know
  // (a newer app build, a CMS-authored `curated` row) degrades to the default
  // playlist instead of 400ing. A strict enum here took playback out entirely.
  test("detail with an UNKNOWN source degrades to the listing playlist", async () => {
    registerFacades("active");
    repo.findItemById.mockResolvedValue(itemRow({ id: "s1" }));
    repo.findPlaylistBySort.mockResolvedValue([itemRow({ id: "s1" }), itemRow({ id: "s2" })]);
    const detail = await service.getItemDetail({ id: "s1", userId: "u", source: "curated" });
    expect(detail.playlistSource).toBe("listing");
    expect(repo.findPlaylistBySort).toHaveBeenCalledWith("default");
  });

  // Backward compatibility: widening the param must not change how any
  // PREVIOUSLY VALID source resolves.
  test("every known source still resolves exactly as before", async () => {
    registerFacades("active");
    repo.findItemById.mockResolvedValue(itemRow({ id: "s1", deitySlug: "shiva" }));
    repo.findPlaylistByDeity.mockResolvedValue([itemRow({ id: "s1" })]);
    repo.findPlaylistByCategory.mockResolvedValue([itemRow({ id: "s1" })]);
    repo.findPlaylistBySort.mockResolvedValue([itemRow({ id: "s1" })]);
    repo.findRecentlyPlayedPlaylist.mockResolvedValue([itemRow({ id: "s1" })]);
    for (const [source, expected] of [
      ["deity", "deity"],
      ["category", "category"],
      ["newly_added", "newly_added"],
      ["recently_played", "recently_played"],
      ["listing", "listing"],
    ] as const) {
      const detail = await service.getItemDetail({
        id: "s1",
        userId: "u",
        source,
        sourceId: source === "category" ? "cat-1" : undefined,
      });
      expect(detail.playlistSource).toBe(expected);
    }
  });

  test("detail 404s for an unknown item id", async () => {
    registerFacades("free");
    repo.findItemById.mockResolvedValue(null);
    await expect(service.getItemDetail({ id: "missing", userId: "u" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("recordRecentlyPlayed entitlement", () => {
  test("FREE user → 403 and NO write", async () => {
    registerFacades("free");
    await expect(
      service.recordRecentlyPlayed({ id: "item-1", userId: "free" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.recordRecentlyPlayed).not.toHaveBeenCalled();
    expect(repo.findItemGateById).not.toHaveBeenCalled();
  });

  test("PRO user → records and returns the new play state", async () => {
    registerFacades("active");
    repo.findItemGateById.mockResolvedValue({ id: "item-1" });
    repo.recordRecentlyPlayed.mockResolvedValue({
      playCount: 5,
      lastPlayedAt: new Date("2026-07-14T00:00:00.000Z"),
      lastProgressSeconds: 42,
    });
    const res = await service.recordRecentlyPlayed({ id: "item-1", userId: "pro", lastProgressSeconds: 42 });
    expect(repo.recordRecentlyPlayed).toHaveBeenCalledWith({
      userId: "pro",
      itemId: "item-1",
      lastProgressSeconds: 42,
    });
    expect(res.playCount).toBe(5);
    expect(res.lastProgressSeconds).toBe(42);
  });
});

describe("toggleLike (Pro-only, via engagement facade)", () => {
  test("FREE user → 403 and no engagement call", async () => {
    registerFacades("free");
    await expect(service.toggleLike("item-1", "free")).rejects.toMatchObject({ statusCode: 403 });
    expect(likeCalls).toEqual([]);
  });

  test("PRO user not-yet-liked → likes via the facade", async () => {
    registerFacades("active");
    repo.findItemGateById.mockResolvedValue({ id: "item-1" });
    likedIds = [];
    const res = await service.toggleLike("item-1", "pro");
    expect(likeCalls).toEqual(["like:item-1"]);
    expect(res.liked).toBe(true);
  });

  test("PRO user already-liked → unlikes via the facade", async () => {
    registerFacades("active");
    repo.findItemGateById.mockResolvedValue({ id: "item-1" });
    likedIds = ["item-1"];
    const res = await service.toggleLike("item-1", "pro");
    expect(likeCalls).toEqual(["unlike:item-1"]);
    expect(res.liked).toBe(false);
  });
});

describe("counter preference", () => {
  const OPTIONS = [7, 11, 21, 108, 1008];

  test("GET returns the default 7 when unset, with the option list", async () => {
    repo.getCounterPreference.mockResolvedValue(null);
    expect(await service.getCounterPreference("u")).toEqual({
      repeatTarget: 7,
      availableTargets: OPTIONS,
    });
  });

  test("GET returns the stored value, with the option list", async () => {
    repo.getCounterPreference.mockResolvedValue(108);
    expect(await service.getCounterPreference("u")).toEqual({
      repeatTarget: 108,
      availableTargets: OPTIONS,
    });
  });

  test("PUT persists and echoes the value, with the option list", async () => {
    repo.setCounterPreference.mockResolvedValue(21);
    expect(await service.setCounterPreference("u", 21)).toEqual({
      repeatTarget: 21,
      availableTargets: OPTIONS,
    });
    expect(repo.setCounterPreference).toHaveBeenCalledWith("u", 21);
  });

  test("availableTargets is the accepted set — every option the PUT would take", async () => {
    repo.getCounterPreference.mockResolvedValue(null);
    const { availableTargets } = await service.getCounterPreference("u");
    // The picker can never offer a value the write path rejects with a 400.
    for (const target of availableTargets) {
      repo.setCounterPreference.mockResolvedValue(target);
      const saved = await service.setCounterPreference("u", target as 7);
      expect(saved.repeatTarget).toBe(target);
    }
  });
});

describe("facade methods", () => {
  test("getItemSummary returns a compact summary with NO stream URL, or null", async () => {
    registerFacades("active");
    repo.findItemById.mockResolvedValueOnce(itemRow({ id: "item-1" }));
    const summary = await service.getItemSummary("item-1");
    expect(summary).toMatchObject({ id: "item-1", type: "mantra" });
    expect(summary && "audioUrl" in summary).toBe(false);

    repo.findItemById.mockResolvedValueOnce(null);
    expect(await service.getItemSummary("missing")).toBeNull();
  });

  test("getItemForShare returns share metadata without a stream URL", async () => {
    repo.findItemById.mockResolvedValue(itemRow({ id: "item-1" }));
    const share = await service.getItemForShare("item-1");
    expect(share).toMatchObject({ id: "item-1", deepLinkUrl: "https://example.com/m/item-1" });
    expect(share && "audioUrl" in share).toBe(false);
  });

  test("resolvePlaylist returns ordered summaries for a deity", async () => {
    repo.findPlaylistByDeity.mockResolvedValue([itemRow({ id: "s1" }), itemRow({ id: "s2" })]);
    const pl = await service.resolvePlaylist({ source: "deity", sourceId: "shiva", userId: "u" });
    expect(pl.map((i) => i.id)).toEqual(["s1", "s2"]);
    expect(pl[0] && "audioUrl" in pl[0]).toBe(false);
  });
});
