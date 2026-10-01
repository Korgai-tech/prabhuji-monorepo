import { z } from 'zod';

import { translationsSchema } from '@/components/translations';
import { LANGUAGE_OPTIONS, languageLabel } from '@/lib/languages';

import type { BookCategory, BookContentType, BookLanguage } from './use-book-content';
import type { BookSectionKey } from './use-book-sections';

/**
 * Client Zod MIRRORS of TAM-102's admin schemas + the module's constrained
 * vocabularies. FAST FEEDBACK ONLY — the server's Zod at the route boundary is
 * authoritative; if they disagree the server wins and `unwrap()` surfaces its
 * message. Keep in sync BY HAND.
 *
 * ⚠️ `bodyText` / `contentBody` are Devanagari scripture — the schemas below
 * REQUIRE non-empty but NEVER `.trim()` or normalise. Blank lines and trailing
 * spaces are meaningful and must survive round-trip (§(e), §#EXPORT_CRITICAL).
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

// ── Constrained vocabularies (mirror TAM-102) ────────────────────────────────

/** The two content hierarchies (immutable after create). */
export const CONTENT_TYPES: { value: BookContentType; label: string }[] = [
  { value: 'major_book', label: 'Major book (chapters & sub-books)' },
  { value: 'direct_scripture', label: 'Direct scripture (inline text)' },
];

export function contentTypeLabel(value: BookContentType): string {
  return value === 'major_book' ? 'Book' : 'Scripture';
}

/** `direct_scripture` category — required for scripture, absent for a book. */
export const CATEGORIES: { value: BookCategory; label: string }[] = [
  { value: 'Aarti', label: 'Aarti' },
  { value: 'Kavach', label: 'Kavach' },
  { value: 'Stotram', label: 'Stotram' },
  { value: 'Chalisa', label: 'Chalisa' },
];

/**
 * The client language codes (empty selection = all languages). Aliased from
 * `@/lib/languages` — the ONE admin-side list, derived from the emitted
 * contract. This module used to hardcode the codes and their labels.
 */
export const LANGUAGES = LANGUAGE_OPTIONS as { value: BookLanguage; label: string }[];

export { languageLabel };

/** The known home-section keys — never free text (an unknown key is unresolvable). */
export const SECTION_KEYS: { value: BookSectionKey; label: string }[] = [
  { value: 'carousel', label: 'Carousel' },
  { value: 'categories', label: 'Categories' },
  { value: 'newly_added', label: 'Newly added' },
  { value: 'all_books', label: 'All books' },
];

// ── Content form (conditional on contentType) ────────────────────────────────

/**
 * ONE schema for both hierarchies: `contentBody` + `category` are only REQUIRED
 * when `contentType === 'direct_scripture'` (a `major_book`'s text lives in its
 * chapters and it carries no category — TAM-102's correspondence rule). The
 * conditional lives in `superRefine`, so the form values keep a single shape.
 */
export const ContentFormSchema = z
  .object({
    slug,
    contentType: z.enum(['major_book', 'direct_scripture']),
    title: z.string().min(1, 'Title is required'),
    coverImageUrl: z.string().url('Upload a cover image to continue'),
    author: z.string(),
    languages: z.array(z.string()),
    sortOrder: z.number().int('Whole numbers only'),
    offlineCacheEligible: z.boolean(),
    isNewlyAdded: z.boolean(),
    active: z.boolean(),
    // Scripture-only; validated in superRefine. NEVER trimmed.
    contentBody: z.string(),
    category: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.contentType === 'direct_scripture') {
      if (values.contentBody.length === 0) {
        ctx.addIssue({
          path: ['contentBody'],
          code: z.ZodIssueCode.custom,
          message: 'Scripture text is required',
        });
      }
      if (values.category === '') {
        ctx.addIssue({
          path: ['category'],
          code: z.ZodIssueCode.custom,
          message: 'Pick a category',
        });
      }
    }
  });

export type ContentFormValues = z.infer<typeof ContentFormSchema>;

// ── Sub-book form ────────────────────────────────────────────────────────────

export const SubBookFormSchema = z.object({
  slug,
  title: z.string().min(1, 'Title is required'),
  order: z.number().int('Whole numbers only'),
});

export type SubBookFormValues = z.infer<typeof SubBookFormSchema>;

// ── Chapter form ─────────────────────────────────────────────────────────────

/** `audioUrl` is OPTIONAL (empty = no audio). `bodyText` required, never trimmed. */
export const ChapterFormSchema = z.object({
  slug,
  title: z.string().min(1, 'Title is required'),
  order: z.number().int('Whole numbers only'),
  bodyText: z.string().min(1, 'Chapter text is required'),
  audioUrl: z
    .string()
    .refine((v) => v === '' || /^https?:\/\//.test(v), 'Wait for the upload to finish'),
});

export type ChapterFormValues = z.infer<typeof ChapterFormSchema>;

// ── Section form ─────────────────────────────────────────────────────────────

export const SectionFormSchema = z.object({
  key: z.string().min(1, 'Pick a section key'),
  title: z.string().min(1, 'Title is required'),
  sortOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  translations: translationsSchema({
    title: z.string().trim().min(1, 'Title is required').max(200),
  }),
});

export type SectionFormValues = z.infer<typeof SectionFormSchema>;
