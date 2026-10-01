/**
 * The media allowlist registry (TAM-84 AC (c), (d), (e)) — the SINGLE SOURCE OF
 * TRUTH shared by `presign` and `validateOwnedUrl`, so the content-type rule,
 * the size cap, and the key-shape rule can never drift apart.
 *
 * A generic "images and audio" allowlist is explicitly NOT acceptable (ADR §A1):
 * it would let an editor drop an MP3 into a thumbnail slot and discover it in
 * the app. The map is keyed by the FULL `(module, entity, field)` triple, and an
 * unknown triple FAILS CLOSED (400 VALIDATION_ERROR) — never a permissive
 * default.
 *
 * #PUBLISHED_VOCABULARY — the `(module, entity, field)` tokens below are the
 * frozen contract the nine module admin tickets (TAM-88, 90, 92, …) send to
 * `POST /admin/media/presign` and pass to `validateOwnedUrl`. Module tickets
 * ADD their fields here and REFERENCE these tokens; they must not invent their
 * own. `entity` is the camelCase model name (`audioItem`, `statusItem`,
 * `wallpaper`, `deity`); it is kebab-cased into the S3 key path.
 */
import { INCOMING_PREFIX } from "@prabhuji/media-profiles";

/** Media class — drives the size cap and the extension derivation. */
export type MediaClass = "image" | "audio" | "video";

export interface AllowlistEntry {
  /** Exact content types S3 will accept for this field (pinned as a signed header). */
  readonly contentTypes: readonly string[];
  readonly mediaClass: MediaClass;
}

/**
 * Per-media-class maximum upload size, in bytes (ADR §A6 / epic P6 — DECIDED:
 * image 10 MB, audio 50 MB, video 200 MB). Enforced TWICE: rejected at presign
 * when `sizeBytes` exceeds the cap, AND pinned by the signed `Content-Length`
 * so S3 rejects a client that lies after the fact. Named constants, not magic
 * numbers scattered across the registry.
 */
const MiB = 1024 * 1024;
export const SIZE_CAPS_BYTES: Readonly<Record<MediaClass, number>> = {
  image: 10 * MiB, // P6: 10 MB
  audio: 50 * MiB, // P6: 50 MB
  video: 200 * MiB, // P6: 200 MB
};

/**
 * The extension stored on the key is derived from the ALLOWLISTED content type,
 * never trusted from the client's filename (AC (e)) — so a caller cannot
 * influence the key and path traversal via `filename` is structurally
 * impossible. Every content type that appears in the registry MUST have an entry
 * here (asserted at module load below).
 */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
};

/**
 * The registry. `${module}.${entity}.${field}` → allowed types + class.
 *
 * The five entries below are the ones AC (c) mandates be exactly right. Module
 * tickets extend this map with their own fields as they land.
 */
// Content-type sets reused across fields (photos vs icons vs the single audio/video type).
const PHOTO = ["image/png", "image/jpeg", "image/webp"] as const;
const ICON = ["image/png", "image/webp", "image/svg+xml"] as const;
const AUDIO = ["audio/mpeg"] as const;
const VIDEO = ["video/mp4"] as const;

const img = (contentTypes: readonly string[]): AllowlistEntry => ({ contentTypes, mediaClass: "image" });
const aud = (): AllowlistEntry => ({ contentTypes: AUDIO, mediaClass: "audio" });
const vid = (): AllowlistEntry => ({ contentTypes: VIDEO, mediaClass: "video" });

