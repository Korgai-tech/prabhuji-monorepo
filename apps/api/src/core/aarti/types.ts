/**
 * Aarti & Bhajans module public types (TAM-63).
 *
 * The devotional-audio module: DISCOVERY IS FREE, PLAYBACK IS PRO. These are
 * the wire-facing shapes the service assembles and the controller sends; they
 * are validated on the way out by the Zod response schemas in
 * `routes/aarti.schemas.ts` (the OpenAPI source of truth), which act as the
 * last-line guard that `audioStreamUrl` is never serialized for a free user.
 *
 * #EXPORT_CRITICAL: `audioStreamUrl` is `string | null` on EVERY audio-bearing
 * shape — the service nulls it for non-Pro callers before serialization.
 */

/** The engagement `contentType` token for this module (guarded at the boundary). */
export const AARTI_CONTENT_TYPE = "aarti";

/**
 * Ordered homepage section kinds (`GET /aarti/main`). The first five are
 * BUILT-IN — one row each, resolved from server-side query rules. `curated`
 * (TAM-160) is the CMS-authored kind: MANY rows, each with a hand-picked,
 * explicitly ordered item list in `homepage_section_items`.
 */
export const AARTI_SECTION_TYPES = [
  "recently_played",
  "deities",
  "browse_categories",
  "newly_added",
  "most_played",
  "curated",
] as const;
export type AartiSectionType = (typeof AARTI_SECTION_TYPES)[number];

/**
 * Section types that carry AUDIO items (usable as a listing `sectionType`
 * filter). `curated` is DELIBERATELY absent (#PATH_DECISION 2): each of these
 * values identifies ONE list, but there are many curated sections — the listing
 * selects one with its own `sectionId` filter instead.
 */
export const AARTI_AUDIO_SECTION_TYPES = [
  "recently_played",
  "newly_added",
  "most_played",
] as const;
export type AartiAudioSectionType = (typeof AARTI_AUDIO_SECTION_TYPES)[number];

/**
 * INTERNAL sort modes. The public `/aarti/audios` listing is no longer
 * user-sortable — it always serves the stable-shuffle `default` order (id ASC).
 * These modes remain only for server-driven ordering: `/aarti/main`'s Most
 * Played (`most_played`) / Newly Added (`newest`) / Recently Played (`recent`)
 * sections, and the `default` flat list. There is no longer a public Zod enum.
 */
export type AartiSortMode = "newest" | "most_played" | "recent" | "default";

/** A compact audio card used inside homepage sections (union member). */
export interface AudioPreview {
  kind: "audio";
  id: string;
  title: string;
  coverImageUrl: string;
  singerName: string | null;
  isPrabhujiOriginal: boolean;
  /** #EXPORT_CRITICAL — non-null ONLY for Pro callers. */
  audioStreamUrl: string | null;
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
}

export type SectionItem = AudioPreview | DeityCard | CategoryCard;

/** One ordered homepage section. */
export interface AartiSection {
  /**
   * TAM-160: the section row's id, present on EVERY section (not just curated
   * ones) — it is what a curated section's "Show all" pages by
   * (`GET /aarti/audios?sectionId=`). Mirrors `WallpaperHomeRow.rowId`.
   */
  sectionId: string;
  sectionType: AartiSectionType;
  title: string;
  sortOrder: number;
  items: SectionItem[];
}

/** A row of the reusable `/aarti/audios` listing. */
export interface AudioListItem {
  id: string;
  title: string;
  coverImageUrl: string;
  singerName: string | null;
  composerNames: string | null;
  /** TAM-108: language-availability set ([] = all languages); supersedes `language`. */
  languages: string[];
  isPrabhujiOriginal: boolean;
  /** #EXPORT_CRITICAL — non-null ONLY for Pro callers. */
  audioStreamUrl: string | null;
  playCount: number;
  likeCount: number;
  viewCount: number;
  shareCount: number;
  likedByMe: boolean;
}

/** Full audio detail (`GET /aarti/audios/:id`). */
export interface AudioDetail extends AudioListItem {
  description: string | null;
  /** ISO-8601 string on the wire (or null). */
  publishedAt: string | null;
  categoryTags: CategoryCard[];
  /** TAM-108: the single deity (resolved from `deitySlug`), or null when unset. */
  deity: DeityCard | null;
}

/** A page of listing rows. */
export interface AudioListPage {
  items: AudioListItem[];
  nextCursor: string | null;
}

