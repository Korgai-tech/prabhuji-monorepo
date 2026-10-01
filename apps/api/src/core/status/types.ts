/**
 * Status Sharing module public types (TAM-71).
 *
 * A CMS-curated vertical status feed (image + video) the user browses, filters
 * by deity, and previews; plus a per-user reusable overlay PROFILE (personal /
 * business fields + avatar URL) and a single fixed overlay TEMPLATE. The core
 * rule is EVERYTHING HERE IS FREE — browse, filter, customize, save, preview,
 * like and view are all free; the ONLY Pro action is the final Share render,
 * enforced ENTIRELY CLIENT-SIDE (TAM-72). So — like wallpaper (TAM-69) and
 * UNLIKE aarti/mantras/ringtone — there is NO server entitlement gate here:
 * every media URL is returned to any authenticated user (the routes require
 * only the JWT guard).
 *
 * These are the wire-facing shapes the service assembles and the controller
 * sends; they are validated on the way out by the Zod response schemas in
 * `routes/status.schemas.ts` (the OpenAPI source of truth).
 */

/** The engagement `contentType` token for this module (see shared/schemas). */
export const STATUS_CONTENT_TYPE = "status";

/** Media kind — `image` (still) or `video` (looping clip). */
export const STATUS_MEDIA_TYPES = ["image", "video"] as const;
export type StatusMediaType = (typeof STATUS_MEDIA_TYPES)[number];

/** The two overlay-profile personas. Last saved/selected becomes active. */
export const STATUS_PROFILE_TYPES = ["personal", "business"] as const;
export type StatusProfileType = (typeof STATUS_PROFILE_TYPES)[number];

/** Char limits for the overlay profile fields (enforced in Zod at the route). */
export const STATUS_PROFILE_LIMITS = {
  personalDisplayName: 40,
  businessName: 50,
  businessDetails: 80,
} as const;

/** Normalized clock/icon safe-area insets (0..1) for compositing the overlay. */
export interface OverlaySafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * A status feed card — the vertical-feed discovery payload. Carries `mediaType`
 * for the video badge, the thumbnail + media URLs, its SINGLE deity (id + name
 * resolved via the deity facade; TAM-108 single-deity model), its `languages`
 * availability set (empty = all languages), the `overlaySafeArea` the client
 * composites the overlay within, and the raw engagement counts + `likedByMe`.
 * All FREE.
 */
/**
 * Who a status is attributed to. TAM-N — today this is always the single house
 * creator (`status.creator.ts`), because status content is CMS-authored and has
 * no real author; the shape exists so the app has a reportable identity and so
 * genuine user-generated status can later vary it per row without a wire change.
 */
export interface StatusCreator {
  id: string;
  name: string;
  /** Null until the real asset is uploaded — the app renders a generic glyph. */
  avatarUrl: string | null;
}

export interface StatusCard {
  id: string;
  slug: string;
  title: string;
  mediaType: StatusMediaType;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string;
  overlaySafeArea: OverlaySafeArea;
  /** The row's single deity SLUG (`deities.slug`) — never a uuid. */
  deitySlug: string | null;
  deityName: string | null;
  languages: string[];
  shareCaption: string | null;
  creator: StatusCreator;
  likeCount: number;
  viewCount: number;
  shareCount: number;
  likedByMe: boolean;
}

/** A page of status cards (cursor pagination). */
export interface StatusCardPage {
  items: StatusCard[];
  nextCursor: string | null;
}

/**
 * The user's reusable overlay profile (`GET`/`PUT /status/profile`). A single
 * row per user with `activeProfileType` + both field sets; the last saved type
 * becomes active for overlay previews. `null` fields mean "not yet saved".
 */
export interface StatusProfile {
  activeProfileType: StatusProfileType;
  personalDisplayName: string | null;
  businessName: string | null;
  businessDetails: string | null;
  businessMobileNumber: string | null;
  avatarImageUrl: string | null;
  updatedAt: string | null;
}

/**
 * Overlay-profile upsert input the service persists — the Zod-validated route
 * body (`StatusProfileBody`) is structurally assignable to this. Kept in
 * `types.ts` (not imported from `routes/`) so the service stays free of a
 * route-layer dependency (arch boundary: services never import routes/).
 */
export interface StatusProfileInput {
  activeProfileType: StatusProfileType;
  // `null` and `undefined` are both treated as "skip / don't touch" by the
  // service (see `StatusService.saveProfile`) so the client can send the
  // OTHER tab's fields as `null` without wiping stored data.
  personalDisplayName?: string | null;
  businessName?: string | null;
  businessDetails?: string | null;
  businessMobileNumber?: string | null;
  avatarImageUrl?: string | null;
}

/** Result of a like toggle (`POST /status/:id/like`). */
export interface StatusLikeResult {
  statusId: string;
  liked: boolean;
  likeCount: number;
}

/** Result of a view record (`POST /status/:id/view`). */
export interface StatusViewResult {
  statusId: string;
  viewCount: number;
}

/**
 * Minimal cross-module preview published on `IStatusApi.getPreview` — a sibling
 * references a status item by id and needs a compact card without importing
 * this module's internals.
 */
export interface StatusPreview {
  id: string;
  title: string;
  mediaType: StatusMediaType;
  thumbnailUrl: string;
}

