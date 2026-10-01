import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { decodeRotationCursor, encodeCursor } from "@api/shared/pagination";
import { resetEnvCache } from "@api/shared/config";
import { clearPlanCache } from "@api/shared/rotation";
import { analyticsEventsClient, FEED_ANALYTICS_EVENT } from "@api/shared/analytics";
import type {
  HomeBannerRow,
  HomeFeedRow,
  HomeRepository,
  HomeShortcutRow,
  HomeShortcutVariantRow,
} from "../../repositories/home.repository.js";
import { HomeService } from "../home.service.js";
import type { IUsersApi } from "@api/core/users/api";

/**
 * Unit coverage for `HomeService` (TAM-61). The repo is mocked; the engagement
 * FACADE is registered into `GlobalServiceMap` as a fake so `performServiceCall`
 * resolves it (there is NO subscription facade — Home is never Pro-gated). Focus:
 * banner ordering + the informational/pro_paywall contract guards; feed ordering
 * (CMS vs trending-first) preserving mixed content types; the opaque cursor
 * round-trip + malformed-cursor rejection; feed engagement enrichment; and the
 * like/view/share forwarders.
 */

interface RepoMock {
  listActiveBanners: Mock;
  listActiveShortcuts: Mock;
  listFeedPage: Mock;
  listFeedRotationCandidates: Mock;
  findFeedByIds: Mock;
  findFeedItemById: Mock;
  getSettings: Mock;
}

function makeRepo(): RepoMock {
  return {
    listActiveBanners: vi.fn().mockResolvedValue([]),
    listActiveShortcuts: vi.fn().mockResolvedValue([]),
    listFeedPage: vi.fn().mockResolvedValue([]),
    listFeedRotationCandidates: vi.fn().mockResolvedValue([]),
    findFeedByIds: vi.fn().mockResolvedValue([]),
    findFeedItemById: vi.fn().mockResolvedValue(null),
    getSettings: vi
      .fn()
      .mockResolvedValue({ feedTrendingFirst: false, shortcutGridGradientEnabled: false }),
  };
}

function shortcut(overrides: Partial<HomeShortcutRow> = {}): HomeShortcutRow {
  return {
    id: overrides.id ?? "s-1",
    key: overrides.key ?? "aarti_bhajans",
    label: overrides.label ?? "Aarti & Bhajans",
    destinationType: overrides.destinationType ?? "linked_module",
    destinationValue:
      overrides.destinationValue !== undefined ? overrides.destinationValue : "aarti",
    iconKey: overrides.iconKey !== undefined ? overrides.iconKey : "aarti",
    // TAM-132 — nullable CMS-owned icon URL; null by default so tests don't
    // need to invent a URL unless they specifically exercise the field.
    iconUrl: overrides.iconUrl !== undefined ? overrides.iconUrl : null,
    // TAM-132 BC gate — null by default (visible to every client). Set a
    // semver string to exercise the version filter.
    minAppVersion:
      overrides.minAppVersion !== undefined ? overrides.minAppVersion : null,
    // TAM-174 — no arm overrides by default, i.e. every caller sees the base
    // tile (exactly the pre-TAM-174 behaviour). Pass `variants: BOTH_ARMS` to
    // exercise the experiment.
    variants: overrides.variants ?? [],
    sortOrder: overrides.sortOrder ?? 0,
    translations: overrides.translations ?? [],
  };
}

/** The `set_status` palette from Figma node 3760:28483. */
const PALETTE = {
  themeBackgroundFrom: "#EAF4FF",
  themeBackgroundFromStop: 0.1,
  themeBackgroundTo: "#3896E9",
  themeBackgroundToStop: 1,
  themeLabelColor: "#1261A8",
} as const;

/** A variant row with no overrides at all — every field inherits the base. */
const EMPTY_OVERRIDES = {
  label: null,
  iconUrl: null,
  minAppVersion: null,
  themeBackgroundFrom: null,
  themeBackgroundFromStop: null,
  themeBackgroundTo: null,
  themeBackgroundToStop: null,
  themeLabelColor: null,
} as const;

/**
 * Both arms as the CMS holds them: control carries its own artwork but NO
 * palette (so the client paints its shipped gradient), and gradient_v1 carries
 * its own copy, artwork AND palette.
 */
const BOTH_ARMS: HomeShortcutVariantRow[] = [
  // Control carries its own artwork ONLY in this fixture, to prove the overlay
  // works for any arm. The SEED deliberately authors no control row — control
  // is the shipping design and must inherit the base row's live CMS icons.
  {
    ...EMPTY_OVERRIDES,
    variant: "control",
    iconUrl: "https://cdn.example.com/control/status.png",
  },
  {
    ...EMPTY_OVERRIDES,
    variant: "gradient_v1",
    label: "स्टेटस लगाएं",
    iconUrl: "https://cdn.example.com/gradient/status.png",
    ...PALETTE,
  },
];

/** The gradient arm with the backwards-compat gate the seed sets. */
const GATED_GRADIENT: HomeShortcutVariantRow[] = [
  {
    ...EMPTY_OVERRIDES,
    variant: "gradient_v1",
    minAppVersion: "1.1.0",
    label: "स्टेटस लगाएं",
    iconUrl: "https://cdn.example.com/gradient/status.png",
    ...PALETTE,
  },
];

function banner(overrides: Partial<HomeBannerRow> = {}): HomeBannerRow {
  return {
    id: overrides.id ?? "b-1",
    mediaType: overrides.mediaType ?? "image",
    mediaUrl: overrides.mediaUrl ?? "https://cdn.example.com/b.png",
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    title: overrides.title ?? "Banner",
    destinationType: overrides.destinationType ?? "linked_module",
    destinationValue:
      overrides.destinationValue !== undefined ? overrides.destinationValue : "wallpaper",
    isProFeatureDiscovery: overrides.isProFeatureDiscovery ?? false,
    sortOrder: overrides.sortOrder ?? 0,
    translations: overrides.translations ?? [],
  };
}

