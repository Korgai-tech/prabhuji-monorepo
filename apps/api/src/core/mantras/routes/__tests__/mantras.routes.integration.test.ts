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
import { initUsersModule } from "@api/core/users";
import { initMantrasModule } from "@api/core/mantras";

/**
 * Structural integration coverage for the Mantras & Stutis endpoints (TAM-65)
 * against real Postgres via testcontainers.
 *
 * The DB seeds are SKELETON-ONLY: `seed:mantras` creates the 6 category taxonomy
 * rows and the 4 homepage section definitions but ZERO audio items and ZERO tag
 * rows (content is populated by the content pipeline, not the seed). So this
 * suite proves the navigational skeleton is served and that the content-backed
 * surfaces behave correctly when empty — the auth gate, the section skeleton
 * (taxonomy sections shown, content-backed sections hidden when empty), the
 * empty items page, an unknown-id 404, and seed idempotency. The Pro/Free
 * `audioUrl` gate, filters, pagination, playlists, and write paths are covered
 * by the service unit tests where content fixtures live.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-mantras-tests";

interface ListBody {
  success: boolean;
  data: { items: unknown[]; nextCursor: string | null };
}
interface SectionsBody {
  success: boolean;
  data: {
    sections: {
      sectionType: string;
      title: string;
      layoutType: string;
      items: unknown[];
    }[];
  };
}

let app: FastifyInstance;
let dbUrl: string;
const USER = randomUUID();

function runSeed(script: "seed:deity" | "seed:mantras"): void {
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
  // TAM-160: `adminMiddleware` resolves the caller's role through
  // `performServiceCall("users", …)` on every request (never from a JWT claim),
  // so the `/admin/mantras/*` block below needs the users facade registered.
  initUsersModule(app);
  initMantrasModule(app);
  await app.ready();

  runSeed("seed:deity");
  runSeed("seed:mantras");
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("no JWT → 401 on every endpoint", async () => {
    for (const url of ["/mantras/sections", "/mantras/items", `/mantras/items/${randomUUID()}`]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("GET /mantras/sections (skeleton)", () => {
  test("serves the taxonomy sections; content-backed sections hidden when empty", async () => {
    const res = await app.inject({ method: "GET", url: "/mantras/sections", headers: auth() });
    expect(res.statusCode).toBe(200);
    const body: SectionsBody = res.json();
    expect(body.success).toBe(true);

    const types = body.data.sections.map((s) => s.sectionType);
    // Taxonomy sections are backed by the skeleton seed (6 categories) + the
    // deity taxonomy (seed:deity) — always present.
    expect(types).toContain("categories");
    expect(types).toContain("deities");
    // Content-backed sections hide-when-empty: no audio items → no
    // `newly_added`; no play history → no `recently_played`.
    expect(types).not.toContain("newly_added");
    expect(types).not.toContain("recently_played");

    const categories = body.data.sections.find((s) => s.sectionType === "categories");
    expect(categories?.items).toHaveLength(6); // the 6 seeded mantra categories
    const deities = body.data.sections.find((s) => s.sectionType === "deities");
    expect(deities?.items.length).toBeGreaterThan(0); // the seeded deity taxonomy
  });

  // The bug that motivated the platform-wide rename: this endpoint took
  // `language`, so `?locale=hi` was silently dropped and Hindi callers got the
  // base English labels with no error. Locks the param NAME to `locale`.
  test("locale=hi serves the seeded Hindi section titles and category names", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mantras/sections?locale=hi",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: SectionsBody = res.json();

    // Section titles come from the `hi` override rows in seeds/mantras.seed.ts.
    const categories = body.data.sections.find((s) => s.sectionType === "categories");
    expect(categories?.title).toBe("श्रेणियाँ देखें");
    const deities = body.data.sections.find((s) => s.sectionType === "deities");
    expect(deities?.title).toBe("देवताओं के मंत्र");

    // Category CARD names localize off their own `displayName` overrides.
    const names = (categories?.items ?? []).map((i) => (i as { name: string }).name);
    expect(names).toContain("शांति");
    expect(names).toContain("धन");
  });

  test("an unsupported locale falls back to the base labels rather than 400ing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mantras/sections?locale=zz",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: SectionsBody = res.json();
    const categories = body.data.sections.find((s) => s.sectionType === "categories");
    expect(categories?.title).toBe("Browse Categories");
  });

  test("the retired `language` param no longer localizes (hard rename, no alias)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mantras/sections?language=hi",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200); // stripped, not rejected
    const body: SectionsBody = res.json();
    const categories = body.data.sections.find((s) => s.sectionType === "categories");
    expect(categories?.title).toBe("Browse Categories");
  });
});

describe("GET /mantras/items (skeleton)", () => {
  test("returns 200 with an empty page — the seed has no audio content", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/mantras/items?limit=30",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: ListBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  test("unknown detail id → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/mantras/items/${randomUUID()}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("seed idempotency", () => {
  test("seed:mantras run again leaves stable skeleton counts (no duplication, no content)", async () => {
    runSeed("seed:mantras");
    expect(await getPrisma().mantraCategory.count()).toBe(6);
    expect(await getPrisma().mantraHomepageSection.count()).toBe(4);
    expect(await getPrisma().mantraAudioItem.count()).toBe(0);
    expect(await getPrisma().mantraCategoryTag.count()).toBe(0);
    expect(await getPrisma().mantraDeityTag.count()).toBe(0);
  });
});

/**
 * TAM-160 — CMS-curated sections (the mantras mirror of the aarti block).
 *
 * DELIBERATELY LAST in the file: it is the only block that puts audio content
 * and extra sections into the database, and everything above (including the
 * exact row counts in `seed idempotency`) is written against the content-less
 * skeleton. All fixtures are created here.
 *
 * `curated` is the one section type whose membership is DATA rather than a query
 * rule, so its ordering, capping, hide-when-empty and Pro gating are only
 * provable against real Postgres — the join table, its `(section_id, position)`
 * keyset, its CASCADE, and the PARTIAL unique index that still caps each
 * built-in type at one row.
 */
