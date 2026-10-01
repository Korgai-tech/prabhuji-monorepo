import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type { PaywallConfigRepository } from "@api/core/paywall/repositories";
import {
  DbPaywallConfigProvider,
  keyForBenefits,
  keyForConfig,
  keyForHeroMedia,
  keyForLegal,
  keyForPlans,
  keyForTranslation,
} from "../config.provider.js";
import { PaywallLruCache } from "../cache.js";
import type {
  RawBenefit,
  RawHeroMedia,
  RawLegalLinks,
  RawPaywallConfig,
  RawPlan,
  RawTranslation,
} from "../config.types.js";

/**
 * Repo mock: each method is a `vi.fn()` typed as `Mock`, then the object is
 * cast to the `PaywallConfigRepository` interface. Individual tests set
 * return values via `.mockResolvedValue(...)` on the Mock references we hold
 * onto locally.
 */
interface RepoMock {
  findConfig: Mock;
  findEnabledPlansWithTranslations: Mock;
  findEnabledBenefitsWithTranslations: Mock;
  findTranslation: Mock;
  findLegalLinks: Mock;
  findHeroMedia: Mock;
}

function makeRepoMock(): { mock: RepoMock; repo: PaywallConfigRepository } {
  const mock: RepoMock = {
    findConfig: vi.fn(),
    findEnabledPlansWithTranslations: vi.fn(),
    findEnabledBenefitsWithTranslations: vi.fn(),
    findTranslation: vi.fn(),
    findLegalLinks: vi.fn(),
    findHeroMedia: vi.fn(),
  };
  // The mock's method shapes match the interface Prisma-typed methods 1:1 at
  // runtime; we can't structurally satisfy the class type without dropping
  // through `unknown` because `Mock` isn't assignable to the concrete
  // Promise-returning method type.
  const repo = mock as unknown as PaywallConfigRepository;
  return { mock, repo };
}

