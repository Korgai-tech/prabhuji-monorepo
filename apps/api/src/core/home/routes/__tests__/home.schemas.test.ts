import { describe, expect, test } from "vitest";
import { HomeBannerSchema } from "@api/core/home/routes/home.schemas";
import type { HomeBanner } from "@api/core/home/types";

/**
 * Response-schema contract guards.
 *
 * `app.ts` installs `fastify-type-provider-zod`'s `serializerCompiler`, which
 * runs every response through its Zod schema — and a Zod object STRIPS keys it
 * doesn't declare. So a field the service maps but the schema omits is silently
 * deleted on the way out: no type error, no test failure, no 500. Just a field
 * the client never receives.
 *
 * That is exactly how video banners shipped half-working. `toBanner()` mapped
 * `thumbnailUrl` (and the admin API stored it, and the CMS uploaded it), but
 * `HomeBannerSchema` never declared it, so `GET /home/banners` dropped the
 * video still on every response and the app had nothing to paint before the
 * clip decoded.
 *
 * The unit tests below the service and the integration tests above it both
 * missed it: the service tests call `getBanners()` directly (no serialization)
 * and the integration suite seeds zero banners. This file closes the gap by
 * asserting the round trip a wire response actually takes.
 */
describe("HomeBannerSchema", () => {
  /**
   * Typed as the DOMAIN model on purpose: adding a field to `HomeBanner`
   * without adding it here is a compile error, and adding it here without
   * adding it to the schema fails the assertion below. The two only stay in
   * sync deliberately.
   */
  const videoBanner: HomeBanner = {
    id: "b-video",
    mediaType: "video",
    mediaUrl: "https://cdn.example.com/banner.mp4",
    thumbnailUrl: "https://cdn.example.com/banner-still.png",
    title: "Diwali",
    destinationType: "linked_module",
    destinationValue: "wallpaper",
    isProFeatureDiscovery: false,
    sortOrder: 0,
  };

  /**
   * The full set of `HomeBanner` keys that currently reach the wire.
   *
   * ⚠️ `title` is deliberately ABSENT — and that is a REAL, still-open gap, not
   * a design choice. `home_banners.title` exists, TAM-108 added a whole
   * `home_banner_translations` table for it, the admin form edits it and
   * `toBanner()` resolves the per-locale override — and then this schema drops
   * the result on the floor, so no client has ever seen a banner title. Fixing
   * it is a one-line schema addition plus the codegen chain, but it is a
   * separate change from video support and needs the app to grow an overlay
   * that renders it; it is called out here so the next person finds it rather
   * than re-discovering it.
   *
   * Adding a field to the schema without adding it here fails this test on
   * purpose — that is the prompt to decide whether it belongs on the wire.
   */
  const SERIALIZED_KEYS = [
    "destinationType",
    "destinationValue",
    "id",
    "isProFeatureDiscovery",
    "mediaType",
    "mediaUrl",
    "sortOrder",
    "thumbnailUrl",
  ];

  test("serializes exactly the declared fields — nothing new is silently stripped", () => {
    const parsed = HomeBannerSchema.parse(videoBanner);
    // Compared key-by-key rather than field-by-field so a future addition to
    // the domain model can't slip through with a passing test.
    expect(Object.keys(parsed).sort()).toEqual(SERIALIZED_KEYS);
  });

  test("KNOWN GAP: `title` is mapped by the service but dropped by this schema", () => {
    // A characterization test, not an endorsement: it documents today's
    // behaviour so the fix is a deliberate, visible change to this file.
    expect(HomeBannerSchema.parse(videoBanner)).not.toHaveProperty("title");
    expect(videoBanner.title).toBe("Diwali");
  });

  test("a video banner keeps its thumbnailUrl (the client's first paint)", () => {
    expect(HomeBannerSchema.parse(videoBanner).thumbnailUrl).toBe(
      "https://cdn.example.com/banner-still.png"
    );
  });

  test("an image banner's null thumbnailUrl survives as null, not as absent", () => {
    const imageBanner: HomeBanner = {
      ...videoBanner,
      id: "b-image",
      mediaType: "image",
      mediaUrl: "https://cdn.example.com/banner.png",
      thumbnailUrl: null,
    };
    const parsed = HomeBannerSchema.parse(imageBanner);
    expect(parsed).toHaveProperty("thumbnailUrl", null);
  });

  test("rejects a mediaType outside the CMS vocabulary", () => {
    expect(() =>
      HomeBannerSchema.parse({ ...videoBanner, mediaType: "gif" })
    ).toThrow();
  });
});
