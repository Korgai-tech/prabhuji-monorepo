import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { ValidationError } from "@api/shared/errors";
import { encodeCursor } from "@api/shared/pagination";
import { clearPlanCache } from "@api/shared/rotation";
import type {
  WallpaperRepository,
  WallpaperRow,
} from "../../repositories/wallpaper.repository.js";
import { WallpaperService } from "../wallpaper.service.js";
import {
  fakeSubscriptionApi,
  freeStatus,
  proStatus,
} from "@api/shared/testing";

/**
 * Unit coverage for `WallpaperService` (TAM-69). The repo is mocked; the
 * engagement / deity FACADES are registered into `GlobalServiceMap` as fakes so
 * `performServiceCall` resolves them. DISCOVERY IS STILL FREE — the subscription
 * facade gates exactly two things (TAM-133): `liveWallpaperAssetUrl` and the
 * `set` counter. Everything else on these screens is returned to any
 * authenticated user, and the tests below pin that boundary in both
 * directions. Focus: per-`row_type` resolution
 * (incl. the personalized `liked` row), the empty-row / empty-liked omission,
 * the deityId ∥ rowId listing guard, the set-count increment, and the like/count
 * delegation to the engagement facade.
 */

interface RepoMock {
  findActiveRows: Mock;
  findRowById: Mock;
  findQueryRulePage: Mock;
  listRotationCandidates: Mock;
  findCustomRowItemsPage: Mock;
  findByIdsPage: Mock;
  findAllActiveIds: Mock;
  findById: Mock;
  findGateById: Mock;
  incrementSetCount: Mock;
}

function makeRepo(): RepoMock {
  return {
    findActiveRows: vi.fn().mockResolvedValue([]),
    findRowById: vi.fn().mockResolvedValue(null),
    findQueryRulePage: vi.fn().mockResolvedValue([]),
    listRotationCandidates: vi.fn().mockResolvedValue([]),
    findCustomRowItemsPage: vi.fn().mockResolvedValue([]),
    findByIdsPage: vi.fn().mockResolvedValue([]),
    findAllActiveIds: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findGateById: vi.fn().mockResolvedValue(null),
    incrementSetCount: vi.fn(),
  };
}

function wallpaperRow(overrides: Partial<WallpaperRow> = {}): WallpaperRow {
  return {
    id: overrides.id ?? "wp-1",
    slug: overrides.slug ?? "wp-1-sample",
    title: overrides.title ?? "Wallpaper (Sample)",
    mediaType: overrides.mediaType ?? "static",
    thumbnailUrl: overrides.thumbnailUrl ?? "https://cdn.example.com/t.png",
    previewImageUrl: overrides.previewImageUrl ?? "https://cdn.example.com/p.png",
    previewVideoUrl: overrides.previewVideoUrl ?? null,
    liveWallpaperAssetUrl: overrides.liveWallpaperAssetUrl ?? null,
    liveWallpaperPackage: overrides.liveWallpaperPackage ?? null,
    fallbackStaticThumbnailUrl: overrides.fallbackStaticThumbnailUrl ?? null,
    altText: overrides.altText ?? null,
    dominantColor: overrides.dominantColor ?? "#000000",
    supportedAndroidVersions: overrides.supportedAndroidVersions ?? [],
    focalPoint: overrides.focalPoint ?? { x: 0.5, y: 0.4 },
    safeAreaMetadata:
      overrides.safeAreaMetadata ?? { top: 0.1, bottom: 0.1, left: 0.05, right: 0.05 },
    setCount: overrides.setCount ?? 0,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date("2026-06-01T00:00:00.000Z"),
    deitySlug: overrides.deitySlug ?? null,
    languages: overrides.languages ?? [],
  };
}

interface RowConfig {
  id: string;
  rowKey: string;
  title: string;
  rowType: "top_live" | "new" | "trending" | "liked" | "custom";
  iconKey: string | null;
  mediaTypeFilter: "static" | "live" | null;
  deityTagFilter: string | null;
  maxItems: number;
  displayOrder: number;
  translations: { locale: string; title: string }[];
}

