/**
 * Books & Scriptures module public types (TAM-75).
 *
 * DISCOVERY IS FREE, READING IS PRO. These are the wire-facing shapes the
 * service assembles and the controller sends; they are validated on the way out
 * by the Zod response schemas in `routes/books.schemas.ts` (the OpenAPI source
 * of truth), which act as the last-line guard.
 *
 * #EXPORT_CRITICAL: the reading shapes (`ChapterContent.bodyText`,
 * `ScriptureContent.contentBody`, `ChapterContent.audioUrl`) are NEVER built for
 * a free caller — the service throws `403` before assembling any reading payload,
 * so no preview/partial shape exists to leak. `audioUrl` is major-book-only (r7):
 * `ScriptureContent` has no audio field at all.
 */

/** The two content hierarchies, discriminated on `content.content_type`. */
export const BOOK_CONTENT_TYPES = ["major_book", "direct_scripture"] as const;
export type BookContentTypeValue = (typeof BOOK_CONTENT_TYPES)[number];

/** Direct-scripture taxonomy (PRD §8.2). Major books carry no category. */
export const BOOK_CATEGORIES = [
  "Chalisa",
  "Aarti",
  "Kavach",
  "Stotram",
] as const;
export type BookCategoryValue = (typeof BOOK_CATEGORIES)[number];

/**
 * The `GET /books/home` section keys, in their default render order. The TITLE of
 * each is CMS-owned (`book_sections.title`) — the app used to hardcode "Books",
 * "Newly Added Books" and "Browse Categories".
 */
export const BOOK_HOME_SECTION_KEYS = [
  "carousel",
  "categories",
  "newly_added",
] as const;
export type BookHomeSectionKey = (typeof BOOK_HOME_SECTION_KEYS)[number];

/**
 * The section key whose title heads the ALL-BOOKS listing SCREEN (`GET /books`) —
 * not a home section, but stored in the same CMS table so every Books heading has
 * exactly one home. The app used to hardcode "All Books".
 */
export const BOOK_ALL_BOOKS_SECTION_KEY = "all_books";

/**
 * A discovery card (home carousel / listings / newly-added). METADATA ONLY —
 * no reading body, no audio URL. Reading is gated server-side on the reading
 * calls (the free-vs-Pro entitlement check), never advertised on the card.
 */
export interface BookCard {
  contentId: string;
  contentType: BookContentTypeValue;
  category: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /**
   * Language availability set (TAM-108, ISO 639-1 codes). A book/scripture is
   * offered in EACH listed language; an EMPTY array means "all languages"
   * (supersedes the single `language` column, dropped in step 3).
   */
  languages: string[];
  offlineCacheEligible: boolean;
}

/** A category card on the books home (Chalisa / Aarti / Kavach / Stotram). */
export interface BookCategoryCard {
  category: BookCategoryValue;
  title: string;
  itemCount: number;
}

/**
 * A section's typed item, discriminated on `kind` — mirrors the Aarti module's
 * `SectionItem` (the in-repo reference for a titled, ordered section list): a
 * `book` card in the carousel/newly-added sections, a `category` card in the
 * categories section.
 */
export type BookSectionItem =
  | ({ kind: "book" } & BookCard)
  | ({ kind: "category" } & BookCategoryCard);

/**
 * One ordered `GET /books/home` section. Mirrors `AartiSection` — the section
 * carries its own CMS-owned `title` + `sortOrder`, so the client renders headings
 * from the server instead of hardcoding them.
 */
export interface BooksHomeSection {
  key: BookHomeSectionKey;
  title: string;
  sortOrder: number;
  items: BookSectionItem[];
}

/**
 * `GET /books/home` — free discovery composition, as ordered, self-titled
 * sections. No reading bodies. Empty sections are omitted (the aarti
 * hide-when-empty convention).
 */
export interface BooksHome {
  sections: BooksHomeSection[];
}

/**
 * A page of discovery cards (cursor-paginated). `title` is the CMS-owned heading
 * for the listing SCREEN — the all-books section title on `GET /books`, the
 * category's own title on `GET /books/categories/:category`.
 */
export interface BookCardPage {
  title: string;
  items: BookCard[];
  nextCursor: string | null;
}

/** A chapter's discovery metadata inside a book's contents (no body/audio URL). */
export interface ChapterSummary {
  chapterId: string;
  title: string;
  order: number;
  /** Whether this chapter carries an audio track (metadata for the client — NOT the URL). */
  hasAudio: boolean;
}

/** A sub-book / kanda inside a book's contents, with its ordered chapters. */
export interface SubBookSummary {
  subBookId: string;
  title: string;
  order: number;
  chapterCount: number;
  chapters: ChapterSummary[];
}

