import { execSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
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
import { initHomeModule } from "@api/core/home";
import { initPinnedContentModule } from "@api/core/pinned-content";
import { initUsersModule } from "@api/core/users";

/**
 * Integration coverage for the Home endpoints (TAM-61) against real Postgres via
 * testcontainers. The seed is SKELETON-ONLY — it creates just the four
 * feature-shortcut tiles (+ their locale overrides) and the single
 * `home_settings` row; it seeds ZERO banners and ZERO feed items (promotional /
 * discovery content the content pipeline populates, not the seed).
 *
 * So these tests are STRUCTURAL-ONLY: every endpoint requires a JWT; the
 * shortcut grid serves its four labels + ORDER from the server with
 * allowlist-key (never URL-shaped) destinations; the banner carousel and the
 * mixed feed resolve to EMPTY (`[]`, 200) until content exists; a malformed feed
 * cursor is a 400; and the engagement forwarders (view/share, keyed on an
 * arbitrary content id — no seeded content needed) increment through the shared
 * facade. Home is NEVER Pro-gated — a plain authenticated user sees everything.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-home-tests";

interface Shortcut {
  id: string;
  key: string;
  label: string;
  destinationType: string;
  destinationValue: string | null;
  iconKey: string | null;
  /** TAM-132 — CMS-owned live icon URL (nullable; BC fallback is `iconKey`). */
  iconUrl: string | null;
  /** TAM-174 — per-tile palette, published only to the experiment's gradient arm. */
  theme: {
    backgroundFrom: string;
    backgroundFromStop: number;
    backgroundTo: string;
    backgroundToStop: number;
    labelColor: string;
  } | null;
  sortOrder: number;
}
interface BannersBody {
  success: boolean;
  message: string;
  data: { banners: unknown[] };
}
interface ShortcutsBody {
  success: boolean;
  data: { shortcuts: Shortcut[] };
}
interface FeedBody {
  success: boolean;
  message: string;
  data: { items: unknown[]; nextCursor: string | null };
}
interface ViewBody {
  success: boolean;
  data: { viewCount: number };
}
interface ShareBody {
  success: boolean;
  data: { shareCount: number };
}

let app: FastifyInstance;
let dbUrl: string;
const USER = randomUUID();
const OTHER_USER = randomUUID();

