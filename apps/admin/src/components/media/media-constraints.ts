/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Client-side media constraints — FAST FEEDBACK ONLY, never the enforcement point
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This is the browser-side MIRROR of TAM-84's per-(module, entity, field)
 * content-type allowlist and per-media-class size caps. It exists so a wrong
 * pick is rejected instantly ("MP3 only, max 50 MB") instead of after a
 * pointless round trip to presign.
 *
 * ⚠️ **This is a mirror, not the source of truth.** The server's per-(module,
 * field) Zod allowlist at `POST /admin/media/presign` and S3's signed
 * `Content-Type` / `Content-Length` are the ONLY enforcement points
 * (`docs/ADMIN-CMS-ARCHITECTURE.md` §A "Content-Type allowlist is per (module,
 * field)"). If this table drifts from TAM-84's registry, the server wins and
 * the editor sees the server's message. There is no generated TS enum for the
 * allowlist today, so this is hand-maintained — DRIFT RISK. When TAM-84 exposes
 * the registry in the generated `@repo/api-client` types, derive from it.
 *
 * Caps are the epic P6 decision (fixed in TAM-84): image 10 MB / audio 50 MB /
 * video 200 MB.
 */

/** The three media classes the CMS handles. Each has one size cap. */
export type MediaClass = 'image' | 'audio' | 'video';

const MB = 1024 * 1024;

/** P6 caps (image 10 MB / audio 50 MB / video 200 MB). Mirror of TAM-84. */
export const MEDIA_CLASS_MAX_BYTES: Record<MediaClass, number> = {
  image: 10 * MB,
  audio: 50 * MB,
  video: 200 * MB,
};

/**
 * The media class a content-type belongs to, by its MIME top-level type.
 * `image/png` → `image`, `audio/mpeg` → `audio`, `video/mp4` → `video`.
 * Returns `undefined` for anything else (which the client then rejects).
 */
export function mediaClassForContentType(contentType: string): MediaClass | undefined {
  const top = contentType.split('/', 1)[0];
  if (top === 'image' || top === 'audio' || top === 'video') return top;
  return undefined;
}

/**
 * A resolved constraint for one media field: which content-types it accepts,
 * its media class, and its byte cap. The `<MediaUploadField>` uses it for the
 * `accept` attribute, the pre-upload check, and the preview element choice.
 */
export interface MediaConstraint {
  /** The allowed content-types (mirror of the server's per-field allowlist). */
  readonly accept: readonly string[];
  /** The single media class these types share (drives the preview element). */
  readonly mediaClass: MediaClass;
  /** The size cap for that class. */
  readonly maxBytes: number;
}

// ── Reusable content-type sets (mirror TAM-84) ───────────────────────────────
/** Icons/thumbnails/covers/wallpapers. */
export const IMAGE_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const;
/** SVG is allowed for vector icons only (e.g. deity/zodiac icons). */
export const ICON_IMAGE_TYPES = ['image/png', 'image/webp', 'image/svg+xml'] as const;
/** Aarti/mantra/ringtone audio. */
export const AUDIO_TYPES = ['audio/mpeg'] as const;
/** Live-wallpaper / preview video. */
export const VIDEO_TYPES = ['video/mp4'] as const;

/**
 * Derives a full `MediaConstraint` from an accept list. The class (and thus the
 * cap) is taken from the FIRST accept type — every accept list for a single
 * field is one class by contract (an image field never also accepts audio).
 *
 * @throws if the accept list is empty or its first type is not image/audio/video.
 */
export function constraintForAccept(accept: readonly string[]): MediaConstraint {
  const first = accept[0];
  const mediaClass = first ? mediaClassForContentType(first) : undefined;
  if (!mediaClass) {
    throw new Error(
      `MediaUploadField: cannot derive a media class from accept=[${accept.join(', ')}]. ` +
        `Expected image/*, audio/*, or video/* content-types.`,
    );
  }
  return { accept, mediaClass, maxBytes: MEDIA_CLASS_MAX_BYTES[mediaClass] };
}

/**
 * The hand-maintained (module/entity/field) → accept-types registry — a MIRROR
 * of TAM-84's server allowlist for fields already known to the epic. A module
 * UI ticket may either register its field here OR pass `accept` to
 * `<MediaUploadField>` directly; the direct prop always wins.
 *
 * ⚠️ DRIFT RISK — see TAM-84's registry for the source of truth.
 */
