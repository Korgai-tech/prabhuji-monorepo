import { describe, expect, it } from "vitest";
import {
  AdminUtmOverrideCreateBody,
  AdminUtmOverrideListResponse,
  AdminUtmOverrideResponse,
  PaywallOverrideDocument,
} from "../paywall-utm-override.admin.schemas.js";

/**
 * Guards the write contract's two easy-to-regress rules.
 *
 * The locale-map case is here because it SHIPPED BROKEN and was caught by
 * end-to-end testing, not by a unit test: in Zod 4 a record keyed by an enum is
 * EXHAUSTIVE, so `z.record(adminLocale, …)` silently demanded an entry for all
 * nine supported languages. A Hindi-only campaign — the normal case — was a 400
 * naming the eight locales it had not translated. `partialRecord` is the fix and
 * this is the test that keeps it.
 */
describe("PaywallOverrideDocument", () => {
  it("accepts ONE locale (the locale map is partial, not exhaustive)", () => {
    const parsed = PaywallOverrideDocument.safeParse({
      locales: {
        hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" }] },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a per-locale hero asset", () => {
    expect(
      PaywallOverrideDocument.safeParse({
        locales: {
          hi: {
            media: {
              mediaType: "video",
              url: "https://cdn.example.com/a.mp4",
              thumbnailUrl: "https://cdn.example.com/a.png",
              mediaId: "diwali_v1",
            },
          },
        },
      }).success
    ).toBe(true);
  });

  it("accepts both hi and en", () => {
    expect(
      PaywallOverrideDocument.safeParse({
        locales: {
          hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" }] },
          en: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "Hanuman Mandir" }] },
        },
      }).success
    ).toBe(true);
  });

  /**
   * Only `hi` and `en` — the two the default paywall has content in, and the
   * only two the locale-fallback chain can serve. A `mr` block would be copy
   * that never renders.
   */
  it("rejects any locale other than hi/en, supported language or not", () => {
    for (const locale of ["zz", "mr", "ta", "gu", "bn", "or", "te", "kn"]) {
      expect(
        PaywallOverrideDocument.safeParse({
          locales: {
            [locale]: {
              benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "x" }],
            },
          },
        }).success
      ).toBe(false);
    }
  });

  it("accepts an empty locale map — every field is optional", () => {
    expect(PaywallOverrideDocument.safeParse({ locales: {} }).success).toBe(true);
  });

  /**
   * The scope boundary. These are all fields a campaign must NOT reach: the
   * paywall's identity, money, legal text, bundled benefit icons, the layout,
   * and the deprecated flat video triple (which is DERIVED from the hero — set
   * independently it would put old and new builds out of step).
   */
  it("rejects every field outside the default paywall's own per-locale content", () => {
    for (const doc of [
      { analyticsPaywallId: "vip-ad-diwali", locales: {} },
      { benefits: { hi: { mandir: "x" } }, locales: {} },
      { layout: "video_bleed", locales: {} },
      { locales: { hi: { videoUrl: "https://cdn.example.com/a.mp4" } } },
      { locales: { hi: { videoId: "x" } } },
      { locales: { hi: { displayPriceText: "₹1" } } },
      { heroMedia: [], locales: {} },
      // The product's own voice — removed from scope, and a typo'd variant of it.
      { locales: { hi: { title: "दिवाली" } } },
      { locales: { hi: { payNowCta: "अभी खरीदें" } } },
      { locales: { hi: { cancelAnytimeText: "x" } } },
      { locales: { hi: { refundPolicyText: "x" } } },
      { locales: { hi: { payNowCTA: "typo" } } },
    ]) {
      expect(PaywallOverrideDocument.safeParse(doc).success).toBe(false);
    }
  });

  /**
   * The benefit list is REPLACED, so its own rules are the only thing standing
   * between an editor and an unrenderable grid.
   */
  it("guards the benefit list's shape", () => {
    const ok = { benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" };
    const doc = (benefits: unknown) => ({ locales: { hi: { benefits } } });

    expect(PaywallOverrideDocument.safeParse(doc([ok])).success).toBe(true);

    // Empty means "show no benefits", which reads as a broken build. Omit the key.
    expect(PaywallOverrideDocument.safeParse(doc([])).success).toBe(false);

    // `card_hero` was laid out against eight tiles.
    const nine = Array.from({ length: 9 }, (_unused, i) => ({ ...ok, benefitId: `b${String(i)}` }));
    expect(PaywallOverrideDocument.safeParse(doc(nine)).success).toBe(false);
    expect(PaywallOverrideDocument.safeParse(doc(nine.slice(0, 8))).success).toBe(true);

    // The app reports impressions under `benefitId`; two tiles sharing one would
    // double-count that benefit in the warehouse.
    expect(PaywallOverrideDocument.safeParse(doc([ok, { ...ok, name: "फिर से" }])).success).toBe(
      false
    );

    // All three fields are required — a tile missing any of them cannot render.
    for (const key of ["benefitId", "icon", "name"] as const) {
      const partial: Record<string, unknown> = { ...ok };
      delete partial[key];
      expect(PaywallOverrideDocument.safeParse(doc([partial])).success).toBe(false);
      expect(PaywallOverrideDocument.safeParse(doc([{ ...ok, [key]: "  " }])).success).toBe(false);
    }

    // `icon` is a BUNDLED KEY, never a URL — accepting one would put artwork
    // nobody reviewed on the paywall.
    expect(
      PaywallOverrideDocument.safeParse(doc([{ ...ok, icon: "https://cdn.example.com/a.png" }]))
        .success
    ).toBe(false);
    expect(PaywallOverrideDocument.safeParse(doc([{ ...ok, benefitId: "Not A Slug" }])).success).toBe(
      false
    );

    // Unknown keys are a silent no-op otherwise, which is what `.strict()` is for.
    expect(
      PaywallOverrideDocument.safeParse(doc([{ ...ok, sortOrder: 3 }])).success
    ).toBe(false);
    expect(
      PaywallOverrideDocument.safeParse(doc([{ ...ok, localizedName: "x" }])).success
    ).toBe(false);
  });

  /** A list would let a campaign author a carousel `card_hero` cannot render. */
  it("rejects a list of media — the default paywall has exactly one hero per locale", () => {
    expect(
      PaywallOverrideDocument.safeParse({
        locales: {
          hi: { media: [{ mediaType: "video", url: "https://cdn.example.com/a.mp4", mediaId: "a" }] },
        },
      }).success
    ).toBe(false);
  });
});

