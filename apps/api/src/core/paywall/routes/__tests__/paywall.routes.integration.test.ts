import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { resolvePaywallId } from "@api/core/paywall/services";
import jwt from "jsonwebtoken";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import {
  clearGlobalServices,
  getGlobalService,
} from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initAuthModule } from "@api/core/auth";
import { initPaywallModule } from "@api/core/paywall";
// TAM-159: variant bucketing reads the phone from the User table through the
// users facade, so this module must be registered or every gated request
// degrades to the default paywall and the variant tests pass vacuously.
import { initUsersModule } from "@api/core/users";

/**
 * Integration coverage for `GET /paywall/config` — real Postgres via
 * testcontainers.
 *
 * The auth module is initialised so `authMiddleware` can resolve its
 * `performServiceCall("auth", …)` handshake — without it the middleware
 * throws SERVICE_UNAVAILABLE regardless of token validity. Tokens are
 * signed directly with the JWT secret (matching AuthService's payload
 * shape) so we don't have to route through OTP for every test.
 *
 * Each test resets the paywall tables to a known fixture. `PAYWALL_ID` is
 * the same `vip-membership-v1` the service defaults to, so we don't have
 * to pass a paywall id from the client.
 */

const JWT_SECRET = "a-sufficiently-long-secret-for-paywall-tests";
const PAYWALL_ID = "vip-membership-v1";
/** The one variant these tests seed — a real id from the bucket map. */
const VARIANT_PAYWALL_ID = "vip-carousel-v1";

interface PaywallConfigBody {
  success: boolean;
  message: string;
  data: {
    paywallId: string;
    configVersion: number;
    enabled: boolean;
    localeRequested: string;
    localeServed: string;
    fallbackUsed: boolean;
    fallbackFrom: string | null;
    missingFields: string[];
    title: string;
    /** TAM-159 — optional on the wire so a rolled-back API cannot break a client. */
    layout?: string;
    heroMedia?: Array<{
      sortOrder: number;
      mediaType: string;
      url: string;
      thumbnailUrl: string | null;
      mediaId: string;
    }>;
    videoUrl: string | null;
    videoThumbnailUrl: string | null;
    videoId: string | null;
    defaultPlanId: string | null;
    plans: Array<{
      planId: string;
      productId: string;
      period: string;
      localizedLabel: string;
      trialLabel: string;
      trialDays: number;
      displayPriceText: string;
      subscriptionDetailText: string;
      sortOrder: number;
    }>;
    benefits: Array<{
      benefitId: string;
      localizedName: string;
      /** A BUNDLED asset key, never a URL — benefit artwork is not CMS-controlled. */
      icon: string;
      sortOrder: number;
    }>;
    legalLinks: {
      privacyPolicyUrl: string;
      termsServiceUrl: string;
      refundPolicyUrl: string;
    };
    cancelAnytimeText: string;
    refundPolicyText: string;
    payNowCta: string;
    shimmerEnabled: boolean;
  };
}

interface ErrBody {
  success: boolean;
  message: string;
  data: null;
  errorCode?: string;
}

let app: FastifyInstance;

/** A phone account, exactly as `core/otp` writes one: no email, no password. */
async function seedUser(): Promise<{ id: string }> {
  const created = await getPrisma().user.create({
    data: {
      phoneCountryCode: "+91",
      phoneNumber: uniquePhone(),
      loginType: "otp",
      name: null,
      selectedLanguage: null,
      onboardingCompletedAt: null,
    },
  });
  return { id: created.id };
}

/**
 * Distinct per call — `user_phone_unique` rejects a repeat. A counter rather
 * than randomness so a failure is reproducible.
 */
let phoneSeq = 0;
function uniquePhone(): string {
  phoneSeq += 1;
  return `9${String(phoneSeq).padStart(9, "0")}`;
}

/** `{sub}` only — the shape `core/otp` mints for a phone account. */
function mintToken(user: { id: string }): string {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "1h" });
}