const MEDIA_FIELD_ACCEPT: Record<string, readonly string[]> = {
  'deity/deity/iconUrl': ICON_IMAGE_TYPES,
  'aarti/audioItem/audioStreamUrl': AUDIO_TYPES,
  'aarti/audioItem/coverImageUrl': IMAGE_TYPES,
  'aarti/audioCategory/imageUrl': IMAGE_TYPES,
  'mantras/mantraAudioItem/audioUrl': AUDIO_TYPES,
  'mantras/mantraAudioItem/artworkUrl': IMAGE_TYPES,
  'mantras/mantraCategory/imageUrl': IMAGE_TYPES,
  'ringtone/ringtone/audioUrl': AUDIO_TYPES,
  'ringtone/ringtone/thumbnailImageUrl': IMAGE_TYPES,
  'wallpaper/wallpaper/thumbnailUrl': IMAGE_TYPES,
  'wallpaper/wallpaper/previewImageUrl': IMAGE_TYPES,
  'wallpaper/wallpaper/fallbackStaticThumbnailUrl': IMAGE_TYPES,
  'wallpaper/wallpaper/previewVideoUrl': VIDEO_TYPES,
  'wallpaper/wallpaper/liveWallpaperAssetUrl': VIDEO_TYPES,
  'status/statusItem/imageUrl': IMAGE_TYPES,
  'status/statusItem/thumbnailUrl': IMAGE_TYPES,
  'status/statusItem/videoUrl': VIDEO_TYPES,
  'home/homeBanner/thumbnailUrl': IMAGE_TYPES,
  // TAM-132 — CMS-owned shortcut tile art. Mirrors the server's icon set
  // (png/webp/svg) at `home.homeShortcut.iconUrl` in
  // `apps/api/src/core/media/media.allowlist.ts`.
  'home/homeShortcut/iconUrl': ICON_IMAGE_TYPES,
  'home/homeFeedItem/heroImageUrl': IMAGE_TYPES,
  'home/homeFeedItem/shareThumbnailUrl': IMAGE_TYPES,
  'home/homeFeedItem/audioPreviewUrl': AUDIO_TYPES,
  'horoscope/zodiacSign/iconAssetUrl': IMAGE_TYPES,
  'horoscope/mediaAsset/resultBackgroundVideoUrl': VIDEO_TYPES,
  'horoscope/mediaAsset/resultBackgroundStaticFallbackUrl': IMAGE_TYPES,
  'books/bookContent/coverImageUrl': IMAGE_TYPES,
  'books/bookChapter/audioUrl': AUDIO_TYPES,
  'paywall/paywallHeroMedia/thumbnailUrl': IMAGE_TYPES,
  // home.homeBanner.mediaUrl and paywall.paywallHeroMedia.url are image-OR-video
  // server-side; callers pass `accept`.
};

function fieldKey(module: string, entity: string, field: string): string {
  return `${module}/${entity}/${field}`;
}

/**
 * Resolves the constraint for a media field. Prefers an explicit `accept`
 * (the caller's own mirror of its field's allowlist); otherwise looks the
 * (module, entity, field) triple up in the registry above.
 *
 * @throws a clear developer error if neither is available — a media field with
 * no known allowlist is a wiring mistake, not a runtime condition to swallow.
 */
export function resolveMediaConstraint(args: {
  module: string;
  entity: string;
  field: string;
  accept?: readonly string[];
}): MediaConstraint {
  const accept =
    args.accept ?? MEDIA_FIELD_ACCEPT[fieldKey(args.module, args.entity, args.field)];
  if (!accept || accept.length === 0) {
    throw new Error(
      `MediaUploadField: no accept allowlist for "${fieldKey(args.module, args.entity, args.field)}". ` +
        `Pass \`accept\` explicitly or register the field in media-constraints.ts (mirror of TAM-84).`,
    );
  }
  return constraintForAccept(accept);
}

/** Human-readable cap, e.g. `50 MB`, for error copy. */
export function formatMaxSize(maxBytes: number): string {
  return `${Math.round(maxBytes / MB)} MB`;
}

/** Human-readable accept summary, e.g. `MP3` or `PNG, WEBP, JPEG`, for error copy. */
export function formatAccept(accept: readonly string[]): string {
  return accept
    .map((type) => {
      const sub = type.split('/', 2)[1] ?? type;
      if (sub === 'mpeg') return 'MP3';
      if (sub === 'svg+xml') return 'SVG';
      return sub.toUpperCase();
    })
    .join(', ');
}
