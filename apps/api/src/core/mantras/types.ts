/**
 * Mantras & Stutis module public types (TAM-65).
 *
 * A structural sibling of the Aarti module (TAM-63): DISCOVERY IS FREE, PLAYBACK
 * IS PRO. These are the wire-facing shapes the service assembles and the
 * controller sends; they are validated on the way out by the Zod response
 * schemas in `routes/mantras.schemas.ts` (the OpenAPI source of truth), which
 * act as the last-line guard that `audioUrl` is never serialized for a free
 * user.
 *
 * #EXPORT_CRITICAL: `audioUrl` is `string | null` on EVERY audio-bearing shape —
 * the service nulls it for non-Pro callers before serialization (detail,
 * listing, sections, playlist).
 */

/** The engagement `contentType` token for this module (guarded at the boundary). */
export const MANTRAS_CONTENT_TYPE = "mantra";

/** Content kinds carried by a `MantraAudioItem`. */
export const MANTRA_ITEM_TYPES = ["mantra", "stuti"] as const;
export type MantraItemType = (typeof MANTRA_ITEM_TYPES)[number];

/**
 * Ordered homepage section kinds (`GET /mantras/sections`). The first four are
 * BUILT-IN — resolved server-side from query rules, one row each. `curated`
 * (TAM-160) is the CMS-authored kind: MANY rows, each with a hand-picked,
 * explicitly ordered item list in `mantra_homepage_section_items`.
 */
export const MANTRA_SECTION_TYPES = [
  "recently_played",
  "deities",
  "categories",
  "newly_added",
  "curated",
] as const;
export type MantraSectionType = (typeof MANTRA_SECTION_TYPES)[number];

/**
 * Section types that carry AUDIO items (usable as a listing `sectionType`
 * filter). TAM-160 #PATH_DECISION 2: `curated` is deliberately ABSENT — each
 * value here identifies exactly ONE list, and with many curated sections
 * `sectionType=curated` would be ambiguous. A curated list is paged by its own
 * `?sectionId=` filter instead (mirrors wallpaper's `?rowId=`).
 */
export const MANTRA_AUDIO_SECTION_TYPES = [
  "recently_played",
  "newly_added",
] as const;
export type MantraAudioSectionType = (typeof MANTRA_AUDIO_SECTION_TYPES)[number];

/** Section layout hints (rendering only). */
export const MANTRA_LAYOUT_TYPES = [
  "horizontal_cards",
  "deity_row",
  "category_grid",
] as const;
export type MantraLayoutType = (typeof MANTRA_LAYOUT_TYPES)[number];

/**
 * Internal listing sort modes (repository/service only). The public
 * `/mantras/items` `sort` query param was removed — the flat listing is now a
 * stable shuffle by `id` (`default`). These names still drive the repository's
 * named-sort clauses (`most_played`→playCount, `newest`→publishedAt,
 * `recent`→lastPlayedAt) that back the homepage sections + the
 * recently-played / newly-added listings.
 */
export type MantraSortMode = "newest" | "most_played" | "recent" | "default";

/**
 * Playlist resolution sources (§6 `playlist_behavior.source_rules`). The client
 * says "opened item X from surface Y"; the SERVER resolves the ordered group so
 * the ordering rules can never drift between platforms.
 */
export const MANTRA_PLAYLIST_SOURCES = [
  "recently_played",
  "deity",
  "category",
  "newly_added",
  "listing",
] as const;
export type MantraPlaylistSource = (typeof MANTRA_PLAYLIST_SOURCES)[number];

/**
 * The EXACT allowed japa counter targets (#EXPORT_CRITICAL). Rejected at the
 * Zod boundary if anything else; default is `7` (Figma's `21` is ignored).
 */
export const MANTRA_REPEAT_TARGETS = [7, 11, 21, 108, 1008] as const;
export type MantraRepeatTarget = (typeof MANTRA_REPEAT_TARGETS)[number];
export const DEFAULT_REPEAT_TARGET: MantraRepeatTarget = 7;

/** A compact mantra card used inside homepage sections (union member). */
export interface MantraPreview {
  kind: "mantra";
  id: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  singerName: string | null;
  /** #EXPORT_CRITICAL — non-null ONLY for Pro callers. */
  audioUrl: string | null;
  playCount: number;
  likeCount: number;
  shareCount: number;
  likedByMe: boolean;
}

/** A deity taxonomy card (from the TAM-57 deity facade). */
export interface DeityCard {
  kind: "deity";
  slug: string;
  displayName: string;
  iconUrl: string;
}