// Pre-populated for ALL nine content modules (orchestrator, ahead of the parallel
// TAM-90…104 module-admin tickets) so those tickets only REFERENCE these tokens and
// never write this shared file concurrently. `entity` is the camelCase model name.
// deepLinkUrl columns are excluded — they are app deep links, not uploadable media.
// Paywall was out of epic scope; TAM-130 added its two VIDEO fields only (see the
// bottom of the map) — pricing, benefits and legal copy remain out. A module ticket
// that finds its field missing/wrong must report it for a central fix, NOT edit this
// map from a parallel worktree.
export const MEDIA_ALLOWLIST: Readonly<Record<string, AllowlistEntry>> = {
  // Taxonomy — deity icon.
  "deity.deity.iconUrl": img(ICON),

  // Aarti.
  "aarti.audioItem.audioStreamUrl": aud(),
  "aarti.audioItem.coverImageUrl": img(PHOTO),
  "aarti.audioCategory.imageUrl": img(PHOTO),

  // Mantras.
  "mantras.mantraAudioItem.audioUrl": aud(),
  "mantras.mantraAudioItem.artworkUrl": img(PHOTO),
  "mantras.mantraCategory.imageUrl": img(PHOTO),

  // Ringtone.
  "ringtone.ringtone.audioUrl": aud(),
  "ringtone.ringtone.thumbnailImageUrl": img(PHOTO),

  // Wallpaper.
  "wallpaper.wallpaper.previewImageUrl": img(PHOTO),
  "wallpaper.wallpaper.thumbnailUrl": img(PHOTO),
  "wallpaper.wallpaper.fallbackStaticThumbnailUrl": img(PHOTO),
  "wallpaper.wallpaper.previewVideoUrl": vid(),
  "wallpaper.wallpaper.liveWallpaperAssetUrl": vid(),

  // Status.
  "status.statusItem.imageUrl": img(PHOTO),
  "status.statusItem.thumbnailUrl": img(PHOTO),
  "status.statusItem.videoUrl": vid(),
  "status.userStatusProfile.avatarImageUrl": img(PHOTO),

  // Horoscope.
  "horoscope.zodiacSign.iconAssetUrl": img(ICON),
  "horoscope.mediaAsset.resultBackgroundStaticFallbackUrl": img(PHOTO),
  "horoscope.mediaAsset.resultBackgroundVideoUrl": vid(),

  // Books.
  "books.bookContent.coverImageUrl": img(PHOTO),
  "books.bookChapter.audioUrl": aud(),

  // Home.
  "home.homeBanner.thumbnailUrl": img(PHOTO),
  // A banner is an image OR a short video; accept both. mediaClass "video" only
  // widens the size cap (extension still derives from the actual content type),
  // so a 2 MB image banner is well within bounds.
  "home.homeBanner.mediaUrl": { contentTypes: [...PHOTO, ...VIDEO], mediaClass: "video" },
  "home.homeFeedItem.heroImageUrl": img(PHOTO),
  "home.homeFeedItem.shareThumbnailUrl": img(PHOTO),
  "home.homeFeedItem.audioPreviewUrl": aud(),
  // TAM-132 — CMS-owned shortcut tile art. Uses the icon set (png/webp/svg)
  // that matches the client's bundled fallback treatment (raster PNG today,
  // svg accepted for future-proofing).
  "home.homeShortcut.iconUrl": img(ICON),

  // Paywall (TAM-159). The hero moved from the flat `paywall_translations`
  // video columns to the ordered `paywall_hero_media` table, so the registered
  // fields moved with it — a variant's hero is an IMAGE (card/icon-grid), a
  // VIDEO (full-bleed), or several images (carousel), and one field has to
  // accept all three. Same both-classes shape as `home.homeBanner.mediaUrl`:
  // mediaClass "video" only widens the size cap, the extension still derives
  // from the actual content type, so an image hero stays well within bounds.
  //
  // Pricing and legal links remain ops-managed and unregistered. Benefit icons
  // are NOT registered either: they are bundled app assets keyed by name, part
  // of the design system rather than content, so there is nothing to upload.
  "paywall.paywallHeroMedia.url": { contentTypes: [...PHOTO, ...VIDEO], mediaClass: "video" },
  "paywall.paywallHeroMedia.thumbnailUrl": img(PHOTO),
};

/** Build the registry key for a triple. */
export function allowlistKey(module: string, entity: string, field: string): string {
  return `${module}.${entity}.${field}`;
}

/**
 * Look up a triple, or `null` if it is not registered. Callers FAIL CLOSED on
 * `null` (400 VALIDATION_ERROR) — there is deliberately no permissive default.
 */
export function lookupAllowlist(
  module: string,
  entity: string,
  field: string
): AllowlistEntry | null {
  return MEDIA_ALLOWLIST[allowlistKey(module, entity, field)] ?? null;
}

/** The allowlisted extension for a content type, or `null` if unmapped. */
export function extensionForContentType(contentType: string): string | null {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? null;
}

/**
 * The S3 key path prefix for a triple: `<module>/<kebab(entity)>` (AC (e)). The
 * full key is this prefix + `/<uuid>.<ext>`, minted server-side.
 */
export function keyPrefixFor(module: string, entity: string): string {
  return `${module}/${kebabCase(entity)}`;
}

function kebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * A canonical uuid (v4) as it appears in a key. Server-minted, so the shape is
 * known exactly — every key gate rejects anything else.
 */
export const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const KEY_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";

/** The generic owned-object shape `<seg>/<seg>/<uuid>.<ext>`, for any module/entity. */
const FINAL_KEY_RE = new RegExp(`^${KEY_SEGMENT}/${KEY_SEGMENT}/${UUID_PATTERN}\\.[a-z0-9]+$`);

/**
 * Is `key` a FINAL object key this platform mints (TAM-267 status polling)?
 * Never an `incoming/` staging key — that prefix only ever holds the raw upload
 * the optimizer consumes, and no row, URL or poll may reference it (an
 * `incoming/x/<uuid>.mp4` would otherwise pass the two-segment shape).
 */
export function isFinalMediaKey(key: string): boolean {
  return !key.startsWith(INCOMING_PREFIX) && FINAL_KEY_RE.test(key);
}

// Load-time integrity check: every content type in the registry must be
// extension-mappable, or `presign` could mint an extension-less key. Fail at
// import (i.e. boot / test collection) rather than at the first upload.
for (const [key, entry] of Object.entries(MEDIA_ALLOWLIST)) {
  for (const ct of entry.contentTypes) {
    if (!EXTENSION_BY_CONTENT_TYPE[ct]) {
      throw new Error(
        `media allowlist misconfigured: '${key}' allows '${ct}' with no extension mapping`
      );
    }
  }
}
