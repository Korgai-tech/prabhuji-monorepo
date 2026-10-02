import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { decodeRotationCursor, encodeCursor } from "@api/shared/pagination";
import { resetEnvCache } from "@api/shared/config";
import { clearPlanCache } from "@api/shared/rotation";
import type {
  StatusProfileRow,
  StatusRow,
} from "../../repositories/status.repository.js";
import { StatusService } from "../status.service.js";
import type { IUsersApi } from "@api/core/users/api";

/**
 * Unit coverage for `StatusService` (TAM-71). The repo is mocked; the engagement
 * FACADE is registered into `GlobalServiceMap` as a fake so `performServiceCall`
 * resolves it (there is NO subscription facade — status is free, no entitlement
 * gate). Focus: feed keyset paging + deity filter + engagement enrichment; the
 * profile upsert + active-profile-type flip; the empty-profile default; the
 * like toggle + view record delegating to engagement.
 */

interface RepoMock {
  listRotationCandidates: Mock;
  findByIds: Mock;
  findById: Mock;
  findGateById: Mock;
  findProfileByUserId: Mock;
  upsertProfile: Mock;
  // TAM-98 admin write surface — present so `RepoMock` still structurally
  // satisfies the widened `StatusRepository`. The public `StatusService` under
  // test never calls them; they are exercised by the admin service's own suite.
  findAdminItemPage: Mock;
  findAdminItemById: Mock;
  itemExistsById: Mock;
  createAdminItem: Mock;
  updateItemWithPrecondition: Mock;
  findAdminTemplatePage: Mock;
  findAdminTemplateById: Mock;
  templateExistsById: Mock;
  createAdminTemplate: Mock;
  updateTemplateWithPrecondition: Mock;
}

function makeRepo(): RepoMock {
  return {
    listRotationCandidates: vi.fn().mockResolvedValue([]),
    findByIds: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findGateById: vi.fn().mockResolvedValue(null),
    findProfileByUserId: vi.fn().mockResolvedValue(null),
    upsertProfile: vi.fn(),
    findAdminItemPage: vi.fn(),
    findAdminItemById: vi.fn(),
    itemExistsById: vi.fn(),
    createAdminItem: vi.fn(),
    updateItemWithPrecondition: vi.fn(),
    findAdminTemplatePage: vi.fn(),
    findAdminTemplateById: vi.fn(),
    templateExistsById: vi.fn(),
    createAdminTemplate: vi.fn(),
    updateTemplateWithPrecondition: vi.fn(),
  };
}

function statusRow(overrides: Partial<StatusRow> = {}): StatusRow {
  return {
    id: overrides.id ?? "st-1",
    slug: overrides.slug ?? "st-1-sample",
    title: overrides.title ?? "Status (Sample)",
    mediaType: overrides.mediaType ?? "image",
    imageUrl: overrides.imageUrl ?? "https://cdn.example.com/i.png",
    videoUrl: overrides.videoUrl ?? null,
    thumbnailUrl: overrides.thumbnailUrl ?? "https://cdn.example.com/t.png",
    overlaySafeArea:
      overrides.overlaySafeArea ?? { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
    languages: overrides.languages ?? [],
    shareCaption: overrides.shareCaption ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date("2026-06-01T00:00:00.000Z"),
    deitySlug: overrides.deitySlug ?? null,
  };
}

function profileRow(overrides: Partial<StatusProfileRow> = {}): StatusProfileRow {
  return {
    activeProfileType: overrides.activeProfileType ?? "personal",
    personalDisplayName: overrides.personalDisplayName ?? null,
    businessName: overrides.businessName ?? null,
    businessDetails: overrides.businessDetails ?? null,
    businessMobileNumber: overrides.businessMobileNumber ?? null,
    avatarImageUrl: overrides.avatarImageUrl ?? null,
    updatedAt: overrides.updatedAt ?? new Date("2026-07-01T00:00:00.000Z"),
  };
}

let engagementCounts: Record<
  string,
  { contentId: string; likeCount: number; viewCount: number; shareCount: number }
> = {};
let likedIds: string[] = [];
const likeCalls: string[] = [];
const viewCalls: string[] = [];

function registerFacades(): void {
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
    recordView: (p: { contentId: string }) => {
      viewCalls.push(`view:${p.contentId}`);
      return Promise.resolve({ viewCount: 42 });
    },
    recordShare: () => Promise.resolve({ shareCount: 0 }),
  });
  // TAM-108: the feed resolves each card's SINGLE deity name via the deity facade.
  registerGlobalService("deity", {
    getActiveDeities: () =>
      Promise.resolve([
        { slug: "shiva", displayName: "Shiva", iconUrl: "https://x/s.png", sortOrder: 0 },
      ]),
    getBySlug: () => Promise.resolve(null),
  });
  // TAM-173: status feed reads active pins per request. Empty by default so
  // pre-TAM-173 tests continue to assert the byte-identical response shape;
  // per-test overrides use `pinnedIds`.
  registerGlobalService("pinnedContent", {
    getActivePinnedIds: () => Promise.resolve(pinnedIds),
  });
}