async function truncatePaywall(): Promise<void> {
  const prisma = getPrisma();
  await prisma.paywallLegalLinks.deleteMany({});
  // TAM-159: hero rows are unique on (paywallId, locale, sortOrder), so leaving
  // them behind makes the SECOND test's seed collide rather than the first fail.
  await prisma.paywallHeroMedia.deleteMany({});
  await prisma.paywallTranslation.deleteMany({});
  await prisma.paywallBenefit.deleteMany({});
  await prisma.paywallPlan.deleteMany({});
  await prisma.paywallConfig.deleteMany({});
}

interface SeedOptions {
  plans?: Array<{
    planId: string;
    enabled?: boolean;
    translations?: Array<{ locale: string; label: string }>;
  }>;
  benefits?: Array<{
    benefitId: string;
    enabled?: boolean;
    translations?: Array<{ locale: string; name: string }>;
  }>;
  translationLocales?: string[];
  legalLocales?: string[];
  configEnabled?: boolean;
}

async function seedPaywall(opts: SeedOptions = {}): Promise<void> {
  const prisma = getPrisma();
  await prisma.paywallConfig.create({
    data: {
      paywallId: PAYWALL_ID,
      enabled: opts.configEnabled ?? true,
      defaultPlanId: "week",
      shimmerEnabled: true,
      hasVideoLocaleFallback: true,
    },
  });

  const plans =
    opts.plans ??
    [
      {
        planId: "week",
        enabled: true,
        translations: [
          { locale: "hi", label: "साप्ताहिक" },
          { locale: "en", label: "Weekly" },
        ],
      },
    ];

  for (let i = 0; i < plans.length; i += 1) {
    const p = plans[i];
    await prisma.paywallPlan.create({
      data: {
        paywallId: PAYWALL_ID,
        planId: p.planId,
        productId: `product-${p.planId}`,
        period: "week",
        sortOrder: i,
        enabled: p.enabled ?? true,
        trialDays: 7,
        translations: {
          create: (p.translations ?? []).map((t) => ({
            locale: t.locale,
            localizedLabel: t.label,
            trialLabel: `trial-${t.locale}`,
            displayPriceText: "₹99",
            subscriptionDetailText: `sub-${t.locale}`,
          })),
        },
      },
    });
  }

  const benefits =
    opts.benefits ??
    [
      {
        benefitId: "mandir",
        enabled: true,
        translations: [
          { locale: "hi", name: "मंदिर" },
          { locale: "en", name: "Mandir" },
        ],
      },
    ];

  for (let i = 0; i < benefits.length; i += 1) {
    const b = benefits[i];
    await prisma.paywallBenefit.create({
      data: {
        paywallId: PAYWALL_ID,
        benefitId: b.benefitId,
        icon: `${b.benefitId}.png`,
        sortOrder: i,
        enabled: b.enabled ?? true,
        translations: {
          create: (b.translations ?? []).map((t) => ({
            locale: t.locale,
            localizedName: t.name,
          })),
        },
      },
    });
  }

  const translationLocales = opts.translationLocales ?? ["hi", "en"];
  for (const locale of translationLocales) {
    await prisma.paywallTranslation.create({
      data: {
        paywallId: PAYWALL_ID,
        locale,
        title: locale === "hi" ? "VIP सदस्यता" : "VIP Membership",
        videoUrl: `https://example.com/video-${locale}.mp4`,
        videoThumbnailUrl: `https://example.com/thumb-${locale}.png`,
        videoId: `vip_intro_${locale}`,
        cancelAnytimeText:
          locale === "hi" ? "कभी भी रद्द करें" : "Cancel anytime",
        refundPolicyText: locale === "hi" ? "रिफंड" : "Refund",
        payNowCta: locale === "hi" ? "आगे बढ़ें" : "Continue",
      },
    });

    // TAM-159: the wire's `videoUrl`/`videoThumbnailUrl`/`videoId` are DERIVED
    // from here, not from the columns above — those are dead data now. Seeded
    // with the same values so the legacy assertions keep pinning the exact bytes
    // a shipped APK receives.
    await prisma.paywallHeroMedia.create({
      data: {
        paywallId: PAYWALL_ID,
        locale,
        sortOrder: 0,
        mediaType: "video",
        url: `https://example.com/video-${locale}.mp4`,
        thumbnailUrl: `https://example.com/thumb-${locale}.png`,
        mediaId: `vip_intro_${locale}`,
      },
    });
  }

  const legalLocales = opts.legalLocales ?? ["hi", "en"];
  for (const locale of legalLocales) {
    await prisma.paywallLegalLinks.create({
      data: {
        paywallId: PAYWALL_ID,
        locale,
        privacyPolicyUrl: `https://prabhuji.example.com/${locale}/privacy`,
        termsServiceUrl: `https://prabhuji.example.com/${locale}/terms`,
        refundPolicyUrl: `https://prabhuji.example.com/${locale}/refund`,
      },
    });
  }
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
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await truncatePaywall();
  // Wipe the module's in-memory caches so the previous test's seed can't
  // bleed into this test's response. The facade's `invalidate` clears both
  // the raw-row provider cache AND the composed response cache — but it is
  // keyed PER PAYWALL and defaults to the default one, so every variant these
  // tests touch has to be named. Miss one and a variant config cached while it
  // was enabled outlives the row itself, which silently defeats the kill-switch
  // and missing-row fallback tests.
  for (const paywallId of [PAYWALL_ID, VARIANT_PAYWALL_ID]) {
    getGlobalService("paywall")?.invalidate(paywallId);
  }
});

