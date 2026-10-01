import { z } from 'zod';

import {
  LANGUAGE_CODES,
  LANGUAGE_OPTIONS,
  languageLabel,
} from '@/lib/languages';

/**
 * MIRRORS TAM-94's `AdminRingtoneCreateBody` / `AdminRingtonePatchBody`. FAST
 * FEEDBACK ONLY — the server's Zod at the route boundary is authoritative; if
 * they disagree the server wins and `unwrap()` surfaces its message. Keep in
 * sync BY HAND (a mirror, not a generated artifact).
 *
 * The two media URLs are REQUIRED URLs: while a `<MediaUploadField>` has not yet
 * reported a `publicUrl`, its value is empty and this mirror blocks submit — the
 * "submitted before the upload finished" guard, with no change to `<EntityForm>`
 * (§(c)).
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

/**
 * The client languages (empty = shown in all). No `en` (regional only).
 *
 * `RINGTONE_LANGUAGES` is now an alias of the ONE admin-side list in
 * `@/lib/languages`, which is derived from the emitted contract — this module
 * used to hardcode the codes and their labels. The alias is kept so the two
 * consumers (`language-multi-select.tsx`, `ringtones-page.tsx`) read naturally.
 */
export const RINGTONE_LANGUAGES = LANGUAGE_OPTIONS;

export { languageLabel };

/**
 * Client bounds for the two string-array columns (§(e), #PLAN_UNCERTAINTY:
 * ≤ 50 items × ≤ 64 chars). FAST FEEDBACK — the server trims, de-dups and bounds
 * authoritatively; a looser client bound would surface as a confusing 400.
 */
export const ARRAY_MAX_ITEMS = 50;
export const ARRAY_MAX_ITEM_LENGTH = 64;

const stringArray = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(ARRAY_MAX_ITEM_LENGTH, `Each entry must be ${ARRAY_MAX_ITEM_LENGTH} characters or fewer`),
  )
  .max(ARRAY_MAX_ITEMS, `At most ${ARRAY_MAX_ITEMS} entries`);

const languageArray = z.array(z.enum(LANGUAGE_CODES));

/** Empty string ⇒ null for the nullable optional text fields the server accepts. */
const nullableText = z
  .string()
  .trim()
  .max(200, 'Must be 200 characters or fewer')
  .nullable();

/**
 * The fields `<EntityForm>` owns. `slug` is present in BOTH modes but the form
 * disables it on edit and the PATCH hook never sends it (immutable business
 * key). `deitySlug` is a REQUIRED single-select — never free text (§(d)). The
 * server-authoritative `updatedAt` is merged in by `<EntityForm mode="edit">`.
 */
export const RingtoneFormSchema = z.object({
  slug,
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  deitySlug: z.string().min(1, 'Pick a deity'),
  thumbnailImageUrl: z.string().url('Upload a thumbnail image to continue'),
  audioUrl: z.string().url('Upload the ringtone audio to continue'),
  tags: stringArray,
  searchKeywords: stringArray,
  languages: languageArray,
  artistOrSource: nullableText,
  deepLinkUrl: z.union([z.literal(''), z.string().url('Enter a valid URL')]).nullable(),
  altText: nullableText,
  shareTitle: nullableText,
  shareDescription: z.string().trim().max(500, 'Must be 500 characters or fewer').nullable(),
  isActive: z.boolean(),
});

export type RingtoneFormValues = z.infer<typeof RingtoneFormSchema>;
