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
import { encodeCursor } from "@api/shared/pagination";
import { clearPlanCache } from "@api/shared/rotation";
import type { RingtoneRow } from "../../repositories/ringtone.repository.js";
import { RingtoneService, meetsPlayCountRule } from "../ringtone.service.js";

/**
 * Unit coverage for `RingtoneService` (TAM-67). The repo is mocked; the
 * subscription / engagement / deity FACADES are registered into
 * `GlobalServiceMap` as fakes so `performServiceCall` resolves them. Focus: the
 * #EXPORT_CRITICAL entitlement gate on `audioUrl`, the play-count rule (≥3s) +
 * session dedupe, the Pro-only write gate, sort/validity filtering, and search
 * fallback.
 */

interface RepoMock {
  listRotationCandidates: Mock;
  findByIds: Mock;
  searchPage: Mock;
  searchCount: Mock;
  countActive: Mock;
  findById: Mock;
  findGateById: Mock;
  countPlay: Mock;
  incrementSetCount: Mock;
  // TAM-94 admin write surface — mocked so `RepoMock` still satisfies the
  // widened `RingtoneRepository`. The public `RingtoneService` never calls them.
  findAdminPage: Mock;
  findAdminById: Mock;
  existsAnyById: Mock;
  createAdmin: Mock;
  updateWithPrecondition: Mock;
}

function makeRepo(): RepoMock {
  return {
    listRotationCandidates: vi.fn().mockResolvedValue([]),
    findByIds: vi.fn().mockResolvedValue([]),
    searchPage: vi.fn().mockResolvedValue([]),
    searchCount: vi.fn().mockResolvedValue(0),
    countActive: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(null),
    findGateById: vi.fn().mockResolvedValue(null),
    countPlay: vi.fn(),
    incrementSetCount: vi.fn(),
    findAdminPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findAdminById: vi.fn().mockResolvedValue(null),
    existsAnyById: vi.fn().mockResolvedValue(false),
    createAdmin: vi.fn(),
    updateWithPrecondition: vi.fn().mockResolvedValue(0),
  };
}

function row(overrides: Partial<RingtoneRow> = {}): RingtoneRow {
  return {
    id: overrides.id ?? "rt-1",
    slug: overrides.slug ?? "rt-1-sample",
    title: overrides.title ?? "Hanuman Chalisa (Sample)",
    deitySlug: overrides.deitySlug ?? "hanuman",
    thumbnailImageUrl: overrides.thumbnailImageUrl ?? "https://cdn.example.com/t.png",
    audioUrl: overrides.audioUrl ?? "https://cdn.example.com/rt-1.mp3",
    playCount: overrides.playCount ?? 100,
    setCount: overrides.setCount ?? 10,
    tags: overrides.tags ?? ["hanuman"],
    searchKeywords: overrides.searchKeywords ?? ["hanuman", "chalisa"],
    languages: overrides.languages ?? ["hi"],
    artistOrSource: overrides.artistOrSource ?? "Traditional (Placeholder)",
    deepLinkUrl: overrides.deepLinkUrl ?? "https://example.com/r/rt-1",
    altText: overrides.altText ?? "alt",
    shareTitle: overrides.shareTitle ?? "share title",
    shareDescription: overrides.shareDescription ?? "share desc",
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date("2026-06-01T00:00:00.000Z"),
  };
}

let engagementCounts: Record<
  string,
  { contentId: string; likeCount: number; viewCount: number; shareCount: number }
