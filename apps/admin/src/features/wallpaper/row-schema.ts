import { z } from 'zod';

import { translationsSchema } from '@/components/translations';

/**
 * MIRRORS TAM-96's `AdminWallpaperRowCreateBody` / `AdminWallpaperRowPatchBody`.
 * FAST FEEDBACK ONLY — the server's Zod is authoritative.
 *
 *  - `rowKey` + `rowType` are create-only (immutable — each changes what the row
 *    IS; absent from the PATCH body, so the API 400s if sent);
 *  - `iconKey` is a bundled-asset KEY chosen from a `<select>` (NEVER a URL,
 *    never free text; §#EXPORT_CRITICAL). There is no confirmed fixed client
 *    resolver allowlist (TAM-96 #PLAN_UNCERTAINTY), so we offer the five seed
 *    keys and validate a key-SHAPED string rather than pinning an enum.
 *  - `sortRule` is NOT a field — no such column in TAM-96.
 */

const rowKey = z
  .string()
  .min(1, 'Row key is required')
  .max(80, 'Row key must be 80 characters or fewer')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Lowercase letters, numbers and single hyphens only — no spaces',
  );

/** The five curated-row kinds. Only `custom` accepts curated items. */
export const ROW_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'top_live', label: 'Top live' },
  { value: 'new', label: 'New' },
  { value: 'trending', label: 'Trending' },
  { value: 'liked', label: 'Liked (personalised)' },
  { value: 'custom', label: 'Custom (hand-curated)' },
];

/**
 * The seed `iconKey` set (`live | trending | new | festival | heart`, TAM-96).
 * The bundled-icon set can grow without an app release, so this is the known
 * set, not an enforced allowlist — the server validates only the key shape.
 */
export const ICON_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'trending', label: 'Trending' },
  { value: 'new', label: 'New' },
  { value: 'festival', label: 'Festival' },
  { value: 'heart', label: 'Heart' },
];

const trimmedTag = z.union([z.literal(''), z.string().trim().min(1).max(50)]);

export const RowFormSchema = z.object({
  rowKey,
  title: z.string().trim().min(1, 'Title is required').max(200),
  rowType: z.enum(['top_live', 'new', 'trending', 'liked', 'custom']),
  /** '' = no icon. */
  iconKey: z.string(),
  /** '' = no media-type filter. */
  mediaTypeFilter: z.enum(['', 'static', 'live']),
  deityTagFilter: trimmedTag,
  maxItems: z.number().int('Whole numbers only').positive('Must be at least 1').max(100),
  displayOrder: z.number().int('Whole numbers only'),
  isActive: z.boolean(),
  translations: translationsSchema({
    title: z.string().trim().min(1, 'Title is required').max(200),
  }),
});

export type RowFormValues = z.infer<typeof RowFormSchema>;
