import { z } from 'zod';

import { translationsSchema } from '@/components/translations';
import { LANGUAGE_CODES, LANGUAGE_OPTIONS, languageLabel } from '@/lib/languages';

import type { SectionType } from './use-aarti';

/**
 * Client-side Zod MIRRORS of TAM-90's `apps/api` Aarti admin schemas. FAST
 * FEEDBACK ONLY — the server's Zod at the route boundary is authoritative; if
 * they disagree the server wins and `unwrap()` surfaces its message. Keep in
 * sync BY HAND (a mirror, not a generated artifact — the enums/codes below are
 * derived from the generated `@repo/api-client` types so they cannot drift
 * silently).
 *
 * Media URL fields (`imageUrl`, `coverImageUrl`, `audioStreamUrl`) are required
 * URLs: while `<MediaUploadField>` has not yet reported a `publicUrl` the value
 * is empty and this mirror blocks submit — the "submitted before the upload
 * finished" guard, with no change to `<EntityForm>` (TAM-89 §(c)).
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

// ── Language codes (the 8 client locales; empty = all) ───────────────────────

/**
 * Re-exported from `@/lib/languages` — the ONE admin-side list, derived from the
 * emitted contract. This module used to hardcode the codes AND their labels.
 */
export { LANGUAGE_CODES, LANGUAGE_OPTIONS, languageLabel };

// ── Homepage section types (the known, server-resolvable set) ────────────────

/**
 * The dynamic section types the server can resolve (TAM-90 AC (g)). A free-text
 * value would create a section that renders as nothing with no error, so this is
 * a fixed `<select>` — never a text input.
 *
 * `curated` (TAM-160) is the ONE type whose items are hand-picked rather than
 * resolved: unlike the built-ins it is NOT one-per-module, and it takes an
 * ordered item list edited from `section-items-editor.tsx`.
 */
export const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: 'recently_played', label: 'Recently played' },
  { value: 'deities', label: 'Deities' },
  { value: 'browse_categories', label: 'Browse categories' },
  { value: 'newly_added', label: 'Newly added' },
  { value: 'most_played', label: 'Most played' },
  { value: 'curated', label: 'Curated (hand-picked)' },
];

/** `deities` → `Deities`. */
export function sectionTypeLabel(value: string): string {
  return SECTION_TYPES.find((s) => s.value === value)?.label ?? value;
}

// ── Category form ────────────────────────────────────────────────────────────

export const CategoryFormSchema = z.object({
  slug,
  name: z.string().trim().min(1, 'Name is required').max(200, 'Too long'),
  imageUrl: z.string().url('Upload an image to continue'),
  description: z.string(),
  displayColor: z.string(),
  sortOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  translations: translationsSchema({
    name: z.string().trim().min(1, 'Name is required').max(200),
    description: z.string().trim().max(2000),
  }),
});

export type CategoryFormValues = z.infer<typeof CategoryFormSchema>;

// ── Item form ────────────────────────────────────────────────────────────────

export const ItemFormSchema = z.object({
  slug,
  title: z.string().trim().min(1, 'Title is required').max(200, 'Too long'),
  coverImageUrl: z.string().url('Upload a cover image to continue'),
  audioStreamUrl: z.string().url('Upload an audio file to continue'),
  singerName: z.string(),
  composerNames: z.string(),
  // A single deity, picked from the deity list (never typed — no FK catches a
  // typo, TAM-90 AC (f)). Required on the wire (TAM-108 create body).
  deitySlug: z.string().min(1, 'Pick a deity'),
  // The languages this item is available in; empty = all (TAM-108).
  languages: z.array(z.enum(LANGUAGE_CODES)),
  description: z.string(),
  publishedAt: z.string(),
  isFeatured: z.boolean(),
  isPrabhujiOriginal: z.boolean(),
  isActive: z.boolean(),
});

export type ItemFormValues = z.infer<typeof ItemFormSchema>;

// ── Section form ─────────────────────────────────────────────────────────────

export const SectionFormSchema = z.object({
  sectionType: z.enum([
    'recently_played',
    'deities',
    'browse_categories',
    'newly_added',
    'most_played',
    'curated',
  ]),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Too long'),
  sortOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  translations: translationsSchema({
    title: z.string().trim().min(1, 'Title is required').max(200),
  }),
});

export type SectionFormValues = z.infer<typeof SectionFormSchema>;

/** `''` → `null`; otherwise the trimmed string. Turns an empty optional text
 *  field into the API's `null` rather than `""`. */
export function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