> = {};
let likedIds: string[] = [];
let deityCards: { slug: string; displayName: string; iconUrl: string; sortOrder: number }[] = [];
const engagementCalls: string[] = [];

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
      engagementCalls.push(`like:${p.contentId}`);
      return Promise.resolve({ liked: true, likeCount: 1 });
    },
    unlike: (p: { contentId: string }) => {
      engagementCalls.push(`unlike:${p.contentId}`);
      return Promise.resolve({ liked: false, likeCount: 0 });
    },
    recordView: () => Promise.resolve({ viewCount: 1 }),
    recordShare: (p: { contentId: string }) => {
      engagementCalls.push(`share:${p.contentId}`);
      return Promise.resolve({ shareCount: 7 });
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
let service: RingtoneService;

/**
 * Stand up a rotatable catalogue: the candidates the plan is built from, plus a
 * hydration that returns whatever slice the plan asks for. The rotated ORDER is
 * deliberately not asserted (it changes every 12h by design).
 */
function mockCatalogue(rows: RingtoneRow[]): void {
  repo.listRotationCandidates.mockResolvedValue(
    rows.map((r) => ({ id: r.id, createdAtMs: r.createdAt.getTime(), score: 0 }))
  );
  repo.findByIds.mockImplementation((ids: string[]) =>
    Promise.resolve(ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean))
  );
}

