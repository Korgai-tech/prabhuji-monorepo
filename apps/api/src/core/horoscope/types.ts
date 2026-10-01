/**
 * Horoscope module public types (TAM-73).
 *
 * A Pro-only daily-value feature with two read surfaces: a FREE zodiac grid
 * (discovery) and a Pro-GATED daily result. The horoscope engine source (AI vs
 * third-party API) is not finalized (PRD §6.10 / open-question q1) — Phase 1
 * ships a `HoroscopeProvider` INTERFACE whose only concrete impl is a
 * `CmsHoroscopeProvider` reading seeded rows. These are the wire-facing shapes
 * the service assembles and the controller sends; they are validated on the way
 * out by the Zod response schemas in `routes/horoscope.schemas.ts` (the OpenAPI
 * source of truth).
 */

/**
 * The 12 stable zodiac slugs (typo-free — `sagittarius`, `capricorn`, correcting
 * the Figma "saittarius"/"capricon"). This const is the single source of the
 * zodiac enum the route validates `?zodiac=` against (unknown → 400).
 */
export const ZODIAC_SLUGS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;
export type ZodiacSlug = (typeof ZODIAC_SLUGS)[number];

/** The single enabled Phase-1 mode. Weekly/monthly are Phase-2 (schema allows). */
export const DAILY_MODE_ID = "daily_horoscope";

/** Supported step content kinds. */
export const STEP_CONTENT_TYPES = ["text", "number", "color"] as const;
export type StepContentType = (typeof STEP_CONTENT_TYPES)[number];

/**
 * Content-safety verdict token stored on a result and echoed to the client. Only
 * `passed` content is ever served (the validator runs on seed AND serve).
 */
export const CONTENT_SAFETY_STATUS = "passed" as const;

/**
 * Locale fallback order (open-question q2, confirmed): the requested locale
 * first, then Hindi, then English. Changing this hierarchy is a one-line edit
 * here (the resolver reads this order).
 */
export const FALLBACK_LOCALES = ["hi", "en"] as const;

/**
 * The locales ONE generation produces, in one model call (TAM-73 content
 * pipeline). Every generated `(zodiac, dateIst)` writes exactly this many
 * `daily_horoscope_result` rows — one per locale.
 *
 * HINDI ONLY, deliberately. This was `["en", "hi", "mr", "te"]`; every other
 * locale now resolves through `FALLBACK_LOCALES` to the Hindi row instead of
 * having its own. Two reasons that both point the same way:
 *
 *  - Hindi is the only language the product needs right now, and each extra
 *    locale is output tokens on every call for all 12 signs, every day.
 *  - The Marathi and Telugu the current model produced were visibly weak, and
 *    the deny-list that guards them is explicitly flagged as needing native
 *    review (`content-safety.ts`). Serving Hindi to a Marathi user is a known,
 *    readable fallback; serving bad Marathi is not.
 *
 * The fallback chain makes the narrowing safe rather than a 404 machine: a
 * request for `mr`, `te` or the controller's default `en` misses its own row,
 * then hits `hi`. That is why `FALLBACK_LOCALES` must keep ending in a locale
 * that is generated — today `hi` is both the only generated locale and the
 * first fallback, so the chain always terminates in real content.
 *
 * Restoring a locale is a one-line change here: the prompt, the response
 * schema, the validator, the storage fan out and the coverage expectation all
 * read this tuple. Rows already stored for the dropped locales need no cleanup
 * — reads are always for TODAY's IST date, so yesterday's Marathi row is never
 * reachable; it just stops being written from the day this ships.
 */
export const GENERATION_LOCALES = ["hi"] as const;
export type GenerationLocale = (typeof GENERATION_LOCALES)[number];

/**
 * The content-safety buckets `validateContentSafety` classifies against — the
 * `safetyCategory` an editor may assign to a `HoroscopeStepConfig` row. Kept as
 * a runtime tuple here (types.ts is the lowest layer, importable by both the
 * repository and the routes) so the Zod boundary allowlist can never drift from
 * the deny-list buckets. The admin service pins this to `SafetyCategory` with a
 * compile-time `satisfies` guard, so adding a bucket to `content-safety.ts`
 * without listing it here is a type error. #EXPORT_CRITICAL.
 */
export const HOROSCOPE_SAFETY_CATEGORIES = [
  "medical",
  "financial",
  "fear",
  "ritual_pressure",
  "harm",
] as const;
export type HoroscopeSafetyCategory =
  (typeof HOROSCOPE_SAFETY_CATEGORIES)[number];

/** A zodiac grid card (FREE discovery — no lock badges, no Pro flags). */
export interface ZodiacCard {
  zodiacId: string;
  displayName: string;
  iconAssetUrl: string;
  sortOrder: number;
}

/** One resolved, ordered horoscope step in a served daily result. */
export interface DailyStep {
  stepId: string;
  title: string;
  displayText: string;
  ttsText: string;
  order: number;
  contentType: StepContentType;
  ttsEnabled: boolean;
}

/** Result background media (shared across zodiacs; TAM-56 placeholder URLs). */
export interface HoroscopeMedia {
  backgroundVideoUrl: string;
  backgroundStaticFallbackUrl: string;
  assetVersion: number;
}

/**
 * The full Pro-gated daily result (`GET /horoscope/daily`). Carries the analytics
 * fields TAM-74 attaches to its client events (`localeRequested`, `localeServed`,
 * `fallbackUsed`, `contentSafetyStatus`, `modeId`, per-step `stepId` + `order`).
 */
