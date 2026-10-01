/**
 * Ringtone module public types (TAM-67).
 *
 * A browse-first Pro-conversion utility: DISCOVERY IS FREE, EVERYTHING PLAYABLE
 * IS PRO. These are the wire-facing shapes the service assembles and the
 * controller sends; they are validated on the way out by the Zod response
 * schemas in `routes/ringtone.schemas.ts` (the OpenAPI source of truth), which
 * act as the last-line guard that `audioUrl` is never serialized for a free
 * user.
 *
 * #EXPORT_CRITICAL: `audioUrl` is `string | null` on the detail shape — the
 * service nulls it for non-Pro callers before serialization. The FREE grid/
 * search card carries ONLY `thumbnailImageUrl` (never an audio URL) so a free
 * client can browse + hit the paywall.
 */

/** The engagement `contentType` token for this module (guarded at the boundary). */
export const RINGTONE_CONTENT_TYPE = "ringtone";

/**
 * The EXACT allowed set targets (#EXPORT_CRITICAL). Phase 1 ships
 * `phone_ringtone` ONLY; alarm/notification/contact are rejected at the Zod
 * boundary.
 */
export const RINGTONE_SET_TARGETS = ["phone_ringtone"] as const;
export type RingtoneSetTarget = (typeof RINGTONE_SET_TARGETS)[number];

/**
 * A ringtone grid/search card — FREE discovery payload. Carries metadata +
 * `thumbnailImageUrl`, but NEVER an `audioUrl` (that is a Pro detail field).
 * `deityId` is the deity SLUG (the only deity identifier clients ever see —
 * same convention as aarti/mantras); `deityName` is the resolved localized
 * display name.
 */
export interface RingtoneCard {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  playCount: number;
  setCount: number;
  deityId: string;
  deityName: string;
}

/** A page of grid/search cards (cursor pagination). */
export interface RingtoneCardPage {
  items: RingtoneCard[];
  nextCursor: string | null;
}

/** A search result page — the card page plus the total match count. */
export interface RingtoneSearchPage extends RingtoneCardPage {
  resultCount: number;
}

/**
 * Full ringtone detail (`GET /ringtones/:id`). Adds the Pro-gated media
 * (`audioUrl`), engagement counts + `likedByMe`, and share/taxonomy metadata to
 * the card shape.
 *
 * #EXPORT_CRITICAL: `audioUrl` is non-null ONLY for Pro callers.
 */
export interface RingtoneDetail {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  /** #EXPORT_CRITICAL — non-null ONLY for Pro callers. */
  audioUrl: string | null;
  playCount: number;
  setCount: number;
  likeCount: number;
  shareCount: number;
  likedByMe: boolean;
  deityId: string;
  deityName: string;
  tags: string[];
  /**
   * TAM-108 multi-language: the availability set (ISO 639-1 codes). An EMPTY
   * array means "available in ALL languages" (supersedes the single `language`
   * column, dropped in step 3).
   */
  languages: string[];
  artistOrSource: string | null;
}

/** Result of a play-count assertion (`POST /ringtones/:id/play-count`). */
export interface PlayCountResult {
  ringtoneId: string;
  /** true only when THIS call newly counted a play (past the rule, fresh session). */
  counted: boolean;
  playCount: number;
}

/** Result of a set-count increment (`POST /ringtones/:id/set-count`). */
export interface SetCountResult {
  ringtoneId: string;
  setCount: number;
}

/** Result of a like toggle (`POST /ringtones/:id/like`). */
export interface LikeResult {
  ringtoneId: string;
  liked: boolean;
  likeCount: number;
}

/** Result of a share-count increment (`POST /ringtones/:id/share-count`). */
export interface ShareCountResult {
  ringtoneId: string;
  shareCount: number;
}

/**
 * Minimal cross-module preview published on `IRingtoneApi.getPreview` — a
 * sibling references a ringtone by id and needs a compact card without importing
 * this module's internals. `audioUrl` is intentionally absent (the owning module
 * gates it per request).
 */
export interface RingtonePreview {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  deityId: string;
}

/** Cross-module share payload (`IRingtoneApi.getForShare`). Never an audio URL. */
export interface RingtoneShareInfo {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  deepLinkUrl: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
}