function feedRow(overrides: Partial<HomeFeedRow> = {}): HomeFeedRow {
  return {
    id: overrides.id ?? "f-1",
    contentType: overrides.contentType ?? "wallpaper",
    module: overrides.module ?? "wallpaper",
    title: overrides.title ?? "Feed item",
    subtitle: overrides.subtitle ?? null,
    label: overrides.label ?? null,
    badge: overrides.badge ?? null,
    badgeLabel: overrides.badgeLabel ?? null,
    heroImageUrl: overrides.heroImageUrl ?? "https://cdn.example.com/h.png",
    audioPreviewUrl: overrides.audioPreviewUrl ?? null,
    ctaLabel: overrides.ctaLabel ?? "Open",
    ctaDestinationType: overrides.ctaDestinationType ?? "content_detail",
    ctaDestinationValue: overrides.ctaDestinationValue ?? "some-slug",
    ctaContentId: overrides.ctaContentId ?? null,
    headerDestinationModule: overrides.headerDestinationModule ?? "wallpaper",
    shareTitle: overrides.shareTitle ?? "Share",
    shareText: overrides.shareText ?? "text",
    shareDeepLink: overrides.shareDeepLink ?? "https://example.com/x",
    shareThumbnailUrl: overrides.shareThumbnailUrl ?? null,
    trendingScore: overrides.trendingScore ?? null,
    translations: overrides.translations ?? [],
  };
}

let engagementCounts: Record<
  string,
  { contentId: string; likeCount: number; viewCount: number; shareCount: number }
> = {};
let likedIds: string[] = [];
const likeCalls: string[] = [];
const viewCalls: string[] = [];
const shareCalls: string[] = [];
let lastContentType: string | null = null;

function registerFacades(): void {
  registerGlobalService("engagement", {
    getCounts: (p: { contentType: string; contentIds: string[] }) => {
      lastContentType = p.contentType;
      return Promise.resolve(engagementCounts);
    },
    getUserLikes: (p: { contentType: string; contentIds: string[] }) =>
      Promise.resolve(likedIds.filter((id) => p.contentIds.includes(id))),
    like: (p: { contentType: string; contentId: string }) => {
      likeCalls.push(`like:${p.contentType}:${p.contentId}`);
      return Promise.resolve({ liked: true, likeCount: 6 });
    },
    unlike: (p: { contentType: string; contentId: string }) => {
      likeCalls.push(`unlike:${p.contentType}:${p.contentId}`);
      return Promise.resolve({ liked: false, likeCount: 5 });
    },
    recordView: (p: { contentType: string; contentId: string }) => {
      viewCalls.push(`view:${p.contentType}:${p.contentId}`);
      return Promise.resolve({ viewCount: 42 });
    },
    recordShare: (p: { contentType: string; contentId: string }) => {
      shareCalls.push(`share:${p.contentType}:${p.contentId}`);
      return Promise.resolve({ shareCount: 7 });
    },
  });
  // TAM-173: home feed reads active pins per request. The default fake
  // returns [] so pre-TAM-173 tests continue to assert the empty-pins
  // (byte-identical) response shape; per-test overrides use `pinnedIds`.
  registerGlobalService("pinnedContent", {
    getActivePinnedIds: () => Promise.resolve(pinnedIds),
  });
}

let pinnedIds: { id: string; contentId: string; pinPosition: number }[] = [];

let repo: RepoMock;
let service: HomeService;

/**
 * Stand up a rotatable feed catalogue: the candidates the plan is built from,
 * plus a hydration that returns whatever slice the plan asks for. The rotated
 * ORDER is deliberately not asserted (it changes every 12h by design) — the
 * feed tests pin down that paging serves every card exactly once, and that the
 * mixed content types survive.
 */
function mockFeed(rows: HomeFeedRow[]): void {
  repo.listFeedRotationCandidates.mockResolvedValue(
    rows.map((r) => ({
      id: r.id,
      contentType: r.contentType,
      createdAtMs: Date.parse("2026-01-01T00:00:00.000Z"),
    }))
  );
  repo.findFeedByIds.mockImplementation((ids: string[]) =>
    Promise.resolve(ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean))
  );
}

