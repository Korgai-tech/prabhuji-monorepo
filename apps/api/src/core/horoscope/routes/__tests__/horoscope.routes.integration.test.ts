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
import { initHoroscopeModule } from "@api/core/horoscope";

/**
 * Integration coverage for the Horoscope endpoints (TAM-73) against real Postgres
 * via testcontainers. The seed is SKELETON-ONLY — the zodiac grid + one daily
 * mode + the 8 step configs + media, but ZERO `dailyHoroscopeResult` rows
 * (readings are content, produced by the pipeline, no longer seeded) — so these
 * tests assert STRUCTURE, not reading content:
 *   - the auth gate (401 without a JWT),
 *   - the FREE zodiac grid (12 signs, ordered, localized, no Pro flags),
 *   - the #EXPORT_CRITICAL Pro gate (a FREE JWT NEVER receives the daily result —
 *     403 before any lookup, no steps serialized),
 *   - the empty-content behavior: a PRO JWT clears the gate and resolves the whole
 *     skeleton (entitlement → zodiac → mode → 8 steps) but finds no seeded reading,
 *     so the endpoint returns 404 `RESULT_NOT_FOUND` (never an empty-steps success).
 * Pro is resolved server-side via the subscription facade (a `subscriptions` row
 * with `status='active'`).
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-horoscope-tests";

interface ZodiacCard {
  zodiacId: string;
  displayName: string;
  iconAssetUrl: string;
  sortOrder: number;
}
interface GridBody {
  success: boolean;
  data: { signs: ZodiacCard[] };
}
interface ErrorBody {
  success: boolean;
  message: string;
  data: unknown;
  errorCode?: string;
}

let app: FastifyInstance;
let dbUrl: string;
const PRO_USER = randomUUID();
const FREE_USER = randomUUID();

function runSeed(): void {
  execSync(`pnpm --filter api run seed:horoscope`, {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "ignore",
  });
}

function token(sub: string): string {
  return jwt.sign({ sub, email: `${sub}@prabhuji.internal` }, JWT_SECRET, {
    expiresIn: "1h",
  });
}
const proAuth = (): { authorization: string } => ({
  authorization: `Bearer ${token(PRO_USER)}`,
});
const freeAuth = (): { authorization: string } => ({
  authorization: `Bearer ${token(FREE_USER)}`,
});

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  // Generation OFF, explicitly. Its switch is the PRESENCE of the key, and
  // `nx test` injects the repo-root `.env` — so a developer with a working key
  // configured had this suite call the real model, store a reading, and fail the
  // "no seeded reading → 404" expectation with a 200. CI has no key and passed,
  // which is the worst version of this bug: it only breaks on laptops.
  delete process.env.OPENAI_API_KEY;
  resetEnvCache();
  dbUrl = await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initSubscriptionModule(app);
  initHoroscopeModule(app);
  await app.ready();

  runSeed();

  // Make PRO_USER entitled; FREE_USER has no subscription row (free shape).
  await getPrisma().subscription.create({
    data: { userId: PRO_USER, status: "active" },
  });
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("no JWT → 401 on both endpoints", async () => {
    for (const url of ["/horoscope/zodiac-signs", "/horoscope/daily?zodiac=taurus"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("GET /horoscope/zodiac-signs (FREE discovery)", () => {
  test("free user gets 12 signs, ordered, typo-free labels, localized names", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/horoscope/zodiac-signs?locale=hi",
      headers: freeAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: GridBody = res.json();
    expect(body.data.signs).toHaveLength(12);
    // Ordered by sortOrder.
    const orders = body.data.signs.map((s) => s.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(body.data.signs[0]?.zodiacId).toBe("aries");
    // Typo-free slugs present.
    const ids = body.data.signs.map((s) => s.zodiacId);
    expect(ids).toContain("sagittarius");
    expect(ids).toContain("capricorn");
    // Localized (hi) name for cancer.
    const cancer = body.data.signs.find((s) => s.zodiacId === "cancer");
    expect(cancer?.displayName).toBe("कर्क");
    // No lock/Pro flag leaks into the FREE grid payload.
    expect(JSON.stringify(body.data.signs)).not.toMatch(/isPro|locked|requiresPro/i);
  });

  test("English labels are typo-free (Sagittarius, Capricorn)", async () => {
    const body: GridBody = (
      await app.inject({
        method: "GET",
        url: "/horoscope/zodiac-signs?locale=en",
        headers: freeAuth(),
      })
    ).json();
    const byId = new Map(body.data.signs.map((s) => [s.zodiacId, s.displayName]));
    expect(byId.get("sagittarius")).toBe("Sagittarius");
    expect(byId.get("capricorn")).toBe("Capricorn");
  });
});

describe("#EXPORT_CRITICAL GET /horoscope/daily (Pro-gated, skeleton-only)", () => {
  test("FREE JWT → 403, data null, NO steps serialized", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/horoscope/daily?zodiac=taurus&locale=hi",
      headers: freeAuth(),
    });
    expect(res.statusCode).toBe(403);
    const body: ErrorBody = res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    // The raw response body carries no step text whatsoever.
    expect(res.payload).not.toMatch(/displayText|ttsText|"steps"/);
  });

  test("PRO JWT with no seeded reading → 404 RESULT_NOT_FOUND, no steps serialized", async () => {
    // The skeleton seed creates ZERO daily results, so a Pro caller clears the
    // entitlement gate and resolves the whole skeleton (zodiac enabled, mode
    // enabled, 8 step configs) but the provider finds no reading for today's IST
    // date → 404 RESULT_NOT_FOUND. The specific code proves we reached the final
    // content lookup (not a 403 gate / 404 zodiac / 409 mode/empty-config).
    const res = await app.inject({
      method: "GET",
      url: "/horoscope/daily?zodiac=taurus&locale=hi",
      headers: proAuth(),
    });
    expect(res.statusCode).toBe(404);
    const body: ErrorBody = res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.errorCode).toBe("RESULT_NOT_FOUND");
    // Never an empty-steps success payload — no step content leaks on this path.
    expect(res.payload).not.toMatch(/displayText|ttsText|"steps"/);
  });

  test("unknown zodiac slug → 400 (route enum validation)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/horoscope/daily?zodiac=notasign&locale=en",
      headers: proAuth(),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("seed idempotency", () => {
  test("seed:horoscope run again leaves stable row counts (no duplication)", async () => {
    runSeed(); // second run (beforeAll ran it once)
    expect(await getPrisma().zodiacSign.count()).toBe(12);
    expect(await getPrisma().horoscopeMode.count()).toBe(1);
    expect(await getPrisma().horoscopeStepConfig.count()).toBe(8);
    expect(await getPrisma().mediaAsset.count()).toBe(1);
    // Skeleton-only seed: readings are content, produced by the pipeline.
    expect(await getPrisma().dailyHoroscopeResult.count()).toBe(0);
  });
});