/** Result of a recorded playback (`POST /aarti/audios/:id/play`). */
export interface PlayResult {
  audioId: string;
  playCount: number;
  /** ISO-8601. */
  lastPlayedAt: string;
  lastPositionSeconds: number | null;
}

/** Result of a like toggle (`POST /aarti/audios/:id/like`). */
export interface LikeResult {
  audioId: string;
  liked: boolean;
  likeCount: number;
}

/**
 * Minimal cross-module summary published on `IAartiApi` — Home (TAM-61)
 * references aarti audio by id and needs a compact card without importing this
 * module's internals. `audioStreamUrl` is intentionally absent (the owning
 * module gates it per request).
 */
export interface AudioSummary {
  id: string;
  title: string;
  coverImageUrl: string;
}

/**
 * TAM-125: cross-module download source published on `IAartiApi`. Downloads
 * (`core/downloads`) resolves an aarti/bhajan id to the info it needs to mint a
 * download manifest: the S3 object key (already stripped of
 * `MEDIA_PUBLIC_BASE_URL`) + the size / duration / checksum metadata the mobile
 * client asserts on the downloaded file. `contentType` is echoed from the
 * request (aarti and bhajan share the same `AudioItem` table, so the SERVICE
 * annotates the response with what the client asked for; the repository does
 * not know the distinction).
 *
 * Nullability: `durationMs` and `checksum` are nullable while the data-engineer
 * backfill lands — see spec §Database Tasks. `sizeBytes` is a `number` on the
 * wire (safe for audio blobs; `< 2^53`); the SERVICE narrows from the schema's
 * `BigInt?` with a defensive check.
 */
export interface DownloadSource {
  objectKey: string;
  sizeBytes: number;
  durationMs: number | null;
  checksum: string | null;
  contentType: string;
}

// ===========================================================================
// Admin write surface (TAM-90) — DTOs the admin service returns to the
// controller. Plain, wire-ready shapes (timestamps already `.toISOString()`d)
// so the service stays Prisma-free and the Zod response schemas validate them
// unchanged. Mirrors the TAM-88 deity exemplar (`AdminDeity*`).
//
// #EXPORT_CRITICAL — admin reads are NOT Pro-gated: `AdminAudioItem*View`
// carries `audioStreamUrl` in FULL (an editor must see what they edit; ADR §C1).
// This is achieved by the admin service NEVER calling the subscription facade —
// the public `AartiService`'s fail-closed gate stays unconditional and untouched.
// ===========================================================================

// ---- sort allowlists (Zod enum in schemas is built from these tuples) ------
// They live HERE (not in `routes/`) because the repository builds `orderBy`
// from them and `repositories/` may not import `routes/` (arch-boundaries.json).