function rowConfig(overrides: Partial<RowConfig> = {}): RowConfig {
  return {
    id: overrides.id ?? "row-1",
    rowKey: overrides.rowKey ?? "row-1",
    title: overrides.title ?? "Row 1",
    rowType: overrides.rowType ?? "top_live",
    iconKey: overrides.iconKey ?? null,
    mediaTypeFilter: overrides.mediaTypeFilter ?? null,
    deityTagFilter: overrides.deityTagFilter ?? null,
    maxItems: overrides.maxItems ?? 20,
    displayOrder: overrides.displayOrder ?? 0,
    translations: overrides.translations ?? [],
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
const shareCalls: string[] = [];

/** Flipped per-test; the default is a free user, matching the app's majority. */
let entitled = false;

function registerFacades(): void {
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      getStatus: () => Promise.resolve(entitled ? proStatus() : freeStatus()),
    })
  );
  registerGlobalService("engagement", {
    getCounts: () => Promise.resolve(engagementCounts),
    getUserLikes: (p: { contentIds: string[] }) =>
      Promise.resolve(likedIds.filter((id) => p.contentIds.includes(id))),
    like: (p: { contentId: string }) => {
      likeCalls.push(`like:${p.contentId}`);
      return Promise.resolve({ liked: true, likeCount: 6 });
    },
    unlike: (p: { contentId: string }) => {
      likeCalls.push(`unlike:${p.contentId}`);
      return Promise.resolve({ liked: false, likeCount: 5 });
    },
    recordView: () => Promise.resolve({ viewCount: 1 }),
    recordShare: (p: { contentId: string }) => {
      shareCalls.push(`share:${p.contentId}`);
      return Promise.resolve({ shareCount: 9 });
    },
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
let service: WallpaperService;

/**
 * Stand up a rotatable catalogue for the `default`/`top_live` surfaces: the
 * candidates the plan is built from, plus a hydration that returns whatever
 * slice the plan asks for. The rotated ORDER is deliberately not asserted (it
 * changes every 2h by design).
 */
function mockCatalogue(rows: ReturnType<typeof wallpaperRow>[]): void {
  repo.listRotationCandidates.mockResolvedValue(
    rows.map((r) => ({ id: r.id, createdAtMs: r.createdAt.getTime(), score: r.setCount }))
  );
  repo.findByIdsPage.mockImplementation((p: { ids: string[] }) =>
    Promise.resolve(p.ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean))
  );
}

beforeEach(() => {
  clearPlanCache();
  engagementCounts = {};
  likedIds = [];
  deityCards = [
    { slug: "shiva", displayName: "Shiva", iconUrl: "https://x/s.png", sortOrder: 0 },
    { slug: "ganesha", displayName: "Ganesha", iconUrl: "https://x/g.png", sortOrder: 1 },
  ];
  likeCalls.length = 0;
  shareCalls.length = 0;
  repo = makeRepo();
  // The mock covers only the PUBLIC repo methods `WallpaperService` uses; the
  // TAM-96 admin methods are irrelevant here, so double-assert past the full
  // `WallpaperRepository` interface (behaviour unchanged).
  service = new WallpaperService(repo as unknown as WallpaperRepository);
  registerFacades();
});

afterEach(() => {
  clearGlobalServices();
  entitled = false;
  vi.restoreAllMocks();
});

describe("home row resolution", () => {
  test("top_live resolves only active live items, in rotated order", async () => {
    repo.findActiveRows.mockResolvedValue([rowConfig({ id: "r-live", rowType: "top_live" })]);
    mockCatalogue([wallpaperRow({ id: "l1", mediaType: "live", deitySlug: "shiva" })]);
    const home = await service.getHome("u");
    expect(repo.listRotationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "live" })
    );
    expect(home.rows).toHaveLength(1);
    expect(home.rows[0]?.items.map((i) => i.id)).toEqual(["l1"]);
    expect(home.rows[0]?.items[0]?.mediaType).toBe("live");
  });

  test("trending uses the trending sort; new uses newest", async () => {
    repo.findActiveRows.mockResolvedValue([
      rowConfig({ id: "r-tr", rowType: "trending", displayOrder: 0 }),
      rowConfig({ id: "r-new", rowType: "new", displayOrder: 1 }),
    ]);
    repo.findQueryRulePage.mockResolvedValue([wallpaperRow({ id: "w1" })]);
    await service.getHome("u");
    const sorts = repo.findQueryRulePage.mock.calls.map(
      (c) => (c[0] as { sort: string }).sort
    );
    expect(sorts).toContain("trending");
    expect(sorts).toContain("newest");
  });

  test("liked row returns only the user's liked wallpapers, and is omitted when empty", async () => {
    repo.findActiveRows.mockResolvedValue([rowConfig({ id: "r-liked", rowType: "liked" })]);
    repo.findAllActiveIds.mockResolvedValue(["w1", "w2", "w3"]);

    // no likes → liked row omitted
    likedIds = [];
    let home = await service.getHome("u");
    expect(home.rows).toHaveLength(0);
    expect(repo.findByIdsPage).not.toHaveBeenCalled();

    // has likes → liked row present, scoped to the user's liked ids
    likedIds = ["w2"];
    repo.findByIdsPage.mockResolvedValue([wallpaperRow({ id: "w2" })]);
    home = await service.getHome("u");
    expect(repo.findByIdsPage).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["w2"] })
    );
    expect(home.rows).toHaveLength(1);
    expect(home.rows[0]?.rowType).toBe("liked");
    expect(home.rows[0]?.items.map((i) => i.id)).toEqual(["w2"]);
  });

  test("empty query-rule rows are omitted from home", async () => {
    repo.findActiveRows.mockResolvedValue([
      rowConfig({ id: "r-empty", rowType: "top_live" }),
      rowConfig({ id: "r-full", rowType: "trending" }),
    ]);
    mockCatalogue([]); // top_live's rotated catalogue is empty
    repo.findQueryRulePage.mockResolvedValue([wallpaperRow({ id: "w1" })]); // trending has one
    const home = await service.getHome("u");
    expect(home.rows.map((r) => r.rowId)).toEqual(["r-full"]);
  });

  test("home returns deity filter chips with All Gods pinned first", async () => {
    repo.findActiveRows.mockResolvedValue([]);
    const home = await service.getHome("u");
    expect(home.deityFilters[0]).toMatchObject({ slug: "all", displayName: "All Gods" });
    expect(home.deityFilters.map((f) => f.slug)).toEqual(["all", "shiva", "ganesha"]);
  });

  test("home cards carry engagement counts + likedByMe", async () => {
    repo.findActiveRows.mockResolvedValue([rowConfig({ id: "r", rowType: "trending" })]);
    repo.findQueryRulePage.mockResolvedValue([wallpaperRow({ id: "w1", setCount: 42 })]);
    engagementCounts = { w1: { contentId: "w1", likeCount: 7, viewCount: 0, shareCount: 3 } };
    likedIds = ["w1"];
    const home = await service.getHome("u");
    const card = home.rows[0]?.items[0];
    expect(card).toMatchObject({ setCount: 42, likeCount: 7, shareCount: 3, likedByMe: true });
  });
});

