import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import type { PaywallConfigProvider } from "../config.provider.js";
import {
  PaywallService,
  legacyVideoFields,
  uniqueFallbackChain,
} from "../paywall.service.js";
import { resolvePaywallId } from "../paywall.buckets.js";
import { PaywallLruCache } from "../cache.js";
import type {
  RawBenefit,
  RawHeroMedia,
  RawLegalLinks,
  RawPaywallConfig,
  RawPlan,
  RawTranslation,
} from "../config.types.js";
import { AppError } from "@api/shared/errors";
import { resetEnvCache } from "@api/shared/config";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";

/**
 * Provider mock — one `vi.fn()` per method, then cast to the interface.
 * Tests set locale-specific return values via `mockImplementation` so we
 * can simulate "hi exists, mr doesn't" per method.
 */
interface ProviderMock {
  getConfig: Mock;
  getEnabledPlans: Mock;
  getEnabledBenefits: Mock;
  getTranslation: Mock;
  getLegalLinks: Mock;
  getHeroMedia: Mock;
  invalidate: Mock;
}

function makeProviderMock(): {
  mock: ProviderMock;
  provider: PaywallConfigProvider;
} {
  const mock: ProviderMock = {
    getConfig: vi.fn(),
    getEnabledPlans: vi.fn(),
    getEnabledBenefits: vi.fn(),
    getTranslation: vi.fn(),
    getLegalLinks: vi.fn(),
    getHeroMedia: vi.fn(),
    invalidate: vi.fn(),
  };
  const provider = mock as unknown as PaywallConfigProvider;
  return { mock, provider };
}

