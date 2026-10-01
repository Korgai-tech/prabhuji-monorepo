/**
 * Wallpaper module public types (TAM-69).
 *
 * A CMS-driven wallpaper discovery surface: home rows (deity filters + curated
 * rows), deity/row listing, item detail, like/share/set counts. The core rule
 * is DISCOVERY IS FREE — home, listing, detail, preview, like and share are all
 * free; ONLY the device-level Set Wallpaper / Set Lockscreen action is Pro.
 *
 * The server gates exactly two things (TAM-133), and the boundary is worth
 * stating precisely because it is narrower than it looks:
 *
 *   * `liveWallpaperAssetUrl` — null for free users. The live asset is the one
 *     file here with genuine Pro-only value.
 *   * `POST /wallpaper/:id/count` with `type: "set"` — 403 for free users.
 *     `setCount` orders the `trending` row, so an ungated counter let anyone
 *     with a JWT push a wallpaper up the home screen.
 *
 * The STATIC apply path remains client-gated (TAM-70), and deliberately so:
 * `previewImageUrl` already ships on every free grid card (`WallpaperCard`), and
 * the static Set action applies exactly that image — so gating it on detail
 * would break the free full-screen preview while protecting a file the client
 * already holds. Closing it for real needs a distinct Pro-only apply asset
 * (full-res / unwatermarked), which is a CMS + asset-pipeline change rather than
 * an entitlement one.
 *
 * These are the wire-facing shapes the service assembles and the controller
 * sends; they are validated on the way out by the Zod response schemas in
 * `routes/wallpaper.schemas.ts` (the OpenAPI source of truth).
 */

/** The engagement `contentType` token for this module. */
export const WALLPAPER_CONTENT_TYPE = "wallpaper";

/** Media kind — `static` (image) or `live` (looping video). */
export const WALLPAPER_MEDIA_TYPES = ["static", "live"] as const;
export type WallpaperMediaType = (typeof WALLPAPER_MEDIA_TYPES)[number];

/** Server-side row query rules. `custom` uses the explicit item join. */
export const WALLPAPER_ROW_TYPES = [
  "top_live",
  "new",
  "trending",
  "liked",
  "custom",
] as const;
export type WallpaperRowType = (typeof WALLPAPER_ROW_TYPES)[number];

/** The count kinds the `POST /:id/count` endpoint accepts (never `like`). */
export const WALLPAPER_COUNT_TYPES = ["share", "set"] as const;
export type WallpaperCountType = (typeof WALLPAPER_COUNT_TYPES)[number];

/** Normalized crop focus (0..1) for smart cropping on device. */
export interface FocalPoint {
  x: number;
  y: number;
}