/** A browse-category card. */
export interface CategoryCard {
  kind: "category";
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
}

export type SectionItem = MantraPreview | DeityCard | CategoryCard;

/** One ordered homepage section. */
export interface MantraSection {
  /**
   * TAM-160: the section row's uuid, present on EVERY section (not just curated
   * ones) — it is what the app passes back as `?sectionId=` for Show-all.
   */
  sectionId: string;
  sectionType: MantraSectionType;
  title: string;
  layoutType: MantraLayoutType;
  showAllEnabled: boolean;
  sortOrder: number;
  items: SectionItem[];
}

/** A row of the reusable `/mantras/items` listing (also the playlist element). */
export interface MantraListItem {
  id: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  singerName: string | null;
  composerName: string | null;
  /**
   * TAM-108: the availability language set (ISO 639-1 codes). `[]` means the
   * item is available in ALL languages. Supersedes the old single `language`.
   */
  languages: string[];
  /** #EXPORT_CRITICAL — non-null ONLY for Pro callers. */
  audioUrl: string | null;
  playCount: number;
  likeCount: number;
  viewCount: number;
  shareCount: number;
  likedByMe: boolean;
}

/**
 * Full mantra detail — the primary item on `GET /mantras/items/:id`. Adds the
 * scripture text (Devanagari, line breaks preserved), transliteration, share
 * metadata and taxonomy tags to the listing shape.
 */
export interface MantraDetail extends MantraListItem {
  /** #EXPORT_CRITICAL — Devanagari, line breaks preserved byte-for-byte. */
  mantraText: string;
  transliterationText: string | null;
  description: string | null;
  deepLinkUrl: string | null;
  /** ISO-8601 string on the wire (or null). */
  publishedAt: string | null;
  categoryTags: CategoryCard[];
  /**
   * TAM-108: the SINGLE deity this item belongs to, resolved from the item's
   * `deitySlug` through the deity facade (like ringtone). `null` when the item
   * has no deity or its slug resolves to no active deity. Supersedes the old
   * many-to-many `deityTags` array.
   */
  deity: DeityCard | null;
}

/**
 * `GET /mantras/items/:id` result — the item plus the ordered playlist it was
 * opened from and the resolved `playlistSource`.
 */
export interface MantraDetailResult {
  item: MantraDetail;
  playlist: MantraListItem[];
  playlistSource: MantraPlaylistSource;
}

/** A page of listing rows. */
export interface MantraListPage {
  items: MantraListItem[];
  nextCursor: string | null;
}

/**
 * Deity/category tap result (`GET /mantras/{deities|categories}/:id/playlist`) —
 * the first item of the ordered group plus the full ordered playlist (the
 * `firstItem` IS `playlist[0]`; `firstItem` is `null` only when the group is
 * empty).
 */
export interface PlaylistResult {
  firstItem: MantraListItem | null;
  playlist: MantraListItem[];
  playlistSource: MantraPlaylistSource;
}

/** Result of a recorded recently-played write (`POST …/recently-played`). */
export interface RecentlyPlayedResult {
  itemId: string;
  playCount: number;
  /** ISO-8601. */
  lastPlayedAt: string;
  lastProgressSeconds: number | null;
}

/** Result of a like toggle (`POST …/like`). */
export interface LikeResult {
  itemId: string;
  liked: boolean;
  likeCount: number;
}

/** The stored japa counter preference (`GET/PUT /mantras/counter-preference`). */
export interface CounterPreference {
  repeatTarget: MantraRepeatTarget;
  /**
   * The full selectable option list (`MANTRA_REPEAT_TARGETS`), in display order.
   * Served alongside the chosen target so the client's counter picker is
   * server-driven instead of hardcoding `[7, 11, 21, 108, 1008]`. Typed as a
   * plain `number[]` on the wire (an OpenAPI int enum breaks the Dart generator).
   */
  availableTargets: number[];
}

/**
 * Minimal cross-module summary published on `IMantrasApi` — a sibling module
 * references a mantra by id and needs a compact card without importing this
 * module's internals. `audioUrl` is intentionally absent (the owning module
 * gates it per request).
 */
export interface MantraSummary {
  id: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
}

/** Cross-module share payload (`IMantrasApi.getItemForShare`). Never a stream URL. */
export interface MantraShareInfo {
  id: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  deepLinkUrl: string | null;
}

