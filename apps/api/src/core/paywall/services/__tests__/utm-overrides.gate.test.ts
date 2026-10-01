import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import type { PaywallUtmOverrideRepository } from "@api/core/paywall/repositories";
import type { PaywallOverride } from "@api/core/paywall/services/paywall-override.types";
import { resolvePaywallId } from "../paywall.buckets.js";
import type {
  RawBenefit,
  RawHeroMedia,
  RawLegalLinks,
  RawPaywallConfig,
  RawPlan,
  RawTranslation,
} from "../config.types.js";

/**
 * The enabled-row gate and the ad-group bypass, end to end through
 * `getPaywallConfig`.
 *
 * `resolveOverride` is private and the gate is the whole point of this file: the
 * assertion that matters is not "the response is unmodified" but that the
 * REFERRAL LOOKUP NEVER HAPPENS when no campaign is live. A gate that still paid
 * for the outbound call and then discarded the answer would pass a response-
 * shape assertion while quietly costing every paywall open a round trip.
 *
 * `enabled` is filtered in the QUERY, so a disabled campaign is modelled here by
 * ABSENCE from the fake's map — which is exactly what `findEnabledRows` returns
 * for one, and why nothing downstream re-checks the column.
 */
const fetchLatestUtmGroup = vi.fn<(userId: string) => Promise<string | null>>();
vi.mock("@api/shared/analytics", () => ({
  fetchLatestUtmGroup: (userId: string) => fetchLatestUtmGroup(userId),
}));

const { PaywallService } = await import("../paywall.service.js");

/**
 * Stands in for `PaywallUtmOverrideRepository`. A fake rather than a `vi.mock`
 * of the module, because the repository is INJECTED — mocking the module would
 * also hide the wiring this file is here to exercise.
 */
const overrides = new Map<string, PaywallOverride>();
const findEnabledRows = vi.fn(() =>
  Promise.resolve(
    Array.from(overrides, ([utmGroup, override]) => ({ utmGroup, overrides: override }))
  )
);
const fakeRepo = { findEnabledRows } as unknown as PaywallUtmOverrideRepository;

const CONFIG: RawPaywallConfig = {
  id: "cfg-1",
  paywallId: "vip-membership-v1",
  configVersion: 3,
  enabled: true,
  defaultPlanId: "month",
  shimmerEnabled: true,
  hasVideoLocaleFallback: true,
  layout: "card_hero",
  minAppVersion: "0.0.0",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const TRANSLATION: RawTranslation = {
  id: "t-hi",
  paywallId: "vip-membership-v1",
  locale: "hi",
  title: "VIP",
  videoUrl: null,
  videoThumbnailUrl: null,
  videoId: null,
  cancelAnytimeText: "कभी भी रद्द करें",
  refundPolicyText: "रिफंड",
  payNowCta: "आगे बढ़ें",
};

const HERO: RawHeroMedia = {
  paywallId: "vip-membership-v1",
  locale: "hi",
  sortOrder: 0,
  mediaType: "video",
  url: "https://cdn/original.mp4",
  thumbnailUrl: "https://cdn/original.png",
  mediaId: "original_v1",
};

const LEGAL: RawLegalLinks = {
  id: "l-hi",
  paywallId: "vip-membership-v1",
  locale: "hi",
  privacyPolicyUrl: "https://example.com/privacy",
  termsServiceUrl: "https://example.com/terms",
  refundPolicyUrl: "https://example.com/refund",
};

const PLAN: RawPlan = {
  id: "plan-month",
  paywallId: "vip-membership-v1",
  planId: "month",
  productId: "prod_month",
  period: "month",
  sortOrder: 0,
  enabled: true,
  trialDays: 3,
  translation: {
    locale: "hi",
    paywallId: "vip-membership-v1",
    localizedLabel: "मासिक",
    trialLabel: "3 दिन",
    displayPriceText: "₹99",
    subscriptionDetailText: "हर महीने",
  },
};

const BENEFIT: RawBenefit = {
  id: "b-1",
  paywallId: "vip-membership-v1",
  benefitId: "downloads",
  icon: "download",
  sortOrder: 0,
  enabled: true,
  translation: { locale: "hi", localizedName: "डाउनलोड" },
};

function makeService(): InstanceType<typeof PaywallService> {
  const mock = {
    getConfig: vi.fn().mockResolvedValue(CONFIG),
    getEnabledPlans: vi
      .fn()
      .mockImplementation(({ locale }: { locale: string }) =>
        Promise.resolve(locale === "hi" ? [PLAN] : [])
      ),
    getEnabledBenefits: vi
      .fn()
      .mockImplementation(({ locale }: { locale: string }) =>
        Promise.resolve(locale === "hi" ? [BENEFIT] : [])
      ),
    getTranslation: vi
      .fn()
      .mockImplementation(({ locale }: { locale: string }) =>
        Promise.resolve(locale === "hi" ? TRANSLATION : null)
      ),
    getLegalLinks: vi
      .fn()
      .mockImplementation(({ locale }: { locale: string }) =>
        Promise.resolve(locale === "hi" ? LEGAL : null)
      ),
    getHeroMedia: vi
      .fn()
      .mockImplementation(({ locale }: { locale: string }) =>
        Promise.resolve(locale === "hi" ? [HERO] : [])
      ),
    invalidate: vi.fn(),
  };
  return new PaywallService(mock, undefined, undefined, fakeRepo);
}

const CAMPAIGN: PaywallOverride = {
  locales: {
    hi: {
      media: {
        mediaType: "video",
        url: "https://cdn/diwali.mp4",
        thumbnailUrl: "https://cdn/diwali.png",
        mediaId: "diwali_v1",
      },
      benefits: [
        { benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" },
      ],
    },
  },
};

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "dev-pepper-for-tests-only-not-secret-32ch";
  process.env.MEDIA_BUCKET = "test-bucket";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example.com";
  fetchLatestUtmGroup.mockReset().mockResolvedValue("Diwali - Hindi - Video");
  findEnabledRows.mockClear();
  overrides.clear();
  overrides.set("Diwali - Hindi - Video", CAMPAIGN);
});

