import { describe, expect, it } from "vitest";
import type { PaywallOverride } from "@api/core/paywall/services/paywall-override.types";
import type { PaywallConfigResponseData } from "@api/core/paywall/services/paywall.service";
import { applyPaywallOverride } from "@api/core/paywall/services/paywall.service";

function baseResponse(): PaywallConfigResponseData {
  return {
    paywallId: "vip-membership-v1",
    configVersion: 4,
    enabled: true,
    localeRequested: "hi",
    localeServed: "hi",
    fallbackUsed: false,
    fallbackFrom: null,
    missingFields: [],
    title: "VIP सदस्यता खोलें",
    layout: "card_hero",
    heroMedia: [
      {
        mediaType: "video",
        url: "https://cdn/vip_intro.mp4",
        thumbnailUrl: "https://cdn/vip_intro.png",
        mediaId: "vip_intro_v2_1",
        sortOrder: 0,
      },
    ],
    videoUrl: "https://cdn/vip_intro.mp4",
    videoThumbnailUrl: "https://cdn/vip_intro.png",
    videoId: "vip_intro_v2_1",
    defaultPlanId: "month",
    plans: [
      {
        planId: "month",
        productId: "prod_month",
        period: "month",
        localizedLabel: "मासिक",
        trialLabel: "1 दिन",
        trialDays: 1,
        displayPriceText: "₹5",
        subscriptionDetailText: "हर महीने",
        sortOrder: 0,
      },
    ],
    // Three, not one: the campaign list REPLACES this, so a single-entry fixture
    // could not tell "replaced" apart from "reordered".
    benefits: [
      { benefitId: "mandir", localizedName: "मंदिर", icon: "benefit-mandir.png", sortOrder: 0 },
      { benefitId: "wallpaper", localizedName: "वॉलपेपर", icon: "benefit-wallpaper.png", sortOrder: 1 },
      { benefitId: "ringtone", localizedName: "रिंगटोन", icon: "benefit-ringtone.png", sortOrder: 2 },
    ],
    legalLinks: {
      privacyPolicyUrl: "https://example.com/privacy",
      termsServiceUrl: "https://example.com/terms",
      refundPolicyUrl: "https://example.com/refund",
    },
    cancelAnytimeText: "कभी भी रद्द करें",
    refundPolicyText: "रिफंड पॉलिसी",
    payNowCta: "आगे बढ़ें",
    shimmerEnabled: true,
  };
}

const campaign = (locales: PaywallOverride["locales"]): PaywallOverride => ({ locales });