export interface DailyResult {
  zodiacId: string;
  modeId: string;
  dateIst: string;
  localeRequested: string;
  localeServed: string;
  fallbackUsed: boolean;
  contentSafetyStatus: string;
  providerName: string;
  steps: DailyStep[];
  media: HoroscopeMedia;
}

// ===========================================================================
// Admin write surface (TAM-100). DTOs the admin service returns to the
// controller — plain, wire-ready shapes (timestamps already `.toISOString()`d,
// Json columns narrowed) so the service stays Prisma-free and the Zod response
// schemas validate them unchanged. Admin reads are NOT localized and NOT
// Pro-gated: an editor sees the raw row (every locale in the Json map).
//
// This module diverges from the epic conventions (TAM-73) and admin MUST match
// what exists: liveness is `enabled` (NOT `isActive`); localization is a Json
// `{locale:text}` map (NOT translation tables); identity is a business-key
// string (NOT a slug/uuid on the wire).
// ===========================================================================

/** A `{ locale: text }` map — the module's pre-existing localization shape. */
export type LocaleMap = Record<string, string>;

/** A stored/ordered step inside a `DailyHoroscopeResult.steps` Json array. */
export interface AdminResultStep {
  stepId: string;
  title: string;
  displayText: string;
  ttsText: string;
  order: number;
  contentType: StepContentType;
}

/** Admin `ZodiacSign` row (the raw row; `localizedDisplayName` is the Json map). */
export interface AdminZodiacSignView {
  id: string;
  zodiacId: string;
  displayName: string;
  localizedDisplayName: LocaleMap;
  iconAssetUrl: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Admin `HoroscopeMode` row. */
export interface AdminHoroscopeModeView {
  id: string;
  modeId: string;
  modeName: string;
  enabled: boolean;
  phase: number;
  createdAt: string;
  updatedAt: string;
}

/** Admin `HoroscopeStepConfig` row (the DATA-DRIVEN ordered step catalogue). */
export interface AdminStepConfigView {
  id: string;
  stepId: string;
  modeId: string;
  title: string;
  localizedTitle: LocaleMap;
  order: number;
  enabled: boolean;
  contentType: StepContentType;
  providerMapping: string;
  ttsEnabled: boolean;
  safetyCategory: string;
  createdAt: string;
  updatedAt: string;
}

/** Admin `DailyHoroscopeResult` row (the Phase-1 horoscope product itself). */
export interface AdminDailyResultView {
  id: string;
  zodiacId: string;
  modeId: string;
  dateIst: string;
  languageCode: string;
  steps: AdminResultStep[];
  providerName: string;
  generatedAt: string;
  contentSafetyStatus: string;
  createdAt: string;
  updatedAt: string;
}

/** Admin `MediaAsset` row (horoscope-owned; NOT the TAM-84 media ledger). */
export interface AdminMediaAssetView {
  id: string;
  assetKey: string;
  resultBackgroundVideoUrl: string;
  resultBackgroundStaticFallbackUrl: string;
  assetVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** One offset page + the unpaginated total (ADR §C2). */
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// --- sort allowlists (live HERE so the repository builds `orderBy` from the
// same tuple the Zod enum is built from — `repositories/` cannot import
// `routes/`, so the boundary allowlist and the DB sort can never drift). ------

export const ZODIAC_SORT_FIELDS = [
  "zodiacId",
  "displayName",
  "sortOrder",
  "enabled",
  "createdAt",
  "updatedAt",
] as const;
export type ZodiacSortField = (typeof ZODIAC_SORT_FIELDS)[number];

export const HOROSCOPE_MODE_SORT_FIELDS = [
  "modeId",
  "enabled",
  "phase",
  "createdAt",
  "updatedAt",
] as const;
export type HoroscopeModeSortField =
  (typeof HOROSCOPE_MODE_SORT_FIELDS)[number];

export const STEP_CONFIG_SORT_FIELDS = [
  "stepId",
  "modeId",
  "order",
  "enabled",
  "createdAt",
  "updatedAt",
] as const;
export type StepConfigSortField = (typeof STEP_CONFIG_SORT_FIELDS)[number];

export const DAILY_RESULT_SORT_FIELDS = [
  "zodiacId",
  "modeId",
  "dateIst",
  "languageCode",
  "generatedAt",
  "createdAt",
  "updatedAt",
] as const;
export type DailyResultSortField = (typeof DAILY_RESULT_SORT_FIELDS)[number];

export const MEDIA_ASSET_SORT_FIELDS = [
  "assetKey",
  "assetVersion",
  "createdAt",
  "updatedAt",
] as const;
export type MediaAssetSortField = (typeof MEDIA_ASSET_SORT_FIELDS)[number];

// --- partial mutation inputs the repository applies under a precondition ------

export interface AdminZodiacUpdateInput {
  displayName?: string;
  localizedDisplayName?: LocaleMap;
  iconAssetUrl?: string;
  sortOrder?: number;
  enabled?: boolean;
}

export interface AdminHoroscopeModeUpdateInput {
  modeName?: string;
  phase?: number;
  enabled?: boolean;
}

export interface AdminStepConfigUpdateInput {
  title?: string;
  localizedTitle?: LocaleMap;
  order?: number;
  enabled?: boolean;
  contentType?: StepContentType;
  providerMapping?: string;
  ttsEnabled?: boolean;
  safetyCategory?: string;
}

export interface AdminDailyResultUpdateInput {
  steps?: AdminResultStep[];
  providerName?: string;
  generatedAt?: Date;
  contentSafetyStatus?: string;
}

export interface AdminMediaAssetUpdateInput {
  resultBackgroundVideoUrl?: string;
  resultBackgroundStaticFallbackUrl?: string;
  assetVersion?: number;
}
