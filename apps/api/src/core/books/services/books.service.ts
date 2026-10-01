import { resolveProEntitlement } from "@api/shared/entitlement";
import { createModuleLogger } from "@api/shared/logs";
import { buildPage, decodeCursor, type CursorKey } from "@api/shared/pagination";
import { AppError } from "@api/shared/errors";
import { resolveLocalizedLabel } from "@api/shared/i18n";
import type {
  BooksRepository,
  BookSectionRow,
  ContentCardRow,
} from "@api/core/books/repositories";
import {
  BOOK_ALL_BOOKS_SECTION_KEY,
  BOOK_CATEGORIES,
  BOOK_HOME_SECTION_KEYS,
  type BookCard,
  type BookCardPage,
  type BookCategoryCard,
  type BookCategoryValue,
  type BookContents,
  type BookHomeSectionKey,
  type BooksHome,
  type BooksHomeSection,
  type BookSectionItem,
  type BookSummary,
  type ChapterContent,
  type ScriptureContent,
} from "@api/core/books/types";

const log = createModuleLogger("books:service");

/** Max cards rendered in the home carousel + newly-added sections. */
const HOME_SECTION_LIMIT = 10;

/** Display titles for the four direct-scripture category cards (PRD §8.2). */
const CATEGORY_TITLE: Record<BookCategoryValue, string> = {
  Chalisa: "Chalisa",
  Aarti: "Aarti",
  Kavach: "Kavach",
  Stotram: "Stotram",
};

/**
 * Server-owned FALLBACK heading for each section, used only when the CMS has not
 * authored a `book_sections` row for that key yet. The CMS row always wins.
 *
 * These exist so a heading is ALWAYS servable — the client must never carry its
 * own copy, so an unseeded/partially-seeded table has to degrade to a sensible
 * server string rather than force the app to invent one. A row that EXISTS but is
 * inactive is a real CMS "hide this section" instruction and is honoured (no
 * fallback).
 */
const DEFAULT_SECTION_TITLE: Record<
  BookHomeSectionKey | typeof BOOK_ALL_BOOKS_SECTION_KEY,
  string
> = {
  carousel: "Books",
  categories: "Browse Categories",
  newly_added: "Newly Added Books",
  all_books: "All Books",
};

/**
 * Books & Scriptures business logic (TAM-75) — Prisma-free.
 *
 * DISCOVERY IS FREE, READING IS PRO. Responsibilities:
 *   1. Home aggregation as ordered, SELF-TITLED sections (major-book carousel + 4
 *      category cards + newly-added) — METADATA ONLY, no reading body/audio ever
 *      assembled here. Every heading is server-owned (`book_sections`, mirroring
 *      aarti's `homepage_sections`), so no copy lives in the app.
 *   2. Free cursor-paginated listings (all major books; direct scripture by
 *      category), each headed by its own server-owned `title`.
 *   3. #EXPORT_CRITICAL entitlement gate on EVERY reading path (contents,
 *      chapter, scripture): Pro is resolved server-side via the `subscription`
 *      facade, FAIL-CLOSED (any error → treat as free → `403`). No `bodyText`,
 *      `contentBody`, or `audioUrl` is ever fetched/built for a non-Pro caller —
 *      the gate throws BEFORE the reading query runs.
 *   4. Audio-only-for-major-books rule (r7): `audioUrl` surfaces only on a
 *      major-book chapter; direct-scripture responses have no audio field at all.
 */
export class BooksService {
  constructor(private readonly repo: BooksRepository) {}

  // ---- home (FREE discovery) ----------------------------------------------