const CONFIG: RawPaywallConfig = {
  id: "cfg-1",
  paywallId: "vip-membership-v1",
  configVersion: 3,
  enabled: true,
  defaultPlanId: "week",
  shimmerEnabled: true,
  hasVideoLocaleFallback: true,
  layout: "card_hero",
  // The DEFAULT paywall is ungated: every build contains its screen, and the
  // resolver never version-checks it anyway.
  minAppVersion: "0.0.0",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const TRANSLATION_HI: RawTranslation = {
  id: "t-hi",
  paywallId: "vip-membership-v1",
  locale: "hi",
  title: "VIP",
  videoUrl: "https://cdn/hi.mp4",
  videoThumbnailUrl: "https://cdn/hi.png",
  videoId: "vid-hi",
  cancelAnytimeText: "कभी भी रद्द करें",
  refundPolicyText: "रिफंड",
  payNowCta: "आगे बढ़ें",
};

const TRANSLATION_EN: RawTranslation = {
  ...TRANSLATION_HI,
  id: "t-en",
  locale: "en",
  title: "VIP",
  cancelAnytimeText: "Cancel anytime",
  refundPolicyText: "Refund",
  payNowCta: "Continue",
};

/**
 * TAM-159. The hero row the flat `videoUrl`/`videoThumbnailUrl`/`videoId` triple
 * is now DERIVED from — those three no longer come from the translation row.
 * Kept value-identical to `TRANSLATION_HI`'s old video columns so the legacy
 * assertions below still pin the exact bytes an old client receives.
 */
const HERO_VIDEO_HI: RawHeroMedia = {
  paywallId: "vip-membership-v1",
  locale: "hi",
  sortOrder: 0,
  mediaType: "video",
  url: "https://cdn/hi.mp4",
  thumbnailUrl: "https://cdn/hi.png",
  mediaId: "vid-hi",
};

const LEGAL_HI: RawLegalLinks = {
  id: "l-hi",
  paywallId: "vip-membership-v1",
  locale: "hi",
  privacyPolicyUrl: "https://example.com/privacy",
  termsServiceUrl: "https://example.com/terms",
  refundPolicyUrl: "https://example.com/refund",
};

function planWithTranslation(planId: string, locale: string | null): RawPlan {
  return {
    id: `plan-${planId}-${locale ?? "none"}`,
    paywallId: "vip-membership-v1",
    planId,
    productId: `product-${planId}`,
    period: "week",
    sortOrder: 0,
    enabled: true,
    trialDays: 7,
    translation:
      locale === null
        ? null
        : {
            locale,
            paywallId: "vip-membership-v1",
            localizedLabel: `label-${locale}`,
            trialLabel: `trial-${locale}`,
            displayPriceText: "₹99",
            subscriptionDetailText: `sub-${locale}`,
          },
  };
}

function benefitWithTranslation(
  benefitId: string,
  locale: string | null
): RawBenefit {
  return {
    id: `benefit-${benefitId}-${locale ?? "none"}`,
    paywallId: "vip-membership-v1",
    benefitId,
    icon: `${benefitId}.png`,
    sortOrder: 0,
    enabled: true,
    translation:
      locale === null
        ? null
        : { locale, localizedName: `name-${locale}` },
  };
}

let mock: ProviderMock;
let provider: PaywallConfigProvider;
let service: PaywallService;

beforeEach(() => {
  const built = makeProviderMock();
  mock = built.mock;
  provider = built.provider;
  service = new PaywallService(provider, new PaywallLruCache());
});

describe("uniqueFallbackChain", () => {
  test("mr → [mr, hi, en]", () => {
    expect(uniqueFallbackChain("mr")).toEqual(["mr", "hi", "en"]);
  });

  test("hi → [hi, en] (dedupes)", () => {
    expect(uniqueFallbackChain("hi")).toEqual(["hi", "en"]);
  });

  test("en → [en, hi] (fallback chain applies even for the final locale)", () => {
    // `en` isn't accepted from clients (not in `LanguageCodeSchema`), so this
    // path is theoretical — but the helper stays symmetric: it still walks
    // the [requested, hi, en] template and de-dupes, which leaves [en, hi]
    // when `en` is the request.
    expect(uniqueFallbackChain("en")).toEqual(["en", "hi"]);
  });
});

describe("PaywallService.getPaywallConfig — happy path", () => {
  test("requested locale served when everything exists", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? TRANSLATION_HI : null)
    );
    mock.getLegalLinks.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? LEGAL_HI : null)
    );
    mock.getEnabledPlans.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve([
        planWithTranslation("week", locale === "hi" ? "hi" : null),
      ])
    );
    mock.getEnabledBenefits.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve([
        benefitWithTranslation("mandir", locale === "hi" ? "hi" : null),
      ])
    );
    mock.getHeroMedia.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? [HERO_VIDEO_HI] : [])
    );

    const out = await service.getPaywallConfig({ locale: "hi" });

    expect(out.paywallId).toBe("vip-membership-v1");
    expect(out.configVersion).toBe(3);
    expect(out.localeRequested).toBe("hi");
    expect(out.localeServed).toBe("hi");
    expect(out.fallbackUsed).toBe(false);
    expect(out.fallbackFrom).toBeNull();
    expect(out.missingFields).toEqual([]);
    expect(out.title).toBe("VIP");
    expect(out.videoUrl).toBe("https://cdn/hi.mp4");
    expect(out.plans).toHaveLength(1);
    expect(out.plans[0]?.planId).toBe("week");
    expect(out.plans[0]?.localizedLabel).toBe("label-hi");
    expect(out.benefits).toHaveLength(1);
    expect(out.benefits[0]?.localizedName).toBe("name-hi");
    expect(out.legalLinks.privacyPolicyUrl).toBe("https://example.com/privacy");
  });
});

