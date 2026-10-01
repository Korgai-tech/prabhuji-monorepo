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
import { initAartiModule } from "@api/core/aarti";

/**
 * Integration coverage for the Aarti & Bhajans endpoints (TAM-63) against real
 * Postgres via testcontainers.
 *
 * STRUCTURAL-ONLY: the seeds are skeleton-only — the aarti seed creates the
 * category taxonomy (6 categories) and the 5 homepage-section definitions, but
 * ZERO audio items and ZERO tag rows (content is populated by the content
 * pipeline, not the seed). So this suite proves the contract the SKELETON
 * serves — auth gating, the taxonomy-backed homepage sections, and the
 * empty-content responses — not the content-dependent behaviour (pro gating,
 * filter counts, pagination-over-items, play/like) which now has no fixtures.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-aarti-tests";

interface MainBody {
  success: boolean;
  data: { sections: { sectionType: string; items: unknown[] }[] };
}
interface ListBody {
  success: boolean;
  data: { items: unknown[]; nextCursor: string | null };
}

let app: FastifyInstance;
let dbUrl: string;
const USER = randomUUID();

/**
 * Run a committed seed via its CLI script (not a TS import — the seeds live
 * outside `tsconfig.spec.json`'s program). The seed's PrismaClient reads
 * `DATABASE_URL`, so it targets the same testcontainer.
 */
function runSeed(script: "seed:deity" | "seed:aarti"): void {
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
  // so the `/admin/aarti/*` block below needs the users facade registered.
  initUsersModule(app);
  initAartiModule(app);
  await app.ready();

  // Seed the skeleton (deity taxonomy + aarti categories/sections) via the
  // committed seed CLIs — same DB (the test container's DATABASE_URL is picked
  // up by the seed's PrismaClient). No audio content is seeded anywhere.
  runSeed("seed:deity");
  runSeed("seed:aarti");
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("no JWT → 401 on every endpoint", async () => {
    for (const url of ["/aarti/main", "/aarti/audios", `/aarti/audios/${randomUUID()}`]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("GET /aarti/main", () => {
  test("serves only the taxonomy-backed sections; audio + no-history sections drop when empty", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/aarti/main",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: MainBody = res.json();
    expect(body.success).toBe(true);

    // The seed defines 5 sections (recently_played, deities, browse_categories,
    // newly_added, most_played). With no audio content and no playback history,
    // the service drops every empty section (aarti.service.ts getMain: each
    // branch `continue`s when its item set is empty), leaving only the two
    // taxonomy-backed ones — in `sortOrder` order (repo findActiveSections
    // orders by sortOrder asc).
    const types = body.data.sections.map((s) => s.sectionType);
    expect(types).toEqual(["deities", "browse_categories"]);

    const deities = body.data.sections.find((s) => s.sectionType === "deities");
    const categories = body.data.sections.find(
      (s) => s.sectionType === "browse_categories"
    );
    expect(deities?.items.length).toBeGreaterThan(0); // deity facade (TAM-57 seed)
    expect(categories?.items).toHaveLength(6); // the 6 seeded categories
  });
});

describe("GET /aarti/audios", () => {
  test("returns an empty page (no content seeded)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/aarti/audios?limit=30",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const body: ListBody = res.json();
    expect(body.success).toBe(true);
    // buildPage([], limit) → { items: [], nextCursor: null }.
    expect(body.data.items).toHaveLength(0);
    expect(body.data.nextCursor).toBeNull();
  });

  test("more than one primary filter → 400 (validated before any lookup)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/aarti/audios?categoryId=${randomUUID()}&deityId=shiva`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(400);
  });

  test("malformed cursor → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/aarti/audios?cursor=%40%40bad%40%40",
      headers: auth(),
    });
    expect(res.statusCode).toBe(400);
  });

  test("unknown detail id → 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/aarti/audios/${randomUUID()}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("seed idempotency", () => {
  test("seed:aarti run again leaves stable row counts (no duplication)", async () => {
    runSeed("seed:aarti"); // second run (beforeAll ran it once)
    expect(await getPrisma().audioCategory.count()).toBe(6);
    expect(await getPrisma().homepageSection.count()).toBe(5);
    expect(await getPrisma().audioItem.count()).toBe(0);
    expect(await getPrisma().audioCategoryTag.count()).toBe(0);
    expect(await getPrisma().audioDeityTag.count()).toBe(0);
  });
});

