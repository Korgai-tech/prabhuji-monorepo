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
import { initWallpaperModule } from "@api/core/wallpaper";

/**
 * Integration coverage for the Wallpaper endpoints (TAM-69) against real
 * Postgres via testcontainers, gutted to the SKELETON-ONLY seed contract.
 *
 * The `seed:wallpaper` seed is navigational-skeleton-only: it creates the 5
 * homepage row definitions (+ their locale title overrides) and NO wallpaper
 * content — zero wallpapers, deity tags or row-item memberships. So these tests
 * prove only the STRUCTURAL contract that survives a content-less catalogue:
 * every route is JWT-guarded; `/home` serves an empty rows list because the
 * service drops any item-less row; `/list` serves an empty page; a detail
 * lookup 404s; the filter/body validation gates still fire; and the seed is
 * idempotent. Content-behaviour assertions (counts, filters, like / set / share
 * flows) are intentionally NOT covered here — there is no content to exercise
 * them against. The ONE exception is the rotation block near the bottom, which
 * seeds its own throwaway catalogue because the TAM-150 rotation queries have
 * no other real-Postgres coverage.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-wallpaper-tests";

interface HomeBody {
  success: boolean;
  data: { rows: unknown[] };
}
interface ListBody {
  success: boolean;
  data: { items: unknown[]; nextCursor: string | null };
}

let app: FastifyInstance;
let dbUrl: string;
const USER = randomUUID();

function runSeed(script: "seed:deity" | "seed:wallpaper"): void {
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
  initWallpaperModule(app);
  await app.ready();

  runSeed("seed:deity");
  runSeed("seed:wallpaper");
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
    for (const url of ["/wallpaper/home", "/wallpaper/list", `/wallpaper/${id}`]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
    const post = await app.inject({
      method: "POST",
      url: `/wallpaper/${id}/like`,
    });
    expect(post.statusCode).toBe(401);
  });
});

describe("GET /wallpaper/home (skeleton — no content seeded)", () => {
  test("200 with an empty rows list — every item-less CMS row is omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/wallpaper/home",
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: HomeBody = res.json();
    expect(body.success).toBe(true);
    // The 5 seeded homepage rows exist in the DB (see the `seed idempotency`
    // block), but the service drops any row that resolves to zero items
    // (wallpaper.service.ts:100 `if (rows.length === 0) continue;`). With no
    // wallpapers, deity tags or row-item memberships, ALL rows resolve empty and
    // are dropped, so a content-less skeleton serves NO rows at all.
    expect(body.data.rows).toEqual([]);
  });
});

describe("GET /wallpaper/list (skeleton — no content seeded)", () => {
  test("200 with an empty page — no wallpapers, no cursor", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/wallpaper/list",
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: ListBody = res.json();
    expect(body.success).toBe(true);
    // Default listing over an empty catalogue — the rotation plan is empty, so
    // nothing is hydrated: empty items, no next page.
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  test("deityId AND rowId together → 400 (mutually exclusive filters)", async () => {
    // Structural: the filter combination is rejected before any DB read
    // (wallpaper.service.ts:149-154 throws ValidationError → 400).
    const res = await app.inject({
      method: "GET",
      url: `/wallpaper/list?deityId=shiva&rowId=${randomUUID()}`,
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(400);
  });
});

/**
 * The one place the ROTATION queries (TAM-150) run against real Postgres —
 * `listRotationCandidates` + the `WHERE id IN (...)` hydration. The algorithm
 * itself is covered by `shared/rotation/__tests__`; what matters here is that
 * the SQL works and that paging a rotated plan over a real catalogue neither
 * skips nor repeats a wallpaper.
 */
describe("GET /wallpaper/list (rotated order, seeded catalogue)", () => {
  const CATALOGUE = 30;

  beforeAll(async () => {
    await getPrisma().wallpaper.createMany({
      data: Array.from({ length: CATALOGUE }, (_, i) => ({
        slug: `rotation-fixture-${i}`,
        title: `Rotation fixture ${i}`,
        mediaType: "static",
        // Scoped to one deity so this suite's rotation plan is keyed separately
        // from the empty-catalogue tests above (a plan is cached per epoch per
        // filter combination, and content added mid-epoch is invisible to a
        // plan that was already built — by design; see docs/FEED-ROTATION.md).
        deitySlug: "shiva",
        thumbnailUrl: `https://cdn.example.test/t${i}.png`,
        previewImageUrl: `https://cdn.example.test/p${i}.png`,
        // Old enough to be outside the new-item boost window, and setCount 0 so
        // nothing resurfaces — otherwise the shown count would be the window
        // PLUS whichever pinned items fall outside it, which varies by epoch.
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
    });
  });

  afterAll(async () => {
    await getPrisma().wallpaper.deleteMany({
      where: { slug: { startsWith: "rotation-fixture-" } },
    });
  });

  test("holds part of the catalogue back and pages the rest exactly once", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await app.inject({
        method: "GET",
        url: `/wallpaper/list?deityId=shiva&limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        headers: auth(USER),
      });
      expect(res.statusCode).toBe(200);
      const body: ListBody = res.json();
      seen.push(...body.data.items.map((i) => (i as { id: string }).id));
      cursor = body.data.nextCursor;
    } while (cursor !== null);

    // 65% shown, the rest held back for a later refresh
    expect(seen.length).toBe(Math.ceil(CATALOGUE * 0.65));
    expect(new Set(seen).size).toBe(seen.length); // no repeats across pages
  });

  test("the order is stable within a refresh epoch", async () => {
    const fetchFirstPage = async (): Promise<string[]> => {
      const res = await app.inject({
        method: "GET",
        url: "/wallpaper/list?deityId=shiva&limit=10",
        headers: auth(USER),
      });
      const body: ListBody = res.json();
      return body.data.items.map((i) => (i as { id: string }).id);
    };
    expect(await fetchFirstPage()).toEqual(await fetchFirstPage());
  });
});

describe("GET /wallpaper/:id", () => {
  test("unknown id → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/wallpaper/${randomUUID()}`,
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /wallpaper/:id/count", () => {
  test("unknown count type → 400 (body enum rejects `like`)", async () => {
    // Structural: Zod validates the body at the route boundary before the
    // handler runs, so an invalid `type` 400s regardless of the (absent) content.
    const res = await app.inject({
      method: "POST",
      url: `/wallpaper/${randomUUID()}/count`,
      headers: auth(USER),
      payload: { type: "like" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("seed idempotency", () => {
  test("seed:wallpaper run again leaves stable skeleton counts (no content)", async () => {
    runSeed("seed:wallpaper");
    expect(await getPrisma().wallpaperHomepageRow.count()).toBe(5);
    expect(await getPrisma().wallpaper.count()).toBe(0);
    expect(await getPrisma().wallpaperDeityTag.count()).toBe(0);
    expect(await getPrisma().wallpaperRowItem.count()).toBe(0);
  });
});
