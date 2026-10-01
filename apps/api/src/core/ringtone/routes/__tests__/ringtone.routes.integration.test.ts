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
import { initRingtoneModule } from "@api/core/ringtone";

/**
 * Integration coverage for the Ringtone endpoints (TAM-67) against real Postgres
 * via testcontainers.
 *
 * The DB seeds were trimmed to SKELETON-ONLY: ringtones were 100% content with no
 * structural table of their own, so the ringtone seed was DELETED and ringtones
 * are no longer seeded at all. These tests therefore assert the STRUCTURAL /
 * EMPTY contract — the endpoints wire up and behave correctly with zero rows:
 *   - every route is JWT-gated (401 without a token),
 *   - the grid + search list endpoints return 200 with an EMPTY page,
 *   - a detail lookup for any id is a 404,
 *   - a malformed cursor restarts the rotated grid (200),
 *   - the `ringtone` table is empty.
 * Content-dependent assertions (the Pro/free URL gate, deity-filter counts, cursor
 * paging over a full grid, the play/set/like/share write flows) were removed with
 * the seed.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-ringtone-tests";

interface Card {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  playCount: number;
  setCount: number;
  deityId: string;
  deityName: string;
}
interface GridBody {
  success: boolean;
  data: { items: Card[]; nextCursor: string | null };
}
interface SearchBody {
  success: boolean;
  data: { items: Card[]; nextCursor: string | null; resultCount: number };
}

let app: FastifyInstance;
let dbUrl: string;
const USER = randomUUID();

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
const auth = (): { authorization: string } => ({
  authorization: `Bearer ${token(USER)}`,
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
  initRingtoneModule(app);
  await app.ready();

  // Deities are still seeded (their table is structural); ringtones are not.
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
    for (const url of ["/ringtones", "/ringtones/search?q=ram", `/ringtones/${randomUUID()}`]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("GET /ringtones grid (empty contract)", () => {
  test("authed grid → 200 with an empty page (no ringtones seeded)", async () => {
    const res = await app.inject({ method: "GET", url: "/ringtones?limit=50", headers: auth() });
    expect(res.statusCode).toBe(200);
    const body: GridBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.nextCursor).toBeNull();
  });

  test("malformed cursor restarts the rotated grid (200, not 400)", async () => {
    // TAM-150: the grid pages a rotation plan and the cursor carries the
    // refresh epoch. An unreadable cursor means "start over", never a 400 — an
    // app mid-session across the deploy still holds an old keyset cursor.
    const res = await app.inject({
      method: "GET",
      url: "/ringtones?cursor=%40%40bad%40%40",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: GridBody = res.json();
    expect(body.data.items).toHaveLength(0);
  });

  test("detail for any id → 404 (no ringtones seeded)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/ringtones/${randomUUID()}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /ringtones/search (empty contract)", () => {
  test("query with no possible match → 200, empty items, resultCount 0", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ringtones/search?q=krishna&limit=50",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: SearchBody = res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.resultCount).toBe(0);
  });

  test("empty q → unfiltered (still empty) list, resultCount 0", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ringtones/search?q=&limit=50",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: SearchBody = res.json();
    expect(body.data.items).toHaveLength(0);
    expect(body.data.nextCursor).toBeNull();
    expect(body.data.resultCount).toBe(0);
  });
});

describe("ringtone table is empty (no content seed)", () => {
  test("no ringtone rows exist", async () => {
    expect(await getPrisma().ringtone.count()).toBe(0);
  });
});
