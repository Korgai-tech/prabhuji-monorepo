/**
 * The admin-writable locales for the label-translation editors (TAM-108) — `en`
 * (the fallback the public read path resolves against, TAM-57) plus the eight
 * Phase-1 client languages. This mirrors the server's `adminLocale` enum
 * (`@api/shared/schemas` → `admin-translations.ts`), which is itself built from
 * `LanguageCodeSchema`, so an editor can never offer a locale no client speaks.
 *
 * The codes now come from `@/lib/languages` — the ONE admin-side list, derived
 * from the emitted contract. This module used to hardcode all nine.
 */
import { z } from 'zod';

import {
  ADMIN_LOCALE_CODES,
  ADMIN_LOCALE_OPTIONS,
  adminLocaleLabel,
} from '@/lib/languages';

export { ADMIN_LOCALE_CODES };

/** The `{ value, label }` options for a translations-editor locale picker. */
export const ADMIN_LOCALES: { value: string; label: string }[] =
  ADMIN_LOCALE_OPTIONS;

/** `en` → `English (en)` for read-only display of an existing translation row. */
export const localeLabel = adminLocaleLabel;

/**
 * The Zod locale enum a form schema uses so its `translations[].locale` type
 * matches the generated request body's `adminLocale` enum exactly (avoids a cast
 * at the mutation boundary).
 */
export const adminLocaleEnum = z.enum(ADMIN_LOCALE_CODES);

/**
 * Build the `translations` field for a form's Zod mirror:
 * `z.array(z.object({ locale, ...fields })).default([])`. A required localized
 * field (`z.string().min(1)`) blocks submit until filled — the same guard the
 * server enforces.
 */
export function translationsSchema<T extends z.ZodRawShape>(fields: T) {
  return z.array(z.object({ locale: adminLocaleEnum, ...fields })).default([]);
}

/**
 * True if the edited translation set differs from the loaded one (order- and
 * key-order-insensitive) — used by the "send only what changed" edit forms so an
 * untouched set is omitted from the PATCH body and the server leaves it be.
 */
export function translationsChanged<T extends { locale: string }>(
  next: readonly T[],
  current: readonly T[],
): boolean {
  const norm = (rows: readonly T[]): string =>
    JSON.stringify(
      rows
        .map((r) =>
          Object.keys(r)
            .sort()
            .map((k) => [k, (r as Record<string, unknown>)[k]]),
        )
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  return norm(next) !== norm(current);
}