function runSeed(script: "seed:home"): void {
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
  // `adminMiddleware` resolves the caller's role through the users facade and
  // fails CLOSED when it is unregistered — without this every /admin/* request
  // in this file is a 403 that looks like a permissions bug.
  initUsersModule(app);
  initSubscriptionModule(app);
  initEngagementModule();
  initHomeModule(app);
  // TAM-173: home.getFeed calls `performServiceCall("pinnedContent", …)` to
  // overlay active pins on the rotation head. Without this the feed 500s
  // with "service 'pinnedContent' not registered". Runtime bootstrap wires
  // the same module (see `apps/api/src/modules.ts`).
  initPinnedContentModule(app);
  await app.ready();

  runSeed("seed:home");
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("auth gate", () => {
  test("no JWT → 401 on every endpoint", async () => {
    const banners = await app.inject({ method: "GET", url: "/home/banners" });
    expect(banners.statusCode).toBe(401);
    const shortcuts = await app.inject({ method: "GET", url: "/home/shortcuts" });
    expect(shortcuts.statusCode).toBe(401);
    const feed = await app.inject({ method: "GET", url: "/home/feed" });
    expect(feed.statusCode).toBe(401);
    for (const path of ["like", "view", "share"]) {
      const res = await app.inject({
        method: "POST",
        url: `/home/engagement/${path}`,
        payload: { contentType: "home_item", contentId: randomUUID() },
      });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("GET /home/banners", () => {
  test("no seeded banners → banners come back [] (200)", async () => {
    const res = await app.inject({ method: "GET", url: "/home/banners", headers: auth(USER) });
    expect(res.statusCode).toBe(200);
    const body: BannersBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.banners).toEqual([]);
  });
});

describe("GET /home/shortcuts", () => {
  test("new-build clients (app_version 1.1.0) get the full 6-tile grid in paint order", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: { ...auth(USER), app_version: "1.1.0" },
    });
    expect(res.statusCode).toBe(200);
    const body: ShortcutsBody = res.json();
    // TAM-132 paint order (Figma frame 2569:15302 — row 1: aarti | mantras |
    // wallpaper; row 2: status | horoscope | ringtone).
    expect(body.data.shortcuts.map((s) => s.key)).toEqual([
      "aarti_bhajans",
      "mantras_stutis",
      "set_wallpaper",
      "set_status",
      "horoscope",
      "set_ringtone",
    ]);
    expect(body.data.shortcuts.map((s) => s.label)).toEqual([
      "Aarti & Bhajans",
      "Mantras & Stutis",
      "Set Wallpaper",
      "Set Status",
      "Horoscope",
      "Set Ringtone",
    ]);
    expect(body.data.shortcuts.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(body.data.shortcuts.every((s) => s.iconKey !== null)).toBe(true);
    // TAM-132 — `iconUrl` is a nullable field on every row. Seed leaves it null
    // until ops populates via CMS; when non-null it must be a well-formed URL.
    for (const s of body.data.shortcuts) {
      if (s.iconUrl === null) continue;
      expect(() => new URL(s.iconUrl as string)).not.toThrow();
    }
    // The BC gate MUST NOT leak on the public wire — the mobile client never
    // needs to know it exists (the API does the hiding server-side).
    for (const s of body.data.shortcuts) {
      expect(s).not.toHaveProperty("minAppVersion");
    }
  });

  test("pre-refresh clients (app_version 1.0.4) get the 4 ungated tiles only", async () => {
    // TAM-132 BC gate — the two new tiles (`set_status`, `horoscope`) are
    // gated at `min_app_version = 1.1.0`, so an old build's header (1.0.4)
    // hides them. The remaining 4 preserve their curated `sort_order`.
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: { ...auth(USER), app_version: "1.0.4" },
    });
    expect(res.statusCode).toBe(200);
    const body: ShortcutsBody = res.json();
    expect(body.data.shortcuts.map((s) => s.key)).toEqual([
      "aarti_bhajans",
      "mantras_stutis",
      "set_wallpaper",
      "set_ringtone",
    ]);
    for (const s of body.data.shortcuts) {
      expect(s.key).not.toBe("set_status");
      expect(s.key).not.toBe("horoscope");
    }
  });

  test("missing app_version header → old client (4 tiles)", async () => {
    // A pre-header client (or one where PackageInfo threw) must be treated as
    // "very old" — dropping any row with a non-null gate.
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: ShortcutsBody = res.json();
    expect(body.data.shortcuts).toHaveLength(4);
    expect(body.data.shortcuts.map((s) => s.key)).not.toContain("set_status");
    expect(body.data.shortcuts.map((s) => s.key)).not.toContain("horoscope");
  });

  test("garbled app_version header → parse-fail = old client (4 tiles)", async () => {
    // Header tolerance is load-bearing: an unexpected value must not 500 the
    // read, and it must not accidentally satisfy a real gate.
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: { ...auth(USER), app_version: "garbage" },
    });
    expect(res.statusCode).toBe(200);
    const body: ShortcutsBody = res.json();
    expect(body.data.shortcuts).toHaveLength(4);
  });

  test("destinations are stable module KEYS (never URLs/paths) for the allowlist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: { ...auth(USER), app_version: "1.1.0" },
    });
    const body: ShortcutsBody = res.json();
    expect(
      body.data.shortcuts.map((s) => [s.destinationType, s.destinationValue])
    ).toEqual([
      ["linked_module", "aarti"],
      ["linked_module", "mantras"],
      ["linked_module", "wallpaper"],
      ["linked_module", "status"],
      ["linked_module", "horoscope"],
      ["linked_module", "ringtone"],
    ]);
    // #EXPORT_CRITICAL — an untrusted CMS string must never be URL-shaped: the
    // client resolves these through its hardcoded route allowlist.
    for (const s of body.data.shortcuts) {
      expect(s.destinationValue).not.toMatch(/^[a-z]+:|\/\//);
    }
  });
});