// ---------------------------------------------------------------------------
// Admin write surface (TAM-94) — DTOs the admin service returns to the
// controller. Plain, wire-ready shapes (timestamps already `.toISOString()`d)
// so the service stays Prisma-free and the Zod response schemas validate them
// unchanged.
//
// #EXPORT_CRITICAL: admin reads are NOT Pro-gated. Unlike `RingtoneDetail` (the
// public shape whose `audioUrl` the public service nulls for free callers),
// `AdminRingtoneView` ALWAYS carries the real URL — an editor sees the full row.
// The admin service NEVER calls the subscription facade, so `RingtoneService`'s
// fail-closed gate stays unconditional and untouched.
// ---------------------------------------------------------------------------

/**
 * Bounds for the GIN-indexed array columns (`tags`, `searchKeywords`)
 * (#PLAN_UNCERTAINTY). An unbounded array degrades the GIN index and the search
 * endpoint, so the admin boundary caps BOTH the array length and each element's
 * length. Chosen: ≤ 50 elements, each ≤ 64 chars (the spec's suggested bound).
 * Elements are trimmed and de-duplicated before the write.
 */
export const RINGTONE_TAG_ARRAY_MAX = 50;
export const RINGTONE_TAG_ELEMENT_MAX = 64;

/**
 * Upper bound for the TAM-108 `languages` availability set — the 8 Phase-1
 * language codes (`@api/shared/language.schema`). `[]` = available in all
 * languages; the service de-duplicates before the write.
 */
export const RINGTONE_LANGUAGES_MAX = 8;

/**
 * The admin-list `sort` allowlist (ADR §C2). Lives HERE (not in `routes/`)
 * because the repository builds `orderBy` from it and `repositories/` is
 * forbidden from importing `routes/` (arch-boundaries.json). The Zod enum in
 * `ringtone.admin.schemas.ts` is built from this same tuple, so the boundary
 * allowlist and the DB sort can never drift. `playCount`/`setCount` are
 * SORTABLE but NOT editable (server-authoritative).
 */
export const RINGTONE_SORT_FIELDS = [
  "title",
  "playCount",
  "setCount",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type RingtoneSortField = (typeof RINGTONE_SORT_FIELDS)[number];

/**
 * The full admin row (list item AND detail — this module has no sub-resource,
 * so both endpoints return the same shape). Carries EVERY column, including the
 * Pro-gated `audioUrl` in full (admin is not gated). Timestamps are ISO strings;
 * the repository maps the Prisma `Date`s.
 */
export interface AdminRingtoneView {
  id: string;
  slug: string;
  title: string;
  deitySlug: string;
  thumbnailImageUrl: string;
  audioUrl: string;
  playCount: number;
  setCount: number;
  tags: string[];
  searchKeywords: string[];
  /**
   * TAM-108 multi-language availability set (ISO 639-1 codes); `[]` = all
   * languages. Supersedes the single `language` column (dropped in step 3).
   */
  languages: string[];
  artistOrSource: string | null;
  deepLinkUrl: string | null;
  altText: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin ringtone rows + the unpaginated total (ADR §C2). */
export interface AdminRingtonePage {
  items: AdminRingtoneView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * A fully-resolved create payload the admin repository persists (Zod defaults
 * already applied; `tags`/`searchKeywords` already trimmed + de-duped by the
 * service). `playCount`/`setCount` are absent — server-authoritative.
 */
export interface AdminRingtoneCreateInput {
  slug: string;
  title: string;
  deitySlug: string;
  thumbnailImageUrl: string;
  audioUrl: string;
  tags: string[];
  searchKeywords: string[];
  /** TAM-108 multi-language availability set; `[]` = all languages. */
  languages: string[];
  artistOrSource: string | null;
  deepLinkUrl: string | null;
  altText: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
  isActive: boolean;
}

/**
 * Partial ringtone mutation the admin repository applies under the `updatedAt`
 * precondition. `slug`/`playCount`/`setCount` are deliberately ABSENT — `slug`
 * is the immutable business key; the counts are server-authoritative.
 */
export interface AdminRingtoneUpdateInput {
  title?: string;
  deitySlug?: string;
  thumbnailImageUrl?: string;
  audioUrl?: string;
  tags?: string[];
  searchKeywords?: string[];
  /** TAM-108 multi-language availability set; `[]` = all languages. */
  languages?: string[];
  artistOrSource?: string | null;
  deepLinkUrl?: string | null;
  altText?: string | null;
  shareTitle?: string | null;
  shareDescription?: string | null;
  isActive?: boolean;
}
