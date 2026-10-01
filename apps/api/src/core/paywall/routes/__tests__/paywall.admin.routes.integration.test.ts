import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initUsersModule } from "@api/core/users";
import { initPaywallModule } from "@api/core/paywall";

/**
 * Integration coverage for `/admin/paywall/configs*` (TAM-159) — real Postgres
 * via testcontainers.
 *
 * The `users` module is initialised because `adminMiddleware` resolves the
 * caller's role through `performServiceCall("users", …)` on every request (it
 * deliberately never trusts a JWT claim). The MEDIA facade is registered as a
 * fake: object ownership is `core/media`'s own tested concern, and S3 is not
 * available here — this file is about the paywall's write semantics.
 *
 * The 401/403 guard behaviour is NOT retested here; the table-driven
 * `admin-route-guard.{contract,integration}` tests enumerate the live route
 * table and pick these three routes up automatically.
 *
 * TWO paywalls are seeded on purpose, with DIFFERENT layouts. `paywallId` became
 * a per-call parameter in TAM-159, so "the write landed on the paywall in the
 * URL, and only on it" is now a real thing that can regress — and the
 * single-hero rule is layout-dependent, so both shapes need a fixture:
 * `PAYWALL_ID` is the CAROUSEL (its `en` locale holds two images), `VARIANT_ID`
 * is a single-hero `card_hero`.
 *
 * Benefits are not part of this surface: their icon is a bundled app asset keyed
 * by name, not content, so there is nothing to upload, diff or seed here.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-paywall-admin-tests";
const PAYWALL_ID = "vip-membership-v1";
const VARIANT_ID = "vip-membership-v4";
const ADMIN_EMAIL = "paywall-admin@example.com";
const ADMIN_PASSWORD = "password1";

// Externally-hosted values, exactly like the seed's — `validateOwnedUrl` would
// reject every one of them, so anything that re-validates an unchanged URL
// fails in production. Here the fake facade accepts them; the SERVER-side diff
// is what the no-op tests actually pin.
const SEEDED_VIDEO = "https://cdn.jsdelivr.net/gh/x/big_buck_bunny.mp4";
const SEEDED_POSTER = "https://picsum.photos/seed/paywall/720/1280";
const SEEDED_IMAGE_A = "https://picsum.photos/seed/a/720/1280";
const SEEDED_IMAGE_B = "https://picsum.photos/seed/b/720/1280";
const NEW_IMAGE = "https://cdn.example.com/paywall/paywall-hero-media/hero-2.jpg";

interface HeroMediaView {
  sortOrder: number;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
}

interface TranslationView {
  locale: string;
  title: string;
  cancelAnytimeText: string;
  refundPolicyText: string;
  payNowCta: string;
  heroMedia: HeroMediaView[];
}

interface ConfigData {
  paywallId: string;
  layout: string;
  minAppVersion: string;
  configVersion: number;
  enabled: boolean;
  defaultPlanId: string | null;
  shimmerEnabled: boolean;
  updatedAt: string;
  translations: TranslationView[];
}

interface ConfigBody {
  success: boolean;
  message: string;
  data: ConfigData;
}

interface ListBody {
  success: boolean;
  message: string;
  data: Array<{
    paywallId: string;
    layout: string;
    minAppVersion: string;
    enabled: boolean;
    configVersion: number;
    updatedAt: string;
  }>;
}

interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

let app: FastifyInstance;
let adminToken: string;

async function seedPaywalls(): Promise<void> {
  const prisma = getPrisma();

  // The CAROUSEL — the only layout that may hold the two-image `en` list below.
  // `minAppVersion` left at the column default (`0.0.0` = no gate).
  await prisma.paywallConfig.create({
    data: {
      paywallId: PAYWALL_ID,
      layout: "carousel",
      enabled: true,
      defaultPlanId: "monthly",
      shimmerEnabled: true,
      hasVideoLocaleFallback: true,
    },
  });
  // A single-hero layout, gated above the released build — the state a real
  // variant sits in until the app ships its widgets.
  await prisma.paywallConfig.create({
    data: {
      paywallId: VARIANT_ID,
      layout: "card_hero",
      minAppVersion: "1.1.0",
      enabled: true,
      defaultPlanId: "monthly",
      shimmerEnabled: true,
      hasVideoLocaleFallback: true,
    },
  });

  for (const paywallId of [PAYWALL_ID, VARIANT_ID]) {
    for (const locale of ["en", "hi"]) {
      await prisma.paywallTranslation.create({
        data: {
          paywallId,
          locale,
          title: `title-${locale}`,
          cancelAnytimeText: `cancel-${locale}`,
          refundPolicyText: `refund-${locale}`,
          payNowCta: `cta-${locale}`,
        },
      });
    }
  }

  // `hi` → one video hero; `en` → a two-image carousel (so a reorder and a
  // partial replace are both expressible).
  await prisma.paywallHeroMedia.createMany({
    data: [
      {
        paywallId: PAYWALL_ID,
        locale: "hi",
        sortOrder: 0,
        mediaType: "video",
        url: SEEDED_VIDEO,
        thumbnailUrl: SEEDED_POSTER,
        mediaId: "vip_intro_v1",
      },
      {
        paywallId: PAYWALL_ID,
        locale: "en",
        sortOrder: 0,
        mediaType: "image",
        url: SEEDED_IMAGE_A,
        thumbnailUrl: null,
        mediaId: "hero_a",
      },
      {
        paywallId: PAYWALL_ID,
        locale: "en",
        sortOrder: 1,
        mediaType: "image",
        url: SEEDED_IMAGE_B,
        thumbnailUrl: null,
        mediaId: "hero_b",
      },
      {
        paywallId: VARIANT_ID,
        locale: "hi",
        sortOrder: 0,
        mediaType: "image",
        url: SEEDED_IMAGE_A,
        thumbnailUrl: null,
        mediaId: "variant_hero_a",
      },
    ],
  });

}

async function truncatePaywall(): Promise<void> {
  const prisma = getPrisma();
  await prisma.paywallHeroMedia.deleteMany({});
  await prisma.paywallTranslation.deleteMany({});
  await prisma.paywallConfig.deleteMany({});
}

async function listConfigs(): Promise<ListBody["data"]> {
  const res = await app.inject({
    method: "GET",
    url: "/admin/paywall/configs",
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  const body: ListBody = res.json();
  return body.data;
}

async function getConfig(paywallId: string = PAYWALL_ID): Promise<ConfigData> {
  const res = await app.inject({
    method: "GET",
    url: `/admin/paywall/configs/${paywallId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  const body: ConfigBody = res.json();
  return body.data;
}

function patch(payload: unknown, paywallId: string = PAYWALL_ID) {
  return app.inject({
    method: "PATCH",
    url: `/admin/paywall/configs/${paywallId}`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: payload as Record<string, unknown>,
  });
}

/** The hero rows Postgres holds for one `(paywallId, locale)`, in render order. */
async function heroRows(
  paywallId: string,
  locale: string
): Promise<{ sortOrder: number; url: string; mediaId: string }[]> {
  const rows = await getPrisma().paywallHeroMedia.findMany({
    where: { paywallId, locale },
    orderBy: { sortOrder: "asc" },
    select: { sortOrder: true, url: true, mediaId: true },
  });
  return rows;
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
  initUsersModule(app);
  initPaywallModule(app);
  await app.ready();

  registerGlobalService("media", {
    presign: vi.fn(),
    head: vi.fn(),
    validateOwnedUrl: vi.fn().mockResolvedValue(undefined),
    validateReusableUrl: vi.fn().mockResolvedValue(undefined),
    // TAM-125: IMediaApi grew presignGet + toKey for the downloads endpoint.
    // The paywall admin flow doesn't touch either, but a mock must satisfy the
    // interface (typecheck) — no-op impls keep the shape complete.
    presignGet: vi.fn().mockResolvedValue(""),
    toKey: (keyOrUrl: string) => keyOrUrl,
  });

  await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: ADMIN_EMAIL, name: "Paywall Admin", password: ADMIN_PASSWORD },
  });
  // `role` is never a request input (TAM-82) — promote directly.
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
}, 180_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await truncatePaywall();
  await seedPaywalls();
});

