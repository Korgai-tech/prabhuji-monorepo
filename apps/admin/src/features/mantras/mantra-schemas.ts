import { z } from 'zod';

import { translationsSchema } from '@/components/translations';
import { LANGUAGE_CODES, LANGUAGE_OPTIONS } from '@/lib/languages';


/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Zod mirrors + fixed vocabularies for the Mantras admin UI (TAM-93).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * These MIRROR TAM-92's server Zod (`mantras.admin.schemas.ts`) for FAST
 * FEEDBACK ONLY — the API's Zod at the route boundary is authoritative; if they
 * disagree the server wins and `unwrap()` surfaces its message. Kept in sync BY
 * HAND (a mirror, not a generated artifact).
 *
 * TAM-92 module-specific realities encoded here:
 *  - `mantraText` / `transliterationText` are Devanagari scripture with MEANINGFUL
 *    whitespace. The mirror does NOT `.trim()`, collapse or normalize them —
 *    blank lines and trailing spaces must survive the round-trip (AC (c)).
 *  - `type` / `sectionType` / `layoutType` are FIXED sets (selects, never free
 *    text) — an unknown value has no client renderer.
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

/** An OPTIONAL uploaded-media URL: a valid URL, or empty (meaning "none"). */
const optionalMediaUrl = z.union([z.string().url('Enter a valid URL'), z.literal('')]);

/** A REQUIRED uploaded-media URL: empty (no upload yet) blocks submit. */
const requiredMediaUrl = z.string().url('Upload a file to continue');

// ── Fixed vocabularies (mirror TAM-92 — selects, never free text) ────────────

/** `mantra | stuti` — TAM-92's `type` enum. */
export const MANTRA_TYPE_OPTIONS: { value: 'mantra' | 'stuti'; label: string }[] = [
  { value: 'mantra', label: 'Mantra' },
  { value: 'stuti', label: 'Stuti' },
];

/**
 * The client languages (empty selection = all). Re-exported from
 * `@/lib/languages` — the ONE admin-side list, derived from the emitted
 * contract. This module used to hardcode the codes and their labels.
 */
export { LANGUAGE_OPTIONS };

const LANGUAGE_VALUES = LANGUAGE_CODES;

/**
 * The homepage `sectionType` set (create-only, read-only on edit). `curated`
 * (TAM-160) is the only type that is NOT one-per-module and the only one whose
 * items are hand-picked (`section-items-editor.tsx`) instead of resolved.
 */
export const SECTION_TYPE_OPTIONS: {
  value: 'recently_played' | 'deities' | 'categories' | 'newly_added' | 'curated';
  label: string;
}[] = [
  { value: 'recently_played', label: 'Recently played' },
  { value: 'deities', label: 'Deities' },
  { value: 'categories', label: 'Categories' },
  { value: 'newly_added', label: 'Newly added' },
  { value: 'curated', label: 'Curated (hand-picked)' },
];

/** The `layoutType` set — never free text (an unknown value has no renderer). */
export const LAYOUT_TYPE_OPTIONS: {
  value: 'horizontal_cards' | 'deity_row' | 'category_grid';
  label: string;
}[] = [
  { value: 'horizontal_cards', label: 'Horizontal cards' },
  { value: 'deity_row', label: 'Deity row' },
  { value: 'category_grid', label: 'Category grid' },
];

// ── Category form ────────────────────────────────────────────────────────────

export const MantraCategoryFormSchema = z.object({
  slug,
  displayName: z.string().min(1, 'Enter a display name').max(200, 'Too long'),
  imageUrl: optionalMediaUrl,
  backgroundColorToken: z.string().max(64, 'Too long'),
  sortOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  translations: translationsSchema({
    displayName: z.string().trim().min(1, 'Enter a display name').max(200),
  }),
});

export type MantraCategoryFormValues = z.infer<typeof MantraCategoryFormSchema>;

// ── Item form ────────────────────────────────────────────────────────────────
//
// NOTE (AC (c)): `mantraText` is `z.string().min(1)` — REQUIRED, but NOT trimmed.
// `transliterationText` allows any string incl. empty; the submit maps '' → null.
// There is no `.trim()` / normalization anywhere in this mirror by design.

export const MantraItemFormSchema = z.object({
  slug,
  title: z.string().min(1, 'Enter a title').max(300, 'Too long'),
  type: z.enum(['mantra', 'stuti']),
  artworkUrl: requiredMediaUrl,
  audioUrl: requiredMediaUrl,
  singerName: z.string().max(200, 'Too long'),
  composerName: z.string().max(200, 'Too long'),
  // Scripture — REQUIRED, but whitespace is meaningful and preserved verbatim.
  mantraText: z.string().min(1, 'Enter the mantra text'),
  transliterationText: z.string(),
  deitySlug: z.string(),
  languages: z.array(z.enum(LANGUAGE_VALUES)),
  // Category tags — saved separately via TAM-92's PUT set-semantics, but edited
  // on this form. `categoryIds` (a whole array).
  categories: z.array(z.string()),
  description: z.string(),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
});

export type MantraItemFormValues = z.infer<typeof MantraItemFormSchema>;

// ── Section form ─────────────────────────────────────────────────────────────

export const MantraSectionFormSchema = z.object({
  sectionType: z.enum(['recently_played', 'deities', 'categories', 'newly_added', 'curated']),
  title: z.string().min(1, 'Enter a title').max(200, 'Too long'),
  layoutType: z.enum(['horizontal_cards', 'deity_row', 'category_grid']),
  showAllEnabled: z.boolean(),
  sortOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  translations: translationsSchema({
    title: z.string().trim().min(1, 'Enter a title').max(200),
  }),
});

export type MantraSectionFormValues = z.infer<typeof MantraSectionFormSchema>;