/** Clock/status-bar/icon safe-area insets (0..1) for compositing overlays. */
export interface SafeAreaMetadata {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * A wallpaper grid/list card — the two-column-grid-ready discovery payload.
 * Carries `mediaType` for the LIVE badge, the thumbnail + preview still, the
 * single deity slug (TAM-108), and the engagement/set counts + `likedByMe`.
 * All FREE.
 */
export interface WallpaperCard {
  id: string;
  title: string;
  mediaType: WallpaperMediaType;
  thumbnailUrl: string;
  previewImageUrl: string;
  deitySlug: string | null;
  setCount: number;
  likeCount: number;
  shareCount: number;
  likedByMe: boolean;
}

/** A page of wallpaper cards (cursor pagination). */
export interface WallpaperCardPage {
  items: WallpaperCard[];
  nextCursor: string | null;
}

/** The resolved single deity on the detail surface (localized display, TAM-108). */
export interface WallpaperDeity {
  slug: string;
  displayName: string;
  iconUrl: string;
}

/**
 * Full wallpaper detail (`GET /wallpaper/:id`) — every preview + apply asset
 * field for the preview screen, plus raw counts + `likedByMe`. NO field is
 * entitlement-gated (the Set action is client-side Pro, TAM-70).
 */
export interface WallpaperDetail {
  id: string;
  slug: string;
  title: string;
  mediaType: WallpaperMediaType;
  thumbnailUrl: string;
  previewImageUrl: string;
  previewVideoUrl: string | null;
  liveWallpaperAssetUrl: string | null;
  liveWallpaperPackage: string | null;
  fallbackStaticThumbnailUrl: string | null;
  altText: string | null;
  dominantColor: string | null;
  supportedAndroidVersions: string[];
  focalPoint: FocalPoint | null;
  safeAreaMetadata: SafeAreaMetadata | null;
  deity: WallpaperDeity | null;
  languages: string[];
  setCount: number;
  likeCount: number;
  shareCount: number;
  likedByMe: boolean;
  createdAt: string;
}

/** A deity filter chip on the home surface (All Gods pinned first). */
export interface WallpaperDeityFilter {
  slug: string;
  displayName: string;
  iconUrl: string;
  sortOrder: number;
}

/** One resolved home row: its config + its ordered card items. */
export interface WallpaperHomeRow {
  rowId: string;
  rowKey: string;
  title: string;
  rowType: WallpaperRowType;
  iconKey: string | null;
  items: WallpaperCard[];
}

/**
 * `GET /wallpaper/home` — the ordered active rows (empty rows omitted; the
 * personalized `liked` row hidden when the user has no likes) plus the deity
 * filter chips (All Gods pinned first) for a single round-trip.
 */
export interface WallpaperHome {
  deityFilters: WallpaperDeityFilter[];
  rows: WallpaperHomeRow[];
}

/** Result of a like toggle (`POST /wallpaper/:id/like`). */
export interface WallpaperLikeResult {
  wallpaperId: string;
  liked: boolean;
  likeCount: number;
}

/** Result of a count increment (`POST /wallpaper/:id/count`). */
export interface WallpaperCountResult {
  wallpaperId: string;
  type: WallpaperCountType;
  count: number;
}

/**
 * Minimal cross-module preview published on `IWallpaperApi.getPreview` — a
 * sibling references a wallpaper by id and needs a compact card without
 * importing this module's internals.
 */
export interface WallpaperPreview {
  id: string;
  title: string;
  mediaType: WallpaperMediaType;
  thumbnailUrl: string;
  previewImageUrl: string;
}

/** Cross-module share payload (`IWallpaperApi.getForShare`). Thumbnail only. */
export interface WallpaperShareInfo {
  id: string;
  title: string;
  thumbnailUrl: string;
}

// ---------------------------------------------------------------------------
// Admin write surface (TAM-96) — DTOs the admin service returns to the
// controller. Plain, wire-ready shapes (timestamps already `.toISOString()`d)
// so the service stays Prisma-free and the Zod response schemas validate them
// unchanged. Distinct from the public `WallpaperCard`/`WallpaperDetail`: admin
// reads are NOT localized and NOT gated — this module has no entitlement gate,
// so an editor simply sees the raw row plus its deity tags / curated items.
// ---------------------------------------------------------------------------

/**
 * The wallpaper admin-list `sort` allowlist. Lives HERE (not in `routes/`)
 * because the repository builds `orderBy` from it and `repositories/` is
 * forbidden from importing `routes/` (arch-boundaries.json). The Zod enum in
 * `wallpaper.admin.schemas.ts` is built from this same tuple, so the boundary
 * allowlist and the DB sort can never drift. The per-item `displayOrder` column
 * is gone — the default admin order is newest-first (`createdAt`).
 */
export const WALLPAPER_SORT_FIELDS = [
  "title",
  "setCount",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type WallpaperSortField = (typeof WALLPAPER_SORT_FIELDS)[number];

/** The homepage-row admin-list `sort` allowlist (same rationale as above). */
export const WALLPAPER_ROW_SORT_FIELDS = [
  "title",
  "rowType",
  "displayOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type WallpaperRowSortField = (typeof WALLPAPER_ROW_SORT_FIELDS)[number];

/**
 * An admin wallpaper list row — the card-shaped scalars plus its single deity
 * slug and language-availability set (TAM-108; `languages` empty = all).
 */
export interface AdminWallpaperListItemView {
  id: string;
  slug: string;
  title: string;
  mediaType: WallpaperMediaType;
  thumbnailUrl: string;
  previewImageUrl: string;
  /** `live` only — the looping preview the admin grid card plays. */
  previewVideoUrl: string | null;
  setCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deitySlug: string | null;
  languages: string[];
}

/** An admin wallpaper detail row — the list row plus every asset + metadata column. */
export interface AdminWallpaperDetailView extends AdminWallpaperListItemView {
  liveWallpaperAssetUrl: string | null;
  liveWallpaperPackage: string | null;
  fallbackStaticThumbnailUrl: string | null;
  altText: string | null;
  dominantColor: string | null;
  supportedAndroidVersions: string[];
  focalPoint: FocalPoint | null;
  safeAreaMetadata: SafeAreaMetadata | null;
}

/** One offset page of admin wallpaper rows + the unpaginated total (ADR §C2). */
export interface AdminWallpaperPage {
  items: AdminWallpaperListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The partial wallpaper mutation the admin repository applies under an
 * `updatedAt` precondition. `slug`, `mediaType` and `setCount` are ABSENT by
 * design — the first two are immutable business keys and `setCount` is
 * server-authoritative (it backs `trending` ordering). `null` on an optional
 * column clears it.
 */
export interface AdminWallpaperUpdateInput {
  title?: string;
  deitySlug?: string | null;
  languages?: string[];
  thumbnailUrl?: string;
  previewImageUrl?: string;
  previewVideoUrl?: string | null;
  liveWallpaperAssetUrl?: string | null;
  liveWallpaperPackage?: string | null;
  fallbackStaticThumbnailUrl?: string | null;
  altText?: string | null;
  dominantColor?: string | null;
  supportedAndroidVersions?: string[];
  focalPoint?: FocalPoint | null;
  safeAreaMetadata?: SafeAreaMetadata | null;
  isActive?: boolean;
}

/** An admin homepage-row list row (the full CMS config, no items). */
export interface AdminWallpaperRowListItemView {
  id: string;
  rowKey: string;
  title: string;
  rowType: WallpaperRowType;
  iconKey: string | null;
  mediaTypeFilter: WallpaperMediaType | null;
  deityTagFilter: string | null;
  maxItems: number;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One curated `custom`-row membership entry (position from array index). */
export interface AdminWallpaperRowItemView {
  wallpaperId: string;
  position: number;
}

/**
 * One per-`(row, locale)` `title` override row, embedded in the row detail
 * (TAM-111; NOT localized — an editor sees every locale).
 */
export interface AdminWallpaperRowTranslationView {
  locale: string;
  title: string;
}

/**
 * An admin homepage-row detail row — the config plus its curated items and its
 * per-locale `title` overrides (TAM-111: translations are embedded in the entity;
 * the standalone `…/rows/:id/translations` sub-resource is gone).
 */
export interface AdminWallpaperRowDetailView extends AdminWallpaperRowListItemView {
  items: AdminWallpaperRowItemView[];
  translations: AdminWallpaperRowTranslationView[];
}

/** One offset page of admin homepage-row rows + the unpaginated total. */
export interface AdminWallpaperRowPage {
  items: AdminWallpaperRowListItemView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The partial homepage-row mutation the admin repository applies under an
 * `updatedAt` precondition. `rowKey` and `rowType` are ABSENT (immutable
 * business keys). `null` clears an optional filter column. NOTE: there is no
 * `sortRule` column on `WallpaperHomepageRow` (row ordering is derived from
 * `rowType`'s server-side query rules), so it is not exposed here.
 */
export interface AdminWallpaperRowUpdateInput {
  title?: string;
  iconKey?: string | null;
  mediaTypeFilter?: WallpaperMediaType | null;
  deityTagFilter?: string | null;
  maxItems?: number;
  displayOrder?: number;
  isActive?: boolean;
}
