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
import { initBooksModule } from "@api/core/books";

/**
 * Integration coverage for the Books & Scriptures endpoints (TAM-75) against real
 * Postgres via testcontainers.
 *
 * The `seed:books` seed is SKELETON-ONLY: it creates the 4 CMS-owned section
 * headings (`carousel` / `categories` / `newly_added` / `all_books`) + their
 * translations, and ZERO book/scripture content (no contents, sub-books, or
 * chapters). So this suite proves the STRUCTURAL contract the skeleton serves:
 *   - every route is JWT-gated (401 without a token);
 *   - discovery degrades gracefully with no content — home serves only the
 *     `categories` section (the carousel + newly-added sections are dropped
 *     hide-when-empty), and the listings serve their CMS heading + an empty page;
 *   - the #EXPORT_CRITICAL Pro gate still fires: a FREE JWT is stopped with `403`
 *     + null data on every reading route BEFORE any lookup, and a PRO JWT reaches
 *     the (empty) store and gets `404`.
 * Content-payload behaviour (kanda trees, chapter bodies, scripture bodies, Pro
 * reader deep-dives) is covered by the unit suite / fixtured tests, not here.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-books-tests";

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
}
/** A `GET /books/home` section — items are `book` or `category` cards. */
interface HomeSection {
  key: string;
  title: string;
  sortOrder: number;
  items: { kind: string; category?: string; itemCount?: number }[];
}
/** A discovery listing page (`GET /books`, `GET /books/categories/:category`). */
interface CardPage {
  title: string;
  items: unknown[];
  nextCursor: string | null;
}

let app: FastifyInstance;
let dbUrl: string;
const PRO_USER = randomUUID();
const FREE_USER = randomUUID();

function runSeed(): void {
  execSync(`pnpm --filter api run seed:books`, {
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
  resetEnvCache();
  dbUrl = await startTestDb();
  app = await buildApp();
  initAuthModule(app);
  initSubscriptionModule(app);
  initBooksModule(app);
  await app.ready();

  runSeed();

  // Make PRO_USER entitled; FREE_USER has no subscription row (free shape). The
  // PRO row lets the reading-gate tests reach the (empty) store → 404 instead of
  // being stopped at the 403 gate.
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
  test("no JWT → 401 on every discovery + reading route", async () => {
    const id = randomUUID();
    const urls = [
      "/books/home",
      "/books",
      "/books/categories/Chalisa",
      `/books/${id}/contents`,
      `/books/${id}/chapters/${randomUUID()}`,
      `/books/${id}/scripture`,
    ];
    for (const url of urls) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("GET /books/home (skeleton discovery)", () => {
  test("free user → only the (empty-count) categories section; carousel + newly-added dropped", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/books/home",
      headers: freeAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: Envelope<{ sections: HomeSection[] }> = res.json();
    expect(body.success).toBe(true);

    // With zero content the carousel + newly_added sections are omitted
    // (hide-when-empty); the categories section always renders its 4 CMS-owned
    // category cards (from the BOOK_CATEGORIES constant), each with itemCount 0.
    expect(body.data.sections.map((s) => [s.key, s.title])).toEqual([
      ["categories", "Browse Categories"], // heading is server-owned (book_sections)
    ]);
    const categories = body.data.sections[0].items;
    expect(categories.map((c) => c.category)).toEqual([
      "Chalisa",
      "Aarti",
      "Kavach",
      "Stotram",
    ]);
    expect(categories.every((c) => c.itemCount === 0)).toBe(true);

    // #EXPORT_CRITICAL — no reading content whatsoever in the discovery payload.
    expect(res.payload).not.toMatch(/bodyText|contentBody|audioUrl/);
  });

  test("deactivating the categories CMS row hides the last visible section", async () => {
    await getPrisma().bookSection.update({
      where: { key: "categories" },
      data: { isActive: false },
    });
    try {
      const res = await app.inject({
        method: "GET",
        url: "/books/home",
        headers: freeAuth(),
      });
      const body: Envelope<{ sections: HomeSection[] }> = res.json();
      // categories was the only populated section; switching it off leaves the
      // home with no sections at all (title is CMS-owned, so is visibility).
      expect(body.data.sections).toEqual([]);
    } finally {
      await getPrisma().bookSection.update({
        where: { key: "categories" },
        data: { isActive: true },
      });
    }
  });
});

describe("GET /books (all-books listing, no content)", () => {
  test("free user → CMS heading + an empty page", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/books?limit=2",
      headers: freeAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: Envelope<CardPage> = res.json();
    // The listing heading is server-served (was hardcoded "All Books").
    expect(body.data.title).toBe("All Books");
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });
});

describe("GET /books/categories/:category (no content)", () => {
  test("Chalisa → the category's own heading + an empty page", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/books/categories/Chalisa",
      headers: freeAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: Envelope<CardPage> = res.json();
    expect(body.data.title).toBe("Chalisa"); // server-served screen heading
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  test("invalid category → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/books/categories/NotACategory",
      headers: freeAuth(),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("#EXPORT_CRITICAL reading routes are Pro-gated", () => {
  const readingUrls = (id: string): string[] => [
    `/books/${id}/contents`,
    `/books/${id}/chapters/${randomUUID()}`,
    `/books/${id}/scripture`,
  ];

  test("FREE JWT → 403, data null, no reading payload serialized", async () => {
    for (const url of readingUrls(randomUUID())) {
      const res = await app.inject({ method: "GET", url, headers: freeAuth() });
      expect(res.statusCode).toBe(403);
      const body: { success: boolean; data: unknown } = res.json();
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(res.payload).not.toMatch(/bodyText|contentBody|subBooks|audioUrl/);
    }
  });

  test("PRO JWT past the gate → 404 (nothing seeded)", async () => {
    for (const url of readingUrls(randomUUID())) {
      const res = await app.inject({ method: "GET", url, headers: proAuth() });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("seed idempotency", () => {
  test("seed:books run again → stable skeleton counts (no content, no duplication)", async () => {
    runSeed(); // second run (beforeAll ran it once)
    expect(await getPrisma().bookSection.count()).toBe(4);
    expect(
      await getPrisma().bookContent.count({ where: { contentType: "major_book" } })
    ).toBe(0);
    expect(
      await getPrisma().bookContent.count({
        where: { contentType: "direct_scripture" },
      })
    ).toBe(0);
    expect(await getPrisma().bookSubBook.count()).toBe(0);
    expect(await getPrisma().bookChapter.count()).toBe(0);
  });
});