describe("GET /admin/paywall/configs", () => {
  test("lists every paywall for the picker, each with its own token", async () => {
    const rows = await listConfigs();

    expect(rows.map((r) => r.paywallId)).toEqual([PAYWALL_ID, VARIANT_ID]);
    expect(rows[0]?.layout).toBe("carousel");
    expect(rows[1]?.layout).toBe("card_hero");
    // The picker shows which paywalls are gated, without opening each one.
    expect(rows[0]?.minAppVersion).toBe("0.0.0");
    expect(rows[1]?.minAppVersion).toBe("1.1.0");
    expect(rows.every((r) => r.enabled)).toBe(true);
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}T/.test(r.updatedAt))).toBe(true);
  });
});

describe("GET /admin/paywall/configs/:paywallId", () => {
  test("returns the config, its editable locales and hero lists", async () => {
    const data = await getConfig();

    expect(data.paywallId).toBe(PAYWALL_ID);
    expect(data.layout).toBe("carousel");
    expect(data.minAppVersion).toBe("0.0.0");
    expect(data.enabled).toBe(true);
    expect(data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.translations.map((t) => t.locale)).toEqual(["en", "hi"]);
    expect(data.translations[0]?.title).toBe("title-en");
    // Hero rows land under their own locale, in sortOrder.
    expect(data.translations[0]?.heroMedia.map((m) => m.mediaId)).toEqual([
      "hero_a",
      "hero_b",
    ]);
    expect(data.translations[1]?.heroMedia).toEqual([
      {
        sortOrder: 0,
        mediaType: "video",
        url: SEEDED_VIDEO,
        thumbnailUrl: SEEDED_POSTER,
        mediaId: "vip_intro_v1",
      },
    ]);
  });

  test("serves externally-hosted seed URLs rather than 500ing on them", async () => {
    // The response schema types URL fields loosely on purpose — `mediaUrl`
    // validates on serialization too, and the seeded values are external.
    const data = await getConfig();
    expect(data.translations[1]?.heroMedia[0]?.url).toBe(SEEDED_VIDEO);
  });

  test("each paywall serves its OWN rows", async () => {
    const variant = await getConfig(VARIANT_ID);

    expect(variant.layout).toBe("card_hero");
    expect(variant.minAppVersion).toBe("1.1.0");
    expect(variant.translations[0]?.heroMedia).toEqual([]); // en has none
    expect(variant.translations[1]?.heroMedia.map((m) => m.mediaId)).toEqual([
      "variant_hero_a",
    ]);
  });

  test("an unknown paywallId is 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/paywall/configs/no-such-paywall",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  test("a paywallId that is not a slug is rejected at the boundary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/paywall/configs/Not%20A%20Slug",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /admin/paywall/configs/:paywallId — writes", () => {
  test("writes only the touched locale and only the touched columns", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", payNowCta: "अभी खरीदें" }],
    });
    expect(res.statusCode).toBe(200);

    const rows = await getPrisma().paywallTranslation.findMany({
      where: { paywallId: PAYWALL_ID },
      orderBy: { locale: "asc" },
    });
    const en = rows.find((r) => r.locale === "en");
    const hi = rows.find((r) => r.locale === "hi");

    expect(hi?.payNowCta).toBe("अभी खरीदें");
    // The NOT NULL copy columns this patch did not name must survive.
    expect(hi?.title).toBe("title-hi");
    expect(hi?.cancelAnytimeText).toBe("cancel-hi");
    expect(hi?.refundPolicyText).toBe("refund-hi");
    // The other locale is untouched.
    expect(en?.payNowCta).toBe("cta-en");
  });

  test("layout and minAppVersion are writable on the parent row", async () => {
    // On the single-hero paywall: every locale holds at most one row, so the
    // layout may move freely (the hero-count guard has its own block below).
    const before = await getConfig(VARIANT_ID);

    const res = await patch(
      {
        expectedUpdatedAt: before.updatedAt,
        layout: "icon_grid",
        minAppVersion: "1.3.0",
      },
      VARIANT_ID
    );
    expect(res.statusCode).toBe(200);

    const body: ConfigBody = res.json();
    expect(body.data.layout).toBe("icon_grid");
    expect(body.data.minAppVersion).toBe("1.3.0");
  });

  /**
   * `enabled` is a column the resolver still honours, but the CMS does not write
   * it — parking a variant means raising `minAppVersion` above every shipped
   * build. The body is `.strict()`, so sending it must be a 400 rather than a
   * silently-ignored field that an editor believes took effect.
   */
  test("`enabled` is not writable — the strict body rejects it", async () => {
    const before = await getConfig(VARIANT_ID);

    const res = await patch(
      { expectedUpdatedAt: before.updatedAt, enabled: false },
      VARIANT_ID
    );
    expect(res.statusCode).toBe(400);

    const after = await getConfig(VARIANT_ID);
    expect(after.enabled).toBe(before.enabled);
    expect(after.configVersion).toBe(before.configVersion);
  });

  /**
   * Opening the gate is the CMS action that starts the experiment — no deploy.
   * It has to reach the COLUMN, not just the response projection.
   */
  test("lowering minAppVersion to 0.0.0 lands in the database", async () => {
    const before = await getConfig(VARIANT_ID);

    const res = await patch(
      { expectedUpdatedAt: before.updatedAt, minAppVersion: "0.0.0" },
      VARIANT_ID
    );
    expect(res.statusCode).toBe(200);

    const row = await getPrisma().paywallConfig.findUnique({
      where: { paywallId: VARIANT_ID },
      select: { minAppVersion: true },
    });
    expect(row?.minAppVersion).toBe("0.0.0");
  });

  test("hero media is a replace-set for the touched locale only", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [
        {
          locale: "en",
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: "image",
              url: NEW_IMAGE,
              thumbnailUrl: null,
              mediaId: "hero_c",
            },
          ],
        },
      ],
    });
    expect(res.statusCode).toBe(200);

    // The two seeded `en` rows are gone, replaced by the single new one.
    expect(await heroRows(PAYWALL_ID, "en")).toEqual([
      { sortOrder: 0, url: NEW_IMAGE, mediaId: "hero_c" },
    ]);
    // The untouched locale keeps its row.
    expect(await heroRows(PAYWALL_ID, "hi")).toEqual([
      { sortOrder: 0, url: SEEDED_VIDEO, mediaId: "vip_intro_v1" },
    ]);
  });

  test("a reorder rewrites the list in the new order", async () => {
    const before = await getConfig();
    const en = before.translations.find((t) => t.locale === "en");

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [
        {
          locale: "en",
          heroMedia: [
            { ...en?.heroMedia[1], sortOrder: 0 },
            { ...en?.heroMedia[0], sortOrder: 1 },
          ],
        },
      ],
    });
    expect(res.statusCode).toBe(200);

    expect((await heroRows(PAYWALL_ID, "en")).map((r) => r.mediaId)).toEqual([
      "hero_b",
      "hero_a",
    ]);
  });

  test("an empty heroMedia array clears that locale's hero", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", heroMedia: [] }],
    });
    expect(res.statusCode).toBe(200);

    expect(await heroRows(PAYWALL_ID, "hi")).toEqual([]);
    const body: ConfigBody = res.json();
    expect(body.data.translations.find((t) => t.locale === "hi")?.heroMedia).toEqual(
      []
    );
  });

  test("bumps configVersion and moves the token", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", payNowCta: "अभी खरीदें" }],
    });
    expect(res.statusCode).toBe(200);

    const body: ConfigBody = res.json();
    expect(body.data.configVersion).toBe(before.configVersion + 1);
    expect(body.data.updatedAt).not.toBe(before.updatedAt);
  });

  test("the write lands on the paywall in the URL and on no other", async () => {
    const beforeVariant = await getConfig(VARIANT_ID);
    const beforeDefault = await getConfig(PAYWALL_ID);

    const res = await patch(
      {
        expectedUpdatedAt: beforeVariant.updatedAt,
        layout: "icon_grid",
        translations: [{ locale: "hi", payNowCta: "variant-cta" }],
      },
      VARIANT_ID
    );
    expect(res.statusCode).toBe(200);

    const afterDefault = await getConfig(PAYWALL_ID);
    expect(afterDefault.layout).toBe("carousel");
    expect(afterDefault.configVersion).toBe(beforeDefault.configVersion);
    expect(afterDefault.updatedAt).toBe(beforeDefault.updatedAt);
    expect(
      afterDefault.translations.find((t) => t.locale === "hi")?.payNowCta
    ).toBe("cta-hi");
  });
});

