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
import { initDeityModule } from "@api/core/deity";

/**
 * Integration coverage for `GET /deities` (TAM-57) — real Postgres via
 * testcontainers. The auth module is initialised so `authMiddleware` can
 * resolve its `performServiceCall("auth", …)` handshake; tokens are signed
 * directly with the JWT secret (stateless `verifyToken`, no user row needed).
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-deity-tests";

interface DeityItem {
  slug: string;
  displayName: string;
  iconUrl: string;
  sortOrder: number;
}
interface ListBody {
  success: boolean;
  message: string;
  data: { items: DeityItem[]; nextCursor: string | null };
}
interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

let app: FastifyInstance;

function mintToken(): string {
  return jwt.sign(
    { sub: randomUUID(), email: "tester@prabhuji.internal" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function seedDeity(
  slug: string,
  sortOrder: number,
  active: boolean,
  translations: { locale: string; displayName: string }[]
): Promise<void> {
  await getPrisma().deity.create({
    data: {
      slug,
      iconUrl: `https://cdn.example.com/${slug}.png`,
      sortOrder,
      active,
      translations: { create: translations },
    },
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initDeityModule(app);
  await app.ready();

  // Ordered set: sortOrder gaps + one INACTIVE deity that must never appear.
  await seedDeity("ganesha", 0, true, [
    { locale: "hi", displayName: "गणेश" },
    { locale: "en", displayName: "Ganesha" },
  ]);
  await seedDeity("shiva", 1, true, [
    { locale: "hi", displayName: "शिव" },
    { locale: "en", displayName: "Shiva" },
  ]);
  await seedDeity("hanuman", 2, true, [
    { locale: "hi", displayName: "हनुमान" },
    { locale: "en", displayName: "Hanuman" },
  ]);
  await seedDeity("krishna", 3, true, [
    { locale: "hi", displayName: "कृष्ण" },
    { locale: "en", displayName: "Krishna" },
  ]);
  // en-only translation to exercise the locale fallback.
  await seedDeity("durga", 4, true, [{ locale: "en", displayName: "Durga" }]);
  // inactive — excluded from every response.
  await seedDeity("retired", 5, false, [
    { locale: "hi", displayName: "पुराना" },
    { locale: "en", displayName: "Retired" },
  ]);
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("without a JWT returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/deities?locale=hi" });
    expect(res.statusCode).toBe(401);
  });
});

describe("GET /deities localized + ordered + envelope", () => {
  test("locale=hi returns active deities localized, ordered by sortOrder", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/deities?locale=hi",
      headers: { authorization: `Bearer ${mintToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body: ListBody = res.json();
    expect(body.success).toBe(true);
    // Envelope shape: data.items + data.nextCursor.
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data).toHaveProperty("nextCursor");
    // 5 active deities (the inactive "retired" is excluded), in sortOrder.
    expect(body.data.items.map((d) => d.slug)).toEqual([
      "ganesha",
      "shiva",
      "hanuman",
      "krishna",
      "durga",
    ]);
    expect(body.data.items[0]?.displayName).toBe("गणेश");
    // durga has only an en translation → falls back to English.
    expect(body.data.items[4]?.displayName).toBe("Durga");
    // Single page (5 < default limit 20) → terminal cursor.
    expect(body.data.nextCursor).toBeNull();
    // Icon URLs are the https placeholder shape (media-URL convention).
    for (const d of body.data.items) {
      expect(d.iconUrl.startsWith("https://")).toBe(true);
    }
  });

  test("inactive deity never appears", async () => {
    // `mr` is a valid client locale with no deity translations → every name
    // falls back to `en`, and the inactive "retired" deity is still excluded.
    const res = await app.inject({
      method: "GET",
      url: "/deities?locale=mr",
      headers: { authorization: `Bearer ${mintToken()}` },
    });
    const body: ListBody = res.json();
    expect(body.data.items.some((d) => d.slug === "retired")).toBe(false);
    // Fallback to English display names for the untranslated `mr` locale.
    expect(body.data.items[0]?.displayName).toBe("Ganesha");
  });
});

describe("cursor pagination (no dup / no skip / terminal null)", () => {
  test("paging with limit=2 covers every active deity exactly once", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs = new URLSearchParams({ locale: "hi", limit: "2" });
      if (cursor) qs.set("cursor", cursor);
      const res = await app.inject({
        method: "GET",
        url: `/deities?${qs.toString()}`,
        headers: { authorization: `Bearer ${mintToken()}` },
      });
      expect(res.statusCode).toBe(200);
      const body: ListBody = res.json();
      seen.push(...body.data.items.map((d) => d.slug));
      cursor = body.data.nextCursor;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(10); // guard against an infinite loop
    } while (cursor !== null);

    // 5 active deities across 3 pages (2 + 2 + 1); terminal cursor was null.
    expect(seen).toEqual(["ganesha", "shiva", "hanuman", "krishna", "durga"]);
    expect(new Set(seen).size).toBe(seen.length); // no duplicates
  });
});

describe("input validation", () => {
  test("a malformed cursor returns 400 VALIDATION_ERROR (never 500)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/deities?locale=hi&cursor=%40%40bad%40%40",
      headers: { authorization: `Bearer ${mintToken()}` },
    });
    expect(res.statusCode).toBe(400);
    const body: ErrBody = res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("INVALID_CURSOR");
  });

  // The `locale` read param is deliberately TOLERANT (`shared/schemas/locale.ts`):
  // an unsupported code is a NO-MATCH that resolves through the documented
  // fallback chain, never a 400. This test asserted the opposite until the
  // platform-wide standardization — an app build shipping a ninth language must
  // degrade to the fallback rather than lose the whole screen.
  test("an unsupported locale falls back to `en` rather than 400ing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/deities?locale=zz",
      headers: { authorization: `Bearer ${mintToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body: ListBody = res.json();
    // `toLocalized` resolves requested → en → slug; `zz` matches no translation
    // row, so every card carries its `en` name — same result as the valid-but-
    // untranslated `mr` locale above.
    expect(body.data.items[0]?.displayName).toBe("Ganesha");
    expect(body.data.items.map((d) => d.slug)).toEqual([
      "ganesha",
      "shiva",
      "hanuman",
      "krishna",
      "durga",
    ]);
  });

  test("limit above the max is rejected (400)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/deities?locale=hi&limit=51",
      headers: { authorization: `Bearer ${mintToken()}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