/**
 * `GET /books/:id/contents` — Pro-gated major-book contents (cover, title,
 * ordered kanda list + chapter counts). No `bodyText`, no `audioUrl`: this is
 * the reader's table of contents, still metadata. Serialized ONLY for Pro
 * callers (the endpoint is Pro-gated as a whole per PRD §7).
 */
export interface BookContents {
  contentId: string;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /** Language availability set (TAM-108); empty = all languages. */
  languages: string[];
  offlineCacheEligible: boolean;
  subBooks: SubBookSummary[];
  /** Chapters directly under the book (sub-book-less major books). */
  chapters: ChapterSummary[];
  totalChapterCount: number;
}

/**
 * `GET /books/:id/chapters/:chapterId` — Pro-gated chapter reader payload.
 * #EXPORT_CRITICAL: built ONLY for a Pro caller. `audioUrl` is null when the
 * chapter has no audio (major-book chapters only ever carry it).
 */
export interface ChapterContent {
  contentId: string;
  chapterId: string;
  subBookId: string | null;
  title: string;
  order: number;
  bodyText: string;
  audioUrl: string | null;
  hasAudio: boolean;
  offlineCacheEligible: boolean;
}

/**
 * `GET /books/:id/scripture` — Pro-gated direct-scripture reader payload.
 * #EXPORT_CRITICAL: built ONLY for a Pro caller. There is NO audio field — a
 * direct-scripture response never carries audio (r7).
 */
export interface ScriptureContent {
  contentId: string;
  category: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /** Language availability set (TAM-108); empty = all languages. */
  languages: string[];
  contentBody: string;
  offlineCacheEligible: boolean;
}

/**
 * Minimal cross-module summary published on `IBooksApi` — a sibling (Home/
 * TAM-61) references a book by id and renders a compact card without importing
 * this module's internals. No reading body/audio: the owning module gates those
 * per request.
 */
export interface BookSummary {
  contentId: string;
  contentType: BookContentTypeValue;
  title: string;
  coverImageUrl: string;
}

// ===========================================================================
// Admin write surface (TAM-102) — DTOs the admin service returns to the
// controller. Plain, wire-ready shapes (timestamps already `.toISOString()`d)
// so the service stays Prisma-free and the Zod response schemas validate them
// unchanged. Mirrors the TAM-88 deity exemplar / TAM-90 aarti shape across the
// module's FOUR entities (content, sub-book, chapter, section).
//
// #EXPORT_CRITICAL — admin reads are NOT Pro-gated: the content/chapter views
// carry `contentBody` / `bodyText` / `audioUrl` in FULL (an editor must see what
// they edit; ADR §C1). This is achieved by the admin service NEVER calling the
// subscription facade — the public `BooksService`'s fail-closed gate on those
// three fields stays unconditional and untouched.
// ===========================================================================

// ---- section keys (server-owned set; `key` is `@unique` + immutable) -------

/**
 * The full `book_sections.key` set: the three home-section keys plus the
 * all-books listing-screen key. An unknown key would create a section the
 * service cannot resolve, so it is enum-validated on POST and immutable on PATCH.
 */
export const BOOK_SECTION_KEYS = [
  "carousel",
  "categories",
  "newly_added",
  "all_books",
] as const;
export type BookSectionKeyValue = (typeof BOOK_SECTION_KEYS)[number];

// ---- sort allowlists (Zod enum in schemas is built from these tuples) ------
// They live HERE (not in `routes/`) because the repository builds `orderBy`
// from them and `repositories/` may not import `routes/` (arch-boundaries.json).

