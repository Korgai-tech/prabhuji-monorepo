import { afterAll, beforeAll, beforeEach, expect, test, describe } from "vitest";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { PaywallConfigRepository } from "../paywall-config.repository.js";

const repo = new PaywallConfigRepository();

const PAYWALL_ID = "test-paywall-v1";

/**
 * Seed a small fixture directly through Prisma at the top of each test (the
 * seed script lives outside `src/` so we don't import it from tests — this
 * fixture mirrors its structure but is scoped to the integration suite).
 */
async function seedFixture(): Promise<void> {
  const prisma = getPrisma();
  await prisma.paywallConfig.create({
    data: {
      paywallId: PAYWALL_ID,
      enabled: true,
      defaultPlanId: "week",
      shimmerEnabled: true,
      hasVideoLocaleFallback: true,
    },
  });

  // Two plans, one disabled — the enabled one has `hi` + `en` translations,
  // the disabled one has an `en` translation (so we can verify the enabled
  // filter, not the translation join, is what excludes it).
  const enabledPlan = await prisma.paywallPlan.create({
    data: {
      paywallId: PAYWALL_ID,
      planId: "week",
      productId: "product-week",
      period: "week",
      sortOrder: 0,
      enabled: true,
      trialDays: 7,
      translations: {
        // TAM-159: `paywallId` is NOT NULL with a sentinel DEFAULT of
        // `vip-membership-v1`, and the lookup filters on it — so a fixture that
        // relies on the default while its plans live under another paywall id
        // gets no translation back at all.
        create: [
          {
            locale: "hi",
            paywallId: PAYWALL_ID,
            localizedLabel: "साप्ताहिक",
            trialLabel: "7 दिन",
            displayPriceText: "₹99",
            subscriptionDetailText: "नवीनीकरण",
          },
          {
            locale: "en",
            paywallId: PAYWALL_ID,
            localizedLabel: "Weekly",
            trialLabel: "7-day trial",
            displayPriceText: "₹99",
            subscriptionDetailText: "Renews weekly",
          },
        ],
      },
    },
  });
  await prisma.paywallPlan.create({
    data: {
      paywallId: PAYWALL_ID,
      planId: "yearly-disabled",
      productId: "product-year",
      period: "year",
      sortOrder: 99,
      enabled: false,
      trialDays: 0,
      translations: {
        create: [
          {
            locale: "en",
            localizedLabel: "Yearly",
            trialLabel: "",
            displayPriceText: "₹2999",
            subscriptionDetailText: "Renews yearly",
          },
        ],
      },
    },
  });

  await prisma.paywallBenefit.create({
    data: {
      paywallId: PAYWALL_ID,
      benefitId: "mandir",
      icon: "benefit-mandir.png",
      sortOrder: 0,
      enabled: true,
      translations: {
        create: [
          { locale: "hi", localizedName: "मंदिर" },
          { locale: "en", localizedName: "Mandir" },
        ],
      },
    },
  });
  await prisma.paywallBenefit.create({
    data: {
      paywallId: PAYWALL_ID,
      benefitId: "wallpaper-disabled",
      icon: "benefit-wallpaper.png",
      sortOrder: 1,
      enabled: false,
      translations: {
        create: [{ locale: "en", localizedName: "Wallpaper" }],
      },
    },
  });

  await prisma.paywallTranslation.create({
    data: {
      paywallId: PAYWALL_ID,
      locale: "hi",
      title: "VIP",
      videoUrl: "https://example.com/video.mp4",
      videoThumbnailUrl: "https://example.com/thumb.png",
      videoId: "vip_intro_v1",
      cancelAnytimeText: "कभी भी रद्द करें",
      refundPolicyText: "रिफंड",
      payNowCta: "आगे बढ़ें",
    },
  });

  // TAM-159: the hero is an ORDERED per-locale list of its own now — the flat
  // `paywall_translations.video_*` columns above are dead data the wire ignores.
  // Seeded out of order so `orderBy: sortOrder` is what makes the read
  // deterministic, not insertion order.
  await prisma.paywallHeroMedia.createMany({
    data: [
      {
        paywallId: PAYWALL_ID,
        locale: "hi",
        sortOrder: 1,
        mediaType: "image",
        url: "https://example.com/hero-b.png",
        thumbnailUrl: null,
        mediaId: "hero_b",
      },
      {
        paywallId: PAYWALL_ID,
        locale: "hi",
        sortOrder: 0,
        mediaType: "image",
        url: "https://example.com/hero-a.png",
        thumbnailUrl: null,
        mediaId: "hero_a",
      },
    ],
  });

  await prisma.paywallLegalLinks.create({
    data: {
      paywallId: PAYWALL_ID,
      locale: "hi",
      privacyPolicyUrl: "https://prabhuji.example.com/privacy",
      termsServiceUrl: "https://prabhuji.example.com/terms",
      refundPolicyUrl: "https://prabhuji.example.com/refund",
    },
  });

  // Silence unused var warning while still keeping the reference for future
  // asserts.
  void enabledPlan;
}

async function truncateAll(): Promise<void> {
  const prisma = getPrisma();
  // Order matters — cascade FKs handle translations, but delete parents so
  // the enable-flag counters stay honest across tests.
  await prisma.paywallLegalLinks.deleteMany({});
  // Unique on (paywallId, locale, sortOrder) — leftovers collide with the next
  // test's seed rather than failing the test that created them.
  await prisma.paywallHeroMedia.deleteMany({});
  await prisma.paywallTranslation.deleteMany({});
  await prisma.paywallBenefit.deleteMany({});
  await prisma.paywallPlan.deleteMany({});
  await prisma.paywallConfig.deleteMany({});
}

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await disconnectPrisma();
  await stopTestDb();
});