/**
 * TAM-125: cross-module download source published on `IMantrasApi`. Downloads
 * (`core/downloads`) resolves a mantra id to the info it needs to mint a
 * download manifest — same shape as the aarti facade's `DownloadSource`,
 * but the row comes from a SEPARATE `MantraAudioItem` table.
 *
 * Nullability: `durationMs` and `checksum` are nullable while the data-engineer
 * backfill lands (see spec §Database Tasks). `sizeBytes` is a `number` on the
 * wire (safe for audio blobs; `< 2^53`); the SERVICE narrows from the schema's
 * `BigInt?` with a defensive check. `contentType` is always the literal
 * `"mantra"` (echoed from the request for symmetry with the aarti facade).
 */
export interface DownloadSource {
  objectKey: string;
  sizeBytes: number;
  durationMs: number | null;
  checksum: string | null;
  contentType: "mantra";
}

// ===========================================================================
// Admin write surface (TAM-92) — the near-twin of the deity taxonomy admin
// exemplar (TAM-88). DTOs the admin service returns to the controller: plain,
// wire-ready shapes (timestamps already `.toISOString()`d) so the service stays
// Prisma-free and the Zod response schemas validate them unchanged.
//
// Distinct from the public wire shapes above: admin reads are NOT localized and
// NOT Pro-gated — an editor sees the raw row, and `audioUrl` is returned IN FULL
// (the fail-closed public gate in `MantrasService` is untouched, #EXPORT_CRITICAL).
// ===========================================================================

// ---- sort allowlists (per entity) -----------------------------------------
// These live HERE (not in `routes/`) because the repository builds `orderBy`
// from them and `repositories/` is forbidden from importing `routes/`
// (arch-boundaries.json). The Zod `sort` enums in `mantras.admin.schemas.ts` are
// built from these same tuples, so the boundary allowlist and the DB sort can
// never drift.