/** Admin BookContent list sort allowlist (ADR §C2). */
export const BOOK_CONTENT_SORT_FIELDS = [
  "title",
  "slug",
  "contentType",
  "category",
  "sortOrder",
  "newlyAddedAt",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type BookContentSortField = (typeof BOOK_CONTENT_SORT_FIELDS)[number];

/** Admin BookSubBook list sort allowlist. */
export const BOOK_SUB_BOOK_SORT_FIELDS = [
  "title",
  "order",
  "createdAt",
  "updatedAt",
] as const;
export type BookSubBookSortField = (typeof BOOK_SUB_BOOK_SORT_FIELDS)[number];

/** Admin BookChapter list sort allowlist. */
export const BOOK_CHAPTER_SORT_FIELDS = [
  "title",
  "order",
  "createdAt",
  "updatedAt",
] as const;
export type BookChapterSortField = (typeof BOOK_CHAPTER_SORT_FIELDS)[number];

/** Admin BookSection list sort allowlist. */
export const BOOK_SECTION_SORT_FIELDS = [
  "key",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt",
] as const;
export type BookSectionSortField = (typeof BOOK_SECTION_SORT_FIELDS)[number];

// ---- BookContent -----------------------------------------------------------

/**
 * An admin BookContent row — the full DB row (NOT Pro-gated). `contentBody` is
 * present in FULL for `direct_scripture` (null for `major_book`); admin reads
 * are not entitlement-gated (#EXPORT_CRITICAL). `contentType`/`category` reflect
 * the two-hierarchy discriminator.
 */
export interface AdminBookContentView {
  id: string;
  slug: string;
  contentType: BookContentTypeValue;
  category: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /**
   * Language availability set (TAM-108); empty = all languages. Replaces the
   * single `language` column (kept in the DB until step 3, but no longer read).
   */
  languages: string[];
  sortOrder: number;
  offlineCacheEligible: boolean;
  /** ISO-8601 or null (set → surfaced in the "Newly Added" section). */
  newlyAddedAt: string | null;
  /** Inline scripture text (direct_scripture only); null for major_book. */
  contentBody: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin content rows + the unpaginated total (ADR §C2). */
export interface AdminBookContentPage {
  items: AdminBookContentView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Partial BookContent mutation applied under the `updatedAt` precondition.
 * `slug` and `contentType` are deliberately absent — both immutable and
 * rejected at the Zod boundary (`contentType` flip would orphan the child
 * structure). `newlyAddedAt` is a `Date | null` (the service parses the ISO
 * string before it reaches the repo). `contentBody` round-trips byte-for-byte.
 */
export interface AdminBookContentUpdateInput {
  category?: BookCategoryValue | null;
  title?: string;
  coverImageUrl?: string;
  author?: string | null;
  /** Language availability set (TAM-108); empty = all languages. */
  languages?: string[];
  sortOrder?: number;
  offlineCacheEligible?: boolean;
  newlyAddedAt?: Date | null;
  contentBody?: string | null;
  isActive?: boolean;
}

// ---- BookSubBook -----------------------------------------------------------

/** An admin BookSubBook (kanda) row — `chapterCount` is derived (never input). */
export interface AdminBookSubBookView {
  id: string;
  contentId: string;
  slug: string;
  title: string;
  order: number;
  /** Stored denormalized child-chapter count; recomputed transactionally. */
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin sub-books + the unpaginated total (ADR §C2). */
export interface AdminBookSubBookPage {
  items: AdminBookSubBookView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Partial BookSubBook mutation (`slug`/`contentId`/`chapterCount` absent). */
export interface AdminBookSubBookUpdateInput {
  title?: string;
  order?: number;
}

/** The result of a sub-book hard delete — surfaces the cascade loss to the UI. */
export interface AdminBookSubBookDeleteResult {
  id: string;
  /** Chapters CASCADE-deleted with the sub-book (real, irreversible loss). */
  deletedChapterCount: number;
}

// ---- BookChapter -----------------------------------------------------------

/**
 * An admin BookChapter row — `bodyText` in FULL and `audioUrl` present (admin
 * reads are not Pro-gated; #EXPORT_CRITICAL). `subBookId` is null for chapters
 * hanging directly off the content (the sub-book-less major-book case).
 */
export interface AdminBookChapterView {
  id: string;
  contentId: string;
  subBookId: string | null;
  slug: string;
  title: string;
  order: number;
  bodyText: string;
  audioUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin chapters + the unpaginated total (ADR §C2). */
export interface AdminBookChapterPage {
  items: AdminBookChapterView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Partial BookChapter mutation (`slug`/`contentId` absent — immutable).
 * `subBookId` IS editable (move between kandas within the SAME content, or to
 * null for loose); the service validates same-content and recomputes both the
 * old and new sub-book counts transactionally. `bodyText` round-trips
 * byte-for-byte.
 */
export interface AdminBookChapterUpdateInput {
  subBookId?: string | null;
  title?: string;
  order?: number;
  bodyText?: string;
  audioUrl?: string | null;
}

/** The result of a chapter hard delete. */
export interface AdminBookChapterDeleteResult {
  id: string;
}

// ---- BookSection -----------------------------------------------------------

/** An admin BookSection row — CMS-owned heading copy + order for a Books surface. */
export interface AdminBookSectionView {
  id: string;
  key: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One offset page of admin sections + the unpaginated total (ADR §C2). */
export interface AdminBookSectionPage {
  items: AdminBookSectionView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Partial BookSection mutation (`key` absent — immutable business key). */
export interface AdminBookSectionUpdateInput {
  title?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * A per-`(section, locale)` `title` override row (TAM-112) — carried inline on
 * the section detail/create/update bodies. NOT localized: an editor sees every
 * locale.
 */
export interface AdminBookSectionTranslationView {
  locale: string;
  title: string;
}

/**
 * Admin BookSection DETAIL (TAM-112) — the list row plus ALL `title` overrides
 * (every locale), so the edit form loads them. Returned by section
 * get/create/update; the list endpoint returns the lighter `AdminBookSectionView`.
 */
export interface AdminBookSectionDetailView extends AdminBookSectionView {
  translations: AdminBookSectionTranslationView[];
}
