import { z } from 'zod';

import { adminLocaleEnum } from '@/components/translations';
import { ADMIN_LOCALE_OPTIONS } from '@/lib/languages';

import type { DeityLocale } from './use-deities';

/**
 * MIRRORS TAM-88's `AdminDeityCreateBody` / `AdminDeityPatchBody`
 * (`apps/api/.../deity.admin.schemas.ts`). FAST FEEDBACK ONLY — the server's Zod
 * at the route boundary is authoritative; if they disagree the server wins and
 * `unwrap()` surfaces its message. Keep in sync BY HAND (this is a mirror, not a
 * generated artifact).
 *
 * `iconUrl` is a REQUIRED URL: while `<MediaUploadField>` has not yet reported a
 * `publicUrl`, the value is empty and this mirror blocks submit — the
 * "submitted before the upload finished" guard, with no change to
 * `<EntityForm>` (§(c)).
 */

/** Server: lowercase alphanumerics joined by single hyphens, no whitespace. */
const slug = z
  .string()
  .min(1, 'Slug is required')
  .max(64, 'Slug must be 64 characters or fewer')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Lowercase letters, numbers and single hyphens only — no spaces',
  );

/** A single translation row (mirrors the server's `translationInput`). */
export const TranslationSchema = z.object({
  locale: adminLocaleEnum,
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a display name')
    .max(200, 'Display name must be 200 characters or fewer'),
});

export type TranslationValues = z.infer<typeof TranslationSchema>;

/** The fields `<EntityForm>` owns. `slug` is present in BOTH modes but the form
 *  disables it on edit and the PATCH hook never sends it (immutable business
 *  key). Server-authoritative `updatedAt` is merged in by `<EntityForm mode="edit">`.
 *  `translations` rides in the create/patch body (replace-set on update). */
export const DeityFormSchema = z.object({
  slug,
  iconUrl: z.string().url('Upload an icon to continue'),
  sortOrder: z.number().int('Whole numbers only'),
  active: z.boolean(),
  translations: z.array(TranslationSchema).default([]),
});

export type DeityFormValues = z.infer<typeof DeityFormSchema>;

/**
 * The admin-writable locales (TAM-88 `AdminDeityLocale`) with human labels for
 * the translations editor's language picker. `en` is the fallback the public
 * read path resolves against (TAM-57).
 */
export const DEITY_LOCALES: { value: DeityLocale; label: string }[] =
  ADMIN_LOCALE_OPTIONS;

/** `en` → `English (en)` for read-only display of an existing translation row. */
export function localeLabel(locale: string): string {
  return DEITY_LOCALES.find((l) => l.value === locale)?.label ?? locale;
}
