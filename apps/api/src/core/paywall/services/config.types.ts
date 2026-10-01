/**
 * Re-export of the module-root raw types so consumers importing from the
 * services barrel still get the same names. Source of truth is
 * `@api/core/paywall/types` — see the comment there.
 */
export type {
  RawBenefit,
  RawBenefitTranslation,
  RawHeroMedia,
  RawLegalLinks,
  RawPaywallConfig,
  RawPlan,
  RawPlanTranslation,
  RawTranslation,
} from "@api/core/paywall/types";
