import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initSubscriptionModule } from "@api/core/subscription";
import { initEngagementModule } from "@api/core/engagement";
import { initDeityModule } from "@api/core/deity";
import { initStatusModule } from "@api/core/status";
import { initPinnedContentModule } from "@api/core/pinned-content";
import { clearPlanCache } from "@api/shared/rotation";

/**
 * Integration coverage for the Status Sharing endpoints (TAM-71) against real
 * Postgres via testcontainers — trimmed to the STRUCTURAL / EMPTY contract after
 * the content seeds were removed (status items are no longer seeded). This proves
 * the route surface holds with no content: every route requires a JWT; the feed
 * (and an empty deity filter) returns 200 with an empty page; a like/view on an
 * unknown id 404s; the overlay profile still round-trips (empty default →
 * personal → business, activeProfileType flips) with its Zod validation intact;
 * and the status content tables stay empty (no seed). There is NO entitlement
 * gate — everything is free.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-status-tests";

interface FeedBody {
  success: boolean;
  data: { items: unknown[]; nextCursor: string | null };
}
interface ProfileBody {
  success: boolean;
  data: {
    activeProfileType: string;
    personalDisplayName: string | null;
    businessName: string | null;
    businessMobileNumber: string | null;
    avatarImageUrl: string | null;
    updatedAt: string | null;
  };
}

let app: FastifyInstance;
let dbUrl: string;
const USER = randomUUID();
const OTHER_USER = randomUUID();

function runSeed(script: "seed:deity"): void {
  execSync(`pnpm --filter api run ${script}`, {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "ignore",
  });
}

function token(sub: string): string {
  return jwt.sign({ sub, email: `${sub}@prabhuji.internal` }, JWT_SECRET, {
    expiresIn: "1h",
  });
}
const auth = (sub: string): { authorization: string } => ({
  authorization: `Bearer ${token(sub)}`,
});

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  dbUrl = await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initSubscriptionModule(app);
  initEngagementModule();
  initDeityModule(app);
  initStatusModule(app);
  // TAM-173: status.getFeed calls `performServiceCall("pinnedContent", …)` to
  // overlay active pins. The lookup facade is registered synchronously by
  // `initPinnedContentModule`, so the feed 500s ("service 'pinnedContent' not
  // registered") without this line. Runtime bootstrap wires the same module
  // (see `apps/api/src/modules.ts`).
  initPinnedContentModule(app);
  await app.ready();

  runSeed("seed:deity");
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("no JWT → 401 on every endpoint", async () => {
    const id = randomUUID();
    for (const url of ["/status/feed", "/status/profile"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
    const like = await app.inject({ method: "POST", url: `/status/${id}/like` });
    expect(like.statusCode).toBe(401);
    const view = await app.inject({ method: "POST", url: `/status/${id}/view` });
    expect(view.statusCode).toBe(401);
    const put = await app.inject({
      method: "PUT",
      url: "/status/profile",
      payload: { activeProfileType: "personal" },
    });
    expect(put.statusCode).toBe(401);
  });
});

describe("GET /status/feed", () => {
  test("returns 200 with an empty page when no items are seeded", async () => {
    const res = await app.inject({ method: "GET", url: "/status/feed?limit=50", headers: auth(USER) });
    expect(res.statusCode).toBe(200);
    const body: FeedBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  test("a deity filter over an empty feed returns an empty page", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/status/feed?deityId=ganesha&limit=50",
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: FeedBody = res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });
});

describe("GET/PUT /status/profile", () => {
  test("GET with no saved profile → empty personal default", async () => {
    const res = await app.inject({ method: "GET", url: "/status/profile", headers: auth(USER) });
    expect(res.statusCode).toBe(200);
    const body: ProfileBody = res.json();
    expect(body.data.activeProfileType).toBe("personal");
    expect(body.data.personalDisplayName).toBeNull();
    expect(body.data.updatedAt).toBeNull();
  });

  test("PUT personal then business → activeProfileType flips; GET reflects it", async () => {
    const personal = await app.inject({
      method: "PUT",
      url: "/status/profile",
      headers: auth(USER),
      payload: {
        activeProfileType: "personal",
        personalDisplayName: "Ronak",
        avatarImageUrl: "https://cdn.example.com/avatars/ronak.png",
      },
    });
    expect(personal.statusCode).toBe(200);
    const pBody: ProfileBody = personal.json();
    expect(pBody.data.activeProfileType).toBe("personal");
    expect(pBody.data.avatarImageUrl).toBe("https://cdn.example.com/avatars/ronak.png");

    const business = await app.inject({
      method: "PUT",
      url: "/status/profile",
      headers: auth(USER),
      payload: {
        activeProfileType: "business",
        businessName: "Prabhuji Store",
        businessDetails: "Devotional goods",
        businessMobileNumber: "9876543210",
      },
    });
    expect(business.statusCode).toBe(200);
    const bBody: ProfileBody = business.json();
    expect(bBody.data.activeProfileType).toBe("business");
    expect(bBody.data.businessName).toBe("Prabhuji Store");
    // personal field persists across the business save (single-row profile)
    expect(bBody.data.personalDisplayName).toBe("Ronak");

    const get = await app.inject({ method: "GET", url: "/status/profile", headers: auth(USER) });
    const gBody: ProfileBody = get.json();
    expect(gBody.data.activeProfileType).toBe("business");
    expect(gBody.data.businessMobileNumber).toBe("9876543210");
    expect(gBody.data.avatarImageUrl).toBe("https://cdn.example.com/avatars/ronak.png");
    expect(gBody.data.updatedAt).not.toBeNull();
  });

  test("a user only ever sees their own profile", async () => {
    const res = await app.inject({ method: "GET", url: "/status/profile", headers: auth(OTHER_USER) });
    const body: ProfileBody = res.json();
    // OTHER_USER never saved → empty default, not USER's business profile
    expect(body.data.businessName).toBeNull();
    expect(body.data.activeProfileType).toBe("personal");
  });

  test("char-limit + mobile + business-name violations → 400 VALIDATION_ERROR", async () => {
    const cases = [
      { activeProfileType: "personal", personalDisplayName: "x".repeat(41) },
      { activeProfileType: "business", businessName: "x".repeat(51) },
      { activeProfileType: "business", businessName: "Ok", businessDetails: "x".repeat(81) },
      { activeProfileType: "business", businessName: "Ok", businessMobileNumber: "12345" },
      { activeProfileType: "business" }, // missing businessName
    ];
    for (const payload of cases) {
      const res = await app.inject({
        method: "PUT",
        url: "/status/profile",
        headers: auth(USER),
        payload,
      });
      expect(res.statusCode).toBe(400);
      const errBody: { errorCode?: string } = res.json();
      expect(errBody.errorCode).toBe("VALIDATION_ERROR");
    }
  });
});

describe("POST /status/:id/like + /view (via engagement)", () => {
  test("like/view on an unknown id → 404", async () => {
    const like = await app.inject({ method: "POST", url: `/status/${randomUUID()}/like`, headers: auth(USER) });
    expect(like.statusCode).toBe(404);
    const view = await app.inject({ method: "POST", url: `/status/${randomUUID()}/view`, headers: auth(USER) });
    expect(view.statusCode).toBe(404);
  });
});

describe("no seeded status content", () => {
  test("status content tables are empty (skeleton-only seed)", async () => {
    expect(await getPrisma().statusItem.count()).toBe(0);
    expect(await getPrisma().statusDeityTag.count()).toBe(0);
  });
});

/**
 * TAM-166 — chat-recommended status pinned to position 0. Runs LAST in the
 * file so it can seed a small live catalogue via Prisma without breaking the
 * empty-page assertions above; `afterAll` deletes what it seeded so the DB
 * still ends the run empty (hygiene, not correctness — the container is
 * discarded either way).
 */