describe("PaywallService.getPaywallConfig — locale fallback", () => {
  test("mr → hi fallback (top-level translation + legal)", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? TRANSLATION_HI : null)
    );
    mock.getLegalLinks.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? LEGAL_HI : null)
    );
    // Plans + benefits have translations in `hi` only.
    mock.getEnabledPlans.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve([
        planWithTranslation("week", locale === "hi" ? "hi" : null),
      ])
    );
    mock.getEnabledBenefits.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve([
        benefitWithTranslation("mandir", locale === "hi" ? "hi" : null),
      ])
    );

    const out = await service.getPaywallConfig({ locale: "mr" });

    expect(out.localeRequested).toBe("mr");
    expect(out.localeServed).toBe("hi");
    expect(out.fallbackUsed).toBe(true);
    expect(out.fallbackFrom).toBe("mr");
    // Every localizable slice was missing for `mr` and served from `hi`.
    expect(out.missingFields).toEqual(
      expect.arrayContaining([
        "translation",
        "legalLinks",
        "plans[week].translation",
        "benefits[mandir].translation",
      ])
    );
    expect(out.plans[0]?.localizedLabel).toBe("label-hi");
    expect(out.benefits[0]?.localizedName).toBe("name-hi");
  });

  test("mr → en fallback when hi is also empty (final fallback)", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "en" ? TRANSLATION_EN : null)
    );
    mock.getLegalLinks.mockResolvedValue(null);
    mock.getEnabledPlans.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve([
        planWithTranslation("week", locale === "en" ? "en" : null),
      ])
    );
    mock.getEnabledBenefits.mockResolvedValue([]);

    const out = await service.getPaywallConfig({ locale: "mr" });

    expect(out.localeServed).toBe("en");
    expect(out.fallbackUsed).toBe(true);
    expect(out.fallbackFrom).toBe("mr");
    expect(out.title).toBe(TRANSLATION_EN.title);
    // Legal links resolved to null everywhere -> empty strings on the wire.
    expect(out.legalLinks.privacyPolicyUrl).toBe("");
    // "legalLinks" is NOT in missingFields when it was null in every locale
    // (the value stayed null throughout — we only record the miss when the
    // served locale differs from requested); the empty-string wire shape is
    // the client's cue.
  });

  test("per-plan fallback: plan A has hi, plan B has en only", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? TRANSLATION_HI : null)
    );
    mock.getLegalLinks.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? LEGAL_HI : null)
    );
    mock.getEnabledPlans.mockImplementation(({ locale }: { locale: string }) => {
      // Two plans: week has translations in hi + en; month only in en.
      if (locale === "hi") {
        return Promise.resolve([
          planWithTranslation("week", "hi"),
          planWithTranslation("month", null),
        ]);
      }
      if (locale === "en") {
        return Promise.resolve([
          planWithTranslation("week", "en"),
          planWithTranslation("month", "en"),
        ]);
      }
      return Promise.resolve([
        planWithTranslation("week", null),
        planWithTranslation("month", null),
      ]);
    });
    mock.getEnabledBenefits.mockResolvedValue([]);

    const out = await service.getPaywallConfig({ locale: "hi" });

    // Week served from hi (no miss); month fell through to en.
    expect(out.plans).toHaveLength(2);
    const week = out.plans.find((p) => p.planId === "week");
    const month = out.plans.find((p) => p.planId === "month");
    expect(week?.localizedLabel).toBe("label-hi");
    expect(month?.localizedLabel).toBe("label-en");
    expect(out.missingFields).toContain("plans[month].translation");
    expect(out.missingFields).not.toContain("plans[week].translation");
  });
});

