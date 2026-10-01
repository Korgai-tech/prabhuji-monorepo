import type { paths } from '@repo/api-client';

import { ADMIN_LOCALE_OPTIONS } from '@/lib/languages';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Horoscope module constants — the fixed enumerations TAM-100 pinned.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * These MIRROR TAM-100's Zod boundary (fast feedback only; the server is
 * authoritative). Read TAM-100's Evidence:
 *  - `zodiacId` is the FIXED TWELVE (`z.enum(ZODIAC_SLUGS)`), immutable in PATCH.
 *  - `safetyCategory` is the deny-list bucket set
 *    (`medical | financial | fear | ritual_pressure | harm`).
 *  - `languageCode` / the locale-map keys are the nine client locales.
 *  - `contentType` is `text | number | color`.
 */

// ── Types DERIVED from the generated client (never hand-written) ──────────────

type ZodiacCreateBody =
  paths['/admin/horoscope/zodiac-signs']['post']['requestBody']['content']['application/json'];
type ResultCreateBody =
  paths['/admin/horoscope/results']['post']['requestBody']['content']['application/json'];
type StepCreateBody =
  paths['/admin/horoscope/steps']['post']['requestBody']['content']['application/json'];

/** The fixed twelve signs (TAM-100 `z.enum(ZODIAC_SLUGS)`), immutable in PATCH. */
export type ZodiacId = ZodiacCreateBody['zodiacId'];
/** The nine client languages a daily result can be authored in. */
export type LanguageCode = ResultCreateBody['languageCode'];
/** `text | number | color`. */
export type ContentType = ResultCreateBody['steps'][number]['contentType'];
/** The deny-list buckets — a wrong bucket weakens a safety check. */
export type SafetyCategory = StepCreateBody['safetyCategory'];

// ── The pinned enumerations, with human labels ───────────────────────────────

/** The fixed twelve, in the zodiac's conventional order. */
export const ZODIAC_IDS: { value: ZodiacId; label: string }[] = [
  { value: 'aries', label: 'Aries' },
  { value: 'taurus', label: 'Taurus' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'cancer', label: 'Cancer' },
  { value: 'leo', label: 'Leo' },
  { value: 'virgo', label: 'Virgo' },
  { value: 'libra', label: 'Libra' },
  { value: 'scorpio', label: 'Scorpio' },
  { value: 'sagittarius', label: 'Sagittarius' },
  { value: 'capricorn', label: 'Capricorn' },
  { value: 'aquarius', label: 'Aquarius' },
  { value: 'pisces', label: 'Pisces' },
];

/**
 * The nine locales this module accepts (TAM-57 client set), reused for the
 * result `languageCode` select AND the `{locale:text}` locale-map editors
 * (`localizedDisplayName` / `localizedTitle`). `en` is the fallback.
 */
export const HOROSCOPE_LOCALES: { value: LanguageCode; label: string }[] =
  ADMIN_LOCALE_OPTIONS;

/** The step content types (TAM-100 `z.enum`). */
export const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'color', label: 'Color' },
];

/**
 * The safety-category deny-list buckets (TAM-100 `HOROSCOPE_SAFETY_CATEGORIES`).
 * A wrong bucket weakens the content-safety check, so this is a select, never
 * free text (spec §(f)).
 */
export const SAFETY_CATEGORIES: { value: SafetyCategory; label: string }[] = [
  { value: 'medical', label: 'Medical' },
  { value: 'financial', label: 'Financial' },
  { value: 'fear', label: 'Fear' },
  { value: 'ritual_pressure', label: 'Ritual pressure' },
  { value: 'harm', label: 'Harm' },
];

/** `aries` → `Aries` (falls back to the raw id for an unknown/legacy value). */
export function zodiacLabel(id: string): string {
  return ZODIAC_IDS.find((z) => z.value === id)?.label ?? id;
}

/** `en` → `English (en)`. */
export function localeLabel(locale: string): string {
  return HOROSCOPE_LOCALES.find((l) => l.value === locale)?.label ?? locale;
}

// ── IST civil-date helpers ───────────────────────────────────────────────────
//
// `dateIst` is a strict `YYYY-MM-DD` civil date in Asia/Kolkata — NEVER a
// datetime picker, NEVER an ISO timestamp (TAM-100 rejects it). `en-CA` formats
// a Date as `YYYY-MM-DD`, and `timeZone: 'Asia/Kolkata'` pins the civil day.

/** Strict `YYYY-MM-DD` — the shape TAM-100's `dateIst` regex accepts. */
export const DATE_IST_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The IST civil date `offsetDays` from now, as `YYYY-MM-DD`. */
export function istDate(offsetDays = 0): string {
  const at = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(at);
}

/** Today (IST). */
export const istToday = (): string => istDate(0);
/** Tomorrow (IST) — the editor's "what still needs authoring?" default. */
export const istTomorrow = (): string => istDate(1);