beforeEach(() => {
  clearPlanCache();
  engagementCounts = {};
  likedIds = [];
  likeCalls.length = 0;
  viewCalls.length = 0;
  shareCalls.length = 0;
  lastContentType = null;
  pinnedIds = [];
  repo = makeRepo();
  // RepoMock implements only the public methods the service calls; the repo's
  // private segment helpers make it nominal, so cast through unknown.
  service = new HomeService(repo as unknown as HomeRepository);
  registerFacades();
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

describe("banners", () => {
  test("returns banners in repo (sortOrder) order", async () => {
    repo.listActiveBanners.mockResolvedValue([
      banner({ id: "b-0", sortOrder: 0 }),
      banner({ id: "b-1", sortOrder: 1 }),
    ]);
    const { banners } = await service.getBanners();
    expect(banners.map((b) => b.id)).toEqual(["b-0", "b-1"]);
  });

  test("empty banner set → data.banners is [] (not an error)", async () => {
    repo.listActiveBanners.mockResolvedValue([]);
    const { banners } = await service.getBanners();
    expect(banners).toEqual([]);
  });

  test("informational rows carry a null destinationValue (non-navigable)", async () => {
    repo.listActiveBanners.mockResolvedValue([
      banner({ destinationType: "informational", destinationValue: "should-be-nulled" }),
    ]);
    const { banners } = await service.getBanners();
    expect(banners[0]?.destinationValue).toBeNull();
  });

  test("pro_paywall rows force isProFeatureDiscovery=true even if stored false", async () => {
    repo.listActiveBanners.mockResolvedValue([
      banner({
        destinationType: "pro_paywall",
        destinationValue: "plan-1",
        isProFeatureDiscovery: false,
      }),
    ]);
    const { banners } = await service.getBanners();
    expect(banners[0]?.isProFeatureDiscovery).toBe(true);
    expect(banners[0]?.destinationValue).toBe("plan-1");
  });
});

describe("shortcuts", () => {
  test("returns active shortcuts in repo (sortOrder) order with label + key", async () => {
    repo.listActiveShortcuts.mockResolvedValue([
      shortcut({ id: "s-1", key: "aarti_bhajans", label: "Aarti & Bhajans", sortOrder: 0 }),
      shortcut({
        id: "s-2",
        key: "set_wallpaper",
        label: "Set Wallpaper",
        destinationValue: "wallpaper",
        iconKey: "wallpaper",
        sortOrder: 1,
      }),
    ]);
    const { shortcuts } = await service.getShortcuts();
    expect(shortcuts.map((s) => s.key)).toEqual(["aarti_bhajans", "set_wallpaper"]);
    expect(shortcuts.map((s) => s.label)).toEqual(["Aarti & Bhajans", "Set Wallpaper"]);
    expect(shortcuts.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  test("empty shortcut set → data.shortcuts is [] (not an error)", async () => {
    repo.listActiveShortcuts.mockResolvedValue([]);
    expect(await service.getShortcuts()).toEqual({ shortcuts: [] });
  });

  test("destinationValue is a stable allowlist KEY, never a URL", async () => {
    repo.listActiveShortcuts.mockResolvedValue([
      shortcut({ destinationValue: "wallpaper" }),
    ]);
    const { shortcuts } = await service.getShortcuts();
    expect(shortcuts[0]?.destinationValue).toBe("wallpaper");
    expect(shortcuts[0]?.destinationValue).not.toMatch(/^https?:|\//);
  });

  test("informational rows carry a null destinationValue (non-navigable)", async () => {
    repo.listActiveShortcuts.mockResolvedValue([
      shortcut({ destinationType: "informational", destinationValue: "leaked-key" }),
    ]);
    const { shortcuts } = await service.getShortcuts();
    expect(shortcuts[0]?.destinationValue).toBeNull();
  });
});

describe("label localization (TAM-113)", () => {
  test("banner title resolves to the requested-locale override; locale forwarded to the repo", async () => {
    repo.listActiveBanners.mockResolvedValue([
      banner({ title: "Banner", translations: [{ locale: "hi", title: "बैनर" }] }),
    ]);
    const { banners } = await service.getBanners({ locale: "hi" });
    expect(banners[0]?.title).toBe("बैनर");
    expect(repo.listActiveBanners).toHaveBeenCalledWith("hi");
  });

  test("banner title falls back to the base column when locale is omitted", async () => {
    repo.listActiveBanners.mockResolvedValue([banner({ title: "Banner" })]);
    const { banners } = await service.getBanners();
    expect(banners[0]?.title).toBe("Banner");
    expect(repo.listActiveBanners).toHaveBeenCalledWith(undefined);
  });

  test("banner nullable title stays null when neither override nor base exists", async () => {
    const nullTitleBanner = banner();
    nullTitleBanner.title = null; // fixture coalesces `title ?? "Banner"`, so set it after
    repo.listActiveBanners.mockResolvedValue([nullTitleBanner]);
    const { banners } = await service.getBanners({ locale: "hi" });
    expect(banners[0]?.title).toBeNull();
  });

  test("shortcut label resolves to the requested-locale override", async () => {
    repo.listActiveShortcuts.mockResolvedValue([
      shortcut({ label: "Aarti & Bhajans", translations: [{ locale: "mr", label: "आरती" }] }),
    ]);
    const { shortcuts } = await service.getShortcuts({ locale: "mr" });
    expect(shortcuts[0]?.label).toBe("आरती");
    expect(repo.listActiveShortcuts).toHaveBeenCalledWith("mr");
  });

  test("feed card localizes title/subtitle/label/ctaLabel and forwards locale", async () => {
    mockFeed([
      feedRow({
        id: "f-1",
        title: "Title",
        subtitle: "Sub",
        label: null,
        ctaLabel: "Open",
        translations: [
          { locale: "hi", title: "शीर्षक", subtitle: "उप", label: "लेबल", ctaLabel: "खोलें", badgeLabel: null },
        ],
      }),
    ]);
    const page = await service.getFeed({ userId: "u", limit: 10, locale: "hi" });
    expect(page.items[0]).toMatchObject({
      title: "शीर्षक",
      subtitle: "उप",
      label: "लेबल",
      ctaLabel: "खोलें",
    });
    expect(repo.findFeedByIds).toHaveBeenCalledWith(expect.any(Array), "hi");
  });

  test("feed badgeLabel localizes while the badge/badgeLabel invariant holds", async () => {
    mockFeed([
      feedRow({
        id: "f-1",
        badge: "trending",
        badgeLabel: "TRENDING",
        translations: [
          { locale: "hi", title: "t", subtitle: null, label: null, ctaLabel: "c", badgeLabel: "ट्रेंडिंग" },
        ],
      }),
    ]);
    const page = await service.getFeed({ userId: "u", limit: 10, locale: "hi" });
    expect(page.items[0]?.badge).toBe("trending");
    expect(page.items[0]?.badgeLabel).toBe("ट्रेंडिंग");
  });

  test("feed labels fall back to base columns when locale is omitted", async () => {
    mockFeed([feedRow({ id: "f-1", title: "Title", ctaLabel: "Open" })]);
    const page = await service.getFeed({ userId: "u", limit: 10 });
    expect(page.items[0]?.title).toBe("Title");
    expect(page.items[0]?.ctaLabel).toBe("Open");
    expect(repo.findFeedByIds).toHaveBeenCalledWith(expect.any(Array), undefined);
  });
});

describe("feed — rotated order (flag off)", () => {
  test("pages the plan without skips or repeats, enriched via home_item", async () => {
    repo.getSettings.mockResolvedValue({ feedTrendingFirst: false });
    mockFeed([
      feedRow({ id: "a", contentType: "wallpaper" }),
      feedRow({ id: "b", contentType: "aarti" }),
      feedRow({ id: "c", contentType: "status" }),
    ]);
    engagementCounts = { a: { contentId: "a", likeCount: 3, viewCount: 9, shareCount: 1 } };
    likedIds = ["a"];

    const first = await service.getFeed({ userId: "u", limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    // engagement is keyed on the constant home_item contentType
    expect(lastContentType).toBe("home_item");

    const second = await service.getFeed({
      userId: "u",
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const served = [...first.items, ...second.items];
    expect(served.map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
    // mixed content types are preserved (never grouped)
    expect(new Set(served.map((i) => i.contentType)).size).toBe(3);
    expect(served.find((i) => i.id === "a")).toMatchObject({
      likeCount: 3,
      viewCount: 9,
      shareCount: 1,
      likedByMe: true,
    });
    // the keyset path is NOT used when the CMS override is off
    expect(repo.listFeedPage).not.toHaveBeenCalled();
  });

  test("one content type never clumps: the plan interleaves the types", async () => {
    // Three types, six cards each — while every type still has stock, no two
    // neighbours may share a type (the block order rotates by one per block, so
    // the boundary between blocks is a change too).
    mockFeed(
      (["wallpaper", "status", "mantra"] as const).flatMap((contentType) =>
        Array.from({ length: 6 }, (_, i) =>
          feedRow({ id: `${contentType}-${i}`, contentType })
        )
      )
    );
    const page = await service.getFeed({ userId: "u", limit: 12 });
    const types = page.items.map((i) => i.contentType);
    expect(types).toHaveLength(12);
    for (let i = 1; i < types.length; i += 1) {
      expect(types[i]).not.toBe(types[i - 1]);
    }
  });

  test("the refresh epoch is pinned in the cursor, so a mid-scroll refresh cannot reorder", async () => {
    mockFeed([feedRow({ id: "a" }), feedRow({ id: "b" }), feedRow({ id: "c" })]);
    const first = await service.getFeed({ userId: "u", limit: 1 });
    // a later refresh rebuilds plans, but the open session keeps paging its own
    clearPlanCache();
    const second = await service.getFeed({
      userId: "u",
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    const third = await service.getFeed({
      userId: "u",
      limit: 1,
      cursor: second.nextCursor ?? undefined,
    });
    expect([first, second, third].flatMap((p) => p.items.map((i) => i.id)).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("empty catalogue → empty items, null cursor, no hydration", async () => {
    const page = await service.getFeed({ userId: "u", limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(repo.findFeedByIds).not.toHaveBeenCalled();
  });

  test("emits bk_feed_refresh_triggered once per refresh, with the spec's properties", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue();
    mockFeed([
      feedRow({ id: "w1", contentType: "wallpaper" }),
      feedRow({ id: "w2", contentType: "wallpaper" }),
      feedRow({ id: "s1", contentType: "status" }),
    ]);

    await service.getFeed({ userId: "u", limit: 10 });

    expect(send).toHaveBeenCalledTimes(1);
    const event = send.mock.calls[0]?.[0]?.[0];
    expect(event?.event_type).toBe(FEED_ANALYTICS_EVENT.REFRESH_TRIGGERED);
    expect(event?.event_type).toBe("bk_feed_refresh_triggered");
    // The warehouse's `user_id` is a UUID column: anything else is dropped by
    // ClickPipe with no error here (TAM-188 — every refresh was lost that way).
    expect(event?.user_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    // §6 of the spec: exactly refresh_id, refresh_time, content_type_counts
    const props = event?.event_properties ?? {};
    expect(Object.keys(props).sort()).toEqual([
      "content_type_counts",
      "refresh_id",
      "refresh_time",
    ]);
    expect(props.refresh_id).toMatch(/^\d+$/);
    expect(props.refresh_time).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    expect(props.content_type_counts).toEqual({ wallpaper: 2, status: 1 });
    // keyed on the epoch so N tasks building the same plan dedupe to one row
    expect(event?.insert_id).toBe(`feed_refresh:${String(props.refresh_id)}`);

    // a second page of the SAME refresh must not re-emit
    await service.getFeed({ userId: "u", limit: 10 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("an analytics outage never fails the feed read", async () => {
    vi.spyOn(analyticsEventsClient, "send").mockRejectedValue(new Error("collector down"));
    mockFeed([feedRow({ id: "a" })]);
    const page = await service.getFeed({ userId: "u", limit: 10 });
    expect(page.items.map((i) => i.id)).toEqual(["a"]);
  });

  test("a stale or malformed cursor restarts the feed instead of 400ing", async () => {
    mockFeed([feedRow({ id: "a" }), feedRow({ id: "b" })]);
    // an old-format keyset cursor, minted before rotation shipped
    for (const cursor of [encodeCursor({ sortOrder: 0, id: "a" }), "@@bad@@"]) {
      const page = await service.getFeed({ userId: "u", cursor, limit: 10 });
      expect(page.items).toHaveLength(2);
    }
  });

  test("badgeLabel serves the CMS copy for a badged card", async () => {
    mockFeed([
      feedRow({ id: "f-1", badge: "trending", badgeLabel: "TRENDING" }),
    ]);
    const page = await service.getFeed({ userId: "u", limit: 10 });
    expect(page.items[0]?.badge).toBe("trending");
    expect(page.items[0]?.badgeLabel).toBe("TRENDING");
  });

  test("an unbadged card carries no badgeLabel", async () => {
    mockFeed([feedRow({ id: "f-1", badge: null })]);
    const page = await service.getFeed({ userId: "u", limit: 10 });
    expect(page.items[0]?.badge).toBeNull();
    expect(page.items[0]?.badgeLabel).toBeNull();
  });

  test("a badged card with NO CMS label drops the badge (badgeLabel ⇔ badge)", async () => {
    mockFeed([
      feedRow({ id: "f-1", badge: "suggested", badgeLabel: null }),
    ]);
    const page = await service.getFeed({ userId: "u", limit: 10 });
    // An unlabelled badge cannot be drawn without the client inventing copy —
    // so BOTH fields are nulled, keeping the wire invariant exact.
    expect(page.items[0]?.badge).toBeNull();
    expect(page.items[0]?.badgeLabel).toBeNull();
  });
});

describe("feed — trending-first (flag on)", () => {
  test("trending items lead (composite negative cursor key), mixed types preserved", async () => {
    repo.getSettings.mockResolvedValue({ feedTrendingFirst: true });
    // repo already returns them in trending-first order; the service builds the
    // composite cursor key from the last kept row.
    repo.listFeedPage.mockResolvedValue([
      feedRow({ id: "t1", trendingScore: 100, contentType: "aarti" }),
      feedRow({ id: "t2", trendingScore: 90, contentType: "wallpaper" }),
      feedRow({ id: "n1", trendingScore: null, contentType: "status" }),
    ]);

    const page = await service.getFeed({ userId: "u", limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(["t1", "t2"]);
    // nextCursor encodes the trending composite key of the last kept row (t2):
    // -(90 + 1) = -91  → negative, so the repo knows to continue the trending segment.
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: -91, id: "t2" }));
    expect(repo.listFeedPage).toHaveBeenCalledWith(
      expect.objectContaining({ trendingFirst: true })
    );
  });

  test("a non-trending last row yields a non-negative default composite key", async () => {
    repo.getSettings.mockResolvedValue({ feedTrendingFirst: true });
    repo.listFeedPage.mockResolvedValue([
      feedRow({ id: "t1", trendingScore: 100 }),
      feedRow({ id: "n1", trendingScore: null }),
      feedRow({ id: "n2", trendingScore: null }),
    ]);
    const page = await service.getFeed({ userId: "u", limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(["t1", "n1"]);
    // last kept row n1 is non-trending → non-negative default key {sortOrder: 0}
    expect(page.nextCursor).toBe(encodeCursor({ sortOrder: 0, id: "n1" }));
  });
});

describe("engagement forwarders", () => {
  test("like toggles on when not liked, using the caller-supplied contentType", async () => {
    likedIds = [];
    const res = await service.toggleLike("u", "home_item", "f-1");
    expect(likeCalls).toEqual(["like:home_item:f-1"]);
    expect(res).toEqual({ liked: true, likeCount: 6 });
  });

  test("like toggles off when already liked", async () => {
    likedIds = ["f-1"];
    const res = await service.toggleLike("u", "aarti", "f-1");
    expect(likeCalls).toEqual(["unlike:aarti:f-1"]);
    expect(res.liked).toBe(false);
  });

  test("view forwards to engagement and returns the fresh viewCount", async () => {
    const res = await service.recordView("u", "home_item", "f-1");
    expect(viewCalls).toEqual(["view:home_item:f-1"]);
    expect(res).toEqual({ viewCount: 42 });
  });

  test("share forwards to engagement and returns the fresh shareCount", async () => {
    const res = await service.recordShare("u", "home_item", "f-1", "whatsapp");
    expect(shareCalls).toEqual(["share:home_item:f-1"]);
    expect(res).toEqual({ shareCount: 7 });
  });
});

/**
 * TAM-174 — the shortcut-grid gradient experiment.
 *
 * Three independent gates decide whether a caller sees a palette, and each one
 * alone is enough to fall back to the shipped grid: the CMS kill switch, the
 * arm, and whether the row is themed at all. They are tested separately because
 * in production they fail separately.
 */
describe("shortcut grid gradient A/B (TAM-174)", () => {
  // The in-process map's arms — pinned in `home.buckets.test.ts`.
  const USER_GRADIENT = "019f5f4c-793c-7358-aec3-f7941d852db6"; // bucket 57
  const USER_CONTROL = "019f5f4c-793c-7358-aec3-f7941d852db8"; // bucket 45

  const enable = (on = true): void => {
    repo.getSettings.mockResolvedValue({
      feedTrendingFirst: false,
      shortcutGridGradientEnabled: on,
    });
  };

  beforeEach(() => {
    repo.listActiveShortcuts.mockResolvedValue([shortcut({ variants: BOTH_ARMS })]);
  });

  describe("the kill switch", () => {
    test("off ⇒ everyone gets the CONTROL arm's tile", async () => {
      enable(false);
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).toBeNull();
      expect(shortcuts[0]?.iconUrl).toBe("https://cdn.example.com/control/status.png");
    });

    test("off ⇒ the abtest service is never called, so stopping never depends on it", async () => {
      process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
      process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
      resetEnvCache();
      const fetchSpy = vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ inExperiment: true, bucket: 7, variant: { id: "gradient_v1" } }),
            { status: 200 }
          )
        )
      );
      vi.stubGlobal("fetch", fetchSpy);
      try {
        enable(false);
        await service.getShortcuts({ userId: USER_GRADIENT });
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        delete process.env.ABTEST_BASE_URL;
        delete process.env.ABTEST_TENANT_KEY;
        resetEnvCache();
        vi.unstubAllGlobals();
      }
    });
  });

  describe("with the experiment on, and no abtest service configured", () => {
    beforeEach(() => enable());

    // The whole point of the variant table: an arm is a COMPLETE tile, not the
    // base row wearing a different gradient.
    test("the gradient arm gets its own copy, artwork AND palette", async () => {
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.label).toBe("स्टेटस लगाएं");
      expect(shortcuts[0]?.iconUrl).toBe("https://cdn.example.com/gradient/status.png");
      expect(shortcuts[0]?.theme).toEqual({
        backgroundFrom: "#EAF4FF",
        backgroundFromStop: 0.1,
        backgroundTo: "#3896E9",
        backgroundToStop: 1,
        labelColor: "#1261A8",
      });
    });

    test("the control arm gets its own artwork and NO palette", async () => {
      const { shortcuts } = await service.getShortcuts({ userId: USER_CONTROL });
      expect(shortcuts[0]?.iconUrl).toBe("https://cdn.example.com/control/status.png");
      expect(shortcuts[0]?.theme).toBeNull();
      // Control has no `label` override, so it inherits the base row's copy.
      expect(shortcuts[0]?.label).toBe("Aarti & Bhajans");
    });

    test("assignment is sticky across calls", async () => {
      const a = await service.getShortcuts({ userId: USER_GRADIENT });
      const b = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(a.shortcuts[0]?.theme).not.toBeNull();
      expect(b.shortcuts[0]?.label).toBe(a.shortcuts[0]?.label);
    });

    test("no userId ⇒ control rather than a throw", async () => {
      const { shortcuts } = await service.getShortcuts({});
      expect(shortcuts[0]?.theme).toBeNull();
    });

    // A row with NO arm rows at all is every pre-TAM-174 shortcut, and it must
    // keep working untouched.
    test("a shortcut with no arm rows serves the base tile to both arms", async () => {
      repo.listActiveShortcuts.mockResolvedValue([shortcut({ iconUrl: "https://base/x.png" })]);
      for (const userId of [USER_GRADIENT, USER_CONTROL]) {
        const { shortcuts } = await service.getShortcuts({ userId });
        expect(shortcuts[0]?.theme).toBeNull();
        expect(shortcuts[0]?.iconUrl).toBe("https://base/x.png");
        expect(shortcuts[0]?.label).toBe("Aarti & Bhajans");
      }
    });

    // Ops theming one arm and not the other is a normal intermediate state.
    test("an arm present but empty inherits every base field", async () => {
      repo.listActiveShortcuts.mockResolvedValue([
        shortcut({
          iconUrl: "https://base/x.png",
          variants: [{ ...EMPTY_OVERRIDES, variant: "gradient_v1" }],
        }),
      ]);
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.iconUrl).toBe("https://base/x.png");
      expect(shortcuts[0]?.label).toBe("Aarti & Bhajans");
      expect(shortcuts[0]?.theme).toBeNull();
    });

    // Postgres cannot express "all five or none", so a row written by direct
    // SQL can arrive partial. Half a gradient is unrenderable.
    test("a partially themed arm is treated as unthemed", async () => {
      repo.listActiveShortcuts.mockResolvedValue([
        shortcut({
          variants: [
            { ...EMPTY_OVERRIDES, variant: "gradient_v1", ...PALETTE, themeLabelColor: null },
          ],
        }),
      ]);
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).toBeNull();
    });

    /**
     * TAM-174 follow-up — the seed wrote `http://127.0.0.1:4566/...` into the
     * arm's `icon_url`. `iconUrl` is published through `mediaUrl`, which
     * accepts http on loopback ONLY while the dev carve-out is on, and Fastify
     * validates it on the way OUT: outside a dev box that stored value fails
     * RESPONSE serialization and `GET /home/shortcuts` returns 500 — the whole
     * grid, for every user the row reaches, not one tile's artwork.
     *
     * WHY THE CARVE-OUT IS PINNED OFF HERE. Vite loads `apps/api/.env` into the
     * test process, and a dev box that has run `scripts/local-ab-setup.sh` has
     * `MEDIA_ALLOW_INSECURE_URLS=true` in it — under which the URL below is
     * legal and this test would silently assert nothing. CI has no such file
     * and stage/prod can never have the flag (env.ts hard-fails boot), so OFF
     * is the predicate that matters. Pinning it is also what stops this pair
     * from passing locally and failing in the deploy gate, which is exactly how
     * the bug reached CI in the first place.
     */
    describe("an unservable stored iconUrl (carve-out off)", () => {
      const LOOPBACK_ICON = "http://127.0.0.1:4566/app-local-media/seed/x.png";
      let previous: string | undefined;

      beforeEach(() => {
        previous = process.env.MEDIA_ALLOW_INSECURE_URLS;
        process.env.MEDIA_ALLOW_INSECURE_URLS = "false";
        resetEnvCache();
      });

      afterEach(() => {
        if (previous === undefined) {
          delete process.env.MEDIA_ALLOW_INSECURE_URLS;
        } else {
          process.env.MEDIA_ALLOW_INSECURE_URLS = previous;
        }
        resetEnvCache();
      });

      test("an arm icon the wire would refuse degrades to null", async () => {
        repo.listActiveShortcuts.mockResolvedValue([
          shortcut({
            iconUrl: "https://cdn.example.com/base/x.png",
            variants: [
              {
                ...EMPTY_OVERRIDES,
                variant: "gradient_v1",
                ...PALETTE,
                iconUrl: LOOPBACK_ICON,
              },
            ],
          }),
        ]);
        const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
        expect(shortcuts[0]?.iconUrl).toBeNull();
        // The arm is NOT abandoned over its artwork — only the unservable field
        // is dropped, so the palette and copy still reach the client.
        expect(shortcuts[0]?.theme).not.toBeNull();
      });

      test("a base-row icon the wire would refuse degrades to null", async () => {
        repo.listActiveShortcuts.mockResolvedValue([shortcut({ iconUrl: LOOPBACK_ICON })]);
        const { shortcuts } = await service.getShortcuts({ userId: USER_CONTROL });
        expect(shortcuts[0]?.iconUrl).toBeNull();
        expect(shortcuts[0]?.label).toBe("Aarti & Bhajans");
      });

      // The guard must not become a silent filter on GOOD data.
      test("an https icon is untouched", async () => {
        repo.listActiveShortcuts.mockResolvedValue([
          shortcut({ iconUrl: "https://cdn.example.com/base/x.png" }),
        ]);
        const { shortcuts } = await service.getShortcuts({ userId: USER_CONTROL });
        expect(shortcuts[0]?.iconUrl).toBe("https://cdn.example.com/base/x.png");
      });
    });

    test("a stop above 1 survives the projection unclamped", async () => {
      repo.listActiveShortcuts.mockResolvedValue([
        shortcut({
          variants: [
            {
              ...EMPTY_OVERRIDES,
              variant: "gradient_v1",
              ...PALETTE,
              themeBackgroundFromStop: 0.14734,
              themeBackgroundToStop: 1.4734,
            },
          ],
        }),
      ]);
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme?.backgroundFromStop).toBe(0.14734);
      expect(shortcuts[0]?.theme?.backgroundToStop).toBe(1.4734);
    });
  });

  /**
   * The ladder, exercised through the REAL abtest client — env configures it and
   * a stubbed global `fetch` plays the service, so only the resolution ORDER is
   * ours to assert. Mirrors `chat.service.test.ts`'s TAM-173 block.
   */
  describe("the shared abtesting service (the ladder)", () => {
    const answer = (body: unknown): void => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })))
      );
    };

    beforeEach(() => {
      enable();
      process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
      process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
      resetEnvCache();
    });

    afterEach(() => {
      delete process.env.ABTEST_BASE_URL;
      delete process.env.ABTEST_TENANT_KEY;
      resetEnvCache();
      vi.unstubAllGlobals();
    });

    test("the service's arm beats the in-process bucket", async () => {
      answer({ inExperiment: true, bucket: 7, variant: { id: "gradient_v1", payload: {} } });
      const { shortcuts } = await service.getShortcuts({ userId: USER_CONTROL });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    // An arm the CMS has no row for inherits the base tile — the console cannot
    // invent a rendering that does not exist.
    test("an arm with no CMS row falls back to the base tile", async () => {
      answer({ inExperiment: true, bucket: 7, variant: { id: "rogue_arm", payload: {} } });
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).toBeNull();
      expect(shortcuts[0]?.label).toBe("Aarti & Bhajans");
    });

    test("an api-default naming the arm hands it to out-of-experiment users", async () => {
      answer({ inExperiment: false, bucket: 7, defaultConfig: { gridVariant: "gradient_v1" } });
      const { shortcuts } = await service.getShortcuts({ userId: USER_CONTROL });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    test("an api-default with gridVariant: null is control for out-of-experiment users", async () => {
      answer({ inExperiment: false, bucket: 7, defaultConfig: { gridVariant: null } });
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).toBeNull();
    });

    test("an api-default WITHOUT the key falls back to the in-process map", async () => {
      answer({ inExperiment: false, bucket: 7, defaultConfig: { unrelated: true } });
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    test("the service's fail-soft tell (bucket: -1) falls back in-process", async () => {
      answer({ inExperiment: false, bucket: -1, defaultConfig: { gridVariant: null } });
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    test("an unreachable service falls back in-process rather than throwing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.reject(new Error("ECONNREFUSED")))
      );
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    test("sends the apiId as the only identifier — never an experimentId", async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init: RequestInit) => {
          calls.push({ url, init });
          return Promise.resolve(
            new Response(JSON.stringify({ inExperiment: false, bucket: 7 }), { status: 200 })
          );
        })
      );
      await service.getShortcuts({ userId: USER_GRADIENT });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe("https://platform.test/abtesting/evaluate");
      const body = JSON.parse(calls[0]?.init.body as string) as Record<string, unknown>;
      // The apiId names the SURFACE and is ours; the experimentId is the
      // console's and must never appear in this repo's source or its requests.
      expect(body).toEqual({ subjectId: USER_GRADIENT, apiId: "home.shortcut_grid" });
    });
  });

  /**
   * TAM-174 backwards compat — the gate that protects builds already in the wild.
   *
   * An arm's artwork, copy and palette are authored together for the layout
   * that ships with it. A build that predates the new card would paint the
   * gradient arm's transparent band art bottom-anchored in the old 103×117
   * tile: not a crash, just wrong, on a device nobody can reach. So the arm is
   * dropped ENTIRELY below its `minAppVersion` and the base row is served —
   * byte-for-byte what that build renders today.
   */
  describe("the app-version gate", () => {
    beforeEach(() => {
      enable();
      repo.listActiveShortcuts.mockResolvedValue([
        shortcut({ iconUrl: "https://base/x.png", variants: GATED_GRADIENT }),
      ]);
    });

    test("a build at the gate gets the arm", async () => {
      const { shortcuts } = await service.getShortcuts({
        userId: USER_GRADIENT,
        appVersion: "1.1.0",
      });
      expect(shortcuts[0]?.theme).not.toBeNull();
      expect(shortcuts[0]?.label).toBe("स्टेटस लगाएं");
    });

    test("a build above the gate gets the arm", async () => {
      const { shortcuts } = await service.getShortcuts({
        userId: USER_GRADIENT,
        appVersion: "1.4.2",
      });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    // The whole point: an old build must be indistinguishable from one that
    // never had an experiment at all.
    test("a build BELOW the gate falls back to the base tile entirely", async () => {
      const { shortcuts } = await service.getShortcuts({
        userId: USER_GRADIENT,
        appVersion: "1.0.9",
      });
      expect(shortcuts[0]?.theme).toBeNull();
      expect(shortcuts[0]?.label).toBe("Aarti & Bhajans");
      expect(shortcuts[0]?.iconUrl).toBe("https://base/x.png");
    });

    // A pre-header build sends nothing; a broken platform channel sends "".
    // Both must read as "very old", never as "new enough".
    test.each([undefined, "", "not-a-version", "1.0", "v"])(
      "an unusable app_version (%p) is treated as too old",
      async (appVersion) => {
        const { shortcuts } = await service.getShortcuts({
          userId: USER_GRADIENT,
          appVersion,
        });
        expect(shortcuts[0]?.theme).toBeNull();
        expect(shortcuts[0]?.iconUrl).toBe("https://base/x.png");
      }
    );

    // Lexical comparison would put "1.0.99" above "1.1.0" and hand a variant to
    // a build that cannot draw it.
    // `parseAppVersion` is deliberately tolerant and defaults a missing segment
    // to 0, so a two-part version is a real version rather than a parse failure.
    // Worth pinning: `paywall.buckets.ts`'s own gate takes the opposite line and
    // rejects anything that is not exactly three segments, so the two are NOT
    // interchangeable despite doing the same job.
    test("a two-part version reads as .0 and satisfies an equal gate", async () => {
      const { shortcuts } = await service.getShortcuts({
        userId: USER_GRADIENT,
        appVersion: "1.1",
      });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });

    test("versions compare numerically, not lexically", async () => {
      const { shortcuts } = await service.getShortcuts({
        userId: USER_GRADIENT,
        appVersion: "1.0.99",
      });
      expect(shortcuts[0]?.theme).toBeNull();
    });

    test("an ungated arm reaches every build", async () => {
      repo.listActiveShortcuts.mockResolvedValue([shortcut({ variants: BOTH_ARMS })]);
      const { shortcuts } = await service.getShortcuts({
        userId: USER_GRADIENT,
        appVersion: undefined,
      });
      expect(shortcuts[0]?.theme).not.toBeNull();
    });
  });

  /**
   * The claim that makes the ladder free on production, where the tenant key is
   * unset: `evaluateAbtest` short-circuits BEFORE `fetch`. If this ever
   * regresses, every Home load on prod grows a network round trip.
   */
  test("with the abtest env unconfigured, no request is made at all", async () => {
    enable();
    const fetchSpy = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { shortcuts } = await service.getShortcuts({ userId: USER_GRADIENT });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(shortcuts[0]?.theme).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * TAM-180 — the feed algorithm A/B. The shared abtesting service decides per
 * user whether page one is WOVEN around their gods (`deity_split`) or served as
 * the plain shared rotation (`rotation`). The ladder itself is pinned in
 * `shared/rotation/__tests__/deity-split.experiment.test.ts`; what is asserted
 * here is what each arm DOES to the feed and, above all, WHEN the service is
 * asked — only when the cursor cannot name the pair.
 */
describe("feed algorithm A/B (TAM-180)", () => {
  const USER = "019f5f4c-793c-7358-aec3-f7941d852db6";
  let preferenceReads: string[] = [];

  const answer = (body: unknown): Mock => {
    const spy = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    vi.stubGlobal("fetch", spy);
    return spy;
  };
  const treatment = (): Mock =>
    answer({
      inExperiment: true,
      bucket: 700,
      variant: { id: "treatment", payload: { deitySplit: true } },
    });
  const control = (): Mock =>
    answer({
      inExperiment: true,
      bucket: 100,
      variant: { id: "control", payload: { deitySplit: false } },
    });

  beforeEach(() => {
    preferenceReads = [];
    registerGlobalService("users", {
      getDeityPreference: (userId: string) => {
        preferenceReads.push(userId);
        return Promise.resolve({
          primaryDeitySlug: "shiva",
          secondaryDeitySlug: null,
          adDeitySlug: null,
          source: null,
        });
      },
    } as unknown as IUsersApi);
    process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
    process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
    process.env.ENABLE_DEITY_SPLIT = "true";
    resetEnvCache();
    repo.getSettings.mockResolvedValue({ feedTrendingFirst: false });
    mockFeed([
      feedRow({ id: "a", contentType: "status" }),
      feedRow({ id: "b", contentType: "wallpaper" }),
      feedRow({ id: "c", contentType: "aarti" }),
    ]);
  });

  afterEach(() => {
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    delete process.env.ENABLE_DEITY_SPLIT;
    resetEnvCache();
    vi.unstubAllGlobals();
  });

  test("treatment: the preference is read and the pair rides in the cursor", async () => {
    const spy = treatment();
    const page = await service.getFeed({ userId: USER, limit: 2 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(preferenceReads).toEqual([USER]);
    expect(decodeRotationCursor(page.nextCursor ?? "")).toMatchObject({ d1: "shiva", d2: null });
  });

  test("control: the preference is NEVER read and the cursor pins a null pair", async () => {
    const spy = control();
    const page = await service.getFeed({ userId: USER, limit: 2 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(preferenceReads).toEqual([]);
    // `null`, not absent: the cursor records that this session was decided
    // WITHOUT a pair, so page 2 reproduces the plain rotation.
    expect(decodeRotationCursor(page.nextCursor ?? "")).toMatchObject({ d1: null, d2: null });
  });

  test("outside every bucket range ⇒ the old algorithm", async () => {
    answer({ inExperiment: false, bucket: 12 });
    await service.getFeed({ userId: USER, limit: 2 });
    expect(preferenceReads).toEqual([]);
  });

  test("a cursor page asks neither the service nor the preference — the cursor decides", async () => {
    const spy = treatment();
    const first = await service.getFeed({ userId: USER, limit: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(preferenceReads).toHaveLength(1);

    // Even a service that would now say CONTROL cannot flip an open session.
    control();
    const second = await service.getFeed({
      userId: USER,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    expect((globalThis.fetch as Mock).mock.calls).toHaveLength(0);
    expect(preferenceReads).toHaveLength(1);
    expect([...first.items, ...second.items].map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("an unreadable cursor restarts the session and is decided afresh", async () => {
    const spy = control();
    await service.getFeed({ userId: USER, limit: 2, cursor: "@@bad@@" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("the kill switch keeps the service out of the loop entirely", async () => {
    process.env.ENABLE_DEITY_SPLIT = "false";
    resetEnvCache();
    const spy = treatment();
    await service.getFeed({ userId: USER, limit: 2 });
    expect(spy).not.toHaveBeenCalled();
    expect(preferenceReads).toEqual([]);
  });

  test("trending-first (the CMS override) never asks the service", async () => {
    repo.getSettings.mockResolvedValue({ feedTrendingFirst: true });
    const spy = treatment();
    await service.getFeed({ userId: USER, limit: 2 });
    expect(spy).not.toHaveBeenCalled();
    expect(preferenceReads).toEqual([]);
  });
});
