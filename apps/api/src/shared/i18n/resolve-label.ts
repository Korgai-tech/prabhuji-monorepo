/**
 * TAM-108 — the shared framing-label localization resolver.
 *
 * The CMS label-localization design (`docs/CMS-LABEL-LOCALIZATION.md`) is
 * ADDITIVE: every localized entity keeps its existing single-string column as
 * the guaranteed fallback value, and a new `<Entity>Translation` table
 * (`@@unique([<fk>, locale])`, mirroring `DeityTranslation`) carries per-client-
 * language OVERRIDES only. The public read rule is exactly:
 *
 *   label(requested_locale) = translation[requested_locale] ?? base_column
 *
 * This module is the ONE place that rule lives, so every module's serving code
 * (TAM-109…113) resolves labels identically. It is PURE — no Prisma, no Fastify,
 * no I/O — and imports nothing from `core/`, so it is safe to call from any
 * module's service layer.
 */

/**
 * The label fallback locale (design §3 / product decision P7): the locale the
 * base column is assumed to hold, and the locale the read path falls back to
 * when a requested locale has no override row. `en`, matching `DeityTranslation`
 * (`DEFAULT_DEITY_LOCALE`) — the pattern this work standardizes on.
 *
 * Note: for these entities the base COLUMN is the fallback value (an
 * `AudioCategory` has a `name` column), so a fallback row is never required —
 * this constant names the semantic locale of that base string for the admin /
 * backfill tickets (TAM-116), not a lookup key on the hot read path.
 */
export const LABEL_FALLBACK_LOCALE = "en";

/** The minimal shape a translation row must have to be resolved: its `locale`. */
export interface LocaleRow {
  locale: string;
}

/**
 * The requested locale's translation row, or `undefined` when the entity has no
 * override for it (⇒ the caller resolves to the base column). A nullish
 * `requestedLocale` (an absent `?locale=` query param — today's exact behaviour)
 * short-circuits to `undefined`, so an un-updated client always gets the base
 * string. Multi-field entities (`HomeFeedItem`) find the row ONCE and read each
 * localized field off it (like `PaywallPlanTranslation`).
 */
export function findTranslation<T extends LocaleRow>(
  translations: readonly T[],
  requestedLocale: string | null | undefined
): T | undefined {
  if (requestedLocale == null || requestedLocale === "") return undefined;
  return translations.find((t) => t.locale === requestedLocale);
}

/**
 * Resolve one framing label for a requested locale: `translation[requested] ??
 * base`. `pick` reads the localized value off the matched row; a nullish
 * override (a partial translation row that left this field blank) falls through
 * to `base`, so a translation can never BLANK a label that has a base value.
 *
 * The return type follows `base`: a non-null base yields a `string`; a nullable
 * base (e.g. `HomeBanner.title`, `HomeFeedItem.subtitle`) yields `string | null`.
 *
 * @example single-field
 *   name = resolveLocalizedLabel(row.name, row.translations, locale, (t) => t.name)
 * @example multi-field (resolve the row once, read each field)
 *   const t = findTranslation(row.translations, locale);
 *   const title = t?.title ?? row.title;
 */
export function resolveLocalizedLabel<T extends LocaleRow, V extends string | null>(
  base: V,
  translations: readonly T[],
  requestedLocale: string | null | undefined,
  pick: (translation: T) => string | null | undefined
): V {
  const match = findTranslation(translations, requestedLocale);
  const override = match ? pick(match) : undefined;
  return (override ?? base) as V;
}
