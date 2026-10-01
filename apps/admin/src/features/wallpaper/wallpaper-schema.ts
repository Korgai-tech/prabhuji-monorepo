import { z } from 'zod';

import { LANGUAGE_CODES, LANGUAGE_OPTIONS } from '@/lib/languages';

/**
 * MIRRORS TAM-96's `AdminWallpaperCreateBody` / `AdminWallpaperPatchBody`
 * (`apps/api/.../wallpaper.admin.schemas.ts`). FAST FEEDBACK ONLY — the server's
 * Zod at the route boundary is authoritative; if they disagree the server wins
 * and `unwrap()` surfaces its message. Keep in sync BY HAND (a mirror, not a
 * generated artifact).
 *
 * The `mediaType`-discriminated required-field rule is mirrored in
 * `applyMediaTypeRule` below — the SAME shape TAM-96 landed (its Evidence): a
 * `static` wallpaper is satisfied by the always-required `previewImageUrl`; a
 * `live` wallpaper REQUIRES `previewVideoUrl` and at least one of
 * `liveWallpaperAssetUrl` / `liveWallpaperPackage`. The fields for the other
 * type are NOT rendered, so the form never carries a value the server would
 * reject.
 *
 * The five media URL fields hold a URL, not a file: `<MediaUploadField>` only
 * reports a `publicUrl` once the S3 PUT completes, so a required media field
 * stays empty until then and this mirror blocks submit — the "submitted before
 * the upload finished" guard, with no change to `<EntityForm>`.
 */

/** Server: lowercase alphanumerics joined by single hyphens, no whitespace. */
const slug = z
  .string()
  .min(1, 'Slug is required')
  .max(80, 'Slug must be 80 characters or fewer')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Lowercase letters, numbers and single hyphens only — no spaces',
  );

/** The two media kinds. Create-only — immutable thereafter (§(c)). */
export const WALLPAPER_MEDIA_TYPES = ['static', 'live'] as const;
export type WallpaperMediaTypeValue = (typeof WALLPAPER_MEDIA_TYPES)[number];

/**
 * The language codes (EMPTY = available in ALL). Re-exported from
 * `@/lib/languages` — the ONE admin-side list, derived from the emitted
 * contract. This module used to hardcode the codes twice over: once for the
 * multiselect labels and again for the Zod enum.
 */
export { LANGUAGE_OPTIONS };

const languageCode = z.enum(LANGUAGE_CODES);

/** A required, uploaded media URL (empty until the upload completes). */
const requiredMediaUrl = z.string().url('Upload a file to continue');
/** An optional media URL — empty string means "not set". */
const optionalMediaUrl = z.union([z.literal(''), z.string().url()]);

const focalPoint = z
  .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
  .nullable();
const safeArea = z
  .object({
    top: z.number().min(0).max(1),
    bottom: z.number().min(0).max(1),
    left: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
  })
  .nullable();

const baseShape = {
  slug,
  title: z.string().trim().min(1, 'Title is required').max(200),
  mediaType: z.enum(WALLPAPER_MEDIA_TYPES),
  /** '' = no deity (submitted as `null`). */
  deitySlug: z.string(),
  languages: z.array(languageCode),
  thumbnailUrl: requiredMediaUrl,
  previewImageUrl: requiredMediaUrl,
  // live-only
  previewVideoUrl: optionalMediaUrl,
  liveWallpaperAssetUrl: optionalMediaUrl,
  liveWallpaperPackage: z.string(),
  fallbackStaticThumbnailUrl: optionalMediaUrl,
  supportedAndroidVersions: z.array(z.string()),
  // common metadata
  altText: z.string(),
  dominantColor: z.union([
    z.literal(''),
    z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'A hex colour like #1a2b3c'),
  ]),
  focalPoint,
  safeAreaMetadata: safeArea,
  isActive: z.boolean(),
};

/** Mirror of TAM-96's `applyMediaTypeRule` (fast feedback; server authoritative). */
function applyMediaTypeRule(v: z.infer<z.ZodObject<typeof baseShape>>, ctx: z.RefinementCtx) {
  // `static` needs no extra rule — the always-required `previewImageUrl` is the
  // merged device-set image. Only `live` carries conditional requirements.
  if (v.mediaType === 'live') {
    if (v.previewVideoUrl === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['previewVideoUrl'],
        message: 'A live wallpaper needs a preview video.',
      });
    }
    if (v.liveWallpaperAssetUrl === '' && v.liveWallpaperPackage.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['liveWallpaperAssetUrl'],
        message: 'A live wallpaper needs a video asset or a package name.',
      });
    }
  }
}

export const WallpaperFormSchema = z.object(baseShape).superRefine(applyMediaTypeRule);

export type WallpaperFormValues = z.infer<typeof WallpaperFormSchema>;