/**
 * TAM-160 — CMS-curated sections.
 *
 * DELIBERATELY LAST in the file: this block is the only one that puts audio
 * content and extra sections into the database, and the STRUCTURAL blocks above
 * (plus `seed idempotency`, which asserts exact row counts) are written against
 * a content-less catalogue. Everything here seeds its own fixtures.
 *
 * The `curated` type is the one section type whose membership is DATA, not a
 * query rule, so it is also the only one whose ordering, capping, hide-when-
 * empty and Pro-gating behaviour can only be proven against real Postgres — the
 * join table, its `(section_id, position)` keyset, its CASCADE, and the PARTIAL
 * unique index that still caps the built-in types at one row each.
 */
describe("TAM-160 curated sections", () => {
  const ADMIN_EMAIL = "aarti-curated-admin@example.com";
  const ADMIN_PASSWORD = "password1";
  /** A second caller with a live entitlement — the #EXPORT_CRITICAL Pro side. */
  const PRO_USER = randomUUID();
  const FIXTURES = 12; // > the 10-item section cap AND > one Show-all page

  /**
   * TAM-160: the membership row carries display-only `title`/`coverImageUrl`
   * echoes so the CMS can name a member without having loaded its catalogue
   * page. Order assertions below project them away via `order()`.
   */
  interface CuratedItem {
    audioId: string;
    position: number;
    title: string;
    coverImageUrl: string;
  }

  /** The ORDER view of a membership list — drops the display echoes. */
  const order = (
    items: CuratedItem[]
  ): { audioId: string; position: number }[] =>
    items.map(({ audioId, position }) => ({ audioId, position }));

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
  interface CuratedMainBody {
    success: boolean;
    data: {
      sections: {
        sectionId: string;
        sectionType: string;
        title: string;
        items: { id: string; audioStreamUrl: string | null }[];
      }[];
    };
  }
  interface CuratedListBody {
    success: boolean;
    data: {
      items: { id: string; audioStreamUrl: string | null }[];
      nextCursor: string | null;
    };
  }

  let adminToken: string;
  /** Fixture audio ids, in creation (slug) order — the "editor's list". */
  let audioIds: string[] = [];
  let sectionA: string; // the workhorse curated section
  let sectionB: string; // a curated section deliberately kept EMPTY
  let builtInSection: string; // the seeded `newly_added` row

  const adminAuth = (): { authorization: string } => ({
    authorization: `Bearer ${adminToken}`,
  });
  const proAuth = (): { authorization: string } => ({
    authorization: `Bearer ${token(PRO_USER)}`,
  });

  const streamUrl = (i: number): string =>
    `https://cdn.example.test/curated/audio-${i}.m4a`;

  function createSection(payload: Record<string, unknown>) {
    return app.inject({
      method: "POST",
      url: "/admin/aarti/sections",
      headers: adminAuth(),
      payload,
    });
  }

  function putItems(sectionId: string, ids: string[]) {
    return app.inject({
      method: "PUT",
      url: `/admin/aarti/sections/${sectionId}/items`,
      headers: adminAuth(),
      payload: { audioIds: ids },
    });
  }

  /** The server's own view of the saved membership (what the editor hydrates from). */
  async function savedItems(
    sectionId: string
  ): Promise<CuratedItem[]> {
    const res = await app.inject({
      method: "GET",
      url: `/admin/aarti/sections/${sectionId}`,
      headers: adminAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: SectionBody = res.json();
    return body.data.items;
  }

  async function main(
    headers: { authorization: string }
  ): Promise<CuratedMainBody["data"]["sections"]> {
    const res = await app.inject({ method: "GET", url: "/aarti/main", headers });
    expect(res.statusCode).toBe(200);
    const body: CuratedMainBody = res.json();
    return body.data.sections;
  }

  /** Walk every page of a curated Show-all, returning the ids in served order. */
  async function showAll(
    sectionId: string,
    limit: number,
    headers = auth()
  ): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await app.inject({
        method: "GET",
        url: `/aarti/audios?sectionId=${sectionId}&limit=${limit}${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
        }`,
        headers,
      });
      expect(res.statusCode).toBe(200);
      const body: CuratedListBody = res.json();
      ids.push(...body.data.items.map((i) => i.id));
      cursor = body.data.nextCursor;
      pages += 1;
    } while (cursor !== null);
    return { ids, pages };
  }

  beforeAll(async () => {
    // An admin caller. `role` is never a request input (TAM-82) — promote directly.
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: ADMIN_EMAIL, name: "Aarti Admin", password: ADMIN_PASSWORD },
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

    // The seeds create categories and sections but ZERO audio, so the curated
    // fixtures are ours. Created one-by-one to lock the id order to the slug
    // order — `createMany` gives no ordering guarantee and the whole point here
    // is that `position`, not any intrinsic column, decides the served order.
    for (let i = 0; i < FIXTURES; i++) {
      const row = await getPrisma().audioItem.create({
        data: {
          slug: `curated-fixture-${i}`,
          title: `Curated fixture ${i}`,
          coverImageUrl: `https://cdn.example.test/curated/cover-${i}.png`,
          audioStreamUrl: streamUrl(i),
        },
        select: { id: true },
      });
      audioIds.push(row.id);
    }

    const built = await getPrisma().homepageSection.findFirstOrThrow({
      where: { sectionType: "newly_added" },
      select: { id: true },
    });
    builtInSection = built.id;
  }, 60_000);

  afterAll(async () => {
    // The join rows go with the sections (CASCADE); drop ours so nothing here
    // leaks into a future block appended after this one.
    await getPrisma().homepageSection.deleteMany({
      where: { sectionType: "curated" },
    });
    await getPrisma().audioItem.deleteMany({
      where: { slug: { startsWith: "curated-fixture-" } },
    });
    await getPrisma().subscription.deleteMany({ where: { userId: PRO_USER } });
    audioIds = [];
  });

  describe("POST /admin/aarti/sections", () => {
    // THE invariant change: `section_type` lost its plain UNIQUE, so many
    // `curated` rows are legal where before a second row of ANY type was not.
    test("two curated sections can coexist", async () => {
      const first = await createSection({
        sectionType: "curated",
        title: "Top Aartis listened to by 80s kids",
        sortOrder: 10,
      });
      expect(first.statusCode).toBe(201);
      const second = await createSection({
        sectionType: "curated",
        title: "Monsoon Bhajans",
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
        sortOrder: 99,
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("PUT /admin/aarti/sections/:id/items", () => {
    test("writes position = array index, and a re-PUT rewrites the order", async () => {
      const first = audioIds.slice(0, 4);
      const res = await putItems(sectionA, first);
      expect(res.statusCode).toBe(200);
      const body: ItemsBody = res.json();
      expect(order(body.data)).toEqual(
        first.map((audioId, position) => ({ audioId, position }))
      );

      // Set semantics: the SECOND write replaces the whole membership, so the
      // positions are recomputed from the new array — not appended to.
      const reordered = [first[3], first[0], first[2], first[1]] as string[];
      const again = await putItems(sectionA, reordered);
      expect(again.statusCode).toBe(200);
      const rewritten: ItemsBody = again.json();
      expect(order(rewritten.data)).toEqual(
        reordered.map((audioId, position) => ({ audioId, position }))
      );
      expect(order(await savedItems(sectionA))).toEqual(
        reordered.map((audioId, position) => ({ audioId, position }))
      );
    });

    test("an empty array clears the set", async () => {
      await putItems(sectionA, audioIds.slice(0, 3));
      const res = await putItems(sectionA, []);
      expect(res.statusCode).toBe(200);
      const cleared: ItemsBody = res.json();
      expect(cleared.data).toEqual([]);
      expect(await savedItems(sectionA)).toEqual([]);
      expect(
        await getPrisma().homepageSectionItem.count({ where: { sectionId: sectionA } })
      ).toBe(0);
    });

    test("duplicate ids → 400 (rejected at the Zod boundary)", async () => {
      const res = await putItems(sectionA, [audioIds[0], audioIds[1], audioIds[0]] as string[]);
      expect(res.statusCode).toBe(400);
    });

    // The whole set is rejected — a partial write would leave the editor's list
    // silently truncated with a success toast on screen.
    test("an unknown id → 400 with NOTHING written", async () => {
      const saved = audioIds.slice(0, 3);
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const res = await putItems(sectionA, [...saved, randomUUID()]);
      expect(res.statusCode).toBe(400);

      expect(order(await savedItems(sectionA))).toEqual(
        saved.map((audioId, position) => ({ audioId, position }))
      );
    });

    // Without these the CMS could only name a member whose catalogue page it
    // happened to have loaded; everything else rendered as a raw uuid.
    test("membership rows carry the item's title + cover for the editor", async () => {
      expect((await putItems(sectionA, audioIds.slice(0, 2))).statusCode).toBe(200);
      const items = await savedItems(sectionA);
      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.title).toMatch(/^Curated fixture \d+$/);
        expect(item.coverImageUrl).toMatch(/^https:\/\//);
      }
    });

    test("a BUILT-IN section → 400; an unknown section → 404", async () => {
      const builtIn = await putItems(builtInSection, [audioIds[0]]);
      expect(builtIn.statusCode).toBe(400);

      const missing = await putItems(randomUUID(), [audioIds[0]]);
      expect(missing.statusCode).toBe(404);
    });
  });

  describe("GET /aarti/main", () => {
    test("serves the curated section in saved order, capped at 10, and omits the empty one", async () => {
      // 12 saved, deliberately NOT in fixture order, so a preview that happened
      // to be ordered by id/createdAt would not accidentally pass.
      const saved = [...audioIds].reverse();
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const sections = await main(auth());
      const curated = sections.filter((s) => s.sectionType === "curated");

      // sectionB has zero items → hide-when-empty (the same rule every other
      // section type obeys), so exactly ONE curated section is served.
      expect(curated).toHaveLength(1);
      expect(curated.map((s) => s.sectionId)).not.toContain(sectionB);
      expect(curated[0]?.sectionId).toBe(sectionA);
      expect(curated[0]?.title).toBe("Top Aartis listened to by 80s kids");
      expect(curated[0]?.items.map((i) => i.id)).toEqual(saved.slice(0, 10));
    });

    test("every section carries a sectionId", async () => {
      const sections = await main(auth());
      expect(sections.length).toBeGreaterThan(1);
      for (const s of sections) {
        expect(s.sectionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
      // Not just present but CORRECT: the built-in row's own id, not a blank or
      // a repeat of the previous section's.
      const newly = sections.find((s) => s.sectionType === "newly_added");
      expect(newly?.sectionId).toBe(builtInSection);
      expect(new Set(sections.map((s) => s.sectionId)).size).toBe(sections.length);
    });

    // A deactivated aarti must not survive anywhere through a curated row — the
    // join table has no idea the item was retired, so the filter has to be on
    // the JOINED item in both the preview and the Show-all query.
    test("deactivating an item removes it from the preview AND Show-all", async () => {
      const saved = audioIds.slice(0, 11);
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);
      const dropped = saved[2];

      await getPrisma().audioItem.update({
        where: { id: dropped },
        data: { isActive: false },
      });
      try {
        const curated = (await main(auth())).find((s) => s.sectionType === "curated");
        expect(curated?.items.map((i) => i.id)).not.toContain(dropped);
        // Still a full page of 10 — the 11th saved item is pulled up.
        expect(curated?.items).toHaveLength(10);

        const { ids } = await showAll(sectionA, 5);
        expect(ids).not.toContain(dropped);
        expect(ids).toEqual(saved.filter((id) => id !== dropped));
      } finally {
        await getPrisma().audioItem.update({
          where: { id: dropped },
          data: { isActive: true },
        });
      }
    });
  });

  describe("GET /aarti/audios?sectionId=", () => {
    // The case that motivated Show-all: the preview caps at 10, so a curated
    // section of 12 is only fully reachable through a MULTI-page keyset read.
    test("pages the full list on a stable keyset — no dupes, no gaps", async () => {
      const saved = [...audioIds].reverse();
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const first = await app.inject({
        method: "GET",
        url: `/aarti/audios?sectionId=${sectionA}&limit=7`,
        headers: auth(),
      });
      expect(first.statusCode).toBe(200);
      const page1: CuratedListBody = first.json();
      expect(page1.data.items).toHaveLength(7);
      expect(page1.data.nextCursor).not.toBeNull();

      const second = await app.inject({
        method: "GET",
        url: `/aarti/audios?sectionId=${sectionA}&limit=7&cursor=${encodeURIComponent(
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
          url: `/aarti/audios?sectionId=${sectionA}&${extra}`,
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
    test("audioStreamUrl is null for a free caller and present for Pro", async () => {
      const saved = audioIds.slice(0, 3);
      expect((await putItems(sectionA, saved)).statusCode).toBe(200);

      const freeSection = (await main(auth())).find((s) => s.sectionType === "curated");
      expect(freeSection?.items).toHaveLength(3);
      expect(freeSection?.items.every((i) => i.audioStreamUrl === null)).toBe(true);

      const proSection = (await main(proAuth())).find((s) => s.sectionType === "curated");
      expect(proSection?.items.map((i) => i.audioStreamUrl)).toEqual(
        saved.map((id) => streamUrl(audioIds.indexOf(id)))
      );

      // Same on the Show-all page, which is a different code path.
      const freeList = await app.inject({
        method: "GET",
        url: `/aarti/audios?sectionId=${sectionA}`,
        headers: auth(),
      });
      const freeBody: CuratedListBody = freeList.json();
      expect(freeBody.data.items.every((i) => i.audioStreamUrl === null)).toBe(true);

      const proList = await app.inject({
        method: "GET",
        url: `/aarti/audios?sectionId=${sectionA}`,
        headers: proAuth(),
      });
      const proBody: CuratedListBody = proList.json();
      expect(proBody.data.items.map((i) => i.audioStreamUrl)).toEqual(
        saved.map((id) => streamUrl(audioIds.indexOf(id)))
      );
    });
  });

  describe("cascade", () => {
    test("deleting a section deletes its join rows", async () => {
      const created = await createSection({
        sectionType: "curated",
        title: "Throwaway",
        sortOrder: 12,
      });
      expect(created.statusCode).toBe(201);
      const throwaway: SectionBody = created.json();
      const id = throwaway.data.id;
      expect((await putItems(id, audioIds.slice(0, 3))).statusCode).toBe(200);
      expect(
        await getPrisma().homepageSectionItem.count({ where: { sectionId: id } })
      ).toBe(3);

      // A hard DELETE — the admin DELETE route is a DEACTIVATE, so the FK's
      // ON DELETE CASCADE is only reachable from the database side.
      await getPrisma().homepageSection.delete({ where: { id } });
      expect(
        await getPrisma().homepageSectionItem.count({ where: { sectionId: id } })
      ).toBe(0);
      // The audio itself survives — only the membership went.
      expect(
        await getPrisma().audioItem.count({
          where: { id: { in: audioIds.slice(0, 3) } },
        })
      ).toBe(3);
    });
  });
});