describe("listing", () => {
  test("rejects deityId AND rowId together (→ ValidationError)", async () => {
    await expect(
      service.list({ userId: "u", deityId: "shiva", rowId: "11111111-1111-1111-1111-111111111111", limit: 20 })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findQueryRulePage).not.toHaveBeenCalled();
  });

  test("deityId filter pages the rotated default listing without skips or repeats", async () => {
    mockCatalogue([
      wallpaperRow({ id: "a" }),
      wallpaperRow({ id: "b" }),
      wallpaperRow({ id: "c" }),
    ]);
    const first = await service.list({ userId: "u", deityId: "shiva", limit: 2 });
    expect(repo.listRotationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ deitySlug: "shiva" })
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.list({
      userId: "u",
      deityId: "shiva",
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("rowId listing resolves the row config then applies its rule (trending keyset on setCount)", async () => {
    repo.findRowById.mockResolvedValue(rowConfig({ id: "row-tr", rowType: "trending" }));
    repo.findQueryRulePage.mockResolvedValue([
      wallpaperRow({ id: "a", setCount: 300 }),
      wallpaperRow({ id: "b", setCount: 200 }),
      wallpaperRow({ id: "c", setCount: 100 }),
    ]);
    const page = await service.list({ userId: "u", rowId: "row-tr", limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: 200, id: "b" }));
  });

  test("unknown rowId → 404", async () => {
    repo.findRowById.mockResolvedValue(null);
    await expect(
      service.list({ userId: "u", rowId: "11111111-1111-1111-1111-111111111111", limit: 20 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("a stale or malformed cursor restarts the rotated listing instead of 400ing", async () => {
    mockCatalogue([wallpaperRow({ id: "a" }), wallpaperRow({ id: "b" })]);
    // an old-format keyset cursor, minted before rotation shipped
    for (const cursor of [encodeCursor({ sortOrder: 0, id: "a" }), "@@bad@@"]) {
      const page = await service.list({ userId: "u", deityId: "shiva", cursor, limit: 20 });
      expect(page.items).toHaveLength(2);
    }
  });

  test("a malformed cursor on a RANKED row still throws a ValidationError (→400)", async () => {
    repo.findRowById.mockResolvedValue(rowConfig({ id: "row-tr", rowType: "trending" }));
    await expect(
      service.list({ userId: "u", rowId: "row-tr", cursor: "@@bad@@", limit: 20 })
    ).rejects.toThrowError(/Invalid pagination cursor/);
  });
});

describe("detail", () => {
  test("returns full detail incl. asset fields + resolved single deity + raw counts", async () => {
    repo.findById.mockResolvedValue(
      wallpaperRow({
        id: "wp-1",
        mediaType: "live",
        previewVideoUrl: "https://cdn.example.com/v.mp4",
        liveWallpaperAssetUrl: "https://cdn.example.com/v-live.mp4",
        deitySlug: "shiva",
        languages: ["hi", "mr"],
        setCount: 12,
      })
    );
    engagementCounts = { "wp-1": { contentId: "wp-1", likeCount: 4, viewCount: 0, shareCount: 2 } };
    likedIds = ["wp-1"];
    // Pro: the live asset URL is the one gated field, so the "full detail"
    // assertion below only holds for an entitled caller.
    entitled = true;
    const d = await service.getDetail("wp-1", "u");
    expect(d.previewVideoUrl).toBe("https://cdn.example.com/v.mp4");
    expect(d.liveWallpaperAssetUrl).toBe("https://cdn.example.com/v-live.mp4");
    expect(d.deity).toEqual({
      slug: "shiva",
      displayName: "Shiva",
      iconUrl: "https://x/s.png",
    });
    expect(d.languages).toEqual(["hi", "mr"]);
    expect(d).toMatchObject({ setCount: 12, likeCount: 4, shareCount: 2, likedByMe: true });
    expect(d.focalPoint).toEqual({ x: 0.5, y: 0.4 });
  });

  test("unknown id → 404", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getDetail("missing", "u")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("like toggle (via engagement facade, FREE — no entitlement gate)", () => {
  test("not-yet-liked → likes via the facade", async () => {
    repo.findGateById.mockResolvedValue({ id: "wp-1" });
    likedIds = [];
    const res = await service.toggleLike("wp-1", "u");
    expect(likeCalls).toEqual(["like:wp-1"]);
    expect(res).toMatchObject({ wallpaperId: "wp-1", liked: true, likeCount: 6 });
  });

  test("already-liked → unlikes via the facade", async () => {
    repo.findGateById.mockResolvedValue({ id: "wp-1" });
    likedIds = ["wp-1"];
    const res = await service.toggleLike("wp-1", "u");
    expect(likeCalls).toEqual(["unlike:wp-1"]);
    expect(res.liked).toBe(false);
  });

  test("unknown id → 404, no engagement call", async () => {
    repo.findGateById.mockResolvedValue(null);
    await expect(service.toggleLike("missing", "u")).rejects.toMatchObject({ statusCode: 404 });
    expect(likeCalls).toEqual([]);
  });
});

describe("the two Pro gates", () => {
  test("a free user gets no live-wallpaper asset, but keeps every preview field", async () => {
    repo.findById.mockResolvedValue(
      wallpaperRow({
        id: "wp-1",
        mediaType: "live",
        previewVideoUrl: "https://cdn.example.com/v.mp4",
        liveWallpaperAssetUrl: "https://cdn.example.com/v-live.mp4",
      })
    );
    const d = await service.getDetail("wp-1", "u");

    expect(d.liveWallpaperAssetUrl).toBeNull();
    // DISCOVERY IS FREE. `previewImageUrl` in particular must stay populated —
    // it already ships on every free grid card, and the free full-screen
    // preview renders from it.
    expect(d.previewImageUrl).not.toBeNull();
    expect(d.previewVideoUrl).toBe("https://cdn.example.com/v.mp4");
    expect(d.thumbnailUrl).not.toBeNull();
  });

  test("a Pro user gets the live asset", async () => {
    repo.findById.mockResolvedValue(
      wallpaperRow({
        id: "wp-1",
        mediaType: "live",
        liveWallpaperAssetUrl: "https://cdn.example.com/v-live.mp4",
      })
    );
    entitled = true;
    const d = await service.getDetail("wp-1", "u");
    expect(d.liveWallpaperAssetUrl).toBe("https://cdn.example.com/v-live.mp4");
  });
});

describe("count increments", () => {
  test("type=set increments the LOCAL set_count by exactly 1 and returns it", async () => {
    repo.findGateById.mockResolvedValue({ id: "wp-1" });
    repo.incrementSetCount.mockResolvedValue({ setCount: 101 });
    entitled = true;
    const res = await service.recordCount("wp-1", "u", "set");
    expect(repo.incrementSetCount).toHaveBeenCalledWith("wp-1");
    expect(res).toEqual({ wallpaperId: "wp-1", type: "set", count: 101 });
    expect(shareCalls).toEqual([]);
  });

  test("a free user cannot inflate the set counter", async () => {
    // Not merely an entitlement rule: `setCount` orders the `trending` home row
    // and the admin sort, so an ungated counter let anyone with a JWT push a
    // wallpaper up the home screen by POSTing in a loop.
    repo.findGateById.mockResolvedValue({ id: "wp-1" });
    await expect(service.recordCount("wp-1", "u", "set")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.incrementSetCount).not.toHaveBeenCalled();
  });

  test("share stays free", async () => {
    repo.findGateById.mockResolvedValue({ id: "wp-1" });
    const res = await service.recordCount("wp-1", "u", "share");
    expect(res.count).toBe(9);
  });

  test("type=share increments via the engagement share counter", async () => {
    repo.findGateById.mockResolvedValue({ id: "wp-1" });
    const res = await service.recordCount("wp-1", "u", "share");
    expect(shareCalls).toEqual(["share:wp-1"]);
    expect(res).toEqual({ wallpaperId: "wp-1", type: "share", count: 9 });
    expect(repo.incrementSetCount).not.toHaveBeenCalled();
  });

  test("unknown id → 404", async () => {
    repo.findGateById.mockResolvedValue(null);
    await expect(service.recordCount("missing", "u", "set")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("facade methods", () => {
  test("getPreview returns a compact card or null", async () => {
    repo.findById.mockResolvedValueOnce(wallpaperRow({ id: "wp-1", mediaType: "live" }));
    const preview = await service.getPreview("wp-1");
    expect(preview).toMatchObject({ id: "wp-1", mediaType: "live" });
    repo.findById.mockResolvedValueOnce(null);
    expect(await service.getPreview("missing")).toBeNull();
  });

  test("getForShare returns thumbnail-only share metadata (never a full-res image)", async () => {
    repo.findById.mockResolvedValue(wallpaperRow({ id: "wp-1" }));
    const share = await service.getForShare("wp-1");
    expect(share).toEqual({
      id: "wp-1",
      title: "Wallpaper (Sample)",
      thumbnailUrl: "https://cdn.example.com/t.png",
    });
    expect(share && "previewImageUrl" in share).toBe(false);
  });
});
