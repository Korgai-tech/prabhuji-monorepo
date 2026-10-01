/**
 * Raw, DB-shaped types returned by the paywall module's repository +
 * `PaywallConfigProvider` (TAM-46).
 *
 * "Raw" here means: pre-fallback, pre-shape-massage, one row per query. The
 * consumer (TAM-45's controller/service) owns the fallback resolution (i.e.
 * "no `bn` translation → fall back to `hi`") and the final wire projection —
 * this module intentionally stops at raw rows so the cache key stays keyed
 * on a single `(paywallId, locale)` and doesn't have to re-cache every
 * fallback combination.
 *
 * These types live at the module root (rather than under `services/` or
 * `repositories/`) so both the repo and the service can import them without
 * violating the layered architecture (repositories can't import from
 * services and vice versa — see `arch-boundaries.json`).
 */

export interface RawPaywallConfig {
  id: string;
  paywallId: string;
  configVersion: number;
  enabled: boolean;
  defaultPlanId: string | null;
  shimmerEnabled: boolean;
  hasVideoLocaleFallback: boolean;
  /** TAM-159. Which built layout renders this config; the client falls back on anything it doesn't know. */
  layout: string;
  /** TAM-159. Lowest `major.minor.patch` app version allowed to receive this paywall. `0.0.0` = no gate. */
  minAppVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RawPlanTranslation {
  locale: string;
  /**
   * TAM-159. Which variant this copy row belongs to. The canonical row carries
   * the sentinel (`vip-membership-v1`); a variant that overrides the wording
   * carries its own id. The service prefers the variant's row and falls back to
   * the canonical one — see `resolvePlanTranslation`.
   */
  paywallId: string;
  localizedLabel: string;
  trialLabel: string;
  displayPriceText: string;
  subscriptionDetailText: string;
}

/**
 * TAM-159. One hero asset. An ordered list of these per `(paywallId, locale)`
 * replaces the single nullable video the flat `paywall_translations.video_*`
 * columns could express: one `image` row (P-1/P-3), one `video` row (P-2), or N
 * `image` rows rendered as a carousel (P-4).
 */
export interface RawHeroMedia {
  paywallId: string;
  locale: string;
  sortOrder: number;
  /** `image` | `video`. Not an enum — see the schema comment on `PaywallHeroMedia`. */
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
}

/**
 * A plan reduced to what BILLING needs: the machine-readable price and the
 * trial length, with no locale and no display copy.
 *
 * Deliberately separate from `RawPlan`. The paywall's own reads are
 * locale-scoped because everything they return is display text; the payment
 * module needs none of that and must never be in a position where the amount
 * it charges depends on which locale it happened to ask for.
 */
export interface PurchasablePlan {
  planId: string;
  productId: string;
  period: string;
  trialDays: number;
  /** Integer paise. Never derived from `displayPriceText`. */
  amountPaise: number;
  /**
   * Integer paise taken at mandate registration while a trial runs — the small
   * charge that proves the payment instrument works before the real price is
   * due. Read by the payment module, never shown to the user.
   */
  initialDepositPaise: number;
  currency: string;
}

export interface RawPlan {
  id: string;
  paywallId: string;
  planId: string;
  productId: string;
  period: string;
  sortOrder: number;
  enabled: boolean;
  trialDays: number;
  /**
   * The translation for the requested locale. `null` when no row exists for
   * `(planId, locale)` — TAM-45's service handles the fallback lookup.
   */
  translation: RawPlanTranslation | null;
}

export interface RawBenefitTranslation {
  locale: string;
  localizedName: string;
}

export interface RawBenefit {
  id: string;
  paywallId: string;
  benefitId: string;
  /** An icon KEY the client maps to a BUNDLED asset — never a URL, never CMS-uploaded. */
  icon: string;
  sortOrder: number;
  enabled: boolean;
  translation: RawBenefitTranslation | null;
}

export interface RawTranslation {
  id: string;
  paywallId: string;
  locale: string;
  title: string;
  videoUrl: string | null;
  videoThumbnailUrl: string | null;
  videoId: string | null;
  cancelAnytimeText: string;
  refundPolicyText: string;
  payNowCta: string;
}

export interface RawLegalLinks {
  id: string;
  paywallId: string;
  locale: string;
  privacyPolicyUrl: string;
  termsServiceUrl: string;
  refundPolicyUrl: string;
}

// ---------------------------------------------------------------------------
// admin write-side (TAM-159) — multi-paywall CMS
//
// Supersedes TAM-130's hero-video-only surface. The flat `video_*` columns it
// wrote are dead as of TAM-159 (the wire derives the hero from
// `paywall_hero_media`), so keeping that endpoint would let an editor upload a
// video that silently never reaches a device.
// ---------------------------------------------------------------------------

/** One row of the paywall list — enough to pick one, no per-locale detail. */
export interface PaywallAdminListRow {
  paywallId: string;
  layout: string;
  minAppVersion: string;
  enabled: boolean;
  configVersion: number;
  updatedAt: Date;
}

/** One hero asset as the editor sees and writes it. */
export interface PaywallAdminHeroMediaRow {
  locale: string;
  sortOrder: number;
  mediaType: string;
  url: string;
  thumbnailUrl: string | null;
  mediaId: string;
}

/** The editable shell copy of one `paywall_translations` row. */
export interface PaywallAdminCopyRow {
  locale: string;
  title: string;
  cancelAnytimeText: string;
  refundPolicyText: string;
  payNowCta: string;
}

/** The changed subset of one locale's shell copy. `undefined` = leave alone. */
export interface PaywallCopyWriteData {
  title?: string;
  cancelAnytimeText?: string;
  refundPolicyText?: string;
  payNowCta?: string;
}

/** One locale's copy diff, as handed to the repository. Never empty. */
export interface PaywallCopyUpdate {
  locale: string;
  data: PaywallCopyWriteData;
}

/**
 * A full replacement of one locale's hero list.
 *
 * Replace-set (delete-all + insert), unlike the shell copy's in-place update:
 * `paywall_hero_media` is wholly owned by this endpoint — there are no columns
 * it does not know about — and the list is ORDERED, so "set position 2" is not
 * expressible as a per-row patch without a reindexing dance.
 */
export interface PaywallHeroMediaReplacement {
  locale: string;
  rows: {
    sortOrder: number;
    mediaType: string;
    url: string;
    thumbnailUrl: string | null;
    mediaId: string;
  }[];
}