// ===========================================================================
// Admin write surface (TAM-98) — DTOs the admin service returns to the
// controller. Plain, wire-ready shapes (timestamps already `.toISOString()`d)
// so the service stays Prisma-free and the Zod response schemas validate them
// unchanged. Mirrors the TAM-88 deity / TAM-90 aarti / TAM-96 wallpaper
// exemplars.
//
// NOTE — status has NO Pro-gating (see the module header: everything is free,
// the only Pro action is the client-side Share render). So — like wallpaper and
// UNLIKE aarti — the admin service adds no gate and never touches the
// subscription facade; there is simply no gated field to un-gate.
//
// #EXPORT_CRITICAL — `UserStatusProfile` is USER-authored state holding PII
// (`businessMobileNumber`) and is deliberately absent from this admin surface.
// ===========================================================================

// ---- sort allowlists (Zod enum in schemas is built from these tuples) ------
// They live HERE (not in `routes/`) because the repository builds `orderBy`
// from them and `repositories/` may not import `routes/` (arch-boundaries.json).

/** Admin StatusItem list sort allowlist (ADR §C2). */
export const STATUS_ITEM_SORT_FIELDS = [
  "title",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type StatusItemSortField = (typeof STATUS_ITEM_SORT_FIELDS)[number];

/**
 * Admin status-PERFORMANCE list sort allowlists (TAM-256).
 *
 * Deliberately wider than `STATUS_ITEM_SORT_FIELDS`: this is a read-only
 * reporting surface where **every displayed column is sortable** is an explicit
 * acceptance criterion, so the allowlist is the column list. The
 * enumeration-surface argument behind `sortQuery`'s "never a free string" rule
 * still applies — these tuples are the allowlist, and a column absent here
 * cannot be ordered by.
 *
 * NOTE these are NOT all Prisma columns. The metric and position fields are
 * computed in the service after the Postgres/warehouse join (the warehouse
 * aggregate is window-scoped and page-independent — D-2 condition 9 forbids
 * pushing ORDER BY/LIMIT into ClickHouse), so the repository orders by the
 * Postgres-backed fields only and the service sorts the rest in TypeScript.
 * Blanks sort LAST in both directions — a mostly-blank pin column is useless
 * to sort otherwise.
 */
export const STATUS_PERFORMANCE_ITEM_SORT_FIELDS = [
  "title",
  "slug",
  "deitySlug",
  "mediaType",
  "isActive",
  "createdAt",
  "daysLive",
  "statusPinPosition",
  "homepagePinPosition",
  "avgObservedPosition",
  "onHomepageSince",
  "views",
  "viewers",
  "shareIntents",
  "shares",
  "shareRate",
  "completion",
] as const;
export type StatusPerformanceItemSortField =
  (typeof STATUS_PERFORMANCE_ITEM_SORT_FIELDS)[number];

/** Admin status-performance BY-DEITY list sort allowlist (TAM-256). */
export const STATUS_PERFORMANCE_DEITY_SORT_FIELDS = [
  "deitySlug",
  "deityName",
  "totalItems",
  "activeItems",
  "itemsInFeed",
  "views",
  "viewers",
  "shareIntents",
  "shares",
  "shareRate",
  "completion",
  "viewsPerItem",
  "sharesPerItem",
] as const;
export type StatusPerformanceDeitySortField =
  (typeof STATUS_PERFORMANCE_DEITY_SORT_FIELDS)[number];

/**
 * The sentinel `deitySlug` for items with no deity mapping (D-9).
 *
 * `status_items.deity_slug` is nullable with no FK, so "no deity" is a real
 * population that must be selectable as its own Tab 2 row and as a Tab 1
 * filter value — dropping it would silently hide content from the report.
 * A literal slug can never collide with it: `deities.slug` is never empty and
 * this value is not a valid slug shape.
 */
export const STATUS_PERFORMANCE_NO_DEITY = "(no-deity)" as const;

/**
 * First day `status_share_cta_clicked` exists in the warehouse (IST).
 *
 * Measured 2026-09-22: the event was added in `317a765f` (2026-09-10) and its
 * first warehouse row is 2026-09-12. A window starting before this returns a
 * populated Views column beside blank Share intents / Completion, so the API
 * reports it as `metricsAvailableFrom` and the UI must say so rather than let
 * an editor read blank as zero.
 */
export const STATUS_SHARE_INTENT_AVAILABLE_FROM = "2026-09-12" as const;

// ---- StatusItem ------------------------------------------------------------

/**
 * An admin StatusItem row — the full DB row (NOT gated: status has no
 * entitlement gate). Engagement counts (`contentType: "status"`) live in the
 * shared engagement module and are never CRUD-able here, so they are absent.
 */
export interface AdminStatusItemView {
  id: string;
  slug: string;
  title: string;
  mediaType: StatusMediaType;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string;
  overlaySafeArea: OverlaySafeArea;
  languages: string[];
  shareCaption: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Admin StatusItem detail — the row plus its single deity (TAM-108). */
export interface AdminStatusItemDetailView extends AdminStatusItemView {
  /** The single deity slug — a LOGICAL reference (no FK; validated via the facade). */
  deitySlug: string | null;
}

/** One offset page of admin status items + the unpaginated total (ADR §C2). */
export interface AdminStatusItemPage {
  items: AdminStatusItemView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Partial StatusItem mutation applied under the `updatedAt` precondition.
 * `slug` and `mediaType` (both immutable) are deliberately absent — rejected at
 * the Zod boundary. `overlaySafeArea` is a required `Json` column, so it is
 * never cleared to null (only replaced).
 */
export interface AdminStatusItemUpdateInput {
  title?: string;
  deitySlug?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string;
  overlaySafeArea?: OverlaySafeArea;
  languages?: string[];
  shareCaption?: string | null;
  isActive?: boolean;
}

