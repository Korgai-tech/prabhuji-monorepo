import { IMAGE_TYPES, AUDIO_TYPES, VIDEO_TYPES } from '@/components/media';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Home module — shared vocabularies (TAM-105).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * These MIRROR TAM-104's confirmed allowlists (its Evidence §"Module-key
 * allowlist", §"iconKey", §"shareDeepLink", §"trendingScore"). Client-side these
 * are FAST FEEDBACK ONLY — the server's Zod at the route boundary is
 * authoritative; if they drift, the server wins and `unwrap()` surfaces its
 * message. Keep in sync BY HAND.
 */

// ── Media accept lists (re-exported so forms bind them explicitly) ────────────
// The `home/*` fields are NOT in media-constraints.ts's registry, so every
// `<MediaUploadField>` here passes `accept` explicitly (the direct prop wins).
export { IMAGE_TYPES, AUDIO_TYPES, VIDEO_TYPES };

// ── Destination type — the shared vocabulary across banner/shortcut/feed CTA ──
export const DESTINATION_TYPE_VALUES = [
  'linked_module',
  'content_detail',
  'pro_paywall',
  'informational',
] as const;
export type DestinationType = (typeof DESTINATION_TYPE_VALUES)[number];

export const DESTINATION_TYPE_OPTIONS: { value: DestinationType; label: string }[] = [
  { value: 'linked_module', label: 'Linked module' },
  { value: 'content_detail', label: 'Content detail' },
  { value: 'pro_paywall', label: 'Pro paywall' },
  { value: 'informational', label: 'Informational (no destination)' },
];

/**
 * The module-key allowlist. MIRRORS TAM-104's `HOME_MODULE_KEYS`
 * (`apps/api/.../home.admin.schemas.ts`), which itself mirrors the client's
 * `HomeDestinations._moduleRoutes` (`apps/mobile/.../destinations.dart`) EXACTLY.
 * Applied to `linked_module` `destinationValue`/`ctaDestinationValue`, and to
 * `module`/`headerDestinationModule`.
 */
export const HOME_MODULE_KEYS = [
  'wallpaper',
  'status',
  'aarti',
  'aarti-bhajans',
  'mantra',
  'mantras',
  'ringtone',
  'ringtones',
  'horoscope',
  'books',
] as const;
export type HomeModuleKey = (typeof HOME_MODULE_KEYS)[number];

export const MODULE_KEY_OPTIONS: { value: HomeModuleKey; label: string }[] =
  HOME_MODULE_KEYS.map((k) => ({ value: k, label: k }));

// ── Feed item content type ────────────────────────────────────────────────────
export const CONTENT_TYPE_VALUES = [
  'wallpaper',
  'status',
  'aarti',
  'mantra',
  'ringtone',
] as const;
export type ContentType = (typeof CONTENT_TYPE_VALUES)[number];

export const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] =
  CONTENT_TYPE_VALUES.map((v) => ({ value: v, label: v }));

/** `audioPreviewUrl` renders ONLY for these content types (TAM-104 AC (e)). */
export const AUDIO_CONTENT_TYPES: ReadonlySet<ContentType> = new Set([
  'aarti',
  'mantra',
  'ringtone',
]);

export function contentTypeHasAudio(contentType: string): boolean {
  return AUDIO_CONTENT_TYPES.has(contentType as ContentType);
}

// ── Feed item badge (paired with badgeLabel) ──────────────────────────────────
/** `'none'` is the UI sentinel for the API's `badge: null`. */
export const BADGE_OPTIONS: { value: 'none' | 'trending' | 'suggested'; label: string }[] = [
  { value: 'none', label: 'No badge' },
  { value: 'trending', label: 'Trending' },
  { value: 'suggested', label: 'Suggested' },
];

// ── Banner media type ─────────────────────────────────────────────────────────
export const MEDIA_TYPE_OPTIONS: { value: 'image' | 'video'; label: string }[] = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
];

/**
 * Shortcut `iconKey` options — the six bundled-asset slugs the mobile build
 * ships (`_kShortcutArt` in `home_shortcut_grid.dart`).
 *
 * ⚠️ TAM-132 extends the original TAM-105 four-key list (`aarti | mantras |
 * ringtone | wallpaper`) with `status` and `horoscope` so the admin can still
 * edit the BC-fallback slug for the two new 6-tile cards. `iconKey` stays a
 * `<select>` of BUNDLED-asset keys (never a URL, never a `<MediaUploadField>`,
 * never free text) — the new CMS-served art lives on the sibling `iconUrl`
 * field, and `iconKey` is the offline / older-app-build fallback rung of
 * TAM-132's ladder (`iconUrl` → bundled `iconKey` PNG → `SizedBox.shrink()`).
 * Adding a fresh non-bundled slug is still an app release, not an upload
 * (§(e), #EXPORT_CRITICAL from TAM-105 is preserved).
 *
 * There is NO fixed server-side allowlist for `iconKey` — the client resolver
 * is a graceful-fallback map (an unknown key ⇒ a labelled art-less tile).
 * These options are the six keys the current build actually ships assets for.
 */
export const ICON_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: 'aarti', label: 'aarti' },
  { value: 'mantras', label: 'mantras' },
  { value: 'ringtone', label: 'ringtone' },
  { value: 'wallpaper', label: 'wallpaper' },
  { value: 'status', label: 'status' },
  { value: 'horoscope', label: 'horoscope' },
];

/**
 * Mirror of TAM-104's `stableKey` refine: a `destinationValue` MUST be a stable
 * key, never a URL/path/deep link. Rejects a value containing `://`, starting
 * with `/`, or carrying a URI scheme prefix (`scheme:`). This is the client's
 * third safety layer (the select makes it un-typeable; this is the belt-and-
 * braces for the two free-text destination types). The server 400 is the
 * backstop.
 */
export function isUrlShaped(value: string): boolean {
  const s = value.trim();
  if (s === '') return false;
  if (s.startsWith('/')) return true;
  if (s.includes('://')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return true;
  return false;
}