describe("applyPaywallOverride", () => {
  it("returns the SAME reference when there is no override", () => {
    const response = baseResponse();
    expect(applyPaywallOverride(response, undefined)).toBe(response);
  });

  /** The input may be the shared cache entry — mutating it leaks one campaign to everyone. */
  it("never mutates the response it is given", () => {
    const response = baseResponse();
    const before = JSON.stringify(response);
    applyPaywallOverride(response, campaign({ hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" }] } }));
    expect(JSON.stringify(response)).toBe(before);
  });

  it("replaces the hero with the locale's single asset at sortOrder 0", () => {
    const out = applyPaywallOverride(
      baseResponse(),
      campaign({
        hi: {
          media: {
            mediaType: "video",
            url: "https://cdn/diwali.mp4",
            thumbnailUrl: "https://cdn/diwali.png",
            mediaId: "diwali_v1",
          },
        },
      })
    );
    expect(out.heroMedia).toEqual([
      {
        mediaType: "video",
        url: "https://cdn/diwali.mp4",
        thumbnailUrl: "https://cdn/diwali.png",
        mediaId: "diwali_v1",
        sortOrder: 0,
      },
    ]);
  });

  /** Shipped APKs read the flat triple; it must never disagree with the hero. */
  it("re-derives the deprecated flat video fields from the new hero", () => {
    const out = applyPaywallOverride(
      baseResponse(),
      campaign({
        hi: {
          media: {
            mediaType: "video",
            url: "https://cdn/diwali.mp4",
            thumbnailUrl: "https://cdn/diwali.png",
            mediaId: "diwali_v1",
          },
        },
      })
    );
    expect(out.videoUrl).toBe("https://cdn/diwali.mp4");
    expect(out.videoThumbnailUrl).toBe("https://cdn/diwali.png");
    expect(out.videoId).toBe("diwali_v1");
  });

  it("keeps the CMS hero when the locale overrides benefits only", () => {
    const base = baseResponse();
    const out = applyPaywallOverride(base, campaign({ hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" }] } }));
    expect(out.heroMedia).toEqual(base.heroMedia);
    expect(out.videoUrl).toBe(base.videoUrl);
    expect(out.benefits[0]?.localizedName).toBe("हनुमान मंदिर");
  });

  it("keeps the CMS benefits when the locale overrides the hero only", () => {
    const base = baseResponse();
    const out = applyPaywallOverride(
      base,
      campaign({
        hi: {
          media: {
            mediaType: "video",
            url: "https://cdn/diwali.mp4",
            thumbnailUrl: null,
            mediaId: "diwali_v1",
          },
        },
      })
    );
    expect(out.benefits).toBe(base.benefits);
  });

  /**
   * The list is REPLACED, not merged: "show three of the eight, in this order,
   * under these names" is the whole point, and a merge could not express it.
   * `sortOrder` comes from the array index so the editor's order is the render
   * order.
   */
  it("replaces the benefit list wholesale and renumbers it", () => {
    const base = baseResponse();
    expect(base.benefits.length).toBeGreaterThan(2);

    const out = applyPaywallOverride(
      base,
      campaign({
        hi: {
          benefits: [
            { benefitId: "ringtone", icon: "benefit-ringtone.png", name: "भजन रिंगटोन" },
            { benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" },
          ],
        },
      })
    );

    expect(out.benefits).toEqual([
      {
        benefitId: "ringtone",
        icon: "benefit-ringtone.png",
        localizedName: "भजन रिंगटोन",
        sortOrder: 0,
      },
      {
        benefitId: "mandir",
        icon: "benefit-mandir.png",
        localizedName: "हनुमान मंदिर",
        sortOrder: 1,
      },
    ]);
  });

  /**
   * The response handed in is the entry the cache SHARES with every caller on
   * this `(paywallId, locale)`. Renaming a benefit in place would rename it for
   * everyone — organic users included — so every row must be a new object.
   */
  it("builds new benefit objects rather than editing the shared ones", () => {
    const base = baseResponse();
    const original = base.benefits[0];
    if (original === undefined) throw new Error("fixture has no benefits");
    const snapshot = { ...original };

    const out = applyPaywallOverride(
      base,
      campaign({
        hi: {
          benefits: [
            { benefitId: original.benefitId, icon: original.icon, name: "CAMPAIGN NAME" },
          ],
        },
      })
    );

    expect(out.benefits[0]?.localizedName).toBe("CAMPAIGN NAME");
    // The caller's array and the row inside it are both untouched.
    expect(base.benefits[0]).toEqual(snapshot);
    expect(out.benefits[0]).not.toBe(original);
    expect(out.benefits).not.toBe(base.benefits);
  });

  /** The product's own voice is out of reach — a campaign dresses, it does not speak. */
  it("never touches the four copy fields", () => {
    const base = baseResponse();
    const out = applyPaywallOverride(
      base,
      campaign({ hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" }] } })
    );
    expect(out.title).toBe(base.title);
    expect(out.payNowCta).toBe(base.payNowCta);
    expect(out.cancelAnytimeText).toBe(base.cancelAnytimeText);
    expect(out.refundPolicyText).toBe(base.refundPolicyText);
  });

  /**
   * A caller asking for `mr` is SERVED `hi` (the composer's fallback chain), so
   * keying on the requested locale would hand them English copy over a Hindi
   * screen.
   */
  it("keys on the SERVED locale, not the requested one", () => {
    const base = { ...baseResponse(), localeRequested: "mr", localeServed: "hi" };
    const out = applyPaywallOverride(
      base,
      campaign({
        hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हिन्दी" }] },
        en: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "English" }] },
      })
    );
    expect(out.benefits[0]?.localizedName).toBe("हिन्दी");
  });

  it("applies the `en` block to an `en` screen", () => {
    const base = { ...baseResponse(), localeServed: "en" };
    const out = applyPaywallOverride(
      base,
      campaign({ en: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "Hanuman Mandir" }] } })
    );
    expect(out.benefits[0]?.localizedName).toBe("Hanuman Mandir");
  });

  /**
   * The most likely CMS mistake: an editor fills ONLY the English section —
   * the second one, and collapsed by default — and saves.
   *
   * Borrowing it for a Hindi screen would print an English headline and pay
   * button over a Hindi price list, with `fallbackUsed` still false because the
   * COMPOSER did not fall back. A language the campaign left blank keeps the
   * paywall's own copy instead. Asserted in both directions, because this used
   * to hold in one of them only.
   */
  it("never borrows one language's block for another", () => {
    const hiScreen = { ...baseResponse(), localeServed: "hi" };
    const enOnly = applyPaywallOverride(
      hiScreen,
      campaign({ en: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "English" }] } })
    );
    expect(enOnly.benefits).toEqual(hiScreen.benefits);
    expect(enOnly.heroMedia).toEqual(hiScreen.heroMedia);

    const enScreen = { ...baseResponse(), localeServed: "en" };
    const hiOnly = applyPaywallOverride(
      enScreen,
      campaign({ hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हिन्दी" }] } })
    );
    expect(hiOnly.benefits).toEqual(enScreen.benefits);
    expect(hiOnly.heroMedia).toEqual(enScreen.heroMedia);
  });

  /**
   * `localeServed` is a free-form string. Anything outside `hi`/`en` — which
   * this paywall's fallback chain should never produce — overrides nothing,
   * rather than indexing into nothing or reaching for another language.
   */
  it("changes nothing when the served locale is outside `hi`/`en`", () => {
    const base = { ...baseResponse(), localeServed: "ta" };
    for (const override of [
      campaign({ en: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "English" }] } }),
      campaign({ hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हिन्दी" }] } }),
    ]) {
      const out = applyPaywallOverride(base, override);
      expect(out.benefits).toEqual(base.benefits);
      expect(out.heroMedia).toEqual(base.heroMedia);
    }
  });

  /**
   * The scope boundary, asserted rather than assumed: money, legal text, the
   * layout and the paywall's own id are all beyond what a marketing override may
   * touch, even when the campaign fills everything it IS allowed to.
   */
  it("leaves plans, legal links, layout and paywallId untouched", () => {
    const base = baseResponse();
    const out = applyPaywallOverride(
      base,
      campaign({
        hi: {
          media: { mediaType: "image", url: "https://cdn/a.png", thumbnailUrl: null, mediaId: "a" },
          benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" }],
        },
      })
    );
    expect(out.paywallId).toBe("vip-membership-v1");
    expect(out.layout).toBe("card_hero");
    expect(out.plans).toEqual(base.plans);
    expect(out.defaultPlanId).toBe(base.defaultPlanId);
    expect(out.legalLinks).toEqual(base.legalLinks);
    // Copy stays the product's own voice even with the hero and benefits replaced.
    expect(out.title).toBe(base.title);
    expect(out.payNowCta).toBe(base.payNowCta);
  });

  it("changes nothing for an override with no locales at all", () => {
    const base = baseResponse();
    const out = applyPaywallOverride(base, campaign({}));
    expect(out).toEqual(base);
  });
});
