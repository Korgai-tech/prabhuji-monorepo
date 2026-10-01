import type { paths } from '@repo/api-client';

/**
 * THE admin-side language list — one of exactly two copies in the monorepo (the
 * other is `apps/api/src/shared/language.schema.ts`, which is served to mobile
 * over `GET /languages` so the app holds none).
 *
 * This replaced four hand-maintained copies (`status-schema.ts`,
 * `aarti-schema.ts`, `wallpaper-schema.ts`, `ringtone-schema.ts`), each of which
 * repeated the eight codes and could silently drift from the API.
 *
 * ## Why this can't drift
 *
 * `LanguageCode` is DERIVED from the emitted contract, and `LANGUAGE_LABELS` is
 * a `Record<LanguageCode, string>` — an exhaustive mapped type. So if the API
 * adds a ninth language, this file stops compiling until its label is added, and
 * if a code is removed the extra key is an error too. Drift is a build failure,
 * not a silent gap. `pnpm verify` runs the admin typecheck, so CI catches it.
 *
 * Only the LABELS live here. The codes never do.
 */

type LanguagesData =
  paths['/languages']['get']['responses'][200]['content']['application/json']['data'];

/** The exact union the API accepts — `'hi' | 'mr' | …`, straight from the contract. */
export type LanguageCode = LanguagesData['languages'][number]['code'];

/**
 * English exonyms for the admin UI. Native labels deliberately live only in the
 * API constant: they are user-facing app copy served to mobile, whereas admin
 * shows the code alongside the English name for unambiguous CMS data entry.
 */
const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  hi: 'Hindi',
  mr: 'Marathi',
  gu: 'Gujarati',
  bn: 'Bengali',
  or: 'Odia',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
};

/** The codes, as a non-empty tuple — `z.enum(LANGUAGE_CODES)` needs that shape. */
export const LANGUAGE_CODES = Object.keys(LANGUAGE_LABELS) as [
  LanguageCode,
  ...LanguageCode[],
];

/** `{ value, label }` options for the multi-selects and list-page filters. */
export const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] =
  LANGUAGE_CODES.map((value) => ({
    value,
    label: `${LANGUAGE_LABELS[value]} (${value})`,
  }));

/** `hi` → `Hindi (hi)` for read-only display of a language chip. */
export function languageLabel(code: string): string {
  const label = LANGUAGE_LABELS[code as LanguageCode];
  return label === undefined ? code : `${label} (${code})`;
}

// ── Admin-writable locales (`en` + the eight) ────────────────────────────────

/**
 * The label-translation editors write one MORE locale than a client can request:
 * `en`, the fallback the public read path resolves against. This mirrors the
 * server's `adminLocale` (`@api/shared/schemas` → `admin-translations.ts`), which
 * is likewise `[LABEL_FALLBACK_LOCALE, ...LanguageCodeSchema.options]` — so this
 * derives from `LANGUAGE_CODES` rather than repeating the eight a second time.
 */
export const LABEL_FALLBACK_LOCALE = 'en';

export type AdminLocale = typeof LABEL_FALLBACK_LOCALE | LanguageCode;

/** `en` first (the fallback), then the eight client languages in display order. */
export const ADMIN_LOCALE_CODES = [LABEL_FALLBACK_LOCALE, ...LANGUAGE_CODES] as [
  AdminLocale,
  ...AdminLocale[],
];

export const ADMIN_LOCALE_OPTIONS: { value: AdminLocale; label: string }[] = [
  { value: LABEL_FALLBACK_LOCALE, label: 'English (en)' },
  ...LANGUAGE_OPTIONS,
];

/** `en` → `English (en)` for read-only display of an existing translation row. */
export function adminLocaleLabel(locale: string): string {
  return (
    ADMIN_LOCALE_OPTIONS.find((l) => l.value === locale)?.label ?? locale
  );
}
