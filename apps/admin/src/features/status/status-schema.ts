import { z } from 'zod';

import {
  LANGUAGE_CODES,
  LANGUAGE_OPTIONS,
  languageLabel,
  type LanguageCode,
} from '@/lib/languages';

/**
 * MIRRORS TAM-98's `apps/api/.../status.admin.schemas.ts` (`AdminStatusItemCreateBody`
 * / `AdminStatusItemPatchBody`). FAST FEEDBACK
 * ONLY — the server's Zod at the route boundary is authoritative; if they disagree
 * the server wins and `unwrap()` surfaces its message. Keep in sync BY HAND (this is
 * a mirror, not a generated artifact).
 *
 * Two module-specific validations are CONTENT-CORRECTNESS, not decoration, and are
 * mirrored here so the editor gets fast feedback (TAM-99 §(c)(d)):
 *   - the `mediaType` discrimination (`image` requires `imageUrl`, `video` requires
 *     `videoUrl`); the fields for the other type are not even rendered;
 *   - `overlaySafeArea` — four normalized insets, EACH in `[0, 1]`, with
 *     `top+bottom < 1` and `left+right < 1`. A wrong value renders a user's name
 *     over a deity's face on a publicly-shared status, so this is the ticket's
 *     defining requirement. The convention is confirmed against TAM-98's landed
 *     `normalizedUnit = z.number().min(0).max(1)` — FRACTIONS, not percents.
 */

/** Server: lowercase alphanumerics joined by single hyphens, no whitespace. */
const slug = z
  .string()
  .min(1, 'Slug is required')
  .max(96, 'Slug must be 96 characters or fewer')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Lowercase letters, numbers and single hyphens only — no spaces',
  );

/** A normalized inset / coordinate — a fraction in `[0, 1]` (TAM-98 `normalizedUnit`). */
const normalizedUnit = z
  .number({ message: 'Enter a number between 0 and 1' })
  .min(0, 'Must be 0 or more')
  .max(1, 'Must be 1 or less');

/**
 * The language availability set holds only the eight client locales (`en` is
 * deliberately NOT a member) and an EMPTY set means "available in ALL languages".
 *
 * Re-exported from `@/lib/languages` — the ONE admin-side list, derived from the
 * emitted contract. This module used to hardcode the codes AND their labels.
 */
export { LANGUAGE_CODES, LANGUAGE_OPTIONS, languageLabel, type LanguageCode };

// ── overlaySafeArea ──────────────────────────────────────────────────────────

/** The four normalized insets, each `[0,1]`. Range + cross-field are checked in
 *  the item schema's `superRefine` so the errors attach to the safe-area field. */
export const SafeAreaSchema = z.object({
  top: normalizedUnit,
  bottom: normalizedUnit,
  left: normalizedUnit,
  right: normalizedUnit,
});
export type SafeAreaValues = z.infer<typeof SafeAreaSchema>;

/** The empty-form default — a small centred box, well inside the frame. */
export const DEFAULT_SAFE_AREA: SafeAreaValues = {
  top: 0.1,
  bottom: 0.14,
  left: 0.05,
  right: 0.05,
};

const MEDIA_TYPES = ['image', 'video'] as const;

function isFilledUrl(value: string): boolean {
  return z.string().url().safeParse(value).success;
}

// ── StatusItem ───────────────────────────────────────────────────────────────

/**
 * The fields `<EntityForm>` owns for a StatusItem. `slug` + `mediaType` are present
 * in BOTH modes but the form disables them on edit and the PATCH hook never sends
 * them (immutable business keys — TAM-98 rejects them in `PATCH`). The media URL of
 * the OTHER media type stays `''` and is never rendered nor sent.
 */
export const StatusItemFormSchema = z
  .object({
    slug,
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(300, 'Title must be 300 characters or fewer'),
    mediaType: z.enum(MEDIA_TYPES),
    // TAM-108: a SINGLE deity, chosen from the picker (never free text). Required on
    // create (the server's `statusDeitySlug` is non-optional there).
    deitySlug: z.string().min(1, 'Select a deity'),
    // TAM-108: the language availability set. `[]` = all languages.
    languages: z.array(z.enum(LANGUAGE_CODES)).max(8),
    imageUrl: z.string(),
    videoUrl: z.string(),
    thumbnailUrl: z.string().url('Upload a thumbnail image to continue'),
    overlaySafeArea: SafeAreaSchema,
    shareCaption: z.string().max(500, 'Caption must be 500 characters or fewer'),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    // overlaySafeArea cross-field (mirrors TAM-98) — the safe area must not collapse.
    if (v.overlaySafeArea.top + v.overlaySafeArea.bottom >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['overlaySafeArea', 'top'],
        message: 'top + bottom must be less than 1 (the safe area would be empty)',
      });
    }
    if (v.overlaySafeArea.left + v.overlaySafeArea.right >= 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['overlaySafeArea', 'left'],
        message: 'left + right must be less than 1 (the safe area would be empty)',
      });
    }
    // mediaType discrimination (mirrors TAM-98) — the required upload for THIS type.
    if (v.mediaType === 'image') {
      if (!isFilledUrl(v.imageUrl)) {
        ctx.addIssue({
          code: 'custom',
          path: ['imageUrl'],
          message: 'An image status requires an uploaded image',
        });
      }
    } else if (!isFilledUrl(v.videoUrl)) {
      ctx.addIssue({
        code: 'custom',
        path: ['videoUrl'],
        message: 'A video status requires an uploaded video',
      });
    }
  });

export type StatusItemFormValues = z.infer<typeof StatusItemFormSchema>;