afterEach(() => {
  resetEnvCache();
  clearGlobalServices();
});

/**
 * Bucketing reads the phone from the USER TABLE via the users facade. Register a
 * fake so the resolver has something to bucket on; `phoneNumber: null` models an
 * account with none.
 */
function stubUser(phoneNumber: string | null): void {
  registerGlobalService("users", {
    getUserPublic: () =>
      Promise.resolve({
        id: "u-1",
        name: null,
        selectedLanguage: null,
        onboardingCompletedAt: null,
        phoneCountryCode: phoneNumber === null ? null : "+91",
        phoneNumber,
      }),
    getRole: () => Promise.resolve("user"),
    getRazorpayCustomerId: () => Promise.resolve(null),
    rememberRazorpayCustomerId: () => Promise.resolve(),
  } as never);
}

/** A number whose last two digits bucket into a NON-default paywall. */
function phoneInAVariantBucket(): string {
  for (let i = 0; i < 5000; i += 1) {
    const candidate = `9${String(i).padStart(9, "0")}`;
    if (resolvePaywallId(candidate) !== "vip-membership-v1") return candidate;
  }
  throw new Error("no variant bucket found — is BUCKETS all default?");
}

/** What the CMS does when an editor clears `enabled` on the last live campaign. */
function disableEveryCampaign(): void {
  overrides.clear();
}

