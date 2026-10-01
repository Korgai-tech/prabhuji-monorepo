import { z } from "zod";
import { requiredLocaleQuery } from "@api/shared/schemas";

/**
 * Zod schemas for `GET /paywall/config?locale=<code>` (TAM-45).
 *
 * These schemas are the single source of truth for the OpenAPI contract
 * emitted by `pnpm nx run api:openapi` and consumed by the generated TS
 * (`packages/api-client`) + Dart (`apps/mobile`) clients.
 *
 * The `locale` query param reuses `LanguageCodeSchema` (TAM-44) — the
 * canonical set of supported client-facing locales. `en` is a valid
 * server-side fallback locale for content lookup but is intentionally NOT
 * accepted as a client-supplied `locale`: mobile always sends one of the
 * eight Phase-1 language codes chosen at onboarding.
 */

// ---- request ---------------------------------------------------------------

/**
 * `PaywallConfigQuery` is intentionally NOT `.meta({ id })`-tagged. Named
 * component refs work for request bodies and responses but @fastify/swagger's
 * openapi emitter can't resolve them for querystring parameters (it tries
 * to look them up in a common-params table that doesn't exist yet) — so we
 * keep this inline. The `LanguageCodeSchema` INSIDE the object is still a
 * shared named component; only the parent wrapper is inlined.
 */
export const PaywallConfigQuery = z.object({
  ...requiredLocaleQuery.shape,
});

export type PaywallConfigQueryInput = z.infer<typeof PaywallConfigQuery>;

// ---- response components ---------------------------------------------------

export const PlanDisplay = z
  .object({
    planId: z.string(),
    productId: z.string(),
    // The period column is a free-form string in the DB, but every seeded
    // value is one of the three canonical billing periods. We keep it as
    // `string` on the wire (rather than an enum) so a future CMS-added plan
    // period (e.g. "half-year") doesn't require a mobile release.
    period: z.string(),
    localizedLabel: z.string(),
    trialLabel: z.string(),
    trialDays: z.number().int().nonnegative(),
    displayPriceText: z.string(),
    subscriptionDetailText: z.string(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "PaywallPlanDisplay" });

export const BenefitDisplay = z
  .object({
    benefitId: z.string(),
    localizedName: z.string(),
    /**
     * An icon KEY the client maps to a BUNDLED asset — never a URL.
     * Benefit artwork is part of the app's design system, not CMS content.
     */
    icon: z.string(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "PaywallBenefitDisplay" });

/**
 * TAM-159. One hero asset, in render order.
 *
 * Supersedes the flat `videoUrl`/`videoThumbnailUrl`/`videoId` triple, which
 * could only express "one video". A client that does not recognise `mediaType`
 * should skip the entry rather than render it blank.
 */
export const HeroMediaDisplay = z
  .object({
    mediaType: z.string(),
    url: z.string(),
    thumbnailUrl: z.string().nullable(),
    mediaId: z.string(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "PaywallHeroMediaDisplay" });

export const LegalLinksDisplay = z
  .object({
    privacyPolicyUrl: z.string(),
    termsServiceUrl: z.string(),
    refundPolicyUrl: z.string(),
  })
  .meta({ id: "PaywallLegalLinks" });

/**
 * The full paywall config payload — the `data` half of the success envelope.
 *
 * `localeServed` is a string (not `LanguageCodeSchema`) because the server
 * may resolve to `en` when neither the requested locale nor `hi` have
 * content; `en` is not part of the client-facing enum.
 */
export const PaywallConfigData = z
  .object({
    paywallId: z.string(),
    configVersion: z.number().int(),
    enabled: z.boolean(),
    localeRequested: z.string(),
    localeServed: z.string(),
    fallbackUsed: z.boolean(),
    fallbackFrom: z.string().nullable(),
    missingFields: z.array(z.string()),
    title: z.string(),
    /**
     * TAM-159. Which BUILT layout renders this config (`card_hero` |
     * `video_bleed` | `icon_grid` | `carousel`).
     *
     * Deliberately `z.string()` and not an enum. The value is only ever
     * meaningful to a client that already contains the widget, so the client's
     * unknown-value fallback is the real validation boundary — and an enum here
     * would mean a fifth layout could not be authored without an API release.
     *
     * ── WHY OPTIONAL WHEN THE SERVER ALWAYS SENDS IT ─────────────────────────
     * The generated Dart model asserts every REQUIRED key is present, so a
     * required `layout` would break a shipped app the moment the API rolled back
     * to a build that predates this field — and both environments auto-deploy
     * from a branch, so a rollback is a routine event, not a hypothetical.
     * Declaring it optional forces clients to handle absence, which is the only
     * version-skew discipline that survives deploying the two halves separately.
     */
    layout: z.string().optional(),
    /**
     * TAM-159. The hero, in render order. Empty when the resolved locale has no
     * assets. Optional for the same version-skew reason as `layout` — clients
     * fall back to the flat `videoUrl`/`videoThumbnailUrl` pair below.
     */
    heroMedia: z.array(HeroMediaDisplay).optional(),
    /**
     * DEPRECATED (TAM-159) — superseded by `heroMedia`, derived from it.
     *
     * MUST keep being emitted, and must stay non-optional: builds before the
     * layouts release read these three directly, and the generated Dart
     * `fromJson` returns null on a missing required key, which
     * `PaywallRepository` turns into an error screen rather than a paywall.
     * Removing them is a separate change, once no supported build reads them.
     */
    videoUrl: z.string().nullable(),
    videoThumbnailUrl: z.string().nullable(),
    videoId: z.string().nullable(),
    defaultPlanId: z.string().nullable(),
    plans: z.array(PlanDisplay),
    benefits: z.array(BenefitDisplay),
    legalLinks: LegalLinksDisplay,
    cancelAnytimeText: z.string(),
    refundPolicyText: z.string(),
    payNowCta: z.string(),
    shimmerEnabled: z.boolean(),
  })
  .meta({ id: "PaywallConfigData" });

export const PaywallConfigResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: PaywallConfigData,
  })
  .meta({ id: "PaywallConfigResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "PaywallErrorEnvelope" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}