describe("PaywallService.getPaywallConfig — empty-plans contract", () => {
  test("all plans disabled (repo returns empty) → plans: [] not a throw", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? TRANSLATION_HI : null)
    );
    mock.getLegalLinks.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? LEGAL_HI : null)
    );
    mock.getEnabledPlans.mockResolvedValue([]);
    mock.getEnabledBenefits.mockResolvedValue([]);

    const out = await service.getPaywallConfig({ locale: "hi" });

    expect(out.plans).toEqual([]);
    expect(out.benefits).toEqual([]);
    expect(out.enabled).toBe(true);
    expect(out.title).toBe("VIP");
  });

  test("plan exists but no translation in any locale → filtered out + missingFields", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? TRANSLATION_HI : null)
    );
    mock.getLegalLinks.mockImplementation(({ locale }: { locale: string }) =>
      Promise.resolve(locale === "hi" ? LEGAL_HI : null)
    );
    mock.getEnabledPlans.mockResolvedValue([
      planWithTranslation("orphan", null),
    ]);
    mock.getEnabledBenefits.mockResolvedValue([]);

    const out = await service.getPaywallConfig({ locale: "hi" });

    expect(out.plans).toEqual([]);
    expect(out.missingFields).toContain("plans[orphan].translation");
  });
});

describe("PaywallService.getPaywallConfig — config missing", () => {
  test("throws 500 when the paywall id has no config row", async () => {
    mock.getConfig.mockResolvedValue(null);

    await expect(
      service.getPaywallConfig({ locale: "hi" })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      service.getPaywallConfig({ locale: "hi" })
    ).rejects.toMatchObject({ statusCode: 500, errorCode: "PAYWALL_CONFIG_MISSING" });
  });
});