describe("auth gate", () => {
  test("GET /paywall/config without a JWT returns 401", async () => {
    await seedPaywall();
    const res = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=hi",
    });
    expect(res.statusCode).toBe(401);
    const body: ErrBody = res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
  });

  test("GET /paywall/config with an invalid JWT returns 401", async () => {
    await seedPaywall();
    const res = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=hi",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("query validation", () => {
  // The `locale` read param is deliberately TOLERANT
  // (`shared/schemas/locale.ts`): an unknown code walks the documented
  // `requested → hi → en` chain instead of 400ing. This test asserted the
  // opposite until the platform-wide standardization.
  test("unknown locale falls through the chain and is served, not rejected", async () => {
    await seedPaywall();
    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=xx",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: PaywallConfigBody = res.json();
    expect(body.data.localeRequested).toBe("xx");
    // `xx` has no rows; the next chain entry (`hi`) does.
    expect(body.data.localeServed).toBe("hi");
    expect(body.data.plans.length).toBeGreaterThan(0);
  });

  test("missing locale is 400", async () => {
    await seedPaywall();
    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "GET",
      url: "/paywall/config",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("happy path", () => {
  test("GET /paywall/config?locale=hi returns the paywall payload + version header", async () => {
    await seedPaywall();
    const user = await seedUser();
    const token = mintToken(user);

    const res = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=hi",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: PaywallConfigBody = res.json();

    expect(body.success).toBe(true);
    expect(body.data.paywallId).toBe(PAYWALL_ID);
    expect(body.data.localeRequested).toBe("hi");
    expect(body.data.localeServed).toBe("hi");
    expect(body.data.fallbackUsed).toBe(false);
    expect(body.data.fallbackFrom).toBeNull();
    expect(body.data.missingFields).toEqual([]);
    expect(body.data.title).toBe("VIP सदस्यता");
    expect(body.data.videoUrl).toBe("https://example.com/video-hi.mp4");
    expect(body.data.defaultPlanId).toBe("week");
    expect(body.data.plans).toHaveLength(1);
    expect(body.data.plans[0]?.planId).toBe("week");
    expect(body.data.plans[0]?.localizedLabel).toBe("साप्ताहिक");
    expect(body.data.benefits).toHaveLength(1);
    expect(body.data.benefits[0]?.localizedName).toBe("मंदिर");
    expect(body.data.legalLinks.privacyPolicyUrl).toBe(
      "https://prabhuji.example.com/hi/privacy"
    );
    expect(body.data.cancelAnytimeText).toBe("कभी भी रद्द करें");
    expect(body.data.shimmerEnabled).toBe(true);

    // Cache-key header mirrors configVersion.
    expect(res.headers["x-paywall-config-version"]).toBe(
      String(body.data.configVersion)
    );
  });
});

describe("locale fallback", () => {
  test("mr requested with no mr content -> hi served, fallbackUsed=true", async () => {
    // Seed only hi + en translations, but keep the enabled plans + benefits
    // — the client-facing locale `mr` has zero rows so every slice falls
    // through to `hi`.
    await seedPaywall({
      plans: [
        {
          planId: "week",
          enabled: true,
          translations: [
            { locale: "hi", label: "साप्ताहिक" },
            { locale: "en", label: "Weekly" },
          ],
        },
      ],
      benefits: [
        {
          benefitId: "mandir",
          enabled: true,
          translations: [
            { locale: "hi", name: "मंदिर" },
            { locale: "en", name: "Mandir" },
          ],
        },
      ],
      translationLocales: ["hi", "en"],
      legalLocales: ["hi", "en"],
    });

    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=mr",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: PaywallConfigBody = res.json();
    expect(body.data.localeRequested).toBe("mr");
    expect(body.data.localeServed).toBe("hi");
    expect(body.data.fallbackUsed).toBe(true);
    expect(body.data.fallbackFrom).toBe("mr");
    // Content-facing missing markers should include the top-level slots.
    expect(body.data.missingFields).toEqual(
      expect.arrayContaining([
        "translation",
        "legalLinks",
        "plans[week].translation",
        "benefits[mandir].translation",
      ])
    );
    // Content came from hi.
    expect(body.data.title).toBe("VIP सदस्यता");
    expect(body.data.plans[0]?.localizedLabel).toBe("साप्ताहिक");
  });
});

describe("empty-plans contract", () => {
  test("all plans disabled → HTTP 200 with plans: [] (NOT 404)", async () => {
    await seedPaywall({
      plans: [
        {
          planId: "week",
          enabled: false,
          translations: [{ locale: "hi", label: "साप्ताहिक" }],
        },
      ],
    });

    const user = await seedUser();
    const token = mintToken(user);
    const res = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=hi",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body: PaywallConfigBody = res.json();
    expect(body.data.plans).toEqual([]);
    expect(body.data.enabled).toBe(true);
    expect(body.data.title).toBe("VIP सदस्यता");
  });
});

describe("response cache", () => {
  test("second sequential request is served from cache (no extra DB writes seen)", async () => {
    await seedPaywall();
    const user = await seedUser();
    const token = mintToken(user);

    // First — miss, resolves from DB.
    const first = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=hi",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(first.statusCode).toBe(200);
    const firstBody: PaywallConfigBody = first.json();

    // Mutate DB behind the cache — the cached response should NOT reflect this.
    await getPrisma().paywallTranslation.update({
      where: {
        paywall_translation_unique: { paywallId: PAYWALL_ID, locale: "hi" },
      },
      data: { title: "MUTATED" },
    });

    // Second — hit, still serves the pre-mutation body.
    const second = await app.inject({
      method: "GET",
      url: "/paywall/config?locale=hi",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(second.statusCode).toBe(200);
    const secondBody: PaywallConfigBody = second.json();
    expect(secondBody.data.title).toBe(firstBody.data.title);
    expect(secondBody.data.title).not.toBe("MUTATED");
  });
});

// ---------------------------------------------------------------------------
// TAM-159 — A/B variant selection over the wire
// ---------------------------------------------------------------------------

describe("TAM-159 variant selection", () => {
  /**
   * The version gate lives on the variant's OWN config row now, so every variant
   * these tests seed has to name one. Matches the seed script's value: gated
   * above every released build until the app ships the layout widgets.
   */
  const VARIANT_MIN_APP_VERSION = "1.1.0";

  /**
   * Seed a variant paywall with its own copy and a DISTINCT hero, so the
   * response makes it unambiguous which paywall was served.
   */
  async function seedVariant(
    paywallId: string,
    layout: string,
    minAppVersion: string = VARIANT_MIN_APP_VERSION
  ): Promise<void> {
    const prisma = getPrisma();
    await prisma.paywallConfig.create({
      data: {
        paywallId,
        layout,
        minAppVersion,
        enabled: true,
        defaultPlanId: "week",
        shimmerEnabled: true,
      },
    });
    await prisma.paywallTranslation.create({
      data: {
        paywallId,
        locale: "hi",
        title: `VARIANT ${paywallId}`,
        cancelAnytimeText: "कभी भी रद्द करें",
        refundPolicyText: "रिफंड",
        payNowCta: "आगे बढ़ें",
      },
    });
    await prisma.paywallHeroMedia.create({
      data: {
        paywallId,
        locale: "hi",
        sortOrder: 0,
        mediaType: "image",
        url: `https://example.com/${paywallId}-hero.png`,
        thumbnailUrl: null,
        mediaId: `${paywallId}-hero`,
      },
    });
  }

  const COUNTRY_CODE = "+91";

  /**
   * A PHONE NUMBER whose bucket maps to `paywallId`, found by probing the real
   * resolver rather than hardcoding — a traffic re-cut should not read as a test
   * failure. TAM-159 buckets on the phone from the USER TABLE, not the user id.
   */
  function phoneFor(paywallId: string): string {
    for (let i = 0; i < 20000; i += 1) {
      const candidate = `9${String(i).padStart(9, "0")}`;
      if (resolvePaywallId(candidate) === paywallId) return candidate;
    }
    throw new Error(`no phone number buckets to ${paywallId}`);
  }

  /**
   * A user carrying a phone that buckets to `paywallId`. `phoneFor` is a pure
   * function of the bucket map, so every test in this block asks for the SAME
   * number — and `user_phone_unique` rejects a repeat while `beforeEach`
   * truncates only the paywall tables (wiping users would take the admin/auth
   * fixtures with it). Hence upsert-by-phone, returning whichever row now holds
   * it, rather than a create that would collide from the second test onwards.
   */
  async function seedUserWithPhone(phoneNumber: string): Promise<{ id: string }> {
    const existing = await getPrisma().user.findFirst({
      where: { phoneCountryCode: COUNTRY_CODE, phoneNumber },
      select: { id: true },
    });
    if (existing) return existing;
    return getPrisma().user.create({
      data: {
        phoneCountryCode: COUNTRY_CODE,
        phoneNumber,
        loginType: "otp",
        name: null,
        selectedLanguage: null,
        onboardingCompletedAt: null,
      },
      select: { id: true },
    });
  }

  /** A user with NO phone — must land on the default paywall, never a variant. */
  async function seedUserWithoutPhone(): Promise<{ id: string }> {
    return getPrisma().user.create({
      data: {
        email: `no-phone-${phoneSeq += 1}@example.com`,
        loginType: "email",
        passwordHash: "x".repeat(60),
        name: null,
        selectedLanguage: null,
        onboardingCompletedAt: null,
      },
      select: { id: true },
    });
  }

  async function fetchConfig(
    token: string,
    appVersion?: string
  ): Promise<PaywallConfigBody & { data: { layout?: string; heroMedia?: unknown[] } }> {
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (appVersion !== undefined) headers["app_version"] = appVersion;
    const res = await app.inject({ method: "GET", url: "/paywall/config?locale=hi", headers });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  /**
   * THE backward-compatibility guarantee. A build that predates the layouts
   * release must receive exactly what it received before this ticket — same
   * paywall, same flat video triple — no matter which bucket its user falls in.
   */
  test("a below-gate app_version gets the default paywall, byte-identical", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel");
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));
    const token = mintToken({ id });

    const noHeader = await fetchConfig(token);
    const oldVersion = await fetchConfig(token, "1.0.4");

    for (const body of [noHeader, oldVersion]) {
      expect(body.data.paywallId).toBe(PAYWALL_ID);
      expect(body.data.title).toBe("VIP सदस्यता");
      expect(body.data.videoUrl).toBe("https://example.com/video-hi.mp4");
      expect(body.data.videoThumbnailUrl).toBe("https://example.com/thumb-hi.png");
      expect(body.data.videoId).toBe("vip_intro_hi");
    }
    // Same user, same locale, two ways of being an old client → same bytes.
    expect(JSON.stringify(noHeader.data)).toBe(JSON.stringify(oldVersion.data));
  });

  /**
   * A variant gated ABOVE the client — the state every variant is in until the
   * app ships its layouts. Distinct from "below the gate" above only in that the
   * client here is a perfectly modern build; what moved is the CMS value.
   */
  test("a variant gated above the client falls back to the default", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel", "2.0.0");
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));

    const body = await fetchConfig(mintToken({ id }), "1.5.0");

    expect(body.data.paywallId).toBe(PAYWALL_ID);
    expect(body.data.title).toBe("VIP सदस्यता");
  });

  /**
   * The gate is CMS data, so opening it is a save, not a deploy: `0.0.0` means
   * no gate and the variant reaches even a client that sends no `app_version`.
   */
  test("a variant gated at 0.0.0 is served without any app_version header", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel", "0.0.0");
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));

    const body = await fetchConfig(mintToken({ id }));

    expect(body.data.paywallId).toBe(VARIANT_PAYWALL_ID);
    expect(body.data.layout).toBe("carousel");
  });

  test("a gated-in app_version gets the bucket's variant", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel");
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));

    const body = await fetchConfig(mintToken({ id }), VARIANT_MIN_APP_VERSION);

    expect(body.data.paywallId).toBe(VARIANT_PAYWALL_ID);
    expect(body.data.layout).toBe("carousel");
    expect(body.data.title).toBe("VARIANT vip-carousel-v1");
    // An image-only hero: no video, and the first image lands in the legacy
    // thumbnail field, which is what the shipped screen renders as a still.
    expect(body.data.videoUrl).toBeNull();
    expect(body.data.videoThumbnailUrl).toBe("https://example.com/vip-carousel-v1-hero.png");
  });

  /**
   * `User.phoneNumber` is nullable — email and admin accounts have none, and an
   * OTP row exists from `send`, before verify. Bucketing has nothing to hash, so
   * these accounts must land on the shipped paywall rather than on whatever an
   * empty seed happens to hash to.
   */
  test("an account with no phone number gets the default paywall", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel");
    const { id } = await seedUserWithoutPhone();

    const body = await fetchConfig(mintToken({ id }), "1.1.0");
    expect(body.data.paywallId).toBe(PAYWALL_ID);
  });

  test("a DISABLED variant falls back to the default — the CMS kill switch", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel");
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));
    await getPrisma().paywallConfig.update({
      where: { paywallId: VARIANT_PAYWALL_ID },
      data: { enabled: false },
    });

    // The gate is OPEN for this client — the only reason to fall back is the
    // kill switch, so this cannot pass vacuously on a version mismatch.
    const body = await fetchConfig(mintToken({ id }), VARIANT_MIN_APP_VERSION);
    expect(body.data.paywallId).toBe(PAYWALL_ID);
  });

  test("a variant in the bucket map with no config row falls back to the default", async () => {
    await seedPaywall(); // no variant rows seeded at all
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));

    const body = await fetchConfig(mintToken({ id }), "1.1.0");
    expect(body.data.paywallId).toBe(PAYWALL_ID);
  });

  test("price and legal links come from the canonical paywall, not the variant", async () => {
    await seedPaywall();
    await seedVariant(VARIANT_PAYWALL_ID, "carousel");
    const { id } = await seedUserWithPhone(phoneFor(VARIANT_PAYWALL_ID));

    const body = await fetchConfig(mintToken({ id }), VARIANT_MIN_APP_VERSION);

    expect(body.data.paywallId).toBe(VARIANT_PAYWALL_ID);
    // The variant seeded NO plans and NO legal links of its own. If either
    // resolved per-variant, these would be empty — an empty plan list routes the
    // app to Home, and empty policy URLs are a legal defect.
    expect(body.data.plans.length).toBeGreaterThan(0);
    expect(body.data.legalLinks.privacyPolicyUrl).toBe(
      "https://prabhuji.example.com/hi/privacy"
    );
  });
});
