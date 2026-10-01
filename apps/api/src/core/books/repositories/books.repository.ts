import { Prisma } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import type { CursorKey } from "@api/shared/pagination";
import type {
  AdminBookChapterPage,
  AdminBookChapterUpdateInput,
  AdminBookChapterView,
  AdminBookContentPage,
  AdminBookContentUpdateInput,
  AdminBookContentView,
  AdminBookSectionDetailView,
  AdminBookSectionPage,
  AdminBookSectionUpdateInput,
  AdminBookSectionView,
  AdminBookSubBookPage,
  AdminBookSubBookUpdateInput,
  AdminBookSubBookView,
  BookCategoryValue,
  BookChapterSortField,
  BookContentSortField,
  BookContentTypeValue,
  BookSectionKeyValue,
  BookSectionSortField,
  BookSubBookSortField,
} from "@api/core/books/types";

/**
 * Books module repository — the ONLY place `@prisma/client` is reached for this
 * module (arch-boundaries.json enforces it; the service stays Prisma-free).
 *
 * Owns content queries (the CMS section headings, major-book listings,
 * direct-scripture-by-category listings, a book's sub-book/chapter tree, a single
 * chapter, a direct-scripture body) with keyset pagination on the discovery
 * listings. It does NOT touch the
 * subscription table — that's the subscription module, reached by the SERVICE via
 * `performServiceCall`.
 *
 * KEYSET PAGINATION: discovery listings order by the stable `(sortOrder, id)`
 * tuple and over-fetch `limit + 1` so the service can build `nextCursor`.
 *
 * READING vs DISCOVERY: the repo returns the FULL row (including `bodyText` /
 * `contentBody` / `audioUrl`) for the reading queries; the entitlement gate lives
 * in the SERVICE, which only ever CALLS these reading queries after a Pro check
 * passes. The discovery queries deliberately do not select any reading column.
 */

/** A CMS-owned section heading row (title + order for a Books surface). */
export interface BookSectionRow {
  key: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  /**
   * TAM-112: the requested locale's `title` override rows (empty when no locale
   * is requested or none is authored). The SERVICE resolves the displayed title
   * as `translation[locale]?.title ?? title` (the base column is the fallback).
   */
  translations: BookSectionTranslationRow[];
}

/** A per-`(section, locale)` title override projection (TAM-112). */
export interface BookSectionTranslationRow {
  locale: string;
  title: string;
}

/** A discovery row — metadata only (no reading body / audio). */
export interface ContentCardRow {
  id: string;
  contentType: BookContentTypeValue;
  category: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /** Language availability set (TAM-108); empty = all languages. */
  languages: string[];
  offlineCacheEligible: boolean;
  sortOrder: number;
}

/** A major-book head row (for the Pro-gated contents endpoint). */
export interface BookHeadRow {
  id: string;
  contentType: BookContentTypeValue;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /** Language availability set (TAM-108); empty = all languages. */
  languages: string[];
  offlineCacheEligible: boolean;
}

/** A sub-book (kanda) row with its ordered chapter metadata. */
export interface SubBookRow {
  id: string;
  title: string;
  order: number;
  chapterCount: number;
  chapters: ChapterMetaRow[];
}

/** Chapter discovery metadata (no body / no audio URL — just `hasAudio`). */
export interface ChapterMetaRow {
  id: string;
  title: string;
  order: number;
  hasAudio: boolean;
}

/** A full chapter row (reading payload — only read after the Pro gate passes). */
export interface ChapterRow {
  id: string;
  contentId: string;
  subBookId: string | null;
  title: string;
  order: number;
  bodyText: string;
  audioUrl: string | null;
}

/** A direct-scripture reading row (only read after the Pro gate passes). */
export interface ScriptureRow {
  id: string;
  category: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author: string | null;
  /** Language availability set (TAM-108); empty = all languages. */
  languages: string[];
  contentBody: string;
  offlineCacheEligible: boolean;
}

const CARD_SELECT = {
  id: true,
  contentType: true,
  category: true,
  title: true,
  coverImageUrl: true,
  author: true,
  languages: true,
  offlineCacheEligible: true,
  sortOrder: true,
} as const;