describe("GET /status/feed?pinnedId=... (TAM-166)", () => {
  interface FeedItem {
    id: string;
    slug: string;
    title: string;
  }
  interface PinFeedBody {
    success: boolean;
    data: { items: FeedItem[]; nextCursor: string | null };
  }

  const seededIds: string[] = [];

  async function seedStatusItem(overrides: {
    slug: string;
    title: string;
  }): Promise<string> {
    const row = await getPrisma().statusItem.create({
      data: {
        slug: overrides.slug,
        title: overrides.title,
        mediaType: "image",
        imageUrl: "https://cdn.example.com/i.png",
        thumbnailUrl: "https://cdn.example.com/t.png",
        overlaySafeArea: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
        languages: [],
        isActive: true,
      },
      select: { id: true },
    });
    seededIds.push(row.id);
    return row.id;
  }

  let pinId: string;
  let otherIdA: string;
  let otherIdB: string;

  beforeAll(async () => {
    pinId = await seedStatusItem({ slug: "tam-166-pin", title: "Pin (TAM-166)" });
    otherIdA = await seedStatusItem({ slug: "tam-166-a", title: "A (TAM-166)" });
    otherIdB = await seedStatusItem({ slug: "tam-166-b", title: "B (TAM-166)" });
    // The earlier `GET /status/feed` describe block hit an empty catalogue
    // and cached an empty rotation plan in the in-process LRU (keyed
    // `status:*:*`). Without clearing it the plan-cache serves that stale
    // empty plan and the freshly-seeded items never enter the rotation
    // window — the pin still lands at position 0 (findById bypasses the
    // cache) but `nextCursor` is null and the "other seeded items" tail
    // is empty. Same seam used by home/wallpaper/ringtone/status unit
    // tests when they mutate the catalogue between assertions.
    clearPlanCache();
  }, 30_000);

  afterAll(async () => {
    if (seededIds.length > 0) {
      await getPrisma().statusItem.deleteMany({ where: { id: { in: seededIds } } });
    }
    // Symmetric to the beforeAll — leaving the seeded plan cached would
    // pollute any suite that runs after this file (all integration suites
    // share one process).
    clearPlanCache();
  });

  test("first page: pinnedId prepends the item and dedupes any tail occurrence", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/status/feed?limit=50&pinnedId=${pinId}`,
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: PinFeedBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items[0]?.id).toBe(pinId);
    // Deduped — the pinned id must appear EXACTLY once across the whole page.
    expect(body.data.items.filter((i) => i.id === pinId)).toHaveLength(1);
    // The rest of the seeded catalogue is still served.
    const otherIds = body.data.items.map((i) => i.id).filter((id) => id !== pinId);
    expect(otherIds).toEqual(expect.arrayContaining([otherIdA, otherIdB]));
  });

  test("non-first page: pinnedId is ignored (cursor set → pin not repeated on scroll)", async () => {
    // Force a small page so we get a real nextCursor to walk with.
    const first = await app.inject({
      method: "GET",
      url: `/status/feed?limit=1&pinnedId=${pinId}`,
      headers: auth(USER),
    });
    const firstBody: PinFeedBody = first.json();
    expect(firstBody.data.items[0]?.id).toBe(pinId);
    expect(firstBody.data.nextCursor).not.toBeNull();

    const second = await app.inject({
      method: "GET",
      url: `/status/feed?limit=50&pinnedId=${pinId}&cursor=${encodeURIComponent(
        firstBody.data.nextCursor ?? ""
      )}`,
      headers: auth(USER),
    });
    const secondBody: PinFeedBody = second.json();
    // On a subsequent page the pin must NOT be re-prepended — position 0 is
    // whatever the rotation cursor points at, never the pinned id.
    expect(secondBody.data.items[0]?.id).not.toBe(pinId);
  });

  test("fail-soft: unknown pinnedId returns the normal feed, no 404", async () => {
    const missing = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/status/feed?limit=50&pinnedId=${missing}`,
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: PinFeedBody = res.json();
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items[0]?.id).not.toBe(missing);
  });

  test("malformed pinnedId (not a uuid) → 400 VALIDATION_ERROR (Zod boundary)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/status/feed?limit=50&pinnedId=not-a-uuid`,
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(400);
    const body: { errorCode?: string } = res.json();
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });
});