/** Admin AudioItem list sort allowlist (ADR §C2). */
export const AUDIO_ITEM_SORT_FIELDS = [
  "title",
  "playCount",
  "publishedAt",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type AudioItemSortField = (typeof AUDIO_ITEM_SORT_FIELDS)[number];

/** Admin AudioCategory list sort allowlist. */
export const AUDIO_CATEGORY_SORT_FIELDS = [
  "slug",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type AudioCategorySortField = (typeof AUDIO_CATEGORY_SORT_FIELDS)[number];

/** Admin HomepageSection list sort allowlist. */
export const HOMEPAGE_SECTION_SORT_FIELDS = [
  "sectionType",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type HomepageSectionSortField =
  (typeof HOMEPAGE_SECTION_SORT_FIELDS)[number];

// ---- AudioCategory ---------------------------------------------------------

/** An admin AudioCategory row — the full DB row (NOT localized, NOT gated). */
export interface AdminAudioCategoryView {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  displayColor: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin categories + the unpaginated total (ADR §C2). */
export interface AdminAudioCategoryPage {
  items: AdminAudioCategoryView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Partial AudioCategory mutation applied under the `updatedAt` precondition. */
export interface AdminAudioCategoryUpdateInput {
  name?: string;
  imageUrl?: string | null;
  description?: string | null;
  displayColor?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * TAM-109: one `(audioCategoryId, locale)` label-override row as returned to the
 * admin client (NOT localized — an editor sees every locale). `description` is
 * nullable (the column is optional).
 */
export interface AdminAudioCategoryTranslationView {
  locale: string;
  name: string;
  description: string | null;
}

/**
 * TAM-109: admin AudioCategory detail — the row plus ALL its per-locale label
 * overrides, so the edit form can load the current translations. Translations
 * now ride in the category create/patch body (no sub-resource).
 */
export interface AdminAudioCategoryDetailView extends AdminAudioCategoryView {
  translations: AdminAudioCategoryTranslationView[];
}

// ---- AudioItem -------------------------------------------------------------

/** A resolved category tag on an admin audio detail row. */
export interface AdminAudioCategoryTagView {
  id: string;
  slug: string;
  name: string;
}

/**
 * An admin AudioItem list row — the full DB row. `audioStreamUrl` is present in
 * FULL (admin reads are not Pro-gated; #EXPORT_CRITICAL). `playCount` is shown
 * but is server-authoritative and rejected in write schemas.
 */
export interface AdminAudioItemView {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string;
  audioStreamUrl: string;
  singerName: string | null;
  composerNames: string | null;
  /** TAM-108: single-deity logical ref to `deities.slug` (no DB FK), or null. */
  deitySlug: string | null;
  /** TAM-108: language-availability set ([] = all languages); supersedes `language`. */
  languages: string[];
  description: string | null;
  publishedAt: string | null;
  playCount: number;
  isFeatured: boolean;
  isPrabhujiOriginal: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Admin AudioItem detail — the list row plus its resolved category tag set.
 * TAM-108: the deity is now the scalar `deitySlug` on the row (not a tag set).
 */
export interface AdminAudioItemDetailView extends AdminAudioItemView {
  categoryTags: AdminAudioCategoryTagView[];
}

/** One offset page of admin audio items + the unpaginated total (ADR §C2). */
export interface AdminAudioItemPage {
  items: AdminAudioItemView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Partial AudioItem mutation applied under the `updatedAt` precondition.
 * `slug` (immutable) and `playCount` (server-authoritative) are deliberately
 * absent — rejected at the Zod boundary. `publishedAt` is a `Date | null`
 * (the service parses the ISO string before it reaches the repo).
 */
export interface AdminAudioItemUpdateInput {
  title?: string;
  coverImageUrl?: string;
  audioStreamUrl?: string;
  singerName?: string | null;
  composerNames?: string | null;
  /** TAM-108: single-deity logical ref; validated via the deity facade. */
  deitySlug?: string;
  /** TAM-108: language-availability set ([] = all languages). */
  languages?: string[];
  description?: string | null;
  publishedAt?: Date | null;
  isFeatured?: boolean;
  isPrabhujiOriginal?: boolean;
  isActive?: boolean;
}

// ---- HomepageSection -------------------------------------------------------

/** An admin HomepageSection row — the full DB row. */
export interface AdminHomepageSectionView {
  id: string;
  sectionType: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  itemQuery: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin sections + the unpaginated total (ADR §C2). */
export interface AdminHomepageSectionPage {
  items: AdminHomepageSectionView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Partial HomepageSection mutation applied under the `updatedAt` precondition.
 * `sectionType` (immutable — it drives bespoke server-side resolution) is
 * deliberately absent, rejected at the Zod boundary like `slug` on the exemplar.
 */
export interface AdminHomepageSectionUpdateInput {
  title?: string;
  sortOrder?: number;
  isActive?: boolean;
  itemQuery?: string | null;
}

/**
 * TAM-109: one `(homepageSectionId, locale)` `title`-override row as returned to
 * the admin client (NOT localized — an editor sees every locale).
 */
export interface AdminHomepageSectionTranslationView {
  locale: string;
  title: string;
}

/**
 * TAM-160: one curated membership entry (`position` = the array index the editor
 * saved). Mirrors `AdminWallpaperRowItemView`.
 */
export interface AdminHomepageSectionItemView {
  audioId: string;
  position: number;
  /** Display-only echoes of `audio_items`, so the CMS can name a member it has
   * not separately loaded (TAM-160). Never read back on the write path. */
  title: string;
  coverImageUrl: string;
}

/**
 * TAM-109: admin HomepageSection detail — the row plus ALL its per-locale title
 * overrides, so the edit form can load the current translations. Translations
 * now ride in the section create/patch body (no sub-resource).
 *
 * TAM-160: plus its ordered curated `items` (always `[]` for a built-in type,
 * whose items resolve from query rules).
 */
export interface AdminHomepageSectionDetailView
  extends AdminHomepageSectionView {
  translations: AdminHomepageSectionTranslationView[];
  items: AdminHomepageSectionItemView[];
}