describe("GET /home/feed", () => {
  test("no seeded feed items → items [] and nextCursor null (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/home/feed?limit=30",
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: FeedBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.nextCursor).toBeNull();
  });

  test("malformed cursor restarts the rotated feed (200, not 400)", async () => {
    // TAM-150: the feed pages a rotation plan, and the cursor carries the
    // refresh epoch. An unreadable cursor means "start over", never a 400 — an
    // app mid-session across the deploy still holds an old keyset cursor.
    const res = await app.inject({
      method: "GET",
      url: "/home/feed?cursor=@@not-a-cursor@@",
      headers: auth(USER),
    });
    expect(res.statusCode).toBe(200);
    const body: FeedBody = res.json();
    expect(body.data.items).toEqual([]);
  });
});

describe("POST /home/engagement/{view,share} (via engagement facade)", () => {
  test("view + share increment via the engagement facade", async () => {
    const contentId = randomUUID();
    const v1 = await app.inject({
      method: "POST",
      url: "/home/engagement/view",
      headers: auth(USER),
      payload: { contentType: "home_item", contentId },
    });
    expect(v1.statusCode).toBe(200);
    const v1Body: ViewBody = v1.json();
    expect(v1Body.data.viewCount).toBe(1);
    const v2 = await app.inject({
      method: "POST",
      url: "/home/engagement/view",
      headers: auth(OTHER_USER),
      payload: { contentType: "home_item", contentId },
    });
    const v2Body: ViewBody = v2.json();
    expect(v2Body.data.viewCount).toBe(2);

    const s1 = await app.inject({
      method: "POST",
      url: "/home/engagement/share",
      headers: auth(USER),
      payload: { contentType: "home_item", contentId, channel: "whatsapp" },
    });
    expect(s1.statusCode).toBe(200);
    const s1Body: ShareBody = s1.json();
    expect(s1Body.data.shareCount).toBe(1);
  });

  test("an out-of-vocabulary contentType → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/home/engagement/like",
      headers: auth(USER),
      payload: { contentType: "not-a-type", contentId: randomUUID() },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("seed idempotency", () => {
  test("seed:home run again leaves stable skeleton row counts (no duplication)", async () => {
    runSeed("seed:home");
    expect(await getPrisma().homeBanner.count()).toBe(0);
    // TAM-132 — 6-tile grid (was 4 pre-refresh).
    expect(await getPrisma().homeShortcut.count()).toBe(6);
    expect(await getPrisma().homeFeedItem.count()).toBe(0);
    expect(await getPrisma().homeSettings.count()).toBe(1);
  });
});


/**
 * TAM-174 — the gradient experiment, end to end against a real database.
 *
 * The unit tests cover the resolution LADDER; this covers the parts only a real
 * Postgres can answer: that the migration's seeded palettes are actually there,
 * that the kill switch reaches the wire, and that two real users on opposite
 * sides of the bucket map get different payloads from the same endpoint.
 */
describe("GET /home/shortcuts — gradient A/B (TAM-174)", () => {
  /**
   * Two subjects that straddle the in-process 50/50 split. Pinned, not random:
   * a random uuid lands in either arm, so an arm-specific assertion would pass
   * or fail by chance. The buckets are asserted in `home.buckets.test.ts`.
   */
  const GRADIENT_USER = "019f5f4c-793c-7358-aec3-f7941d852db6"; // bucket 57
  const CONTROL_USER = "019f5f4c-793c-7358-aec3-f7941d852db8"; // bucket 45

  const setExperiment = async (on: boolean): Promise<void> => {
    await getPrisma().homeSettings.updateMany({ data: { shortcutGridGradientEnabled: on } });
  };

  const fetchShortcuts = async (sub: string, appVersion = "1.1.0"): Promise<Shortcut[]> => {
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: { ...auth(sub), app_version: appVersion },
    });
    expect(res.statusCode).toBe(200);
    const body: ShortcutsBody = res.json();
    return body.data.shortcuts;
  };

  afterEach(async () => {
    await setExperiment(false);
  });

  test("the seed writes ONLY the gradient arm, gated, for all six tiles", async () => {
    const rows = await getPrisma().homeShortcut.findMany({
      select: {
        key: true,
        variants: {
          select: {
            variant: true,
            themeBackgroundFrom: true,
            minAppVersion: true,
            iconUrl: true,
          },
        },
      },
      orderBy: { key: "asc" },
    });
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      // CONTROL IS DELIBERATELY ABSENT. It is the design already shipping, so it
      // must inherit whatever ops published on the base row. Seeding a control
      // override pinned it to the seed's own art and silently replaced the live
      // icons — the bug that produced white-boxed tiles on the control grid.
      expect(row.variants.map((v) => v.variant)).toEqual(["gradient_v1"]);
      const gradient = row.variants[0];
      expect(gradient?.themeBackgroundFrom, `${row.key} has no palette`).toMatch(
        /^#[0-9A-Fa-f]{6}$/
      );
      expect(gradient?.minAppVersion, `${row.key} arm is ungated`).toBe("1.1.0");
      // ARTWORK IS NOT SEEDED, deliberately. The gradient PNGs are not in the
      // repo — `scripts/local-ab-setup.sh` uploads them to floci from an
      // untracked directory — so any URL the seed invented would point at a
      // file that exists on one laptop. Ops publishes the real artwork per
      // environment through the CMS (the shortcut form has an upload field
      // bound to this column); the seed only ships what it can author, the
      // palette and the copy. The opt-in is `SEED_MEDIA_BASE_URL`, which the
      // local device harness sets after uploading the files.
      expect(gradient?.iconUrl, `${row.key} arm seeds artwork`).toBeNull();
    }
  });

  /**
   * The backwards-compat guarantee, end to end: a build that predates the new
   * card must be unable to tell the experiment exists.
   */
  test("an old build in the gradient arm is served the base tile", async () => {
    await setExperiment(true);

    const newBuild = await fetchShortcuts(GRADIENT_USER, "1.1.0");
    const oldBuild = await fetchShortcuts(GRADIENT_USER, "1.0.5");
    const control = await fetchShortcuts(CONTROL_USER, "1.1.0");

    const pick = (rows: Shortcut[]): Shortcut =>
      rows.find((s) => s.key === "set_status")!;

    // The new build gets the arm…
    expect(pick(newBuild).theme).not.toBeNull();
    // …the old build gets nothing of it…
    expect(pick(oldBuild).theme).toBeNull();
    // …and what it DOES get is identical to what a control user sees, which is
    // the definition of "the API change did not break it".
    expect(pick(oldBuild).label).toBe(pick(control).label);
    expect(pick(oldBuild).iconUrl).toBe(pick(control).iconUrl);
  });

  test("a build sending NO app_version is treated as too old", async () => {
    await setExperiment(true);
    const res = await app.inject({
      method: "GET",
      url: "/home/shortcuts",
      headers: auth(GRADIENT_USER),
    });
    expect(res.statusCode).toBe(200);
    const body: ShortcutsBody = res.json();
    expect(body.data.shortcuts.every((s) => s.theme === null)).toBe(true);
  });

  test("set_wallpaper keeps its out-of-range stops unclamped", async () => {
    // The only tile authored outside 0..1 (0.14734 → 1.4734). Clamping it in the
    // seed or on the wire would silently flatten a gradient design asked for.
    const row = await getPrisma().homeShortcutVariant.findFirst({
      where: { variant: "gradient_v1", shortcut: { key: "set_wallpaper" } },
      select: { themeBackgroundFromStop: true, themeBackgroundToStop: true },
    });
    expect(row?.themeBackgroundFromStop).toBeCloseTo(0.14734, 5);
    expect(row?.themeBackgroundToStop).toBeCloseTo(1.4734, 4);
  });

  test("the kill switch OFF serves theme: null to everyone", async () => {
    await setExperiment(false);
    for (const sub of [GRADIENT_USER, CONTROL_USER]) {
      const shortcuts = await fetchShortcuts(sub);
      expect(shortcuts).not.toHaveLength(0);
      expect(shortcuts.every((s) => s.theme === null)).toBe(true);
    }
  });

  test("with the switch ON, the two arms get different payloads", async () => {
    await setExperiment(true);

    const gradient = await fetchShortcuts(GRADIENT_USER);
    expect(gradient.every((s) => s.theme !== null)).toBe(true);
    const wallpaper = gradient.find((s) => s.key === "set_wallpaper");
    expect(wallpaper?.theme?.backgroundFrom).toBe("#E8F8F5");
    expect(wallpaper?.theme?.backgroundToStop).toBeCloseTo(1.4734, 4);
    expect(wallpaper?.theme?.labelColor).toBe("#08776D");

    const control = await fetchShortcuts(CONTROL_USER);
    expect(control.every((s) => s.theme === null)).toBe(true);
  });

  test("assignment is sticky across requests", async () => {
    await setExperiment(true);
    const first = await fetchShortcuts(GRADIENT_USER);
    const second = await fetchShortcuts(GRADIENT_USER);
    const third = await fetchShortcuts(GRADIENT_USER);
    for (const round of [first, second, third]) {
      expect(round.find((s) => s.key === "set_status")?.theme?.backgroundFrom).toBe("#EAF4FF");
    }
  });

  test("a tile whose gradient arm has no row degrades alone", async () => {
    await setExperiment(true);
    const removed = await getPrisma().homeShortcutVariant.findFirstOrThrow({
      where: { variant: "gradient_v1", shortcut: { key: "horoscope" } },
    });
    await getPrisma().homeShortcutVariant.delete({ where: { id: removed.id } });
    try {
      const shortcuts = await fetchShortcuts(GRADIENT_USER);
      expect(shortcuts.find((s) => s.key === "horoscope")?.theme).toBeNull();
      expect(shortcuts.find((s) => s.key === "set_status")?.theme).not.toBeNull();
    } finally {
      // Recreated rather than restored by id — the row is gone, and its id is
      // not part of what the test is asserting.
      await getPrisma().homeShortcutVariant.create({
        data: {
          homeShortcutId: removed.homeShortcutId,
          variant: removed.variant,
          label: removed.label,
          iconUrl: removed.iconUrl,
          themeBackgroundFrom: removed.themeBackgroundFrom,
          themeBackgroundFromStop: removed.themeBackgroundFromStop,
          themeBackgroundTo: removed.themeBackgroundTo,
          themeBackgroundToStop: removed.themeBackgroundToStop,
          themeLabelColor: removed.themeLabelColor,
        },
      });
    }
  });

  // Postgres cannot express "all five or none", so a row written by direct SQL
  // can arrive partial. Half a gradient is unrenderable, so it must read as no
  // theme rather than reach the client.
  test("a half-set palette is served as theme: null", async () => {
    await setExperiment(true);
    const row = await getPrisma().homeShortcutVariant.findFirstOrThrow({
      where: { variant: "gradient_v1", shortcut: { key: "set_status" } },
    });
    await getPrisma().homeShortcutVariant.update({
      where: { id: row.id },
      data: { themeLabelColor: null },
    });
    try {
      const shortcuts = await fetchShortcuts(GRADIENT_USER);
      expect(shortcuts.find((s) => s.key === "set_status")?.theme).toBeNull();
    } finally {
      await getPrisma().homeShortcutVariant.update({
        where: { id: row.id },
        data: { themeLabelColor: row.themeLabelColor },
      });
    }
  });

  // The variant table's reason for existing: an arm is a COMPLETE tile.
  //
  // ARTWORK IS ASSERTED THROUGH A ROW THIS TEST WRITES, not through the seed.
  // The seed publishes the arm's palette and copy but NO `iconUrl`: the PNGs
  // are not in the repo and exist only where `scripts/local-ab-setup.sh` has
  // uploaded them, so a seeded URL would have no file behind it on stage — and,
  // when it was `http://127.0.0.1:4566/...`, no valid SHAPE either, which 500'd
  // this endpoint everywhere the dev media carve-out is off. Ops publishes the
  // real artwork per environment through the CMS. What must hold on the wire is
  // that an arm's icon OVERRIDES the base row's when one is set, and that is
  // what this asserts.
  test("the two arms differ in copy and artwork, not only colour", async () => {
    await setExperiment(true);
    const arm = await getPrisma().homeShortcutVariant.findFirstOrThrow({
      where: { variant: "gradient_v1", shortcut: { key: "set_status" } },
    });
    const base = await getPrisma().homeShortcut.findFirstOrThrow({
      where: { key: "set_status" },
    });
    await getPrisma().homeShortcut.update({
      where: { id: base.id },
      data: { iconUrl: "https://cdn.example.com/base/set_status.png" },
    });
    await getPrisma().homeShortcutVariant.update({
      where: { id: arm.id },
      data: { iconUrl: "https://cdn.example.com/gradient_v1/set_status.png" },
    });
    try {
      const gradient = await fetchShortcuts(GRADIENT_USER);
      const control = await fetchShortcuts(CONTROL_USER);

      const g = gradient.find((s) => s.key === "set_status");
      const c = control.find((s) => s.key === "set_status");
      expect(g?.label).not.toBe(c?.label);
      expect(g?.iconUrl).toBe("https://cdn.example.com/gradient_v1/set_status.png");
      // Control has no arm row at all, so it IS the base tile — same field,
      // inherited, which is the comparison that makes the override meaningful.
      expect(c?.iconUrl).toBe("https://cdn.example.com/base/set_status.png");
      expect(g?.theme).not.toBeNull();
      expect(c?.theme).toBeNull();
    } finally {
      await getPrisma().homeShortcut.update({
        where: { id: base.id },
        data: { iconUrl: base.iconUrl },
      });
      await getPrisma().homeShortcutVariant.update({
        where: { id: arm.id },
        data: { iconUrl: arm.iconUrl },
      });
    }
  });

  /**
   * The regression that took `GET /home/shortcuts` down in the deploy gate.
   *
   * `iconUrl` is published through `mediaUrl`, which Fastify validates on the
   * way OUT, and which accepts `http://` on loopback ONLY while the dev
   * carve-out is on. A stored value it refuses is therefore not one tile
   * missing its art — it fails response serialization and 500s the endpoint for
   * every user the row reaches. It must degrade to `null` instead, which is the
   * same thing a pre-TAM-132 row already serves.
   *
   * Asserted with a non-loopback http URL so the expectation holds in BOTH
   * environments: the carve-out never accepts http off localhost / RFC1918, so
   * this does not quietly pass on a dev box whose `apps/api/.env` turns the
   * carve-out on.
   */
  test("an arm icon the wire schema would refuse serves null, not a 500", async () => {
    await setExperiment(true);
    const arm = await getPrisma().homeShortcutVariant.findFirstOrThrow({
      where: { variant: "gradient_v1", shortcut: { key: "set_status" } },
    });
    await getPrisma().homeShortcutVariant.update({
      where: { id: arm.id },
      data: { iconUrl: "http://cdn.example.com/gradient_v1/set_status.png" },
    });
    try {
      const shortcuts = await fetchShortcuts(GRADIENT_USER);
      const g = shortcuts.find((s) => s.key === "set_status");
      expect(g?.iconUrl).toBeNull();
      // The arm is not abandoned over its artwork — palette and copy still ship.
      expect(g?.theme).not.toBeNull();
      // And the rest of the grid is untouched, which is the whole point.
      expect(shortcuts).toHaveLength(6);
    } finally {
      await getPrisma().homeShortcutVariant.update({
        where: { id: arm.id },
        data: { iconUrl: arm.iconUrl },
      });
    }
  });
});