describe("the CMS enabled toggle is the whole switch", () => {
  it("serves the campaign creative while a row is enabled", async () => {
    const out = await makeService().getPaywallConfig({ locale: "hi", userId: "u-1" });

    expect(out.videoUrl).toBe("https://cdn/diwali.mp4");
    expect(out.benefits).toEqual([
      {
        benefitId: "mandir",
        icon: "benefit-mandir.png",
        localizedName: "हनुमान मंदिर",
        sortOrder: 0,
      },
    ]);
    // The paywall id is NOT editable — a campaign is a different dressing of
    // the default paywall, never a different paywall.
    expect(out.paywallId).toBe("vip-membership-v1");
    expect(fetchLatestUtmGroup).toHaveBeenCalledWith("u-1");
  });

  it("serves the stored paywall untouched once every campaign is disabled", async () => {
    disableEveryCampaign();

    const out = await makeService().getPaywallConfig({ locale: "hi", userId: "u-1" });

    expect(out.videoUrl).toBe("https://cdn/original.mp4");
    expect(out.benefits[0]?.benefitId).toBe("downloads");
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  /** The gate has to come BEFORE the outbound call, not after it. */
  it("makes no referral lookup when no campaign is enabled", async () => {
    disableEveryCampaign();

    await makeService().getPaywallConfig({ locale: "hi", userId: "u-1" });

    expect(fetchLatestUtmGroup).not.toHaveBeenCalled();
  });

  it("caches the ad group per user rather than re-asking upstream", async () => {
    const service = makeService();

    await service.getPaywallConfig({ locale: "hi", userId: "u-1" });
    await service.getPaywallConfig({ locale: "hi", userId: "u-1" });

    expect(fetchLatestUtmGroup).toHaveBeenCalledTimes(1);
  });

  /**
   * Disabling the last campaign has to reach live traffic the way any other CMS
   * write does — on the next request, through the same invalidation — because it
   * is now the only way to turn this feature off. There is no env var to flip and
   * no task to restart.
   */
  it("returns to the untouched paywall on the next request after a disable", async () => {
    const service = makeService();

    expect((await service.getPaywallConfig({ locale: "hi", userId: "u-1" })).videoUrl).toBe(
      "https://cdn/diwali.mp4"
    );

    disableEveryCampaign();
    service.invalidateUtmOverrides();

    expect((await service.getPaywallConfig({ locale: "hi", userId: "u-2" })).videoUrl).toBe(
      "https://cdn/original.mp4"
    );
  });
});

/**
 * An ad campaign REPLACES the phone-number A/B test rather than layering on it.
 *
 * The creative was signed off against one screen. If the campaign patched
 * whatever variant the user's phone bucketed into, the same ad would render
 * inside `video_bleed` for a quarter of arrivals and `icon_grid` for another —
 * neither a working campaign nor a readable experiment.
 */
describe("an ad arrival bypasses the phone bucket", () => {
  it("serves the DEFAULT shell to a user whose phone buckets into a variant", async () => {
    const phone = phoneInAVariantBucket();
    stubUser(phone);
    // Precondition: this number really would have been bucketed away from the default.
    expect(resolvePaywallId(phone)).not.toBe("vip-membership-v1");

    const out = await makeService().getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.1.0",
    });

    expect(out.layout).toBe("card_hero");
    expect(out.videoUrl).toBe("https://cdn/diwali.mp4");
    // The DEFAULT paywall id, not the variant this phone buckets into.
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  it("still buckets a user who did NOT come from a configured ad", async () => {
    fetchLatestUtmGroup.mockResolvedValue(null); // organic touch
    const phone = phoneInAVariantBucket();
    stubUser(phone);

    const out = await makeService().getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "9.9.9",
    });

    expect(out.paywallId).toBe(resolvePaywallId(phone));
  });

  it("buckets an ad arrival whose ad group is not configured", async () => {
    fetchLatestUtmGroup.mockResolvedValue("Some Unconfigured Group");
    const phone = phoneInAVariantBucket();
    stubUser(phone);

    const out = await makeService().getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "9.9.9",
    });

    expect(out.paywallId).toBe(resolvePaywallId(phone));
  });

  it("buckets everyone once every campaign is disabled, ad or not", async () => {
    disableEveryCampaign();
    const phone = phoneInAVariantBucket();
    stubUser(phone);

    const out = await makeService().getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "9.9.9",
    });

    expect(out.paywallId).toBe(resolvePaywallId(phone));
  });

  /**
   * The bypass skips `resolveVariantPaywallId` entirely, so the ad path costs one
   * query LESS than the organic one rather than one more.
   */
  it("does not read the user at all on the ad path", async () => {
    const getUserPublic = vi.fn();
    registerGlobalService("users", { getUserPublic } as never);

    await makeService().getPaywallConfig({ locale: "hi", userId: "u-1" });

    expect(getUserPublic).not.toHaveBeenCalled();
  });
});

/**
 * The override set now comes from a table, so the failure modes the file map
 * used to make impossible have to be handled instead of assumed away.
 */
describe("the ad-group index is a cached database read", () => {
  it("loads the index once and serves later requests from cache", async () => {
    const service = makeService();

    await service.getPaywallConfig({ locale: "hi", userId: "u-1" });
    await service.getPaywallConfig({ locale: "hi", userId: "u-2" });

    expect(findEnabledRows).toHaveBeenCalledTimes(1);
  });

  /** A CMS write must show up without waiting out the TTL on this task. */
  it("reloads after invalidateUtmOverrides", async () => {
    const service = makeService();

    await service.getPaywallConfig({ locale: "hi", userId: "u-1" });
    service.invalidateUtmOverrides();
    await service.getPaywallConfig({ locale: "hi", userId: "u-2" });

    expect(findEnabledRows).toHaveBeenCalledTimes(2);
  });

  /**
   * A database that is refusing connections must produce the ordinary paywall,
   * never a 500 — this endpoint is the purchase screen.
   */
  it("serves the stored paywall when the override read throws", async () => {
    findEnabledRows.mockRejectedValueOnce(new Error("connection refused"));

    const out = await makeService().getPaywallConfig({ locale: "hi", userId: "u-1" });

    expect(out.paywallId).toBe("vip-membership-v1");
    expect(out.videoUrl).toBe("https://cdn/original.mp4");
    // The failure is cached as an empty index, so a database outage costs one
    // query per TTL rather than one per paywall open.
    expect(fetchLatestUtmGroup).not.toHaveBeenCalled();
  });

  /** An anonymous caller has no attribution to read and must not be charged for one. */
  it("makes no lookup at all without a userId", async () => {
    const out = await makeService().getPaywallConfig({ locale: "hi" });

    expect(findEnabledRows).not.toHaveBeenCalled();
    expect(fetchLatestUtmGroup).not.toHaveBeenCalled();
    expect(out.paywallId).toBe("vip-membership-v1");
  });
});