/**
 * Language-membership `WHERE` (TAM-108): a row matches when `locale` is in its
 * `languages` availability set OR the set is EMPTY (empty = available in ALL
 * languages). Returns `{}` when no locale is given, so callers can spread it (or
 * `AND`-combine it) unconditionally.
 */
function languageMembershipWhere(
  locale?: string
): Prisma.BookContentWhereInput {
  if (!locale) return {};
  return { OR: [{ languages: { has: locale } }, { languages: { isEmpty: true } }] };
}

/**
 * TAM-112 label-localization: the `translations` include filter for a section
 * read. When a `locale` is requested, restrict the included override rows to
 * that locale; when none is requested, include NONE (the service then resolves
 * to the base `title` column — the label fallback). Mirrors the deity include.
 */
function sectionLocaleFilter(
  locale?: string
): Prisma.BookSectionTranslationWhereInput {
  return locale ? { locale } : { locale: { in: [] } };
}

/** Build the `(sortOrder, id)` keyset `WHERE` for an ascending listing. */
function ascKeysetWhere(afterKey?: CursorKey): Prisma.BookContentWhereInput {
  if (!afterKey) return {};
  return {
    OR: [
      { sortOrder: { gt: afterKey.sortOrder } },
      { AND: [{ sortOrder: afterKey.sortOrder }, { id: { gt: afterKey.id } }] },
    ],
  };
}

export class BooksRepository {
  // ---- CMS section headings -----------------------------------------------

  /**
   * ALL section headings in curated order `(sort_order, key)`. Serves the
   * `GET /books/home` section titles AND the listing-screen titles — the caller
   * picks the keys it needs (mirrors the aarti section read).
   *
   * Inactive rows are returned deliberately (unlike the aarti read): the SERVICE
   * must distinguish "row exists but is switched OFF" (⇒ hide the section) from
   * "no row authored yet" (⇒ fall back to the server default title), which an
   * `is_active`-filtered query collapses into one indistinguishable case.
   *
   * TAM-112: each row also carries the requested `locale`'s `title` override (or
   * none), so the service can localize the heading (`translation ?? base`).
   */
  async findSections(locale?: string): Promise<BookSectionRow[]> {
    const rows = await getPrisma().bookSection.findMany({
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
      select: {
        key: true,
        title: true,
        sortOrder: true,
        isActive: true,
        translations: {
          where: sectionLocaleFilter(locale),
          select: { locale: true, title: true },
        },
      },
    });
    return rows;
  }

  // ---- discovery (FREE) ---------------------------------------------------

  /** Active major books ordered by `(sortOrder, id)`, limited to `limit`. */
  async findMajorBooks(limit: number): Promise<ContentCardRow[]> {
    const rows = await getPrisma().bookContent.findMany({
      where: { isActive: true, contentType: "major_book" },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: limit,
      select: CARD_SELECT,
    });
    return rows;
  }