describe("PaywallService — response cache", () => {
  test("second call for the same (paywallId, locale) is served from cache", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockResolvedValue(TRANSLATION_HI);
    mock.getLegalLinks.mockResolvedValue(LEGAL_HI);
    mock.getEnabledPlans.mockResolvedValue([
      planWithTranslation("week", "hi"),
    ]);
    mock.getEnabledBenefits.mockResolvedValue([
      benefitWithTranslation("mandir", "hi"),
    ]);

    await service.getPaywallConfig({ locale: "hi" });
    const configCallsAfterFirst = mock.getConfig.mock.calls.length;
    const translationCallsAfterFirst = mock.getTranslation.mock.calls.length;
    const legalCallsAfterFirst = mock.getLegalLinks.mock.calls.length;

    await service.getPaywallConfig({ locale: "hi" });

    // Second request hit the response cache — no further provider calls at
    // all (asserting deltas rather than absolute counts because the first
    // resolution walks the [hi, en] fallback chain so per-locale mocks are
    // called twice inside that miss).
    expect(mock.getConfig.mock.calls.length).toBe(configCallsAfterFirst);
    expect(mock.getTranslation.mock.calls.length).toBe(translationCallsAfterFirst);
    expect(mock.getLegalLinks.mock.calls.length).toBe(legalCallsAfterFirst);
  });

  test("invalidateResponseCache forces the next call to re-fetch", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockResolvedValue(TRANSLATION_HI);
    mock.getLegalLinks.mockResolvedValue(LEGAL_HI);
    mock.getEnabledPlans.mockResolvedValue([
      planWithTranslation("week", "hi"),
    ]);
    mock.getEnabledBenefits.mockResolvedValue([
      benefitWithTranslation("mandir", "hi"),
    ]);

    await service.getPaywallConfig({ locale: "hi" });
    service.invalidateResponseCache();
    await service.getPaywallConfig({ locale: "hi" });

    expect(mock.getConfig).toHaveBeenCalledTimes(2);
  });

  test("different locales are cached under different keys", async () => {
    mock.getConfig.mockResolvedValue(CONFIG);
    mock.getTranslation.mockResolvedValue(TRANSLATION_HI);
    mock.getLegalLinks.mockResolvedValue(LEGAL_HI);
    mock.getEnabledPlans.mockResolvedValue([
      planWithTranslation("week", "hi"),
    ]);
    mock.getEnabledBenefits.mockResolvedValue([
      benefitWithTranslation("mandir", "hi"),
    ]);

    await service.getPaywallConfig({ locale: "hi" });
    await service.getPaywallConfig({ locale: "mr" });

    // Each locale triggers its own end-to-end fetch (config is cached inside
    // the provider mock is not stateful, so getConfig is called once per
    // service-level miss).
    expect(mock.getConfig).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// TAM-159 — A/B variant selection
// ---------------------------------------------------------------------------

/** Wire the provider up for a plain successful compose at the given paywall. */
function stubHappyPath(mockRef: ProviderMock, config: RawPaywallConfig = CONFIG): void {
  mockRef.getConfig.mockResolvedValue(config);
  mockRef.getTranslation.mockResolvedValue(TRANSLATION_HI);
  mockRef.getLegalLinks.mockResolvedValue(LEGAL_HI);
  mockRef.getEnabledPlans.mockResolvedValue([planWithTranslation("week", "hi")]);
  mockRef.getEnabledBenefits.mockResolvedValue([benefitWithTranslation("mandir", "hi")]);
  mockRef.getHeroMedia.mockResolvedValue([HERO_VIDEO_HI]);
}

describe("PaywallService.getPaywallConfig — variant selection", () => {
  const COUNTRY_CODE = "+91";

  /**
   * A PHONE whose bucket maps to a variant. Found by probing rather than
   * hardcoded, so the test keeps working when the bucket ranges are re-cut —
   * pinning a number here would make a traffic change look like a test failure.
   */
  function phoneInAVariantBucket(): string {
    for (let i = 0; i < 5000; i += 1) {
      const candidate = `9${String(i).padStart(9, "0")}`;
      if (resolvePaywallId(candidate) !== "vip-membership-v1") return candidate;
    }
    throw new Error("no variant bucket found — is BUCKETS all default?");
  }

  /**
   * TAM-159 bucketing reads the phone from the USER TABLE via the users facade,
   * because the JWT carries `{sub, email}` only. Register a fake so the service
   * has something to read; `phoneNumber: null` models an email/admin account.
   */
  function stubUser(phoneNumber: string | null): void {
    registerGlobalService("users", {
      getUserPublic: () =>
        Promise.resolve({
          id: "u-1",
          name: null,
          selectedLanguage: null,
          onboardingCompletedAt: null,
          phoneCountryCode: phoneNumber === null ? null : COUNTRY_CODE,
          phoneNumber,
        }),
      getRole: () => Promise.resolve("user"),
      getRazorpayCustomerId: () => Promise.resolve(null),
      rememberRazorpayCustomerId: () => Promise.resolve(),
    } as never);
  }

  /**
   * The version gate lives on the VARIANT'S OWN config row now, not in a module
   * constant — so the provider has to answer differently per paywall id: the
   * default is ungated (and never checked anyway), the variant carries whatever
   * minimum the CMS holds.
   */
  function stubVariantGatedAt(minAppVersion: string): void {
    stubHappyPath(mock);
    mock.getConfig.mockImplementation(({ paywallId }: { paywallId: string }) =>
      Promise.resolve(
        paywallId === "vip-membership-v1"
          ? CONFIG
          : { ...CONFIG, paywallId, minAppVersion }
      )
    );
  }

  beforeEach(() => {
    clearGlobalServices();
    stubUser(phoneInAVariantBucket());
  });

  afterEach(() => {
    clearGlobalServices();
  });

  test("an app version below the variant's minAppVersion gets the default paywall", async () => {
    stubVariantGatedAt("1.1.0");
    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.0.4",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  /**
   * A string compare says `"1.0.99" > "1.1.0"`. This is the case that would hand
   * a variant to a build that cannot render it, and it is invisible in any
   * environment whose released versions never crossed a two-digit patch.
   */
  test("1.0.99 is BELOW a 1.1.0 gate — compared numerically, not lexically", async () => {
    stubVariantGatedAt("1.1.0");
    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.0.99",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  test.each([[undefined], [""], ["garbage"]])(
    "a missing or unparseable app_version (%j) gets the default paywall",
    async (appVersion) => {
      stubVariantGatedAt("1.1.0");
      const out = await service.getPaywallConfig({
        locale: "hi",
        userId: "u-1",
        appVersion,
      });
      expect(out.paywallId).toBe("vip-membership-v1");
    }
  );

  /**
   * A CMS typo in `minAppVersion` must close the gate, not open it. The safe
   * direction is the shipped paywall.
   */
  test("a variant whose minAppVersion is unparseable falls back to the default", async () => {
    stubVariantGatedAt("1.1");
    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "9.9.9",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  /**
   * The other direction of the same switch: the gate is CMS data, so an editor
   * lowering it to `0.0.0` starts serving the variant to every build — including
   * ones that send no `app_version` header at all — with no deploy.
   */
  test("a variant gated at 0.0.0 is served even without an app_version header", async () => {
    stubVariantGatedAt("0.0.0");
    const expected = resolvePaywallId(phoneInAVariantBucket());

    const out = await service.getPaywallConfig({ locale: "hi", userId: "u-1" });
    expect(out.paywallId).toBe(expected);
  });

  /**
   * The DEFAULT paywall is never version-checked. It is the fallback and the
   * screen every build already contains, so honouring a minimum on it could
   * leave a client with nothing to render at all.
   */
  test("the default paywall is served regardless of its own minAppVersion", async () => {
    stubUser(null); // no phone → the resolver lands on the default immediately
    stubHappyPath(mock, { ...CONFIG, minAppVersion: "9.9.9" });

    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.0.0",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  /**
   * `User.phoneNumber` is nullable — email and admin accounts have none, and the
   * row is written at OTP *send*, before verify. Those accounts must land on the
   * default paywall, NOT be bucketed on a placeholder.
   */
  test("an account with no phone number gets the default paywall", async () => {
    stubUser(null);
    stubHappyPath(mock);

    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.1.0",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  /**
   * A degraded users module must not take the paywall down with it: the purchase
   * flow keeps working, everyone just sees the shipped screen.
   */
  test("a failing user lookup falls back to the default paywall, not a 500", async () => {
    clearGlobalServices();
    registerGlobalService("users", {
      getUserPublic: () => Promise.reject(new Error("users is down")),
      getRole: () => Promise.resolve("user"),
      getRazorpayCustomerId: () => Promise.resolve(null),
      rememberRazorpayCustomerId: () => Promise.resolve(),
    } as never);
    stubHappyPath(mock);

    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.1.0",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  /** Exactly AT the minimum qualifies — `minAppVersion` is the lowest allowed. */
  test("a client at the variant's minAppVersion is served that variant", async () => {
    const expected = resolvePaywallId(phoneInAVariantBucket());
    stubVariantGatedAt("1.1.0");

    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.1.0",
    });
    expect(out.paywallId).toBe(expected);
  });

  test("a DISABLED variant falls back to the default — the CMS kill switch", async () => {
    stubHappyPath(mock);
    mock.getConfig.mockImplementation(({ paywallId }: { paywallId: string }) =>
      Promise.resolve(
        paywallId === "vip-membership-v1"
          ? CONFIG
          : { ...CONFIG, paywallId, enabled: false }
      )
    );

    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.1.0",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  test("a variant with no config row yet falls back to the default", async () => {
    stubHappyPath(mock);
    mock.getConfig.mockImplementation(({ paywallId }: { paywallId: string }) =>
      Promise.resolve(paywallId === "vip-membership-v1" ? CONFIG : null)
    );

    const out = await service.getPaywallConfig({
      locale: "hi",
      userId: "u-1",
      appVersion: "1.1.0",
    });
    expect(out.paywallId).toBe("vip-membership-v1");
  });

  test("an explicit paywallId overrides bucketing entirely", async () => {
    stubHappyPath(mock, { ...CONFIG, paywallId: "vip-icon-grid-v1" });
    const out = await service.getPaywallConfig({
      locale: "hi",
      paywallId: "vip-icon-grid-v1",
      userId: "u-1",
      appVersion: "1.0.0",
    });
    expect(out.paywallId).toBe("vip-icon-grid-v1");
  });

  test("plans are read from the CANONICAL paywall, copy from the variant", async () => {
    const variant = resolvePaywallId(phoneInAVariantBucket());
    stubHappyPath(mock, { ...CONFIG, paywallId: variant });

    await service.getPaywallConfig({ locale: "hi", userId: "u-1", appVersion: "1.1.0" });

    // Price must not be able to vary by variant: the plan rows always come from
    // the canonical paywall, and only `variantPaywallId` selects the wording.
    const planCalls = mock.getEnabledPlans.mock.calls as [
      { paywallId: string; variantPaywallId: string },
    ][];
    for (const [args] of planCalls) {
      expect(args.paywallId).toBe("vip-membership-v1");
      expect(args.variantPaywallId).toBe(variant);
    }
    // Legal links are canonical too — a variant must never serve empty policy URLs.
    const legalCalls = mock.getLegalLinks.mock.calls as [{ paywallId: string }][];
    for (const [args] of legalCalls) {
      expect(args.paywallId).toBe("vip-membership-v1");
    }
  });
});

describe("legacyVideoFields — the shipped-APK compat projection", () => {
  test("a video hero maps to all three legacy fields", () => {
    expect(
      legacyVideoFields([
        { mediaType: "video", url: "u.mp4", thumbnailUrl: "p.png", mediaId: "m1", sortOrder: 0 },
      ])
    ).toEqual({ videoUrl: "u.mp4", videoThumbnailUrl: "p.png", videoId: "m1" });
  });

  test("an image-only hero lands in videoThumbnailUrl, which is what the old screen renders", () => {
    expect(
      legacyVideoFields([
        { mediaType: "image", url: "a.png", thumbnailUrl: null, mediaId: "m2", sortOrder: 0 },
        { mediaType: "image", url: "b.png", thumbnailUrl: null, mediaId: "m3", sortOrder: 1 },
      ])
    ).toEqual({ videoUrl: null, videoThumbnailUrl: "a.png", videoId: "m2" });
  });

  test("a video anywhere in the list wins over images", () => {
    expect(
      legacyVideoFields([
        { mediaType: "image", url: "a.png", thumbnailUrl: null, mediaId: "m2", sortOrder: 0 },
        { mediaType: "video", url: "u.mp4", thumbnailUrl: "p.png", mediaId: "m1", sortOrder: 1 },
      ])
    ).toEqual({ videoUrl: "u.mp4", videoThumbnailUrl: "p.png", videoId: "m1" });
  });

  test("no hero yields the same three nulls an empty locale produced before TAM-159", () => {
    expect(legacyVideoFields([])).toEqual({
      videoUrl: null,
      videoThumbnailUrl: null,
      videoId: null,
    });
  });

  test("an unknown mediaType is ignored rather than emitted as a video", () => {
    expect(
      legacyVideoFields([
        { mediaType: "lottie", url: "a.json", thumbnailUrl: null, mediaId: "m9", sortOrder: 0 },
      ])
    ).toEqual({ videoUrl: null, videoThumbnailUrl: null, videoId: null });
  });
});

describe("PaywallService.resolvePaywallIdForUser — shared abtesting service (TAM-173)", () => {
  // Through the REAL client, like the variant-selection block exercises the
  // real bucket map: env configures the service, a stubbed global fetch plays
  // it, and only the resolution ORDER is ours to assert here.
  const evaluateAnswer = (body: unknown): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })))
    );
  };

  /** A users facade whose phone read is a SPY — the service-answered paths must never call it. */
  function stubUserSpy(phoneNumber: string | null): Mock {
    const getUserPublic = vi.fn(() =>
      Promise.resolve({
        id: "u-1",
        name: null,
        selectedLanguage: null,
        onboardingCompletedAt: null,
        phoneCountryCode: phoneNumber === null ? null : "+91",
        phoneNumber,
      })
    );
    registerGlobalService("users", { getUserPublic } as never);
    return getUserPublic;
  }

  /** Probed, not hardcoded — same reasoning as `phoneInAVariantBucket` above. */
  function phoneInSomeVariantBucket(): string {
    for (let i = 0; i < 5000; i += 1) {
      const candidate = `9${String(i).padStart(9, "0")}`;
      if (resolvePaywallId(candidate) !== "vip-membership-v1") return candidate;
    }
    throw new Error("no variant bucket found — is BUCKETS all default?");
  }

  beforeEach(() => {
    clearGlobalServices();
    process.env.ABTEST_BASE_URL = "https://platform.test/abtesting";
    process.env.ABTEST_TENANT_KEY = "prabhuji.dev.key";
    resetEnvCache();
    mock.getConfig.mockImplementation(({ paywallId }: { paywallId: string }) =>
      Promise.resolve({ paywallId, enabled: true })
    );
  });

  afterEach(() => {
    delete process.env.ABTEST_BASE_URL;
    delete process.env.ABTEST_TENANT_KEY;
    resetEnvCache();
    vi.unstubAllGlobals();
    clearGlobalServices();
  });

  test("the service's arm wins, and the phone is never read", async () => {
    const phoneRead = stubUserSpy("9000000042");
    evaluateAnswer({
      inExperiment: true,
      bucket: 7,
      variant: { id: "vip-icon-grid-v1", payload: {} },
    });

    await expect(service.resolvePaywallIdForUser("u-1")).resolves.toBe("vip-icon-grid-v1");
    expect(phoneRead).not.toHaveBeenCalled();
  });

  test("a service arm whose CMS row is disabled still falls back to the default", async () => {
    stubUserSpy("9000000042");
    evaluateAnswer({
      inExperiment: true,
      bucket: 7,
      variant: { id: "vip-icon-grid-v1", payload: {} },
    });
    mock.getConfig.mockImplementation(() => Promise.resolve(null));

    await expect(service.resolvePaywallIdForUser("u-1")).resolves.toBe("vip-membership-v1");
  });

  test("an api-default with a string paywallId hands that paywall to out-of-experiment users", async () => {
    const phoneRead = stubUserSpy("9000000042");
    evaluateAnswer({
      inExperiment: false,
      bucket: 7,
      defaultConfig: { paywallId: "vip-carousel-v1" },
    });

    await expect(service.resolvePaywallIdForUser("u-1")).resolves.toBe("vip-carousel-v1");
    expect(phoneRead).not.toHaveBeenCalled();
  });

  test("an api-default with a non-string paywallId reads as the default paywall", async () => {
    const phoneRead = stubUserSpy("9000000042");
    evaluateAnswer({ inExperiment: false, bucket: 7, defaultConfig: { paywallId: null } });

    await expect(service.resolvePaywallIdForUser("u-1")).resolves.toBe("vip-membership-v1");
    expect(phoneRead).not.toHaveBeenCalled();
  });

  test("an api-default without the paywallId key falls back to phone bucketing", async () => {
    // Credentials wired before any paywall experiment is seeded must move nobody.
    const phone = phoneInSomeVariantBucket();
    stubUserSpy(phone);
    evaluateAnswer({ inExperiment: false, bucket: 7, defaultConfig: { unrelated: true } });

    await expect(service.resolvePaywallIdForUser("u-1")).resolves.toBe(resolvePaywallId(phone));
  });

  test("a service failure degrades to phone bucketing, exactly the pre-TAM-173 path", async () => {
    const phone = phoneInSomeVariantBucket();
    stubUserSpy(phone);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));

    await expect(service.resolvePaywallIdForUser("u-1")).resolves.toBe(resolvePaywallId(phone));
  });
});