/**
 * Admin WRITE path for shortcuts — the optimistic-concurrency contract.
 *
 * These exist because of a reported bug with a one-line cause: `updateMany`'s
 * `data` is legitimately EMPTY when an edit touches only related rows (the arm
 * set, the translations), Prisma SKIPS the statement for an empty `data` and
 * returns `count: 0`, and the service reads a 0-count as a failed precondition.
 * Ops uploading the colour arm's artwork — a variants-only edit, which is the
 * whole post-deploy workflow for TAM-174 — therefore got "Modified by someone
 * else" every single time, on a row nobody else had touched.
 *
 * The fix stamps `updatedAt` so the statement is never empty. The risk in that
 * fix is the opposite failure — a precondition that no longer bites — so a
 * genuinely stale write is asserted here alongside the fresh ones.
 */
describe("PATCH /admin/home/shortcuts/:id — concurrency", () => {
  const ADMIN_EMAIL = "home-admin@prabhuji.internal";
  const ADMIN_PASSWORD = "home-admin-password-123";
  let adminToken: string;

  const adminAuth = (): { authorization: string } => ({
    authorization: `Bearer ${adminToken}`,
  });

  interface AdminShortcut {
    id: string;
    key: string;
    updatedAt: string;
    minAppVersion: string | null;
    variants: {
      variant: string;
      label: string | null;
      iconUrl: string | null;
      minAppVersion: string | null;
      themeBackgroundFrom: string | null;
    }[];
  }

  /** The admin detail view of `set_status`, which the seed gives a themed arm. */
  const loadShortcut = async (): Promise<AdminShortcut> => {
    const row = await getPrisma().homeShortcut.findFirstOrThrow({
      where: { key: "set_status" },
      select: { id: true },
    });
    const res = await app.inject({
      method: "GET",
      url: `/admin/home/shortcuts/${row.id}`,
      headers: adminAuth(),
    });
    expect(res.statusCode).toBe(200);
    const body: { data: AdminShortcut } = res.json();
    return body.data;
  };

  const patch = async (
    id: string,
    payload: Record<string, unknown>
  ): Promise<{ statusCode: number; errorCode?: string }> => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/home/shortcuts/${id}`,
      headers: adminAuth(),
      payload,
    });
    const body: { errorCode?: string } = res.json();
    return { statusCode: res.statusCode, errorCode: body.errorCode };
  };

  beforeAll(async () => {
    // `role` is never a request input (TAM-82) — register, then promote directly.
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: ADMIN_EMAIL, name: "Home Admin", password: ADMIN_PASSWORD },
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
    const body: { data: { token: string } } = login.json();
    adminToken = body.data.token;
  });

  // THE REPORTED BUG. Nothing on the base row changes, so `data` is empty.
  test("a variants-only edit saves instead of reporting a phantom conflict", async () => {
    const before = await loadShortcut();
    const arm = before.variants.find((v) => v.variant === "gradient_v1");
    expect(arm, "seed should give set_status a gradient arm").toBeDefined();

    const result = await patch(before.id, {
      expectedUpdatedAt: before.updatedAt,
      variants: [{ ...arm, iconUrl: "https://cdn.example.com/gradient_v1/set_status.png" }],
    });
    expect(result.statusCode, `got ${result.errorCode ?? "no errorCode"}`).toBe(200);

    const after = await loadShortcut();
    expect(after.variants.find((v) => v.variant === "gradient_v1")?.iconUrl).toBe(
      "https://cdn.example.com/gradient_v1/set_status.png"
    );
    // The arm rows belong to this row's version, so the token must advance —
    // otherwise a second editor's stale write would not be caught.
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(
      new Date(before.updatedAt).getTime()
    );
  });

  test("a translations-only edit saves too (same empty-data path)", async () => {
    const before = await loadShortcut();
    const result = await patch(before.id, {
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", label: "स्टेटस लगाएं" }],
    });
    expect(result.statusCode, `got ${result.errorCode ?? "no errorCode"}`).toBe(200);
  });

  // The other side of the fix: a write that IS stale must still be rejected.
  test("a stale expectedUpdatedAt is still a 409", async () => {
    const before = await loadShortcut();
    const stale = new Date(new Date(before.updatedAt).getTime() - 60_000).toISOString();
    const result = await patch(before.id, {
      expectedUpdatedAt: stale,
      variants: [{ variant: "gradient_v1", label: "should not be written" }],
    });
    expect(result.statusCode).toBe(409);
    expect(result.errorCode).toBe("STALE_WRITE");

    const after = await loadShortcut();
    expect(after.variants.find((v) => v.variant === "gradient_v1")?.label).not.toBe(
      "should not be written"
    );
  });

  /**
   * A PATCH REPLACES the whole arm set, so a client that round-trips the set
   * without a column DELETES that column's value. The admin form did exactly
   * that with `minAppVersion`, and every save silently ungated the colour arm —
   * builds below 1.1.0 then received assets authored for a card they cannot
   * render. The wire must carry the gate back unchanged.
   */
  test("a variants round-trip preserves the arm's app-version gate", async () => {
    const before = await loadShortcut();
    const arm = before.variants.find((v) => v.variant === "gradient_v1");
    expect(arm?.minAppVersion, "seed gates the gradient arm").toBe("1.1.0");

    const result = await patch(before.id, {
      expectedUpdatedAt: before.updatedAt,
      variants: [{ ...arm, label: "छवि बदलें" }],
    });
    expect(result.statusCode).toBe(200);

    const after = await loadShortcut();
    const armAfter = after.variants.find((v) => v.variant === "gradient_v1");
    expect(armAfter?.label).toBe("छवि बदलें");
    expect(armAfter?.minAppVersion).toBe("1.1.0");
  });
});