  /**
   * One keyset page of active major books, ordered `(sortOrder, id)` ascending.
   * Over-fetches `limit + 1` so the service can compute `nextCursor`.
   */
  async findMajorBookPage(params: {
    limit: number;
    afterKey?: CursorKey;
    locale?: string;
  }): Promise<ContentCardRow[]> {
    const rows = await getPrisma().bookContent.findMany({
      where: {
        isActive: true,
        contentType: "major_book",
        // keyset + language-membership combined under AND (each is `{}` when
        // its input is absent) so the two independent `OR` clauses never collide.
        AND: [
          ascKeysetWhere(params.afterKey),
          languageMembershipWhere(params.locale),
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: params.limit + 1,
      select: CARD_SELECT,
    });
    return rows;
  }

  /**
   * One keyset page of active direct-scripture items in `category`, ordered
   * `(sortOrder, id)` ascending. Over-fetches `limit + 1`. Optionally filtered to
   * the caller's `locale` by language membership (TAM-108).
   */
  async findScripturePage(params: {
    category: BookCategoryValue;
    limit: number;
    afterKey?: CursorKey;
    locale?: string;
  }): Promise<ContentCardRow[]> {
    const rows = await getPrisma().bookContent.findMany({
      where: {
        isActive: true,
        contentType: "direct_scripture",
        category: params.category,
        AND: [
          ascKeysetWhere(params.afterKey),
          languageMembershipWhere(params.locale),
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      take: params.limit + 1,
      select: CARD_SELECT,
    });
    return rows;
  }

  /** Active direct-scripture items whose `newlyAddedAt` is set, newest first. */
  async findNewlyAdded(limit: number): Promise<ContentCardRow[]> {
    const rows = await getPrisma().bookContent.findMany({
      where: { isActive: true, newlyAddedAt: { not: null } },
      orderBy: [{ newlyAddedAt: "desc" }, { id: "asc" }],
      take: limit,
      select: CARD_SELECT,
    });
    return rows;
  }

  /** Per-category active direct-scripture counts (home category cards). */
  async countByCategory(): Promise<Record<BookCategoryValue, number>> {
    const grouped = await getPrisma().bookContent.groupBy({
      by: ["category"],
      where: { isActive: true, contentType: "direct_scripture" },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const g of grouped) {
      if (g.category) out[g.category] = g._count._all;
    }
    return out;
  }

  // ---- contents + reading (called only after the Pro gate passes) ---------

  /** A single active content card by id (metadata only) — cross-module facade. */
  async findContentCard(id: string): Promise<ContentCardRow | null> {
    const row = await getPrisma().bookContent.findFirst({
      where: { id, isActive: true },
      select: CARD_SELECT,
    });
    return row;
  }

  /** A content head row by id (or `null`) — used to route + gate reading. */
  async findContentHead(id: string): Promise<BookHeadRow | null> {
    const row = await getPrisma().bookContent.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        contentType: true,
        title: true,
        coverImageUrl: true,
        author: true,
        languages: true,
        offlineCacheEligible: true,
      },
    });
    return row;
  }

  /**
   * The ordered sub-book (kanda) tree for a major book, each kanda carrying its
   * ordered chapter metadata (no bodies). Sub-book-less books yield `[]` here —
   * their chapters come from `findLooseChapters`.
   */
  async findSubBookTree(contentId: string): Promise<SubBookRow[]> {
    const rows = await getPrisma().bookSubBook.findMany({
      where: { contentId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        order: true,
        chapterCount: true,
        chapters: {
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: { id: true, title: true, order: true, audioUrl: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      order: r.order,
      chapterCount: r.chapterCount,
      chapters: r.chapters.map((c) => ({
        id: c.id,
        title: c.title,
        order: c.order,
        hasAudio: c.audioUrl !== null,
      })),
    }));
  }

  /** Ordered chapters hanging directly off a major book (sub_book_id IS NULL). */
  async findLooseChapters(contentId: string): Promise<ChapterMetaRow[]> {
    const rows = await getPrisma().bookChapter.findMany({
      where: { contentId, subBookId: null },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true, title: true, order: true, audioUrl: true },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      hasAudio: c.audioUrl !== null,
    }));
  }

  /** One chapter of a book (reading payload) — scoped to its owning content. */
  async findChapter(
    contentId: string,
    chapterId: string
  ): Promise<ChapterRow | null> {
    const row = await getPrisma().bookChapter.findFirst({
      where: { id: chapterId, contentId },
      select: {
        id: true,
        contentId: true,
        subBookId: true,
        title: true,
        order: true,
        bodyText: true,
        audioUrl: true,
      },
    });
    return row;
  }

  /** A direct-scripture reading row (inline body) — or `null`. */
  async findScripture(id: string): Promise<ScriptureRow | null> {
    const row = await getPrisma().bookContent.findFirst({
      where: { id, isActive: true, contentType: "direct_scripture" },
      select: {
        id: true,
        category: true,
        title: true,
        coverImageUrl: true,
        author: true,
        languages: true,
        contentBody: true,
        offlineCacheEligible: true,
      },
    });
    if (!row || row.contentBody === null) return null;
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      coverImageUrl: row.coverImageUrl,
      author: row.author,
      languages: row.languages,
      contentBody: row.contentBody,
      offlineCacheEligible: row.offlineCacheEligible,
    };
  }

  // =========================================================================
  // ADMIN write surface (TAM-102). Prisma stays confined here; the admin
  // service is Prisma-free. Unlike the public reads above, these methods do NOT
  // filter on `isActive` — an editor manages both active and deactivated rows.
  // Mirrors the TAM-88 deity exemplar / TAM-90 aarti admin shape.
  // =========================================================================

  // ---- BookContent --------------------------------------------------------

  /** One OFFSET page of content rows + the unpaginated `total` (ADR §C2). */
  async findAdminContentPage(params: {
    page: number;
    pageSize: number;
    sort?: BookContentSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    contentType?: BookContentTypeValue;
    category?: BookCategoryValue;
    language?: string;
  }): Promise<AdminBookContentPage> {
    const where: Prisma.BookContentWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.contentType ? { contentType: params.contentType } : {}),
      ...(params.category ? { category: params.category } : {}),
      // TAM-108: filter on language MEMBERSHIP (the row's `languages` set), not
      // the deprecated single `language` column. Wrapped in `AND` so its `OR`
      // never collides with the `q` search `OR` below.
      ...(params.language
        ? { AND: [languageMembershipWhere(params.language)] }
        : {}),
      ...(params.q
        ? {
            OR: [
              { title: { contains: params.q, mode: "insensitive" } },
              { slug: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().bookContent.findMany({
        where,
        orderBy: buildContentOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_CONTENT_SELECT,
      }),
      getPrisma().bookContent.count({ where }),
    ]);
    return {
      items: rows.map(toAdminContent),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full content row by id, or `null`. */
  async findAdminContentById(id: string): Promise<AdminBookContentView | null> {
    const row = await getPrisma().bookContent.findUnique({
      where: { id },
      select: ADMIN_CONTENT_SELECT,
    });
    return row ? toAdminContent(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async contentExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().bookContent.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * The `contentType` of a content row (or `null` if unknown) — backs the
   * SERVICE's two-hierarchy validation when creating a sub-book/chapter under a
   * book (a `direct_scripture` parent → 400).
   */
  async findContentTypeById(id: string): Promise<BookContentTypeValue | null> {
    const row = await getPrisma().bookContent.findUnique({
      where: { id },
      select: { contentType: true },
    });
    return row ? row.contentType : null;
  }

  /** Create a content row; a duplicate `slug` → 409 `SLUG_CONFLICT`. */
  async createAdminContent(input: {
    slug: string;
    contentType: BookContentTypeValue;
    category: BookCategoryValue | null;
    title: string;
    coverImageUrl: string;
    author: string | null;
    languages: string[];
    sortOrder: number;
    offlineCacheEligible: boolean;
    newlyAddedAt: Date | null;
    contentBody: string | null;
  }): Promise<AdminBookContentView> {
    try {
      const row = await getPrisma().bookContent.create({
        data: input,
        select: ADMIN_CONTENT_SELECT,
      });
      return toAdminContent(row);
    } catch (err) {
      throw slugConflict(err, `A book with slug "${input.slug}" already exists`);
    }
  }

  /** Optimistic-concurrency content write (ADR §C3). Returns the affected count. */
  async updateContentWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminBookContentUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().bookContent.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }

  // ---- BookSubBook --------------------------------------------------------

  /** One OFFSET page of sub-books + the unpaginated `total`, parent-filterable. */
  async findAdminSubBookPage(params: {
    page: number;
    pageSize: number;
    sort?: BookSubBookSortField;
    order: "asc" | "desc";
    contentId?: string;
  }): Promise<AdminBookSubBookPage> {
    const where: Prisma.BookSubBookWhereInput = {
      ...(params.contentId ? { contentId: params.contentId } : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().bookSubBook.findMany({
        where,
        orderBy: buildSubBookOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_SUB_BOOK_SELECT,
      }),
      getPrisma().bookSubBook.count({ where }),
    ]);
    return {
      items: rows.map(toAdminSubBook),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full sub-book row by id, or `null`. */
  async findAdminSubBookById(id: string): Promise<AdminBookSubBookView | null> {
    const row = await getPrisma().bookSubBook.findUnique({
      where: { id },
      select: ADMIN_SUB_BOOK_SELECT,
    });
    return row ? toAdminSubBook(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async subBookExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().bookSubBook.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * The parent `contentId` of a sub-book (or `null` if unknown) — backs the
   * SERVICE's chapter↔sub-book same-content validation. #EXPORT_CRITICAL.
   */
  async findSubBookContentId(subBookId: string): Promise<string | null> {
    const row = await getPrisma().bookSubBook.findUnique({
      where: { id: subBookId },
      select: { contentId: true },
    });
    return row ? row.contentId : null;
  }

  /** Create a sub-book; a duplicate `(contentId, slug)` → 409 `SLUG_CONFLICT`. */
  async createAdminSubBook(input: {
    contentId: string;
    slug: string;
    title: string;
    order: number;
  }): Promise<AdminBookSubBookView> {
    try {
      const row = await getPrisma().bookSubBook.create({
        data: { ...input, chapterCount: 0 },
        select: ADMIN_SUB_BOOK_SELECT,
      });
      return toAdminSubBook(row);
    } catch (err) {
      throw slugConflict(
        err,
        `A sub-book with slug "${input.slug}" already exists in this book`
      );
    }
  }

  /** Optimistic-concurrency sub-book write (ADR §C3). Returns the affected count. */
  async updateSubBookWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminBookSubBookUpdateInput;
  }): Promise<number> {
    const res = await getPrisma().bookSubBook.updateMany({
      where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      data: params.data,
    });
    return res.count;
  }

  /**
   * HARD delete a sub-book under the `updatedAt` precondition. Its chapters
   * CASCADE-delete via the declared `onDelete: Cascade` FK — real, irreversible
   * loss — so the count of chapters about to be destroyed is captured BEFORE the
   * delete and returned so the UI can warn (#EXPORT_CRITICAL). The count + delete
   * run in ONE `$transaction`.
   */
  async deleteSubBookWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
  }): Promise<{ existed: boolean; deleted: boolean; deletedChapterCount: number }> {
    return getPrisma().$transaction(async (tx) => {
      const existing = await tx.bookSubBook.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (!existing) return { existed: false, deleted: false, deletedChapterCount: 0 };
      const deletedChapterCount = await tx.bookChapter.count({
        where: { subBookId: params.id },
      });
      const res = await tx.bookSubBook.deleteMany({
        where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      });
      if (res.count === 0) {
        return { existed: true, deleted: false, deletedChapterCount: 0 };
      }
      return { existed: true, deleted: true, deletedChapterCount };
    });
  }

  // ---- BookChapter --------------------------------------------------------

  /** One OFFSET page of chapters + the unpaginated `total`, parent-filterable. */
  async findAdminChapterPage(params: {
    page: number;
    pageSize: number;
    sort?: BookChapterSortField;
    order: "asc" | "desc";
    contentId?: string;
    subBookId?: string;
  }): Promise<AdminBookChapterPage> {
    const where: Prisma.BookChapterWhereInput = {
      ...(params.contentId ? { contentId: params.contentId } : {}),
      ...(params.subBookId ? { subBookId: params.subBookId } : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().bookChapter.findMany({
        where,
        orderBy: buildChapterOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_CHAPTER_SELECT,
      }),
      getPrisma().bookChapter.count({ where }),
    ]);
    return {
      items: rows.map(toAdminChapter),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full chapter row by id, or `null`. */
  async findAdminChapterById(id: string): Promise<AdminBookChapterView | null> {
    const row = await getPrisma().bookChapter.findUnique({
      where: { id },
      select: ADMIN_CHAPTER_SELECT,
    });
    return row ? toAdminChapter(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async chapterExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().bookChapter.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /** The immutable `contentId` of a chapter (or `null`) — backs re-parent validation. */
  async findChapterContentId(id: string): Promise<string | null> {
    const row = await getPrisma().bookChapter.findUnique({
      where: { id },
      select: { contentId: true },
    });
    return row ? row.contentId : null;
  }

  /**
   * Create a chapter and, when it hangs off a sub-book, recompute that
   * sub-book's stored `chapterCount` — both in ONE `$transaction` so the
   * denormalized aggregate the app reads can never desync (#EXPORT_CRITICAL). A
   * duplicate `(contentId, slug)` → 409 `SLUG_CONFLICT`.
   */
  async createAdminChapter(input: {
    contentId: string;
    subBookId: string | null;
    slug: string;
    title: string;
    order: number;
    bodyText: string;
    audioUrl: string | null;
  }): Promise<AdminBookChapterView> {
    try {
      return await getPrisma().$transaction(async (tx) => {
        const row = await tx.bookChapter.create({
          data: input,
          select: ADMIN_CHAPTER_SELECT,
        });
        if (input.subBookId) await recomputeChapterCount(tx, input.subBookId);
        return toAdminChapter(row);
      });
    } catch (err) {
      throw slugConflict(
        err,
        `A chapter with slug "${input.slug}" already exists in this book`
      );
    }
  }

  /**
   * Optimistic-concurrency chapter write (ADR §C3). When the write moves the
   * chapter between sub-books (or to/from a loose position), the OLD and NEW
   * sub-book `chapterCount`s are recomputed in the SAME `$transaction`. Returns
   * the affected count.
   */
  async updateChapterWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminBookChapterUpdateInput;
  }): Promise<number> {
    return getPrisma().$transaction(async (tx) => {
      const existing = await tx.bookChapter.findUnique({
        where: { id: params.id },
        select: { subBookId: true },
      });
      const res = await tx.bookChapter.updateMany({
        where: { id: params.id, updatedAt: params.expectedUpdatedAt },
        data: params.data,
      });
      if (res.count === 0) return 0;
      const affected = new Set<string>();
      if (existing?.subBookId) affected.add(existing.subBookId);
      // `data.subBookId` is only present when the caller re-parents; a new
      // non-null target also needs its count refreshed.
      if (params.data.subBookId) affected.add(params.data.subBookId);
      for (const subBookId of affected) {
        await recomputeChapterCount(tx, subBookId);
      }
      return res.count;
    });
  }

  /**
   * HARD delete a chapter under the `updatedAt` precondition and, when it
   * belonged to a sub-book, recompute that sub-book's `chapterCount` — both in
   * ONE `$transaction`. Chapters have no liveness flag and a real cascade FK, so
   * a genuine delete is correct (ADR §C4).
   */
  async deleteChapterWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
  }): Promise<{ existed: boolean; deleted: boolean }> {
    return getPrisma().$transaction(async (tx) => {
      const existing = await tx.bookChapter.findUnique({
        where: { id: params.id },
        select: { subBookId: true },
      });
      if (!existing) return { existed: false, deleted: false };
      const res = await tx.bookChapter.deleteMany({
        where: { id: params.id, updatedAt: params.expectedUpdatedAt },
      });
      if (res.count === 0) return { existed: true, deleted: false };
      if (existing.subBookId) await recomputeChapterCount(tx, existing.subBookId);
      return { existed: true, deleted: true };
    });
  }

  // ---- BookSection --------------------------------------------------------

  /** One OFFSET page of sections + the unpaginated `total` (ADR §C2). */
  async findAdminSectionPage(params: {
    page: number;
    pageSize: number;
    sort?: BookSectionSortField;
    order: "asc" | "desc";
    q?: string;
    isActive?: boolean;
  }): Promise<AdminBookSectionPage> {
    const where: Prisma.BookSectionWhereInput = {
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { key: { contains: params.q, mode: "insensitive" } },
              { title: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      getPrisma().bookSection.findMany({
        where,
        orderBy: buildSectionOrderBy(params.sort, params.order),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: ADMIN_SECTION_SELECT,
      }),
      getPrisma().bookSection.count({ where }),
    ]);
    return {
      items: rows.map(toAdminSection),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** Full section row + ALL `title` overrides (every locale) by id, or `null`. */
  async findAdminSectionById(
    id: string
  ): Promise<AdminBookSectionDetailView | null> {
    const row = await getPrisma().bookSection.findUnique({
      where: { id },
      select: ADMIN_SECTION_DETAIL_SELECT,
    });
    return row ? toAdminSectionDetail(row) : null;
  }

  /** Cheap existence probe — backs the 404-vs-409 disambiguation (ADR §C3). */
  async sectionExistsById(id: string): Promise<boolean> {
    const row = await getPrisma().bookSection.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Create a section and (optionally) its `title` overrides in one implicit
   * transaction (nested `create`). A duplicate `key` (which is `@unique`) →
   * 409 `KEY_CONFLICT`. Returns the DETAIL row (with every locale's override).
   */
  async createAdminSection(input: {
    key: BookSectionKeyValue;
    title: string;
    sortOrder: number;
    isActive: boolean;
    translations: { locale: string; title: string }[];
  }): Promise<AdminBookSectionDetailView> {
    try {
      const row = await getPrisma().bookSection.create({
        data: {
          key: input.key,
          title: input.title,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          translations: {
            create: input.translations.map((t) => ({
              locale: t.locale,
              title: t.title,
            })),
          },
        },
        select: ADMIN_SECTION_DETAIL_SELECT,
      });
      return toAdminSectionDetail(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          `A section with key "${input.key}" already exists`,
          409,
          "KEY_CONFLICT"
        );
      }
      throw err;
    }
  }

  /**
   * Optimistic-concurrency section write (ADR §C3) + inline `title`-override
   * replace-set (TAM-112), atomically in one `$transaction`. The base write is
   * the `updateMany` under the `updatedAt` precondition; a 0-count means the row
   * is gone or the caller's `updatedAt` is stale (the SERVICE disambiguates
   * 404-vs-409) and the translations are left alone. When `translations` is
   * provided (including `[]`) the whole override set is deleted-then-recreated;
   * `undefined` leaves it untouched. Returns the affected base-row count.
   */
  async updateSectionWithPrecondition(params: {
    id: string;
    expectedUpdatedAt: Date;
    data: AdminBookSectionUpdateInput;
    translations?: { locale: string; title: string }[];
  }): Promise<number> {
    const { id, expectedUpdatedAt, data, translations } = params;
    return getPrisma().$transaction(async (tx) => {
      const { count } = await tx.bookSection.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (count === 0) return 0;
      if (translations !== undefined) {
        await tx.bookSectionTranslation.deleteMany({
          where: { bookSectionId: id },
        });
        if (translations.length > 0) {
          await tx.bookSectionTranslation.createMany({
            data: translations.map((t) => ({
              bookSectionId: id,
              locale: t.locale,
              title: t.title,
            })),
          });
        }
      }
      return count;
    });
  }
}

// ---------------------------------------------------------------------------
// admin selects + row mappers + orderBy builders (kept out of the class body)
// ---------------------------------------------------------------------------

/**
 * Recompute a sub-book's stored `chapterCount` from its live child chapters,
 * inside the caller's transaction. The stored aggregate's only writer WAS the
 * seed; the moment an admin creates/deletes a chapter it becomes the module's
 * engagement-counter-shaped trap — so it is MAINTAINED (not accepted as input).
 */
async function recomputeChapterCount(
  tx: Prisma.TransactionClient,
  subBookId: string
): Promise<void> {
  const chapterCount = await tx.bookChapter.count({ where: { subBookId } });
  await tx.bookSubBook.update({
    where: { id: subBookId },
    data: { chapterCount },
  });
}

/** Map a P2002 unique-constraint violation to a 409 `SLUG_CONFLICT`. */
function slugConflict(err: unknown, message: string): unknown {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return new AppError(message, 409, "SLUG_CONFLICT");
  }
  return err;
}

const ADMIN_CONTENT_SELECT = {
  id: true,
  slug: true,
  contentType: true,
  category: true,
  title: true,
  coverImageUrl: true,
  author: true,
  languages: true,
  sortOrder: true,
  offlineCacheEligible: true,
  newlyAddedAt: true,
  contentBody: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminContentRawRow {
  id: string;
  slug: string;
  contentType: BookContentTypeValue;
  category: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author: string | null;
  languages: string[];
  sortOrder: number;
  offlineCacheEligible: boolean;
  newlyAddedAt: Date | null;
  contentBody: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminContent(row: AdminContentRawRow): AdminBookContentView {
  return {
    id: row.id,
    slug: row.slug,
    contentType: row.contentType,
    category: row.category,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    author: row.author,
    languages: row.languages,
    sortOrder: row.sortOrder,
    offlineCacheEligible: row.offlineCacheEligible,
    newlyAddedAt: row.newlyAddedAt ? row.newlyAddedAt.toISOString() : null,
    contentBody: row.contentBody,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ADMIN_SUB_BOOK_SELECT = {
  id: true,
  contentId: true,
  slug: true,
  title: true,
  order: true,
  chapterCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminSubBookRawRow {
  id: string;
  contentId: string;
  slug: string;
  title: string;
  order: number;
  chapterCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminSubBook(row: AdminSubBookRawRow): AdminBookSubBookView {
  return {
    id: row.id,
    contentId: row.contentId,
    slug: row.slug,
    title: row.title,
    order: row.order,
    chapterCount: row.chapterCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ADMIN_CHAPTER_SELECT = {
  id: true,
  contentId: true,
  subBookId: true,
  slug: true,
  title: true,
  order: true,
  bodyText: true,
  audioUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AdminChapterRawRow {
  id: string;
  contentId: string;
  subBookId: string | null;
  slug: string;
  title: string;
  order: number;
  bodyText: string;
  audioUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminChapter(row: AdminChapterRawRow): AdminBookChapterView {
  return {
    id: row.id,
    contentId: row.contentId,
    subBookId: row.subBookId,
    slug: row.slug,
    title: row.title,
    order: row.order,
    bodyText: row.bodyText,
    audioUrl: row.audioUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ADMIN_SECTION_SELECT = {
  id: true,
  key: true,
  title: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** The list select plus ALL `title` overrides (every locale) for the detail view. */
const ADMIN_SECTION_DETAIL_SELECT = {
  ...ADMIN_SECTION_SELECT,
  translations: {
    select: { locale: true, title: true },
    orderBy: { locale: "asc" },
  },
} as const;

interface AdminSectionRawRow {
  id: string;
  key: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminSection(row: AdminSectionRawRow): AdminBookSectionView {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAdminSectionDetail(
  row: AdminSectionRawRow & { translations: { locale: string; title: string }[] }
): AdminBookSectionDetailView {
  return {
    ...toAdminSection(row),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      title: t.title,
    })),
  };
}

function buildContentOrderBy(
  sort: BookContentSortField | undefined,
  order: "asc" | "desc"
): Prisma.BookContentOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "slug":
      return [{ slug: order }];
    case "contentType":
      return [{ contentType: order }, { sortOrder: "asc" }];
    case "category":
      return [{ category: order }, { sortOrder: "asc" }];
    case "sortOrder":
      return [{ sortOrder: order }, { id: "asc" }];
    case "newlyAddedAt":
      return [{ newlyAddedAt: order }, { id: "asc" }];
    case "isActive":
      return [{ isActive: order }, { sortOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function buildSubBookOrderBy(
  sort: BookSubBookSortField | undefined,
  order: "asc" | "desc"
): Prisma.BookSubBookOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ order: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "order":
      return [{ order: order }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function buildChapterOrderBy(
  sort: BookChapterSortField | undefined,
  order: "asc" | "desc"
): Prisma.BookChapterOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ order: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: order }, { id: "asc" }];
    case "order":
      return [{ order: order }, { id: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}

function buildSectionOrderBy(
  sort: BookSectionSortField | undefined,
  order: "asc" | "desc"
): Prisma.BookSectionOrderByWithRelationInput[] {
  switch (sort) {
    case undefined:
      return [{ sortOrder: "asc" }, { key: "asc" }];
    case "key":
      return [{ key: order }];
    case "sortOrder":
      return [{ sortOrder: order }, { key: "asc" }];
    case "isActive":
      return [{ isActive: order }, { sortOrder: "asc" }];
    case "createdAt":
      return [{ createdAt: order }];
    case "updatedAt":
      return [{ updatedAt: order }];
  }
}