/**
 * Only the carousel pages through a list; the other three layouts draw the first
 * hero row and silently ignore the rest. The admin SPA blocks these client-side,
 * but the client is fast feedback and never the enforcement point — this is the
 * path an editor actually hits, so it is asserted over HTTP.
 */
describe("PATCH /admin/paywall/configs/:paywallId — one hero unless carousel", () => {
  function images(n: number): HeroMediaView[] {
    return Array.from({ length: n }, (_, i) => ({
      sortOrder: i,
      mediaType: "image",
      url: `${NEW_IMAGE}?frame=${i}`,
      thumbnailUrl: null,
      mediaId: `hero_${i}`,
    }));
  }

  test("a two-row hero on a single-hero layout is 400 and writes nothing", async () => {
    const before = await getConfig(VARIANT_ID); // card_hero

    const res = await patch(
      {
        expectedUpdatedAt: before.updatedAt,
        translations: [{ locale: "hi", heroMedia: images(2) }],
      },
      VARIANT_ID
    );

    expect(res.statusCode).toBe(400);
    const after = await getConfig(VARIANT_ID);
    expect(after.configVersion).toBe(before.configVersion);
    expect(await heroRows(VARIANT_ID, "hi")).toEqual([
      { sortOrder: 0, url: SEEDED_IMAGE_A, mediaId: "variant_hero_a" },
    ]);
  });

  /**
   * THE bug this rule nearly missed: the layout moves and the hero list is not
   * mentioned, so a diff-scoped check sees nothing to inspect — and the paywall
   * is left rendering one of its two stored `en` images with the other
   * unreachable and no error anywhere.
   */
  test("switching to a single-hero layout with an over-quota STORED locale is 400", async () => {
    const before = await getConfig(); // carousel, `en` holds two images

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      layout: "card_hero", // no heroMedia in the payload at all
    });

    expect(res.statusCode).toBe(400);
    const after = await getConfig();
    expect(after.layout).toBe("carousel");
    expect(after.configVersion).toBe(before.configVersion);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("carousel → card_hero WITH the list trimmed in the same save is accepted", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      layout: "card_hero",
      translations: [{ locale: "en", heroMedia: images(1) }],
    });
    expect(res.statusCode).toBe(200);

    const body: ConfigBody = res.json();
    expect(body.data.layout).toBe("card_hero");
    expect((await heroRows(PAYWALL_ID, "en")).map((r) => r.mediaId)).toEqual(["hero_0"]);
  });

  test("card_hero → carousel WITH a three-image list in the same save is accepted", async () => {
    const before = await getConfig(VARIANT_ID);

    const res = await patch(
      {
        expectedUpdatedAt: before.updatedAt,
        layout: "carousel",
        translations: [{ locale: "hi", heroMedia: images(3) }],
      },
      VARIANT_ID
    );
    expect(res.statusCode).toBe(200);

    expect((await heroRows(VARIANT_ID, "hi")).map((r) => r.mediaId)).toEqual([
      "hero_0",
      "hero_1",
      "hero_2",
    ]);
  });
});