let pinnedIds: { id: string; contentId: string; pinPosition: number }[] = [];

let repo: RepoMock;
let service: StatusService;

/**
 * Stand up a rotatable catalogue: the candidate list the plan is built from,
 * and a hydration that returns whatever slice the plan asks for. The rotated
 * ORDER is deliberately not asserted (it changes every 2h by design) — what
 * the feed tests pin down is that paging serves every item exactly once.
 */
function mockCatalogue(ids: string[], overrides: Partial<StatusRow> = {}): void {
  repo.listRotationCandidates.mockResolvedValue(
    ids.map((id) => ({ id, createdAtMs: Date.parse("2026-01-01T00:00:00.000Z") }))
  );
  repo.findByIds.mockImplementation((sliceIds: string[]) =>
    Promise.resolve(sliceIds.map((id) => statusRow({ ...overrides, id })))
  );
}

beforeEach(() => {
  clearPlanCache();
  engagementCounts = {};
  likedIds = [];
  likeCalls.length = 0;
  viewCalls.length = 0;
  pinnedIds = [];
  repo = makeRepo();
  service = new StatusService(repo);
  registerFacades();
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

describe("feed", () => {
  test("pages the rotation plan without skipping or repeating, and carries counts + likedByMe", async () => {
    mockCatalogue(["a", "b", "c"]);
    engagementCounts = { a: { contentId: "a", likeCount: 3, viewCount: 9, shareCount: 1 } };
    likedIds = ["a"];

    const first = await service.getFeed({ userId: "u", limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.getFeed({
      userId: "u",
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    const served = [...first.items, ...second.items].map((i) => i.id);
    expect([...served].sort()).toEqual(["a", "b", "c"]);

    const a = [...first.items, ...second.items].find((i) => i.id === "a");
    expect(a).toMatchObject({ likeCount: 3, viewCount: 9, shareCount: 1, likedByMe: true });
    expect(a?.overlaySafeArea).toEqual({ top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 });
  });

  test("deityId filter narrows the rotated catalogue", async () => {
    mockCatalogue(["a"], { deitySlug: "shiva" });
    const page = await service.getFeed({ userId: "u", deityId: "shiva", limit: 20 });
    expect(repo.listRotationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ deitySlug: "shiva" })
    );
    // the single deity is resolved (id + name via the deity facade)
    expect(page.items[0]).toMatchObject({ deitySlug: "shiva", deityName: "Shiva" });
  });

  test("locale filter narrows the rotated catalogue for membership filtering", async () => {
    await service.getFeed({ userId: "u", locale: "hi", limit: 20 });
    expect(repo.listRotationCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "hi" })
    );
  });

  test("empty catalogue → empty items, null cursor, no hydration", async () => {
    const page = await service.getFeed({ userId: "u", deityId: "unknown", limit: 20 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(repo.findByIds).not.toHaveBeenCalled();
  });

  test("a stale or malformed cursor restarts the feed instead of 400ing", async () => {
    mockCatalogue(["a", "b"]);
    // an old-format keyset cursor, minted before rotation shipped
    const stale = encodeCursor({ sortOrder: 0, id: "a" });
    for (const cursor of [stale, "@@bad@@"]) {
      const page = await service.getFeed({ userId: "u", cursor, limit: 20 });
      expect(page.items).toHaveLength(2);
    }
  });
});

describe("feed pin (TAM-166: chat-recommended status prepended to position 0)", () => {
  test("first page: pinned id prepends the item at position 0 (not in tail)", async () => {
    mockCatalogue(["a", "b", "c"]);
    // The pin is a fresh row NOT in the rotation tail — hydrated via findById.
    repo.findById.mockResolvedValue(statusRow({ id: "pin" }));

    const page = await service.getFeed({ userId: "u", limit: 20, pinnedId: "pin" });

    expect(page.items[0]?.id).toBe("pin");
    // Tail (rotation-order) follows the pin. Order inside the tail is
    // rotation-determined; only the SET matters here.
    const tailIds = page.items.slice(1).map((i) => i.id);
    expect([...tailIds].sort()).toEqual(["a", "b", "c"]);
    expect(repo.findById).toHaveBeenCalledWith("pin");
  });

  test("first page: pinned id already in tail is deduped (only appears at position 0)", async () => {
    // The pinned id also lives in the rotation catalogue → tail must drop it.
    mockCatalogue(["a", "pin", "c"]);
    repo.findById.mockResolvedValue(statusRow({ id: "pin" }));

    const page = await service.getFeed({ userId: "u", limit: 20, pinnedId: "pin" });

    expect(page.items[0]?.id).toBe("pin");
    // Exactly one occurrence overall — the pin itself.
    expect(page.items.filter((i) => i.id === "pin")).toHaveLength(1);
    // The rest of the catalogue is still served.
    const rest = page.items.slice(1).map((i) => i.id);
    expect([...rest].sort()).toEqual(["a", "c"]);
  });

  test("non-first page: pinnedId is ignored (cursor is set → no repeat on scroll)", async () => {
    mockCatalogue(["a", "b", "c"]);
    // A cursor from a real prior page — the pin must NOT be honored here.
    const first = await service.getFeed({ userId: "u", limit: 2 });
    expect(first.nextCursor).not.toBeNull();

    // Reset the pin-fetcher mock so we can assert it wasn't called.
    repo.findById.mockReset();

    const second = await service.getFeed({
      userId: "u",
      limit: 2,
      cursor: first.nextCursor ?? undefined,
      pinnedId: "pin",
    });
    expect(repo.findById).not.toHaveBeenCalled();
    expect(second.items.every((i) => i.id !== "pin")).toBe(true);
  });

  test("fail-soft: pinned id missing → normal feed unchanged, no throw", async () => {
    mockCatalogue(["a", "b"]);
    repo.findById.mockResolvedValue(null); // pin does not exist

    const page = await service.getFeed({
      userId: "u",
      limit: 20,
      pinnedId: "00000000-0000-0000-0000-000000000000",
    });
    expect(page.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
    expect(page.items[0]?.id).not.toBe("00000000-0000-0000-0000-000000000000");
  });

  test("fail-soft: pinned id excluded by the deity filter → normal feed unchanged", async () => {
    mockCatalogue(["a"], { deitySlug: "shiva" });
    // The pin's own deity does NOT match the requested filter — must be dropped.
    repo.findById.mockResolvedValue(statusRow({ id: "pin", deitySlug: "ganesha" }));

    const page = await service.getFeed({
      userId: "u",
      deityId: "shiva",
      limit: 20,
      pinnedId: "pin",
    });
    expect(page.items[0]?.id).toBe("a");
    expect(page.items.some((i) => i.id === "pin")).toBe(false);
  });

  test("fail-soft: pinned id excluded by the locale filter → normal feed unchanged", async () => {
    mockCatalogue(["a"]);
    // The pin's `languages` set explicitly lists only "en" — a "hi" caller
    // must not see it (membership filter mirrors the repo's rotation-candidate
    // predicate).
    repo.findById.mockResolvedValue(statusRow({ id: "pin", languages: ["en"] }));

    const page = await service.getFeed({
      userId: "u",
      locale: "hi",
      limit: 20,
      pinnedId: "pin",
    });
    expect(page.items.some((i) => i.id === "pin")).toBe(false);
  });

  test("pin with empty languages ([] = all languages) is HONORED under any locale", async () => {
    mockCatalogue(["a"]);
    repo.findById.mockResolvedValue(statusRow({ id: "pin", languages: [] }));

    const page = await service.getFeed({
      userId: "u",
      locale: "hi",
      limit: 20,
      pinnedId: "pin",
    });
    expect(page.items[0]?.id).toBe("pin");
  });
});

describe("overlay profile", () => {
  test("getProfile returns an empty personal default when none saved", async () => {
    repo.findProfileByUserId.mockResolvedValue(null);
    const p = await service.getProfile("u");
    expect(p).toEqual({
      activeProfileType: "personal",
      personalDisplayName: null,
      businessName: null,
      businessDetails: null,
      businessMobileNumber: null,
      avatarImageUrl: null,
      updatedAt: null,
    });
  });

  test("saveProfile (personal) upserts and sets activeProfileType=personal", async () => {
    repo.upsertProfile.mockResolvedValue(
      profileRow({ activeProfileType: "personal", personalDisplayName: "Ronak" })
    );
    const p = await service.saveProfile("u", {
      activeProfileType: "personal",
      personalDisplayName: "Ronak",
    });
    expect(repo.upsertProfile).toHaveBeenCalledWith(
      "u",
      expect.objectContaining({ activeProfileType: "personal", personalDisplayName: "Ronak" })
    );
    expect(p.activeProfileType).toBe("personal");
    expect(p.personalDisplayName).toBe("Ronak");
  });

  test("saveProfile (business) flips activeProfileType=business", async () => {
    repo.upsertProfile.mockResolvedValue(
      profileRow({ activeProfileType: "business", businessName: "Prabhuji Store" })
    );
    const p = await service.saveProfile("u", {
      activeProfileType: "business",
      businessName: "Prabhuji Store",
      businessMobileNumber: "9876543210",
    });
    expect(repo.upsertProfile).toHaveBeenCalledWith(
      "u",
      expect.objectContaining({ activeProfileType: "business", businessName: "Prabhuji Store" })
    );
    expect(p.activeProfileType).toBe("business");
  });

  test("getProfile maps a saved row (updatedAt serialized to ISO)", async () => {
    repo.findProfileByUserId.mockResolvedValue(
      profileRow({ activeProfileType: "business", businessName: "Store", avatarImageUrl: "https://x/a.png" })
    );
    const p = await service.getProfile("u");
    expect(p.activeProfileType).toBe("business");
    expect(p.businessName).toBe("Store");
    expect(p.avatarImageUrl).toBe("https://x/a.png");
    expect(p.updatedAt).toBe("2026-07-01T00:00:00.000Z");
  });
});


describe("like toggle (via engagement facade, FREE — no entitlement gate)", () => {
  test("not-yet-liked → likes via the facade", async () => {
    repo.findGateById.mockResolvedValue({ id: "st-1" });
    likedIds = [];
    const res = await service.toggleLike("st-1", "u");
    expect(likeCalls).toEqual(["like:st-1"]);
    expect(res).toMatchObject({ statusId: "st-1", liked: true, likeCount: 6 });
  });

  test("already-liked → unlikes via the facade", async () => {
    repo.findGateById.mockResolvedValue({ id: "st-1" });
    likedIds = ["st-1"];
    const res = await service.toggleLike("st-1", "u");
    expect(likeCalls).toEqual(["unlike:st-1"]);
    expect(res.liked).toBe(false);
  });

  test("unknown id → 404, no engagement call", async () => {
    repo.findGateById.mockResolvedValue(null);
    await expect(service.toggleLike("missing", "u")).rejects.toMatchObject({ statusCode: 404 });
    expect(likeCalls).toEqual([]);
  });
});

describe("view record (via engagement facade)", () => {
  test("records a view and returns the fresh viewCount", async () => {
    repo.findGateById.mockResolvedValue({ id: "st-1" });
    const res = await service.recordView("st-1", "u");
    expect(viewCalls).toEqual(["view:st-1"]);
    expect(res).toEqual({ statusId: "st-1", viewCount: 42 });
  });

  test("unknown id → 404, no engagement call", async () => {
    repo.findGateById.mockResolvedValue(null);
    await expect(service.recordView("missing", "u")).rejects.toMatchObject({ statusCode: 404 });
    expect(viewCalls).toEqual([]);
  });
});

describe("getCard (single status fetch — powers the chat deep link)", () => {
  test("known id → hydrated card with engagement + deity name", async () => {
    repo.findById.mockResolvedValue(
      statusRow({ id: "st-1", deitySlug: "shiva" })
    );
    engagementCounts = {
      "st-1": { contentId: "st-1", likeCount: 4, viewCount: 12, shareCount: 2 },
    };
    likedIds = ["st-1"];
    const card = await service.getCard("u", "st-1");
    expect(card).not.toBeNull();
    expect(card).toMatchObject({
      id: "st-1",
      deitySlug: "shiva",
      deityName: "Shiva",
      likeCount: 4,
      viewCount: 12,
      shareCount: 2,
      likedByMe: true,
    });
    expect(repo.findById).toHaveBeenCalledWith("st-1");
  });

  test("unknown id → null (controller lifts to 404)", async () => {
    repo.findById.mockResolvedValue(null);
    expect(await service.getCard("u", "missing")).toBeNull();
  });
});

/**
 * TAM-N — the house creator on the wire.
 *
 * Every status is CMS-authored, so one house account stands in as the author of
 * all of them. Two things must hold and neither is visible from a single card:
 * the credit block carries the PINNED uuid (the same one `reports` writes into
 * `reported_user_id`), and the feed and the single-card deep link agree byte for
 * byte — they are only identical because `toCard` is the one shared mapper, and
 * the moment someone hand-rolls a second mapper the deep-linked card starts
 * rendering a different (or absent) credit chip than the card it was opened from.
 */
describe("house creator attribution (TAM-N)", () => {
  // Asserted as LITERALS, not by re-importing the constants: comparing a
  // constant to itself would pass through any rename. A rename must fail here
  // and be updated deliberately, alongside the seed migration.
  const EXPECTED_CREATOR = {
    id: "019f8c40-0000-7000-8000-000000000001",
    name: "Amit",
    avatarUrl: null,
  };

  test("every feed card carries the house creator credit block", async () => {
    mockCatalogue(["a", "b"]);

    const page = await service.getFeed({ userId: "u", limit: 20 });

    expect(page.items).toHaveLength(2);
    for (const item of page.items) {
      expect(item.creator).toEqual(EXPECTED_CREATOR);
    }
  });

  test("getCard's creator is deep-equal to the feed's — one shared mapper", async () => {
    mockCatalogue(["st-1"]);
    const page = await service.getFeed({ userId: "u", limit: 20 });

    repo.findById.mockResolvedValue(statusRow({ id: "st-1" }));
    const card = await service.getCard("u", "st-1");

    expect(card).not.toBeNull();
    expect(card?.creator).toEqual(EXPECTED_CREATOR);
    // The property that matters: the two surfaces cannot drift apart.
    expect(card?.creator).toEqual(page.items[0]?.creator);
  });

  test("getReportTarget resolves a known status to the house creator id", async () => {
    repo.findGateById.mockResolvedValue({ id: "st-1" });

    expect(await service.getReportTarget("st-1")).toEqual({
      creatorId: "019f8c40-0000-7000-8000-000000000001",
    });
    expect(repo.findGateById).toHaveBeenCalledWith("st-1");
  });

  test("getReportTarget returns null for an unknown id (controller lifts to 404)", async () => {
    repo.findGateById.mockResolvedValue(null);

    expect(await service.getReportTarget("missing")).toBeNull();
  });
});

describe("facade preview", () => {
  test("getPreview returns a compact card or null", async () => {
    repo.findById.mockResolvedValueOnce(statusRow({ id: "st-1", mediaType: "video" }));
    const preview = await service.getPreview("st-1");
    expect(preview).toMatchObject({ id: "st-1", mediaType: "video" });
    repo.findById.mockResolvedValueOnce(null);
    expect(await service.getPreview("missing")).toBeNull();
  });
});

/**
 * TAM-180 — the feed algorithm A/B on the "All" tab. Mirrors the home block:
 * the ladder is pinned in `shared/rotation`, so here it is which arm reads the
 * preference, and that the service is asked ONLY when the cursor cannot name
 * the pair. A deity CHIP feed is not woven and must never evaluate.
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
    mockCatalogue(["a", "b", "c"]);
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
    expect(decodeRotationCursor(page.nextCursor ?? "")).toMatchObject({ d1: null, d2: null });
  });

  test("a cursor page asks neither the service nor the preference — the cursor decides", async () => {
    treatment();
    const first = await service.getFeed({ userId: USER, limit: 2 });
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

  test("a deity CHIP feed is not woven and never asks the service", async () => {
    mockCatalogue(["a"], { deitySlug: "shiva" });
    const spy = treatment();
    await service.getFeed({ userId: USER, deityId: "shiva", limit: 20 });
    expect(spy).not.toHaveBeenCalled();
    expect(preferenceReads).toEqual([]);
  });

  test("the kill switch keeps the service out of the loop entirely", async () => {
    process.env.ENABLE_DEITY_SPLIT = "false";
    resetEnvCache();
    const spy = treatment();
    await service.getFeed({ userId: USER, limit: 2 });
    expect(spy).not.toHaveBeenCalled();
    expect(preferenceReads).toEqual([]);
  });
});