beforeEach(() => {
  clearPlanCache();
  engagementCounts = {};
  likedIds = [];
  deityCards = [
    { slug: "hanuman", displayName: "Hanuman", iconUrl: "https://x/h.png", sortOrder: 0 },
    { slug: "shiva", displayName: "Shiva", iconUrl: "https://x/s.png", sortOrder: 1 },
  ];
  engagementCalls.length = 0;
  repo = makeRepo();
  service = new RingtoneService(repo);
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

describe("meetsPlayCountRule (≥3s)", () => {
  test("2s → not counted", () => {
    expect(meetsPlayCountRule(2)).toBe(false);
  });
  test("3s → counted (floor)", () => {
    expect(meetsPlayCountRule(3)).toBe(true);
  });
  test("just below the floor → not counted (2.9s)", () => {
    expect(meetsPlayCountRule(2.9)).toBe(false);
  });
  test("well past the floor → counted", () => {
    expect(meetsPlayCountRule(30)).toBe(true);
  });
});

describe("#EXPORT_CRITICAL entitlement gate on audioUrl", () => {
  test("FREE user: detail nulls audioUrl; discovery fields stay", async () => {
    registerFacades("free");
    repo.findById.mockResolvedValue(row({ id: "rt-1" }));
    const detail = await service.getDetail("rt-1", "free");
    expect(detail.audioUrl).toBeNull();
    expect(detail.thumbnailImageUrl).toBe("https://cdn.example.com/t.png");
    expect(detail.deityName).toBe("Hanuman");
    expect(detail.title.length).toBeGreaterThan(0);
  });

  test("PRO user: detail returns populated audioUrl", async () => {
    registerFacades("active");
    repo.findById.mockResolvedValue(row({ id: "rt-1" }));
    const detail = await service.getDetail("rt-1", "pro");
    expect(detail.audioUrl).toBe("https://cdn.example.com/rt-1.mp3");
  });

  test("entitlement service failure FAILS CLOSED (treated as free — no audio)", async () => {
    registerFacades("throws");
    repo.findById.mockResolvedValue(row({ id: "rt-1" }));
    const detail = await service.getDetail("rt-1", "u");
    expect(detail.audioUrl).toBeNull();
  });

  test("detail 404s for an unknown id", async () => {
    registerFacades("free");
    repo.findById.mockResolvedValue(null);
    await expect(service.getDetail("missing", "u")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("grid discovery (FREE) — no audio URL in card shape", () => {
  test("cards carry thumbnail + deityName, never an audio field", async () => {
    registerFacades("free");
    mockCatalogue([row({ id: "rt-1" }), row({ id: "rt-2", deitySlug: "shiva" })]);
    const page = await service.getGrid({ limit: 20 });
    expect(page.items).toHaveLength(2);
    for (const card of page.items) {
      expect(Object.keys(card)).not.toContain("audioUrl");
      expect(Object.keys(card)).not.toContain("previewImageUrl");
    }
    expect(page.items.map((i) => i.deityName).sort()).toEqual(["Hanuman", "Shiva"]);
  });

  test("invalid rows (missing thumbnail/audio) are excluded server-side", async () => {
    registerFacades("free");
    mockCatalogue([
      row({ id: "ok" }),
      row({ id: "no-thumb", thumbnailImageUrl: "" }),
      row({ id: "no-audio", audioUrl: "" }),
      row({ id: "blank-title", title: "   " }),
    ]);
    const page = await service.getGrid({ limit: 20 });
    expect(page.items.map((c) => c.id)).toEqual(["ok"]);
  });

  test("pages the rotation plan without skipping or repeating a ringtone", async () => {
    registerFacades("free");
    mockCatalogue([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]);

    const first = await service.getGrid({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.getGrid({ limit: 2, cursor: first.nextCursor ?? undefined });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const served = [...first.items, ...second.items].map((i) => i.id);
    expect([...served].sort()).toEqual(["a", "b", "c"]);
  });

  test("passes the deity-slug filter through to the rotated catalogue read", async () => {
    registerFacades("free");
    await service.getGrid({ deityId: "hanuman", limit: 20 });
    expect(repo.listRotationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ deitySlug: "hanuman" })
    );
  });

  test("a stale or malformed cursor restarts the grid instead of 400ing", async () => {
    registerFacades("free");
    mockCatalogue([row({ id: "a" }), row({ id: "b" })]);
    // an old-format keyset cursor, minted before rotation shipped
    for (const cursor of [encodeCursor({ sortOrder: 0, id: "a" }), "@@bad@@"]) {
      const page = await service.getGrid({ cursor, limit: 20 });
      expect(page.items).toHaveLength(2);
    }
  });
});

describe("search", () => {
  test("empty query → unfiltered grid + resultCount = countActive", async () => {
    registerFacades("free");
    mockCatalogue([row({ id: "rt-1" })]);
    repo.countActive.mockResolvedValue(14);
    const page = await service.search({ q: "   ", limit: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.resultCount).toBe(14);
    expect(repo.searchPage).not.toHaveBeenCalled();
  });

  test("non-empty query → searchPage + searchCount, deity-NAME matches resolved via facade", async () => {
    registerFacades("free");
    repo.searchPage.mockResolvedValue([row({ id: "rt-1", deitySlug: "hanuman" })]);
    repo.searchCount.mockResolvedValue(1);
    const page = await service.search({ q: "hanu", limit: 20 });
    expect(page.items.map((i) => i.id)).toEqual(["rt-1"]);
    expect(page.resultCount).toBe(1);
    // "hanu" partially matches the "Hanuman" display name → slug forwarded.
    expect(repo.searchPage).toHaveBeenCalledWith(
      expect.objectContaining({ q: "hanu", deitySlugMatches: ["hanuman"] })
    );
  });

  test("search never resolves entitlement or touches engagement (no side effects)", async () => {
    registerFacades("free");
    repo.searchPage.mockResolvedValue([row({ id: "rt-1" })]);
    repo.searchCount.mockResolvedValue(1);
    await service.search({ q: "chalisa", limit: 20 });
    expect(engagementCalls).toEqual([]);
  });
});

describe("recordPlayCount (Pro-only, rule + session dedupe)", () => {
  test("FREE user → 403 and NO gate/dedupe lookup", async () => {
    registerFacades("free");
    await expect(
      service.recordPlayCount({ id: "rt-1", userId: "free", sessionToken: "s1", playbackPositionSeconds: 30 })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.findGateById).not.toHaveBeenCalled();
    expect(repo.countPlay).not.toHaveBeenCalled();
  });

  test("PRO below threshold → counted:false, no write", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    repo.findById.mockResolvedValue(row({ id: "rt-1", playCount: 100 }));
    const res = await service.recordPlayCount({
      id: "rt-1",
      userId: "pro",
      sessionToken: "s1",
      playbackPositionSeconds: 2,
    });
    expect(res.counted).toBe(false);
    expect(res.playCount).toBe(100);
    expect(repo.countPlay).not.toHaveBeenCalled();
  });

  test("PRO past threshold, fresh session → counted:true, playCount incremented", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    repo.countPlay.mockResolvedValue({ counted: true, playCount: 101 });
    const res = await service.recordPlayCount({
      id: "rt-1",
      userId: "pro",
      sessionToken: "s1",
      playbackPositionSeconds: 5,
    });
    expect(res.counted).toBe(true);
    expect(res.playCount).toBe(101);
    expect(repo.countPlay).toHaveBeenCalledWith({
      userId: "pro",
      ringtoneId: "rt-1",
      sessionToken: "s1",
    });
  });

  test("PRO replayed session token → repo reports counted:false (no double count)", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    repo.countPlay.mockResolvedValue({ counted: false, playCount: 101 });
    const res = await service.recordPlayCount({
      id: "rt-1",
      userId: "pro",
      sessionToken: "s1",
      playbackPositionSeconds: 30,
    });
    expect(res.counted).toBe(false);
    expect(res.playCount).toBe(101);
  });

  test("PRO past threshold but unknown id → 404", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue(null);
    await expect(
      service.recordPlayCount({ id: "missing", userId: "pro", sessionToken: "s1", playbackPositionSeconds: 5 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("recordSetCount (Pro-only)", () => {
  test("FREE → 403", async () => {
    registerFacades("free");
    await expect(service.recordSetCount("rt-1", "free")).rejects.toMatchObject({ statusCode: 403 });
  });
  test("PRO → increments and returns setCount", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    repo.incrementSetCount.mockResolvedValue({ setCount: 11 });
    const res = await service.recordSetCount("rt-1", "pro");
    expect(res).toEqual({ ringtoneId: "rt-1", setCount: 11 });
  });
});

describe("toggleLike (Pro-only, via engagement facade)", () => {
  test("FREE → 403 and no engagement call", async () => {
    registerFacades("free");
    await expect(service.toggleLike("rt-1", "free")).rejects.toMatchObject({ statusCode: 403 });
    expect(engagementCalls).toEqual([]);
  });
  test("PRO not-yet-liked → likes via facade", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    likedIds = [];
    const res = await service.toggleLike("rt-1", "pro");
    expect(engagementCalls).toEqual(["like:rt-1"]);
    expect(res.liked).toBe(true);
  });
  test("PRO already-liked → unlikes via facade", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    likedIds = ["rt-1"];
    const res = await service.toggleLike("rt-1", "pro");
    expect(engagementCalls).toEqual(["unlike:rt-1"]);
    expect(res.liked).toBe(false);
  });
});

describe("recordShare (Pro-only, via engagement facade)", () => {
  test("FREE → 403", async () => {
    registerFacades("free");
    await expect(service.recordShare("rt-1", "free")).rejects.toMatchObject({ statusCode: 403 });
    expect(engagementCalls).toEqual([]);
  });
  test("PRO → records a share and returns shareCount", async () => {
    registerFacades("active");
    repo.findGateById.mockResolvedValue({ id: "rt-1" });
    const res = await service.recordShare("rt-1", "pro");
    expect(engagementCalls).toEqual(["share:rt-1"]);
    expect(res).toEqual({ ringtoneId: "rt-1", shareCount: 7 });
  });
});

describe("facade methods (never leak a media/audio URL)", () => {
  test("getPreview returns a compact card with NO audioUrl/previewImageUrl, or null", async () => {
    repo.findById.mockResolvedValueOnce(row({ id: "rt-1" }));
    const preview = await service.getPreview("rt-1");
    expect(preview).toMatchObject({ id: "rt-1", deityId: "hanuman" });
    expect(preview && "audioUrl" in preview).toBe(false);
    expect(preview && "previewImageUrl" in preview).toBe(false);

    repo.findById.mockResolvedValueOnce(null);
    expect(await service.getPreview("missing")).toBeNull();
  });

  test("getForShare returns share metadata without an audio URL", async () => {
    repo.findById.mockResolvedValue(row({ id: "rt-1", shareTitle: "st" }));
    const share = await service.getForShare("rt-1");
    expect(share).toMatchObject({ id: "rt-1", shareTitle: "st" });
    expect(share && "audioUrl" in share).toBe(false);
  });
});