const CONFIG: RawPaywallConfig = {
  id: "cfg-1",
  paywallId: "vip-membership-v1",
  configVersion: 1,
  enabled: true,
  defaultPlanId: "week",
  shimmerEnabled: true,
  hasVideoLocaleFallback: true,
  layout: "card_hero",
  minAppVersion: "0.0.0",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const PLANS: RawPlan[] = [
  {
    id: "plan-1",
    paywallId: "vip-membership-v1",
    planId: "week",
    productId: "prabhuji_vip_week",
    period: "week",
    sortOrder: 0,
    enabled: true,
    trialDays: 7,
    translation: null,
  },
];

const BENEFITS: RawBenefit[] = [
  {
    id: "b-1",
    paywallId: "vip-membership-v1",
    benefitId: "mandir",
    icon: "benefit-mandir.png",
    sortOrder: 0,
    enabled: true,
    translation: null,
  },
];

const HERO: RawHeroMedia[] = [
  {
    paywallId: "vip-membership-v1",
    locale: "hi",
    sortOrder: 0,
    mediaType: "video",
    url: "https://example.com/hero.mp4",
    thumbnailUrl: "https://example.com/hero.png",
    mediaId: "vip_intro_v1",
  },
];

const TRANSLATION: RawTranslation = {
  id: "t-1",
  paywallId: "vip-membership-v1",
  locale: "en",
  title: "Unlock VIP",
  videoUrl: null,
  videoThumbnailUrl: null,
  videoId: null,
  cancelAnytimeText: "Cancel anytime",
  refundPolicyText: "Refund",
  payNowCta: "Continue",
};

const LEGAL: RawLegalLinks = {
  id: "l-1",
  paywallId: "vip-membership-v1",
  locale: "en",
  privacyPolicyUrl: "https://prabhuji.example.com/privacy",
  termsServiceUrl: "https://prabhuji.example.com/terms",
  refundPolicyUrl: "https://prabhuji.example.com/refund",
};

let mock: RepoMock;
let repo: PaywallConfigRepository;
let cache: PaywallLruCache;
let provider: DbPaywallConfigProvider;

beforeEach(() => {
  const built = makeRepoMock();
  mock = built.mock;
  repo = built.repo;
  cache = new PaywallLruCache();
  provider = new DbPaywallConfigProvider(repo, cache);
});

describe("cache key helpers", () => {
  test("produce deterministic, unambiguous prefixes", () => {
    expect(keyForConfig("vip")).toBe("config:vip");
    expect(keyForPlans("vip", "hi")).toBe("plans:vip:hi");
    expect(keyForBenefits("vip", "hi")).toBe("benefits:vip:hi");
    expect(keyForTranslation("vip", "hi")).toBe("translation:vip:hi");
    expect(keyForLegal("vip", "hi")).toBe("legal:vip:hi");
    expect(keyForHeroMedia("vip", "hi")).toBe("hero:vip:hi");
  });
});

describe("DbPaywallConfigProvider.getConfig", () => {
  test("caches the first read; second call is a hit", async () => {
    mock.findConfig.mockResolvedValue(CONFIG);
    const a = await provider.getConfig({ paywallId: "vip-membership-v1" });
    const b = await provider.getConfig({ paywallId: "vip-membership-v1" });
    expect(a).toEqual(CONFIG);
    expect(b).toEqual(CONFIG);
    expect(mock.findConfig).toHaveBeenCalledTimes(1);
  });

  test("caches null result (unknown paywall stays known-empty)", async () => {
    mock.findConfig.mockResolvedValue(null);
    const a = await provider.getConfig({ paywallId: "missing" });
    const b = await provider.getConfig({ paywallId: "missing" });
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(mock.findConfig).toHaveBeenCalledTimes(1);
  });
});

describe("DbPaywallConfigProvider.getEnabledPlans / Benefits / …", () => {
  test("plans are cached per (paywallId, locale)", async () => {
    mock.findEnabledPlansWithTranslations.mockResolvedValue(PLANS);
    await provider.getEnabledPlans({ paywallId: "vip-membership-v1", locale: "hi" });
    await provider.getEnabledPlans({ paywallId: "vip-membership-v1", locale: "hi" });
    expect(mock.findEnabledPlansWithTranslations).toHaveBeenCalledTimes(1);
    // A different locale is a different cache key.
    await provider.getEnabledPlans({ paywallId: "vip-membership-v1", locale: "en" });
    expect(mock.findEnabledPlansWithTranslations).toHaveBeenCalledTimes(2);
  });

  test("benefits + translation + legal + hero are cached independently", async () => {
    mock.findEnabledBenefitsWithTranslations.mockResolvedValue(BENEFITS);
    mock.findTranslation.mockResolvedValue(TRANSLATION);
    mock.findLegalLinks.mockResolvedValue(LEGAL);
    mock.findHeroMedia.mockResolvedValue(HERO);

    await provider.getEnabledBenefits({ paywallId: "vip-membership-v1", locale: "hi" });
    await provider.getEnabledBenefits({ paywallId: "vip-membership-v1", locale: "hi" });
    await provider.getTranslation({ paywallId: "vip-membership-v1", locale: "en" });
    await provider.getTranslation({ paywallId: "vip-membership-v1", locale: "en" });
    await provider.getLegalLinks({ paywallId: "vip-membership-v1", locale: "en" });
    await provider.getLegalLinks({ paywallId: "vip-membership-v1", locale: "en" });
    await provider.getHeroMedia({ paywallId: "vip-membership-v1", locale: "hi" });
    await provider.getHeroMedia({ paywallId: "vip-membership-v1", locale: "hi" });

    expect(mock.findEnabledBenefitsWithTranslations).toHaveBeenCalledTimes(1);
    expect(mock.findTranslation).toHaveBeenCalledTimes(1);
    expect(mock.findLegalLinks).toHaveBeenCalledTimes(1);
    expect(mock.findHeroMedia).toHaveBeenCalledTimes(1);
  });
});

describe("DbPaywallConfigProvider.invalidate", () => {
  /**
   * Every key SHAPE has to be swept. A prefix missing from `invalidate` does not
   * fail loudly — it serves that one slice stale for up to the 5-minute TTL,
   * which reads as "the CMS save didn't take" and gets diagnosed as a caching
   * bug days later. The hero list is the newest shape and therefore the likeliest
   * to be forgotten.
   */
  test("clears every cached key for the paywall id", async () => {
    mock.findConfig.mockResolvedValue(CONFIG);
    mock.findEnabledPlansWithTranslations.mockResolvedValue(PLANS);
    mock.findEnabledBenefitsWithTranslations.mockResolvedValue(BENEFITS);
    mock.findTranslation.mockResolvedValue(TRANSLATION);
    mock.findLegalLinks.mockResolvedValue(LEGAL);
    mock.findHeroMedia.mockResolvedValue(HERO);

    // Warm every key kind × two locales.
    await provider.getConfig({ paywallId: "vip-membership-v1" });
    for (const locale of ["hi", "en"]) {
      await provider.getEnabledPlans({ paywallId: "vip-membership-v1", locale });
      await provider.getEnabledBenefits({ paywallId: "vip-membership-v1", locale });
      await provider.getTranslation({ paywallId: "vip-membership-v1", locale });
      await provider.getLegalLinks({ paywallId: "vip-membership-v1", locale });
      await provider.getHeroMedia({ paywallId: "vip-membership-v1", locale });
    }
    // Sanity: 1 (config) + 5 kinds × 2 locales = 11 entries cached.
    expect(cache.size()).toBe(11);

    provider.invalidate({ paywallId: "vip-membership-v1" });
    expect(cache.size()).toBe(0);

    // Next call re-hits the repo.
    await provider.getConfig({ paywallId: "vip-membership-v1" });
    expect(mock.findConfig).toHaveBeenCalledTimes(2);
  });

  test("invalidate leaves other paywall ids untouched", async () => {
    mock.findConfig.mockResolvedValueOnce(CONFIG);
    mock.findConfig.mockResolvedValueOnce({ ...CONFIG, paywallId: "other" });
    await provider.getConfig({ paywallId: "vip-membership-v1" });
    await provider.getConfig({ paywallId: "other" });
    expect(cache.size()).toBe(2);

    provider.invalidate({ paywallId: "vip-membership-v1" });
    expect(cache.size()).toBe(1);
    // The "other" key still hits (no repo call).
    await provider.getConfig({ paywallId: "other" });
    expect(mock.findConfig).toHaveBeenCalledTimes(2);
  });
});
