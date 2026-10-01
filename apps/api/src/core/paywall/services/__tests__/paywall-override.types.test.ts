import { describe, expect, it } from "vitest";
import { parsePaywallOverride } from "../paywall-override.types.js";

/**
 * The narrowing that stands between a JSONB column and the purchase screen.
 *
 * Its contract is TOTAL: every input produces a valid override, and anything
 * unreadable degrades to "change nothing". The write path has a strict Zod
 * schema that rejects bad input with a 400; this exists for what that schema
 * cannot reach — rows written before a field existed, and psql.
 */
describe("parsePaywallOverride", () => {
  it("reads a well-formed document unchanged", () => {
    const doc = {
      locales: {
        hi: {
          media: {
            mediaType: "video",
            url: "https://cdn/hi.mp4",
            thumbnailUrl: "https://cdn/hi.png",
            mediaId: "diwali_hi_v1",
          },
          benefits: [
            { benefitId: "mandir", icon: "benefit-mandir.png", name: "हनुमान मंदिर" },
            { benefitId: "ringtone", icon: "benefit-ringtone.png", name: "भजन रिंगटोन" },
          ],
        },
      },
    };
    expect(parsePaywallOverride(doc)).toEqual(doc);
  });

  it("keeps locales independent, as the underlying tables are", () => {
    const out = parsePaywallOverride({
      locales: {
        hi: { media: { mediaType: "video", url: "https://cdn/hi.mp4", mediaId: "hi_v1" } },
        en: { media: { mediaType: "video", url: "https://cdn/en.mp4", mediaId: "en_v1" } },
      },
    });
    expect(out.locales.hi?.media?.url).toBe("https://cdn/hi.mp4");
    expect(out.locales.en?.media?.url).toBe("https://cdn/en.mp4");
  });

  it("reads garbage as an empty override rather than throwing", () => {
    for (const input of [null, undefined, "nope", 42, [], [1, 2], {}, { locales: "x" }]) {
      expect(parsePaywallOverride(input)).toEqual({ locales: {} });
    }
  });

  /** Nothing outside the default paywall's own per-locale content is reachable. */
  it("drops keys this override is not allowed to set", () => {
    expect(
      parsePaywallOverride({
        analyticsPaywallId: "vip-ad-diwali",
        benefits: { hi: { downloads: "x" } },
        layout: "video_bleed",
        plans: [],
        locales: { hi: { videoUrl: "https://cdn/sneaky.mp4", title: "not mine", payNowCta: "nor this" } },
      })
    ).toEqual({ locales: {} });
  });

  it("drops an unservable media block but keeps that locale's benefits", () => {
    const out = parsePaywallOverride({
      locales: {
        hi: {
          media: { mediaType: "video", url: "" },
          benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "ठीक" }],
        },
      },
    });
    expect(out.locales.hi).toEqual({
      benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "ठीक" }],
    });
  });

  it("normalises an unrecognised mediaType to image", () => {
    const out = parsePaywallOverride({
      locales: { hi: { media: { mediaType: "lottie", url: "https://cdn/a", mediaId: "a" } } },
    });
    expect(out.locales.hi?.media?.mediaType).toBe("image");
  });

  it("defaults a missing thumbnail to null rather than omitting it", () => {
    const out = parsePaywallOverride({
      locales: { hi: { media: { mediaType: "video", url: "https://cdn/a", mediaId: "a" } } },
    });
    expect(out.locales.hi?.media?.thumbnailUrl).toBeNull();
  });

  it("trims values and treats a blank as absent", () => {
    expect(
      parsePaywallOverride({
        locales: { hi: { benefits: [{ benefitId: " mandir ", icon: " benefit-mandir.png ", name: "  नमस्ते  " }] } },
      })
    ).toEqual({
      locales: { hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "नमस्ते" }] } },
    });
    // A benefit missing any of the three cannot render, so the ENTRY goes...
    expect(
      parsePaywallOverride({
        locales: { hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "   " }] } },
      })
    ).toEqual({ locales: {} });
  });

  /**
   * A part-corrupt list keeps what still renders. Dropping the whole campaign
   * over one bad row would be a bigger change than the row deserves.
   */
  it("drops only the unusable benefit rows", () => {
    const out = parsePaywallOverride({
      locales: {
        hi: {
          benefits: [
            { benefitId: "mandir", icon: "benefit-mandir.png", name: "मंदिर" },
            { benefitId: "ringtone", icon: "benefit-ringtone.png" },
            "not-an-object",
            { benefitId: "horoscope", icon: "benefit-horoscope.png", name: "राशिफल" },
          ],
        },
      },
    });
    expect(out.locales.hi?.benefits).toEqual([
      { benefitId: "mandir", icon: "benefit-mandir.png", name: "मंदिर" },
      { benefitId: "horoscope", icon: "benefit-horoscope.png", name: "राशिफल" },
    ]);
  });

  /** An empty grid reads as a broken build; the standard list is always safe. */
  it("keeps the paywall's own list when no benefit row survives", () => {
    expect(
      parsePaywallOverride({ locales: { hi: { benefits: [{ name: "orphan" }] } } })
    ).toEqual({ locales: {} });
    expect(parsePaywallOverride({ locales: { hi: { benefits: [] } } })).toEqual({ locales: {} });
    expect(parsePaywallOverride({ locales: { hi: { benefits: "eight" } } })).toEqual({
      locales: {},
    });
  });

  /** The layout was built for eight tiles; a hand-edited row cannot overflow it. */
  it("truncates a benefit list longer than the layout can show", () => {
    const out = parsePaywallOverride({
      locales: {
        hi: {
          benefits: Array.from({ length: 12 }, (_unused, i) => ({
            benefitId: `b${String(i)}`,
            icon: "benefit-mandir.png",
            name: `नाम ${String(i)}`,
          })),
        },
      },
    });
    expect(out.locales.hi?.benefits).toHaveLength(8);
    expect(out.locales.hi?.benefits?.[7]?.benefitId).toBe("b7");
  });

  /**
   * The default paywall has content in `hi` and `en` only, and the fallback
   * chain means every caller is SERVED one of those two — so a block for any
   * other language could never render, and a hand-edited one must not start.
   */
  it("drops any locale outside hi/en, however it got into the column", () => {
    const out = parsePaywallOverride({
      locales: {
        hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हिन्दी" }] },
        mr: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "मराठी" }] },
        ta: { media: { mediaType: "video", url: "https://cdn/ta.mp4", mediaId: "ta_v1" } },
      },
    });
    expect(out).toEqual({
      locales: { hi: { benefits: [{ benefitId: "mandir", icon: "benefit-mandir.png", name: "हिन्दी" }] } },
    });
  });

  it("drops a locale whose every field is unreadable", () => {
    const good = { benefitId: "mandir", icon: "benefit-mandir.png", name: "Hi" };
    expect(
      parsePaywallOverride({ locales: { hi: { benefits: 42 }, en: { benefits: [good] } } })
    ).toEqual({ locales: { en: { benefits: [good] } } });
  });
});