/** `MantraAudioItem` admin-list `sort` allowlist. */
export const MANTRA_ITEM_SORT_FIELDS = [
  "title",
  "playCount",
  "publishedAt",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type MantraItemSortField = (typeof MANTRA_ITEM_SORT_FIELDS)[number];

/** `MantraCategory` admin-list `sort` allowlist. */
export const MANTRA_CATEGORY_SORT_FIELDS = [
  "slug",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type MantraCategorySortField =
  (typeof MANTRA_CATEGORY_SORT_FIELDS)[number];

/** `MantraHomepageSection` admin-list `sort` allowlist. */
export const MANTRA_SECTION_SORT_FIELDS = [
  "sectionType",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type MantraSectionSortField =
  (typeof MANTRA_SECTION_SORT_FIELDS)[number];

// ---- category ------------------------------------------------------------

/** An admin `MantraCategory` list row (no sub-relations exposed). */
export interface AdminMantraCategoryView {
  id: string;
  slug: string;
  displayName: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * An admin category detail row — the list row plus ALL per-locale `displayName`
 * overrides (TAM-110; single-item reads/writes carry `translations`).
 */
export interface AdminMantraCategoryDetailView extends AdminMantraCategoryView {
  translations: AdminMantraCategoryTranslationView[];
}

/** Partial category mutation applied under an `updatedAt` precondition. */
export interface AdminMantraCategoryUpdateInput {
  displayName?: string;
  imageUrl?: string | null;
  backgroundColorToken?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** Fully-parsed category create input (Zod defaults already applied). */
export interface AdminMantraCategoryCreateInput {
  slug: string;
  displayName: string;
  imageUrl: string | null;
  backgroundColorToken: string | null;
  sortOrder: number;
  isActive: boolean;
  /** TAM-110: per-locale `displayName` overrides seeded with the row. */
  translations: AdminMantraCategoryTranslationView[];
}

// ---- audio item ----------------------------------------------------------

/** An admin `MantraAudioItem` list row — `audioUrl` returned IN FULL (not gated). */
export interface AdminMantraItemListView {
  id: string;
  slug: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  /** #EXPORT_CRITICAL contrast: admin sees the FULL url; the public gate is untouched. */
  audioUrl: string;
  singerName: string | null;
  composerName: string | null;
  /** TAM-108: availability language set (`[]` = all languages). */
  languages: string[];
  publishedAt: string | null;
  playCount: number;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An admin item detail row — the list row plus the scripture text + tag sets. */
export interface AdminMantraItemDetailView extends AdminMantraItemListView {
  /** #EXPORT_CRITICAL — Devanagari, line breaks preserved byte-for-byte. */
  mantraText: string;
  transliterationText: string | null;
  description: string | null;
  deepLinkUrl: string | null;
  categoryIds: string[];
  /** TAM-108: the SINGLE deity slug (logical ref; `null` = no deity). */
  deitySlug: string | null;
}

/** Fully-parsed item create input (Zod defaults applied; `publishedAt` a `Date`). */
export interface AdminMantraItemCreateInput {
  slug: string;
  title: string;
  type: MantraItemType;
  artworkUrl: string;
  audioUrl: string;
  singerName: string | null;
  composerName: string | null;
  mantraText: string;
  transliterationText: string | null;
  /** TAM-108: single deity slug (logical ref; `null` = no deity). */
  deitySlug: string | null;
  /** TAM-108: availability language set (`[]` = all languages). */
  languages: string[];
  description: string | null;
  deepLinkUrl: string | null;
  publishedAt: Date | null;
  isFeatured: boolean;
  isActive: boolean;
}

/**
 * Partial item mutation applied under an `updatedAt` precondition. `playCount`
 * is intentionally ABSENT — it is a server-authoritative column (rejected at the
 * Zod boundary). `slug` is likewise absent (immutable business key).
 */
export interface AdminMantraItemUpdateInput {
  title?: string;
  type?: MantraItemType;
  artworkUrl?: string;
  audioUrl?: string;
  singerName?: string | null;
  composerName?: string | null;
  mantraText?: string;
  transliterationText?: string | null;
  /** TAM-108: single deity slug (logical ref; `null` = clear the deity). */
  deitySlug?: string | null;
  /** TAM-108: availability language set (`[]` = all languages). */
  languages?: string[];
  description?: string | null;
  deepLinkUrl?: string | null;
  publishedAt?: Date | null;
  isFeatured?: boolean;
  isActive?: boolean;
}

// ---- homepage section ----------------------------------------------------

/** An admin `MantraHomepageSection` list row. */
export interface AdminMantraSectionView {
  id: string;
  sectionType: MantraSectionType;
  title: string;
  layoutType: MantraLayoutType;
  showAllEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * TAM-160: one hand-picked membership entry of a `curated` section. `position`
 * is the array index the editor saved (0-based, contiguous after every write).
 */
export interface AdminMantraSectionItemView {
  itemId: string;
  position: number;
  /** Display-only echoes of `mantra_audio_items` so the CMS can name a member
   * it has not separately loaded (TAM-160). Never read back on the write path. */
  title: string;
  artworkUrl: string;
}

/**
 * An admin section detail row — the list row plus ALL per-locale `title`
 * overrides (TAM-110; single-item reads/writes carry `translations`) and, for a
 * `curated` section, its ordered `items` so the editor hydrates from the server
 * (TAM-160). Always `[]` for a built-in section.
 */
export interface AdminMantraSectionDetailView extends AdminMantraSectionView {
  translations: AdminMantraSectionTranslationView[];
  items: AdminMantraSectionItemView[];
}

/** Fully-parsed section create input (Zod defaults applied). */
export interface AdminMantraSectionCreateInput {
  sectionType: MantraSectionType;
  title: string;
  layoutType: MantraLayoutType;
  showAllEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
  /** TAM-110: per-locale `title` overrides seeded with the row. */
  translations: AdminMantraSectionTranslationView[];
}

/**
 * Partial section mutation applied under an `updatedAt` precondition.
 * `sectionType` is intentionally ABSENT — it drives bespoke server-side
 * resolution, so it is immutable (rejected at the Zod boundary).
 */
export interface AdminMantraSectionUpdateInput {
  title?: string;
  layoutType?: MantraLayoutType;
  showAllEnabled?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

// ---- embedded translation views (TAM-110) ---------------------------------
// Admin translation rows are NOT localized — an editor sees every locale. One
// row per `(entity, locale)`; the localized field is the entity's label column.
// Carried on the entity detail view + create body (the sub-resource is gone).

/** An admin `MantraCategoryTranslation` row (`displayName` override per locale). */
export interface AdminMantraCategoryTranslationView {
  locale: string;
  displayName: string;
}

/** An admin `MantraHomepageSectionTranslation` row (`title` override per locale). */
export interface AdminMantraSectionTranslationView {
  locale: string;
  title: string;
}

// ---- offset page wrappers -------------------------------------------------

/** One offset page + the unpaginated total (ADR §C2). */
export interface AdminMantraCategoryPage {
  items: AdminMantraCategoryView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminMantraItemPage {
  items: AdminMantraItemListView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminMantraSectionPage {
  items: AdminMantraSectionView[];
  total: number;
  page: number;
  pageSize: number;
}