  /**
   * `GET /books/home` — the ordered, SELF-TITLED discovery sections (carousel +
   * category cards + newly added). Metadata only, no bodies.
   *
   * Mirrors `AartiService.getMain` (the in-repo reference): every section carries
   * its own CMS-owned `title` + `sortOrder`, so the client renders headings from
   * the server and never hardcodes "Books" / "Browse Categories" / "Newly Added
   * Books". A section is OMITTED when it has no items (aarti's hide-when-empty
   * rule) or when its CMS row is switched off.
   *
   * TAM-112: each section `title` is localized to the OPTIONAL `locale`
   * (`translation ?? base`). An absent locale (an un-updated client) resolves to
   * the base `title` column exactly as before — non-breaking.
   */
  async getHome(params: { locale?: string } = {}): Promise<BooksHome> {
    const [sectionRows, carouselRows, newlyRows, categoryCounts] =
      await Promise.all([
        this.repo.findSections(params.locale),
        this.repo.findMajorBooks(HOME_SECTION_LIMIT),
        this.repo.findNewlyAdded(HOME_SECTION_LIMIT),
        this.repo.countByCategory(),
      ]);
    const bySection = new Map(sectionRows.map((r) => [r.key, r]));

    const categories: BookCategoryCard[] = BOOK_CATEGORIES.map((category) => ({
      category,
      title: CATEGORY_TITLE[category],
      itemCount: categoryCounts[category] ?? 0,
    }));
    const itemsByKey: Record<BookHomeSectionKey, BookSectionItem[]> = {
      carousel: carouselRows.map(toBookItem),
      categories: categories.map((c) => ({ kind: "category", ...c })),
      newly_added: newlyRows.map(toBookItem),
    };

    const sections: BooksHomeSection[] = [];
    BOOK_HOME_SECTION_KEYS.forEach((key, index) => {
      const row = bySection.get(key);
      if (row && !row.isActive) return; // CMS switched the section off
      const items = itemsByKey[key];
      if (items.length === 0) return; // hide-when-empty (never fabricated)
      sections.push({
        key,
        title: resolveSectionTitle(row, DEFAULT_SECTION_TITLE[key], params.locale),
        sortOrder: row?.sortOrder ?? index,
        items,
      });
    });
    sections.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));

    log.info(
      {
        event: "books_home",
        sections: sections.length,
        carousel: carouselRows.length,
        newly_added: newlyRows.length,
      },
      "books home assembled"
    );

    return { sections };
  }

  // ---- listings (FREE discovery) ------------------------------------------

  /**
   * `GET /books` — one keyset page of all major books (2-col-ready cards) headed
   * by the CMS-owned all-books `title` (the client used to hardcode "All Books").
   */
  async listMajorBooks(params: {
    cursor?: string;
    limit: number;
    locale?: string;
  }): Promise<BookCardPage> {
    const afterKey = params.cursor ? decodeCursor(params.cursor) : undefined;
    const [rows, sectionRows] = await Promise.all([
      this.repo.findMajorBookPage({
        limit: params.limit,
        afterKey,
        locale: params.locale,
      }),
      // TAM-112: reuse the existing `locale` to localize the all-books heading.
      this.repo.findSections(params.locale),
    ]);
    const page = buildPage(rows, params.limit, cardKey);
    return {
      title: resolveListingTitle(sectionRows, params.locale),
      items: page.items.map(toCard),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * `GET /books/categories/:category` — one keyset page of direct scripture,
   * headed by the category's own server-owned title (the same string the home
   * category card carries, so the two surfaces can never disagree).
   */
  async listCategory(params: {
    category: BookCategoryValue;
    cursor?: string;
    limit: number;
    locale?: string;
  }): Promise<BookCardPage> {
    const afterKey = params.cursor ? decodeCursor(params.cursor) : undefined;
    const rows = await this.repo.findScripturePage({
      category: params.category,
      limit: params.limit,
      afterKey,
      locale: params.locale,
    });
    const page = buildPage(rows, params.limit, cardKey);
    return {
      title: CATEGORY_TITLE[params.category],
      items: page.items.map(toCard),
      nextCursor: page.nextCursor,
    };
  }

  // ---- reading (PRO-GATED) ------------------------------------------------

  /**
   * `GET /books/:id/contents` — Pro-gated major-book table of contents.
   * #EXPORT_CRITICAL: Pro gate FIRST (fail-closed → `403`); no contents are
   * assembled for a free caller.
   */
  async getContents(params: {
    userId: string;
    contentId: string;
  }): Promise<BookContents> {
    await this.requirePro(params.userId, "book contents");

    const head = await this.repo.findContentHead(params.contentId);
    if (!head || head.contentType !== "major_book") {
      throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
    }

    const [subBookRows, looseChapters] = await Promise.all([
      this.repo.findSubBookTree(params.contentId),
      this.repo.findLooseChapters(params.contentId),
    ]);

    const subBooks = subBookRows.map((s) => ({
      subBookId: s.id,
      title: s.title,
      order: s.order,
      chapterCount: s.chapters.length,
      chapters: s.chapters.map((c) => ({
        chapterId: c.id,
        title: c.title,
        order: c.order,
        hasAudio: c.hasAudio,
      })),
    }));
    const chapters = looseChapters.map((c) => ({
      chapterId: c.id,
      title: c.title,
      order: c.order,
      hasAudio: c.hasAudio,
    }));
    const totalChapterCount =
      subBooks.reduce((sum, s) => sum + s.chapterCount, 0) + chapters.length;

    return {
      contentId: head.id,
      title: head.title,
      coverImageUrl: head.coverImageUrl,
      author: head.author,
      languages: head.languages,
      offlineCacheEligible: head.offlineCacheEligible,
      subBooks,
      chapters,
      totalChapterCount,
    };
  }

  /**
   * `GET /books/:id/chapters/:chapterId` — Pro-gated chapter reader.
   * #EXPORT_CRITICAL: Pro gate FIRST; `bodyText`/`audioUrl` never fetched for a
   * free caller. `audioUrl` is major-book-only and null when the chapter has none.
   */
  async getChapter(params: {
    userId: string;
    contentId: string;
    chapterId: string;
  }): Promise<ChapterContent> {
    await this.requirePro(params.userId, "chapter content");

    const head = await this.repo.findContentHead(params.contentId);
    if (!head || head.contentType !== "major_book") {
      throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
    }
    const chapter = await this.repo.findChapter(
      params.contentId,
      params.chapterId
    );
    if (!chapter) {
      throw new AppError("Chapter not found", 404, "CHAPTER_NOT_FOUND");
    }

    return {
      contentId: chapter.contentId,
      chapterId: chapter.id,
      subBookId: chapter.subBookId,
      title: chapter.title,
      order: chapter.order,
      bodyText: chapter.bodyText,
      audioUrl: chapter.audioUrl,
      hasAudio: chapter.audioUrl !== null,
      offlineCacheEligible: head.offlineCacheEligible,
    };
  }

  /**
   * `GET /books/:id/scripture` — Pro-gated direct-scripture reader.
   * #EXPORT_CRITICAL: Pro gate FIRST; `contentBody` never fetched for a free
   * caller. NEVER carries an audio URL (r7 — direct scripture has no audio).
   */
  async getScripture(params: {
    userId: string;
    contentId: string;
  }): Promise<ScriptureContent> {
    await this.requirePro(params.userId, "scripture content");

    const scripture = await this.repo.findScripture(params.contentId);
    if (!scripture) {
      throw new AppError("Scripture not found", 404, "SCRIPTURE_NOT_FOUND");
    }

    return {
      contentId: scripture.id,
      category: scripture.category,
      title: scripture.title,
      coverImageUrl: scripture.coverImageUrl,
      author: scripture.author,
      languages: scripture.languages,
      contentBody: scripture.contentBody,
      offlineCacheEligible: scripture.offlineCacheEligible,
    };
  }

  // ---- facade -------------------------------------------------------------

  /** Compact summary for cross-module callers (Home/TAM-61). Never a body. */
  async getBookSummary(contentId: string): Promise<BookSummary | null> {
    const card = await this.repo.findContentCard(contentId);
    if (!card) return null;
    return {
      contentId: card.id,
      contentType: card.contentType,
      title: card.title,
      coverImageUrl: card.coverImageUrl,
    };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * #EXPORT_CRITICAL entitlement gate. Resolves Pro server-side via the
   * `subscription` facade and throws `403` for a free caller. FAIL-CLOSED: any
   * error resolving entitlement → treat as free (never fail open).
   */
  private async requirePro(userId: string, surface: string): Promise<void> {
    if (await this.resolveEntitlement(userId)) return;
    log.info(
      { event: "books_pro_gate_denied", user_id: userId, surface },
      "free caller denied a Pro reading surface"
    );
    throw new AppError(
      "Reading is a Prabhuji Pro benefit",
      403,
      "FORBIDDEN"
    );
  }

  /** FAIL-CLOSED via the shared gate — never fail open. */
  private async resolveEntitlement(userId: string): Promise<boolean> {
    return resolveProEntitlement(userId, "books:entitlement");
  }
}

/**
 * The heading for the all-books listing SCREEN. The CMS row wins; an unauthored
 * (or deactivated) row falls back to the server default — a listing screen always
 * needs a heading, and it must come from here rather than the app. Deactivating
 * the row cannot hide the screen (it is a route, not a section), so `is_active`
 * is deliberately ignored for this key.
 */
function resolveListingTitle(
  sections: BookSectionRow[],
  locale?: string
): string {
  const row = sections.find((s) => s.key === BOOK_ALL_BOOKS_SECTION_KEY);
  return resolveSectionTitle(
    row,
    DEFAULT_SECTION_TITLE[BOOK_ALL_BOOKS_SECTION_KEY],
    locale
  );
}

/**
 * TAM-112 label rule for a section heading: an authored CMS row resolves to its
 * localized title (`translation[locale]?.title ?? row.title`, via the shared
 * resolver — the base column is the fallback); an UNAUTHORED row (none in the
 * CMS) resolves to the server-owned `fallback`. An absent `locale` yields the
 * base `title` unchanged (non-breaking for un-updated clients).
 */
function resolveSectionTitle(
  row: BookSectionRow | undefined,
  fallback: string,
  locale?: string
): string {
  if (!row) return fallback;
  return resolveLocalizedLabel(
    row.title,
    row.translations,
    locale,
    (t) => t.title
  );
}

/** Map a discovery row → a `book`-kind section item (metadata only). */
function toBookItem(row: ContentCardRow): BookSectionItem {
  return { kind: "book", ...toCard(row) };
}

/** Map a discovery row → a wire card (metadata only). */
function toCard(row: ContentCardRow): BookCard {
  return {
    contentId: row.id,
    contentType: row.contentType,
    category: row.category,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    author: row.author,
    languages: row.languages,
    offlineCacheEligible: row.offlineCacheEligible,
  };
}

/** Stable `(sortOrder, id)` keyset key for a discovery row. */
function cardKey(row: ContentCardRow): CursorKey {
  return { sortOrder: row.sortOrder, id: row.id };
}