beforeEach(async () => {
  await truncateAll();
  await seedFixture();
});

describe("PaywallConfigRepository.findConfig", () => {
  test("returns the config row shaped as RawPaywallConfig", async () => {
    const cfg = await repo.findConfig(PAYWALL_ID);
    expect(cfg).not.toBeNull();
    expect(cfg?.paywallId).toBe(PAYWALL_ID);
    expect(cfg?.defaultPlanId).toBe("week");
    expect(cfg?.enabled).toBe(true);
    expect(cfg?.shimmerEnabled).toBe(true);
    expect(cfg?.hasVideoLocaleFallback).toBe(true);
    expect(cfg?.configVersion).toBe(1);
    expect(cfg?.createdAt).toBeInstanceOf(Date);
    expect(cfg?.updatedAt).toBeInstanceOf(Date);
  });

  /**
   * The fixture above sets neither column, so these are the DB defaults — and
   * they are the values every pre-TAM-159 row was migrated to. `card_hero` is
   * the shipped screen and `0.0.0` means NO version gate: a default that gated
   * anything would have made every existing paywall unreachable the moment the
   * migration ran.
   */
  test("layout and minAppVersion default to the shipped, ungated paywall", async () => {
    const cfg = await repo.findConfig(PAYWALL_ID);
    expect(cfg?.layout).toBe("card_hero");
    expect(cfg?.minAppVersion).toBe("0.0.0");
  });

  test("carries a variant's own layout and version gate through unchanged", async () => {
    await getPrisma().paywallConfig.create({
      data: {
        paywallId: "test-carousel-v1",
        layout: "carousel",
        minAppVersion: "1.1.0",
        enabled: true,
        shimmerEnabled: true,
      },
    });

    const cfg = await repo.findConfig("test-carousel-v1");
    expect(cfg?.layout).toBe("carousel");
    // A STRING, never coerced: the comparison is a numeric-tuple parse done in
    // `meetsMinVersion`, and a number here would lose the patch component.
    expect(cfg?.minAppVersion).toBe("1.1.0");
  });

  test("returns null for an unknown paywallId", async () => {
    const cfg = await repo.findConfig("nope");
    expect(cfg).toBeNull();
  });
});

describe("PaywallConfigRepository.findHeroMedia", () => {
  test("returns one locale's hero rows in render order", async () => {
    const rows = await repo.findHeroMedia(PAYWALL_ID, "hi");

    expect(rows.map((r) => r.mediaId)).toEqual(["hero_a", "hero_b"]);
    expect(rows[0]).toMatchObject({
      locale: "hi",
      sortOrder: 0,
      mediaType: "image",
      thumbnailUrl: null,
    });
  });

  /** Empty is a valid answer, not an error — the service walks the locale chain. */
  test("returns an empty list for a locale with no hero", async () => {
    expect(await repo.findHeroMedia(PAYWALL_ID, "bn")).toEqual([]);
  });
});

describe("PaywallConfigRepository.findEnabledPlansWithTranslations", () => {
  test("returns only enabled plans, ordered by sortOrder, with the requested locale", async () => {
    const plans = await repo.findEnabledPlansWithTranslations(PAYWALL_ID, "hi", PAYWALL_ID);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.planId).toBe("week");
    expect(plans[0]?.enabled).toBe(true);
    expect(plans[0]?.trialDays).toBe(7);
    expect(plans[0]?.translation?.locale).toBe("hi");
    expect(plans[0]?.translation?.localizedLabel).toBe("साप्ताहिक");
  });

  test("returns a plan with translation=null when the locale is unknown", async () => {
    const plans = await repo.findEnabledPlansWithTranslations(PAYWALL_ID, "bn", PAYWALL_ID);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.translation).toBeNull();
  });

  test("returns an empty array for an unknown paywallId", async () => {
    const plans = await repo.findEnabledPlansWithTranslations("nope", "hi", "nope");
    expect(plans).toEqual([]);
  });
});

describe("PaywallConfigRepository.findEnabledBenefitsWithTranslations", () => {
  test("excludes disabled benefits", async () => {
    const benefits = await repo.findEnabledBenefitsWithTranslations(PAYWALL_ID, "en");
    expect(benefits).toHaveLength(1);
    expect(benefits[0]?.benefitId).toBe("mandir");
    expect(benefits[0]?.translation?.localizedName).toBe("Mandir");
  });

  test("returns benefit with translation=null for an unknown locale", async () => {
    const benefits = await repo.findEnabledBenefitsWithTranslations(PAYWALL_ID, "ta");
    expect(benefits).toHaveLength(1);
    expect(benefits[0]?.translation).toBeNull();
  });
});

describe("PaywallConfigRepository.findTranslation", () => {
  test("returns the paywall-shell row for a known locale", async () => {
    const t = await repo.findTranslation(PAYWALL_ID, "hi");
    expect(t).not.toBeNull();
    expect(t?.title).toBe("VIP");
    expect(t?.videoUrl).toBe("https://example.com/video.mp4");
  });

  test("returns null when the locale doesn't exist", async () => {
    const t = await repo.findTranslation(PAYWALL_ID, "bn");
    expect(t).toBeNull();
  });
});

describe("PaywallConfigRepository.findLegalLinks", () => {
  test("returns the legal-links row for a known locale", async () => {
    const l = await repo.findLegalLinks(PAYWALL_ID, "hi");
    expect(l).not.toBeNull();
    expect(l?.privacyPolicyUrl).toContain("privacy");
  });

  test("returns null when the locale doesn't exist", async () => {
    const l = await repo.findLegalLinks(PAYWALL_ID, "bn");
    expect(l).toBeNull();
  });
});