describe("PATCH /admin/paywall/configs/:paywallId — the no-op", () => {
  test("re-sending the full current state is a 200 no-op — no version bump", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      layout: before.layout,
      minAppVersion: before.minAppVersion,
      // Echoed verbatim, including the external seed URLs `validateOwnedUrl`
      // would reject — the SERVER diff is what keeps them out of the write.
      translations: before.translations,
    });

    expect(res.statusCode).toBe(200);
    const body: ConfigBody = res.json();
    expect(body.data.configVersion).toBe(before.configVersion);
    expect(body.data.updatedAt).toBe(before.updatedAt);
    // And nothing was rewritten underneath: the hero rows are the seeded ones.
    expect((await heroRows(PAYWALL_ID, "en")).map((r) => r.mediaId)).toEqual([
      "hero_a",
      "hero_b",
    ]);
  });

  test("a no-op does not spend the token — the same token still writes afterwards", async () => {
    const before = await getConfig();

    const noop = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: before.translations,
    });
    expect(noop.statusCode).toBe(200);

    const real = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", payNowCta: "अभी खरीदें" }],
    });
    expect(real.statusCode).toBe(200);
  });
});

describe("PATCH /admin/paywall/configs/:paywallId — rejections", () => {
  test("replaying a spent token is 409 STALE_WRITE and writes nothing", async () => {
    // This is the test that pins the design: the precondition lives on the
    // PARENT config row, and it only works because the write bumps that row.
    const before = await getConfig();

    const first = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", payNowCta: "first" }],
    });
    expect(first.statusCode).toBe(200);

    const replay = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", payNowCta: "second" }],
    });
    expect(replay.statusCode).toBe(409);
    const body: ErrBody = replay.json();
    expect(body.errorCode).toBe("STALE_WRITE");

    const hi = await getPrisma().paywallTranslation.findFirst({
      where: { paywallId: PAYWALL_ID, locale: "hi" },
    });
    expect(hi?.payNowCta).toBe("first");
  });

  test("patching an unknown paywall is 404", async () => {
    const before = await getConfig();

    const res = await patch(
      {
        expectedUpdatedAt: before.updatedAt,
        translations: [{ locale: "hi", payNowCta: "nope" }],
      },
      "no-such-paywall"
    );

    expect(res.statusCode).toBe(404);
  });

  test("a locale with no copy row is 400 and writes nothing", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "ta", payNowCta: "வாங்கு" }],
    });

    expect(res.statusCode).toBe(400);
    const after = await getConfig();
    expect(after.configVersion).toBe(before.configVersion);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("an unknown layout is rejected at the schema boundary", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      layout: "layuot_grid",
    });

    expect(res.statusCode).toBe(400);
  });

  /**
   * `meetsMinVersion` denies anything it cannot parse, so a typo here would send
   * every user of this paywall to the default with nothing in the UI saying why.
   * The write path is where that has to be caught.
   */
  test.each([["1.1"], ["v1.1.0"], ["1.1.0-beta"], ["latest"], [""]])(
    "a minAppVersion of %j is rejected at the schema boundary",
    async (minAppVersion) => {
      const before = await getConfig();

      const res = await patch({ expectedUpdatedAt: before.updatedAt, minAppVersion });

      expect(res.statusCode).toBe(400);
    }
  );

  test("a duplicated locale is rejected rather than silently last-write-wins", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [
        { locale: "hi", payNowCta: "one" },
        { locale: "hi", payNowCta: "two" },
      ],
    });

    expect(res.statusCode).toBe(400);
  });

  test("a locale row naming no field to change is rejected", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi" }],
    });

    expect(res.statusCode).toBe(400);
  });

  test("a duplicated sortOrder within one hero list is rejected", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [
        {
          locale: "en",
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: "image",
              url: NEW_IMAGE,
              thumbnailUrl: null,
              mediaId: "hero_c",
            },
            {
              sortOrder: 0,
              mediaType: "image",
              url: NEW_IMAGE,
              thumbnailUrl: null,
              mediaId: "hero_d",
            },
          ],
        },
      ],
    });

    expect(res.statusCode).toBe(400);
  });

  test("an unknown mediaType is rejected — the client can only build two", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [
        {
          locale: "en",
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: "lottie",
              url: NEW_IMAGE,
              thumbnailUrl: null,
              mediaId: "hero_c",
            },
          ],
        },
      ],
    });

    expect(res.statusCode).toBe(400);
  });

  test("a non-https hero url is rejected", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [
        {
          locale: "en",
          heroMedia: [
            {
              sortOrder: 0,
              mediaType: "image",
              url: "ftp://cdn.example.com/hero.jpg",
              thumbnailUrl: null,
              mediaId: "hero_c",
            },
          ],
        },
      ],
    });

    expect(res.statusCode).toBe(400);
  });

  test("an unknown body field is rejected, not silently stripped", async () => {
    const before = await getConfig();

    const res = await patch({
      expectedUpdatedAt: before.updatedAt,
      translations: [{ locale: "hi", payNowCta: "अभी खरीदें" }],
      shimmerEnabled: false,
    });

    expect(res.statusCode).toBe(400);
  });

  test("a missing expectedUpdatedAt is rejected — there is no unconditional write", async () => {
    const res = await patch({
      translations: [{ locale: "hi", payNowCta: "अभी खरीदें" }],
    });

    expect(res.statusCode).toBe(400);
  });
});