describe("AdminUtmOverrideCreateBody", () => {
  /**
   * The ad group name is chosen in the ad platform, not by us — spaces, capitals
   * and punctuation are all normal, and it is only ever an equality key.
   */
  it("accepts an ad group name with spaces, capitals and punctuation", () => {
    const parsed = AdminUtmOverrideCreateBody.safeParse({
      utmGroup: "Diwali 2026 — Hindi / Video (Set 1)",
      overrides: { locales: {} },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.enabled).toBe(true);
  });

  it("rejects a blank ad group", () => {
    expect(AdminUtmOverrideCreateBody.safeParse({ utmGroup: "   ", overrides: { locales: {} } }).success).toBe(
      false
    );
  });
});

/**
 * The READ contract, which must be LOOSER than the write one.
 *
 * `serializerCompiler` validates responses, so if the view re-used
 * `PaywallOverrideDocument` then one stored value that schema would reject — a
 * URL minted under a previous `MEDIA_PUBLIC_BASE_URL`, a psql edit, a field
 * whose cap tightened since — would 500 the LIST and the by-id read together,
 * locking every campaign out of the only UI that could repair it. Reproduced
 * end-to-end before it was fixed; this is what keeps it fixed.
 */
describe("AdminUtmOverrideResponse (read contract)", () => {
  function row(media: Record<string, unknown>, title: string) {
    return {
      success: true as const,
      message: "ok",
      data: {
        id: "0198f0c2-0000-7000-8000-000000000001",
        utmGroup: "Diwali 2026",
        enabled: true,
        overrides: { locales: { hi: { media, title } } },
        createdAt: "2026-08-19T00:00:00.000Z",
        updatedAt: "2026-08-19T00:00:00.000Z",
      },
    };
  }

  const legal = {
    mediaType: "video",
    url: "https://cdn.example.com/a.mp4",
    thumbnailUrl: null,
    mediaId: "diwali-2026-hi",
  };

  it("serialises a row the WRITE schema would have rejected", () => {
    const hostile = { ...legal, url: "http://evil.example.com/a.mp4", mediaId: "NOT a slug!!" };
    // Precondition: the write schema really would refuse this.
    expect(
      PaywallOverrideDocument.safeParse({ locales: { hi: { media: hostile } } }).success
    ).toBe(false);

    expect(AdminUtmOverrideResponse.safeParse(row(hostile, "x".repeat(300))).success).toBe(
      true
    );
  });

  it("does not let one bad row take the whole list", () => {
    const bad = row({ ...legal, url: "http://evil.example.com/a.mp4" }, "bad");
    const good = row(legal, "good");
    const parsed = AdminUtmOverrideListResponse.safeParse({
      success: true,
      message: "ok",
      data: [bad.data, good.data],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.data).toHaveLength(2);
  });

  /**
   * Tolerant is not shapeless: `parsePaywallOverride` has already narrowed the
   * blob, so anything OUTSIDE that guarantee still means the service returned
   * something it should not have, and should fail loudly.
   */
  it("still rejects a shape the read path cannot produce", () => {
    expect(
      AdminUtmOverrideResponse.safeParse(row({ ...legal, mediaType: "audio" }, "x")).success
    ).toBe(false);
    expect(
      AdminUtmOverrideListResponse.safeParse({
        success: true,
        message: "ok",
        data: [{ ...row(legal, "x").data, overrides: { locales: { mr: { title: "x" } } } }],
      }).success
    ).toBe(false);
  });
});