describe("TAM-160 curated sections", () => {
  const ADMIN_EMAIL = "mantras-curated-admin@example.com";
  const ADMIN_PASSWORD = "password1";
  /** A second caller with a live entitlement — the #EXPORT_CRITICAL Pro side. */
  const PRO_USER = randomUUID();
  const FIXTURES = 12; // > the 10-item section cap AND > one Show-all page

  /**
   * TAM-160: the membership row carries display-only `title`/`artworkUrl`
   * echoes so the CMS can name a member without having loaded its catalogue
   * page. Order assertions below project them away via `order()`.
   */
  interface CuratedItem {
    itemId: string;
    position: number;
    title: string;
    artworkUrl: string;
  }

  /** The ORDER view of a membership list — drops the display echoes. */
  const order = (
    items: CuratedItem[]
  ): { itemId: string; position: number }[] =>
    items.map(({ itemId, position }) => ({ itemId, position }));

  interface ItemsBody {
    success: boolean;
    // NOTE: a BARE array (mirrors `AdminWallpaperRowItemsResponse`), not `data.items`.
    data: CuratedItem[];
  }
  interface SectionBody {
    success: boolean;
    data: {
      id: string;
      sectionType: string;
      updatedAt: string;
      items: CuratedItem[];
    };
  }
  interface CuratedSectionsBody {
    success: boolean;
    data: {
      sections: {
        sectionId: string;
        sectionType: string;
        title: string;
        layoutType: string;
        showAllEnabled: boolean;
        items: { id: string; audioUrl: string | null }[];
      }[];
    };
  }
  interface CuratedListBody {
    success: boolean;
    data: {
      items: { id: string; audioUrl: string | null }[];
      nextCursor: string | null;
    };
  }

  let adminToken: string;
  /** Fixture item ids, in creation (slug) order — the "editor's list". */
  let itemIds: string[] = [];
  let sectionA: string; // the workhorse curated section
  let sectionB: string; // a curated section deliberately kept EMPTY
  let builtInSection: string; // the seeded `newly_added` row

  const adminAuth = (): { authorization: string } => ({
    authorization: `Bearer ${adminToken}`,
  });
  const proAuth = (): { authorization: string } => ({
    authorization: `Bearer ${token(PRO_USER)}`,
  });

  const audioUrl = (i: number): string =>
    `https://cdn.example.test/curated/mantra-${i}.m4a`;

  function createSection(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/admin/mantras/sections",
      headers: adminAuth(),
      payload,
    });
  }

  function putItems(sectionId: string, ids: string[]) {
    return app.inject({
      method: "PUT",
      url: `/admin/mantras/sections/${sectionId}/items`,
      headers: adminAuth(),
      payload: { itemIds: ids },
    });
  }

  /** The server's own view of the saved membership (what the editor hydrates from). */
  async function savedItems(
    sectionId: string
  ): Promise<CuratedItem[]> {
    const res = await app.inject({
      method: "GET",
      url: `/admin/mantras/sections/${sectionId}`,
      headers: adminAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: SectionBody = res.json();
    return body.data.items;
  }

  async function sections(
    headers: { authorization: string }
  ): Promise<CuratedSectionsBody["data"]["sections"]> {
    const res = await app.inject({
      method: "GET",
      url: "/mantras/sections",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body: CuratedSectionsBody = res.json();
    return body.data.sections;
  }

  /** Walk every page of a curated Show-all, returning the ids in served order. */
  async function showAll(sectionId: string, limit: number): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await app.inject({
        method: "GET",
        url: `/mantras/items?sectionId=${sectionId}&limit=${limit}${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        }`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body: CuratedListBody = res.json();
      ids.push(...body.data.items.map((i) => i.id));
      cursor = body.data.nextCursor;
    } while (cursor !== null);
    return ids;
  }

  beforeAll(async () => {
    // An admin caller. `role` is never a request input (TAM-82) — promote directly.
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: ADMIN_EMAIL, name: "Mantras Admin", password: ADMIN_PASSWORD },
    });
    await getPrisma().user.update({
      where: { email: ADMIN_EMAIL },
      data: { role: "admin" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const loginBody: { data: { token: string } } = login.json();
    adminToken = loginBody.data.token;

    // A live entitlement for PRO_USER. `subscriptions` has no FK to `User`, and
    // `computeIsEntitled` keys `active` off `expiresAt` alone.
    await getPrisma().subscription.create({
      data: {
        userId: PRO_USER,
        status: "active",
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    // The seed creates categories and sections but ZERO audio, so the curated
    // fixtures are ours. Created one-by-one to lock the id order to the slug
    // order — `createMany` gives no ordering guarantee, and the point of these
    // tests is that `position`, not any intrinsic column, decides the order.
    for (let i = 0; i < FIXTURES; i++) {
      const row = await getPrisma().mantraAudioItem.create({
        data: {
          slug: `curated-fixture-${i}`,
          title: `Curated mantra ${i}`,
          type: "mantra",
          artworkUrl: `https://cdn.example.test/curated/art-${i}.png`,
          audioUrl: audioUrl(i),
          mantraText: `ॐ फिक्स्चर ${i}`,
        },
        select: { id: true },
      });
      itemIds.push(row.id);
    }

    const built = await getPrisma().mantraHomepageSection.findFirstOrThrow({
      where: { sectionType: "newly_added" },
      select: { id: true },
    });
    builtInSection = built.id;
  }, 60_000);

  afterAll(async () => {
    // The join rows go with the sections (CASCADE); drop ours so nothing here
    // leaks into a future block appended after this one.
    await getPrisma().mantraHomepageSection.deleteMany({
      where: { sectionType: "curated" },
    });
    await getPrisma().mantraAudioItem.deleteMany({
      where: { slug: { startsWith: "curated-fixture-" } },
    });
    await getPrisma().subscription.deleteMany({ where: { userId: PRO_USER } });
    itemIds = [];
  });

  describe("POST /admin/mantras/sections", () => {
    // THE invariant change: `section_type` lost its plain UNIQUE, so many
    // `curated` rows are legal where before a second row of ANY type was not.
    test("two curated sections can coexist", async () => {
      const first = await createSection({
        sectionType: "curated",
        title: "Mantras for a Monday",
        layoutType: "horizontal_cards",
        sortOrder: 10,
      });
      expect(first.statusCode).toBe(201);
      const second = await createSection({
        sectionType: "curated",
        title: "Evening Stutis",
        layoutType: "horizontal_cards",
        sortOrder: 11,
      });
      expect(second.statusCode).toBe(201);

      const a: SectionBody = first.json();
      const b: SectionBody = second.json();
      sectionA = a.data.id;
      sectionB = b.data.id;
      expect(sectionA).not.toBe(sectionB);

      // A brand-new curated section starts empty — the editor picks items after
      // saving the row (there is no create-with-items path).
      expect(a.data.items).toEqual([]);
    });

    // The partial unique index (`WHERE section_type <> 'curated'`) must still
    // bite. It is hand-written SQL that Prisma's schema cannot express, so if it
    // ever goes missing this is the test that notices.
    test("a second built-in `newly_added` still → 409", async () => {
      const res = await createSection({
        sectionType: "newly_added",
        title: "Newly Added (duplicate)",
        layoutType: "horizontal_cards",
        sortOrder: 99,
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("PUT /admin/mantras/sections/:id/items", () => {
    test("writes position = array index, and a re-PUT rewrites the order", async () => {
      const first = itemIds.slice(0, 4);
      const res = await putItems(sectionA, first);
      expect(res.statusCode).toBe(200);
      const body: ItemsBody = res.json();
      expect(order(body.data)).toEqual(
        first.map((itemId, position) => ({ itemId, position }))
      );

      // Set semantics: the SECOND write replaces the whole membership, so the
      // positions are recomputed from the new array — not appended to.
      const reordered = [first[3], first[0], first[2], first[1]] as string[];
      const again = await putItems(sectionA, reordered);
      expect(again.statusCode).toBe(200);
      const rewritten: ItemsBody = again.json();
      expect(order(rewritten.data)).toEqual(
        reordered.map((itemId, position) => ({ itemId, position }))
      );
      expect(order(await savedItems(sectionA))).toEqual(
        reordered.map((itemId, position) => ({ itemId, position }))
      );
    });

    test("an empty array clears the set", async () => {
      await putItems(sectionA, itemIds.slice(0, 3));
      const res = await putItems(sectionA, []);
      expect(res.statusCode).toBe(200);
      const cleared: ItemsBody = res.json();
      expect(cleared.data).toEqual([]);
      expect(await savedItems(sectionA)).toEqual([]);
      expect(
        await getPrisma().mantraHomepageSectionItem.count({
          where: { sectionId: sectionA },
        })
      ).toBe(0);
    });

    test("duplicate ids → 400 (rejected at the Zod boundary)", async () => {
      const res = await putItems(sectionA, [itemIds[0], itemIds[1], itemIds[0]] as string[]);
      expect(res.statusCode).toBe(400);
    });

    // The whole set is rejected — a partial write would leave the editor's list
    // silently truncated with a success toast on screen.
    test("an unknown id → 400 with NOTHING written", async () => {
      const saved = itemIds.slice(0, 3);
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const res = await putItems(sectionA, [...saved, randomUUID()]);
      expect(res.statusCode).toBe(400);

      expect(order(await savedItems(sectionA))).toEqual(
        saved.map((itemId, position) => ({ itemId, position }))
      );
    });

    test("a BUILT-IN section → 400; an unknown section → 404", async () => {
      const builtIn = await putItems(builtInSection, [itemIds[0]]);
      expect(builtIn.statusCode).toBe(400);

      const missing = await putItems(randomUUID(), [itemIds[0]]);
      expect(missing.statusCode).toBe(404);
    });
  });

  describe("GET /mantras/sections", () => {
    test("serves the curated section in saved order, capped at 10, and omits the empty one", async () => {
      // 12 saved, deliberately NOT in fixture order, so a preview that happened
      // to be ordered by id/createdAt would not accidentally pass.
      const saved = [...itemIds].reverse();
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const all = await sections(auth());
      const curated = all.filter((s) => s.sectionType === "curated");

      // sectionB has zero items → hide-when-empty (the same rule every other
      // section type obeys), so exactly ONE curated section is served.
      expect(curated).toHaveLength(1);
      expect(curated.map((s) => s.sectionId)).not.toContain(sectionB);
      expect(curated[0]?.sectionId).toBe(sectionA);
      expect(curated[0]?.title).toBe("Mantras for a Monday");
      expect(curated[0]?.layoutType).toBe("horizontal_cards");
      expect(curated[0]?.showAllEnabled).toBe(true);
      expect(curated[0]?.items.map((i) => i.id)).toEqual(saved.slice(0, 10));
    });

    test("every section carries a sectionId", async () => {
      const all = await sections(auth());
      expect(all.length).toBeGreaterThan(1);
      for (const s of all) {
        expect(s.sectionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
      // Not just present but CORRECT: the built-in row's own id, not a blank or
      // a repeat of the previous section's.
      const newly = all.find((s) => s.sectionType === "newly_added");
      expect(newly?.sectionId).toBe(builtInSection);
      expect(new Set(all.map((s) => s.sectionId)).size).toBe(all.length);
    });

    // A deactivated mantra must not survive anywhere through a curated row — the
    // join table has no idea the item was retired, so the filter has to be on
    // the JOINED item in both the preview and the Show-all query.
    test("deactivating an item removes it from the preview AND Show-all", async () => {
      const saved = itemIds.slice(0, 11);
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);
      const dropped = saved[2];

      await getPrisma().mantraAudioItem.update({
        where: { id: dropped },
        data: { isActive: false },
      });
      try {
        const curated = (await sections(auth())).find(
          (s) => s.sectionType === "curated"
        );
        expect(curated?.items.map((i) => i.id)).not.toContain(dropped);
        // Still a full page of 10 — the 11th saved item is pulled up.
        expect(curated?.items).toHaveLength(10);

        const ids = await showAll(sectionA, 5);
        expect(ids).not.toContain(dropped);
        expect(ids).toEqual(saved.filter((id) => id !== dropped));
      } finally {
        await getPrisma().mantraAudioItem.update({
          where: { id: dropped },
          data: { isActive: true },
        });
      }
    });
  });

  describe("GET /mantras/items?sectionId=", () => {
    // The case that motivated Show-all: the preview caps at 10, so a curated
    // section of 12 is only fully reachable through a MULTI-page keyset read.
    test("pages the full list on a stable keyset — no dupes, no gaps", async () => {
      const saved = [...itemIds].reverse();
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const first = await app.inject({
        method: "GET",
        url: `/mantras/items?sectionId=${sectionA}&limit=7`,
        headers: auth(),
      });
      expect(first.statusCode).toBe(200);
      const page1: CuratedListBody = first.json();
      expect(page1.data.items).toHaveLength(7);
      expect(page1.data.nextCursor).not.toBeNull();

      const second = await app.inject({
        method: "GET",
        url: `/mantras/items?sectionId=${sectionA}&limit=7&cursor=${encodeURIComponent(
          page1.data.nextCursor as string
        )}`,
        headers: auth(),
      });
      expect(second.statusCode).toBe(200);
      const page2: CuratedListBody = second.json();
      expect(page2.data.items).toHaveLength(FIXTURES - 7);
      expect(page2.data.nextCursor).toBeNull();

      const seen = [
        ...page1.data.items.map((i) => i.id),
        ...page2.data.items.map((i) => i.id),
      ];
      expect(seen).toEqual(saved); // exact saved order, reconstructed
      expect(new Set(seen).size).toBe(seen.length); // no duplicates
    });

    test("sectionId with categoryId or deityId → 400 INVALID_FILTER_COMBINATION", async () => {
      for (const extra of [`categoryId=${randomUUID()}`, "deityId=shiva"]) {
        const res = await app.inject({
          method: "GET",
          url: `/mantras/items?sectionId=${sectionA}&${extra}`,
          headers: auth(),
        });
        expect(res.statusCode).toBe(400);
        const body: { errorCode?: string } = res.json();
        expect(body.errorCode).toBe("INVALID_FILTER_COMBINATION");
      }
    });

    // #EXPORT_CRITICAL: curated items go through the SAME mapper as every other
    // audio surface, so the Pro gate covers this path with no new gating code.
    // If a curated read ever grows its own mapper, this is what catches it.
    test("audioUrl is null for a free caller and present for Pro", async () => {
      const saved = itemIds.slice(0, 3);
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const freeSection = (await sections(auth())).find(
        (s) => s.sectionType === "curated"
      );
      expect(freeSection?.items).toHaveLength(3);
      expect(freeSection?.items.every((i) => i.audioUrl === null)).toBe(true);

      const proSection = (await sections(proAuth())).find(
        (s) => s.sectionType === "curated"
      );
      expect(proSection?.items.map((i) => i.audioUrl)).toEqual(
        saved.map((id) => audioUrl(itemIds.indexOf(id)))
      );

      // Same on the Show-all page, which is a different code path.
      const freeList = await app.inject({
        method: "GET",
        url: `/mantras/items?sectionId=${sectionA}`,
        headers: auth(),
      });
      const freeBody: CuratedListBody = freeList.json();
      expect(freeBody.data.items.every((i) => i.audioUrl === null)).toBe(true);

      const proList = await app.inject({
        method: "GET",
        url: `/mantras/items?sectionId=${sectionA}`,
        headers: proAuth(),
      });
      const proBody: CuratedListBody = proList.json();
      expect(proBody.data.items.map((i) => i.audioUrl)).toEqual(
        saved.map((id) => audioUrl(itemIds.indexOf(id)))
      );
    });
  });

  describe("cascade", () => {
    test("deleting a section deletes its join rows", async () => {
      const created = await createSection({
        sectionType: "curated",
        title: "Throwaway",
        layoutType: "horizontal_cards",
        sortOrder: 12,
      });
      expect(created.statusCode).toBe(201);
      const throwaway: SectionBody = created.json();
      const id = throwaway.data.id;
      expect((await putItems(id, itemIds.slice(0, 3))).statusCode).toBe(200);
      expect(
        await getPrisma().mantraHomepageSectionItem.count({
          where: { sectionId: id },
        })
      ).toBe(3);

      // A hard DELETE — the admin DELETE route is a DEACTIVATE, so the FK's
      // ON DELETE CASCADE is only reachable from the database side.
      await getPrisma().mantraHomepageSection.delete({ where: { id } });
      expect(
        await getPrisma().mantraHomepageSectionItem.count({
          where: { sectionId: id },
        })
      ).toBe(0);
      // The mantra itself survives — only the membership went.
      expect(
        await getPrisma().mantraAudioItem.count({
          where: { id: { in: itemIds.slice(0, 3) } },
        })
      ).toBe(3);
    });
  });
});
