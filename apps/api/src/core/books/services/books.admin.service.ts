import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError, ValidationError } from "@api/shared/errors";
import type { BooksRepository } from "@api/core/books/repositories";
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
  AdminBookSubBookDeleteResult,
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

const log = createModuleLogger("books:admin:service");

// ---------------------------------------------------------------------------
// parsed-input param shapes (Zod defaults already applied at the boundary)
// ---------------------------------------------------------------------------

export interface AdminContentListParams {
  page: number;
  pageSize: number;
  sort?: BookContentSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
  contentType?: BookContentTypeValue;
  category?: BookCategoryValue;
  /** TAM-108: single-code language-membership filter (rows whose set contains it, or is empty = all). */
  language?: string;
}

export interface AdminContentCreateParams {
  slug: string;
  contentType: BookContentTypeValue;
  category?: BookCategoryValue | null;
  title: string;
  coverImageUrl: string;
  author?: string | null;
  /** TAM-108: availability set (empty = all languages). */
  languages: string[];
  sortOrder: number;
  offlineCacheEligible: boolean;
  newlyAddedAt?: string | null;
  contentBody?: string | null;
}

export interface AdminContentUpdateParams {
  expectedUpdatedAt: string;
  category?: BookCategoryValue | null;
  title?: string;
  coverImageUrl?: string;
  author?: string | null;
  /** TAM-108: replace the whole availability set (empty = all languages). */
  languages?: string[];
  sortOrder?: number;
  offlineCacheEligible?: boolean;
  newlyAddedAt?: string | null;
  contentBody?: string | null;
  isActive?: boolean;
}

export interface AdminSubBookListParams {
  page: number;
  pageSize: number;
  sort?: BookSubBookSortField;
  order: "asc" | "desc";
  contentId?: string;
}

export interface AdminSubBookCreateParams {
  contentId: string;
  slug: string;
  title: string;
  order: number;
}

export interface AdminSubBookUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  order?: number;
}

export interface AdminChapterListParams {
  page: number;
  pageSize: number;
  sort?: BookChapterSortField;
  order: "asc" | "desc";
  contentId?: string;
  subBookId?: string;
}

export interface AdminChapterCreateParams {
  contentId: string;
  subBookId?: string | null;
  slug: string;
  title: string;
  order: number;
  bodyText: string;
  audioUrl?: string | null;
}

export interface AdminChapterUpdateParams {
  expectedUpdatedAt: string;
  subBookId?: string | null;
  title?: string;
  order?: number;
  bodyText?: string;
  audioUrl?: string | null;
}

export interface AdminSectionListParams {
  page: number;
  pageSize: number;
  sort?: BookSectionSortField;
  order: "asc" | "desc";
  q?: string;
  isActive?: boolean;
}

export interface AdminSectionCreateParams {
  key: BookSectionKeyValue;
  title: string;
  sortOrder: number;
  isActive: boolean;
  translations: { locale: string; title: string }[];
}

export interface AdminSectionUpdateParams {
  expectedUpdatedAt: string;
  title?: string;
  sortOrder?: number;
  isActive?: boolean;
  // TAM-112: `undefined` ⇒ leave the override set untouched; provided
  // (including `[]`) ⇒ REPLACE the whole set.
  translations?: { locale: string; title: string }[];
}

/**
 * Admin write-side service for the Books & Scriptures module (TAM-102) —
 * **Prisma-free** (all DB access is delegated to `BooksRepository`). This is the
 * epic's most structurally complex module: TWO content hierarchies discriminated
 * by one `contentType` column, and **the database enforces none of it** — this
 * service is the only guard (#PATH_DECISION).
 *
 * #EXPORT_CRITICAL — admin reads are NOT Pro-gated and this service **NEVER
 * calls the subscription facade**: content/chapter detail returns `contentBody`,
 * `bodyText` and `audioUrl` in FULL so an editor sees what they edit (ADR §C1).
 * The public `BooksService`'s fail-closed entitlement gate (three fields across
 * two tables) is a physically separate path and stays unconditional + untouched.
 *
 * The invariants it enforces because the DB cannot:
 *   - `direct_scripture` → `contentBody` + `category` REQUIRED; NO sub-books,
 *     NO chapters, NO audio. `major_book` → `contentBody`/`category` FORBIDDEN;
 *     audio only on chapters (r7).
 *   - a chapter's `subBookId`, if set, MUST belong to the SAME `contentId`.
 *   - `contentType` immutable; `chapterCount` recomputed transactionally (in the
 *     repo) on every chapter create/delete/re-parent, NEVER accepted as input.
 */
export class BooksAdminService {
  constructor(private readonly repo: BooksRepository) {}

  // =======================================================================
  // BookContent
  // =======================================================================

  async listContent(params: AdminContentListParams): Promise<AdminBookContentPage> {
    return this.repo.findAdminContentPage(params);
  }

  async getContentById(id: string): Promise<AdminBookContentView> {
    const row = await this.repo.findAdminContentById(id);
    if (!row) throw new AppError("Book not found", 404, "NOT_FOUND");
    return row;
  }

  async createContent(
    params: AdminContentCreateParams
  ): Promise<AdminBookContentView> {
    const category = params.category ?? null;
    const contentBody = params.contentBody ?? null;
    this.validateContentInvariantsOnCreate(params.contentType, category, contentBody);
    await this.validateMediaUrl(params.coverImageUrl, "bookContent", "coverImageUrl");
    const row = await this.repo.createAdminContent({
      slug: params.slug,
      contentType: params.contentType,
      category,
      title: params.title,
      coverImageUrl: params.coverImageUrl,
      author: params.author ?? null,
      languages: params.languages,
      sortOrder: params.sortOrder,
      offlineCacheEligible: params.offlineCacheEligible,
      newlyAddedAt: parseNullableDate(params.newlyAddedAt),
      contentBody,
    });
    log.info(
      { event: "books_admin_content_created", id: row.id, contentType: row.contentType },
      "book content created"
    );
    return row;
  }

  async updateContent(
    id: string,
    params: AdminContentUpdateParams
  ): Promise<AdminBookContentView> {
    // The row's `contentType` is immutable and drives the category/contentBody
    // correspondence, so it must be loaded before the patch is validated.
    const existing = await this.getContentById(id);
    this.validateContentInvariantsOnPatch(existing.contentType, params);
    if (params.coverImageUrl !== undefined) {
      await this.validateMediaUrl(params.coverImageUrl, "bookContent", "coverImageUrl");
    }
    const data: AdminBookContentUpdateInput = {};
    if (params.category !== undefined) data.category = params.category;
    if (params.title !== undefined) data.title = params.title;
    if (params.coverImageUrl !== undefined) data.coverImageUrl = params.coverImageUrl;
    if (params.author !== undefined) data.author = params.author;
    if (params.languages !== undefined) data.languages = params.languages;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.offlineCacheEligible !== undefined) {
      data.offlineCacheEligible = params.offlineCacheEligible;
    }
    if (params.newlyAddedAt !== undefined) {
      data.newlyAddedAt = parseNullableDate(params.newlyAddedAt);
    }
    if (params.contentBody !== undefined) data.contentBody = params.contentBody;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    const row = await this.writeWithPrecondition(
      "Book",
      () =>
        this.repo.updateContentWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
        }),
      () => this.repo.contentExistsById(id),
      () => this.getContentById(id)
    );
    log.info({ event: "books_admin_content_updated", id }, "book content updated");
    return row;
  }

  /**
   * "Delete" = deactivate (`isActive = false`). `BookContent` is the module's
   * root, has the flag, and the public path filters on it; a soft delete keeps
   * the child structure intact and the client prunes the now-unknown book (ADR
   * §C4). Reversible via `PATCH { isActive: true }`.
   */
  async deactivateContent(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminBookContentView> {
    const row = await this.writeWithPrecondition(
      "Book",
      () =>
        this.repo.updateContentWithPrecondition({
          id,
          expectedUpdatedAt: new Date(expectedUpdatedAt),
          data: { isActive: false },
        }),
      () => this.repo.contentExistsById(id),
      () => this.getContentById(id)
    );
    log.info({ event: "books_admin_content_deactivated", id }, "book content deactivated");
    return row;
  }

  // =======================================================================
  // BookSubBook (kanda)
  // =======================================================================

  async listSubBooks(params: AdminSubBookListParams): Promise<AdminBookSubBookPage> {
    return this.repo.findAdminSubBookPage(params);
  }

  async getSubBookById(id: string): Promise<AdminBookSubBookView> {
    const row = await this.repo.findAdminSubBookById(id);
    if (!row) throw new AppError("Sub-book not found", 404, "NOT_FOUND");
    return row;
  }

  /** A sub-book may hang ONLY off a `major_book` — a `direct_scripture` → 400. */
  async createSubBook(
    params: AdminSubBookCreateParams
  ): Promise<AdminBookSubBookView> {
    await this.ensureMajorBook(params.contentId, "sub-book");
    const row = await this.repo.createAdminSubBook({
      contentId: params.contentId,
      slug: params.slug,
      title: params.title,
      order: params.order,
    });
    log.info(
      { event: "books_admin_sub_book_created", id: row.id, contentId: row.contentId },
      "sub-book created"
    );
    return row;
  }

  async updateSubBook(
    id: string,
    params: AdminSubBookUpdateParams
  ): Promise<AdminBookSubBookView> {
    const data: AdminBookSubBookUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.order !== undefined) data.order = params.order;
    const row = await this.writeWithPrecondition(
      "Sub-book",
      () =>
        this.repo.updateSubBookWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
        }),
      () => this.repo.subBookExistsById(id),
      () => this.getSubBookById(id)
    );
    log.info({ event: "books_admin_sub_book_updated", id }, "sub-book updated");
    return row;
  }

  /**
   * HARD delete (ADR §C4 exception): sub-books have no liveness flag, a real
   * cascade FK, and no external references. Deleting one CASCADES to its
   * chapters — irreversible content loss — so the count is captured before the
   * delete and returned so TAM-103 can warn. #EXPORT_CRITICAL.
   */
  async deleteSubBook(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminBookSubBookDeleteResult> {
    const res = await this.repo.deleteSubBookWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    if (!res.existed) throw new AppError("Sub-book not found", 404, "NOT_FOUND");
    if (!res.deleted) {
      throw new AppError(
        "Sub-book was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
    log.info(
      {
        event: "books_admin_sub_book_deleted",
        id,
        deletedChapterCount: res.deletedChapterCount,
      },
      "sub-book hard-deleted (cascade)"
    );
    return { id, deletedChapterCount: res.deletedChapterCount };
  }

  // =======================================================================
  // BookChapter
  // =======================================================================

  async listChapters(params: AdminChapterListParams): Promise<AdminBookChapterPage> {
    return this.repo.findAdminChapterPage(params);
  }

  async getChapterById(id: string): Promise<AdminBookChapterView> {
    const row = await this.repo.findAdminChapterById(id);
    if (!row) throw new AppError("Chapter not found", 404, "NOT_FOUND");
    return row;
  }

  /**
   * A chapter belongs ONLY to a `major_book` and, if `subBookId` is set, that
   * sub-book MUST belong to the SAME content (two independent FKs let the DB
   * accept a cross-book chapter — the service is the only guard). `audioUrl` is
   * the module's only audio (r7) and is ownership-checked before the write.
   */
  async createChapter(
    params: AdminChapterCreateParams
  ): Promise<AdminBookChapterView> {
    const subBookId = params.subBookId ?? null;
    await this.validateChapterParent(params.contentId, subBookId);
    const audioUrl = params.audioUrl ?? null;
    if (audioUrl !== null) {
      await this.validateMediaUrl(audioUrl, "bookChapter", "audioUrl");
    }
    const row = await this.repo.createAdminChapter({
      contentId: params.contentId,
      subBookId,
      slug: params.slug,
      title: params.title,
      order: params.order,
      bodyText: params.bodyText,
      audioUrl,
    });
    log.info(
      { event: "books_admin_chapter_created", id: row.id, contentId: row.contentId },
      "chapter created"
    );
    return row;
  }

  async updateChapter(
    id: string,
    params: AdminChapterUpdateParams
  ): Promise<AdminBookChapterView> {
    // Re-parenting to a non-null sub-book must stay within the chapter's own
    // (immutable) content — validate before the write.
    if (params.subBookId !== undefined && params.subBookId !== null) {
      const contentId = await this.repo.findChapterContentId(id);
      if (contentId === null) {
        throw new AppError("Chapter not found", 404, "NOT_FOUND");
      }
      const subContentId = await this.repo.findSubBookContentId(params.subBookId);
      if (subContentId === null) {
        throw new ValidationError(
          `Unknown sub-book id "${params.subBookId}"`,
          "UNKNOWN_SUB_BOOK_ID"
        );
      }
      if (subContentId !== contentId) {
        throw new ValidationError(
          "A chapter's sub-book must belong to the same book",
          "SUB_BOOK_CONTENT_MISMATCH"
        );
      }
    }
    if (params.audioUrl !== undefined && params.audioUrl !== null) {
      await this.validateMediaUrl(params.audioUrl, "bookChapter", "audioUrl");
    }
    const data: AdminBookChapterUpdateInput = {};
    if (params.subBookId !== undefined) data.subBookId = params.subBookId;
    if (params.title !== undefined) data.title = params.title;
    if (params.order !== undefined) data.order = params.order;
    if (params.bodyText !== undefined) data.bodyText = params.bodyText;
    if (params.audioUrl !== undefined) data.audioUrl = params.audioUrl;
    const row = await this.writeWithPrecondition(
      "Chapter",
      () =>
        this.repo.updateChapterWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
        }),
      () => this.repo.chapterExistsById(id),
      () => this.getChapterById(id)
    );
    log.info({ event: "books_admin_chapter_updated", id }, "chapter updated");
    return row;
  }

  /**
   * HARD delete (ADR §C4 exception, as for sub-books). The repo recomputes the
   * owning sub-book's `chapterCount` in the same transaction (#EXPORT_CRITICAL).
   */
  async deleteChapter(id: string, expectedUpdatedAt: string): Promise<{ id: string }> {
    const res = await this.repo.deleteChapterWithPrecondition({
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    if (!res.existed) throw new AppError("Chapter not found", 404, "NOT_FOUND");
    if (!res.deleted) {
      throw new AppError(
        "Chapter was modified by someone else; reload and retry",
        409,
        "STALE_WRITE"
      );
    }
    log.info({ event: "books_admin_chapter_deleted", id }, "chapter hard-deleted");
    return { id };
  }

  // =======================================================================
  // BookSection
  // =======================================================================

  async listSections(params: AdminSectionListParams): Promise<AdminBookSectionPage> {
    return this.repo.findAdminSectionPage(params);
  }

  async getSectionById(id: string): Promise<AdminBookSectionDetailView> {
    const row = await this.repo.findAdminSectionById(id);
    if (!row) throw new AppError("Section not found", 404, "NOT_FOUND");
    return row;
  }

  /**
   * Duplicate `key` (which is `@unique`) → 409 `KEY_CONFLICT` (in the repo).
   * TAM-112: seeds the inline per-locale `title` overrides in the same write.
   */
  async createSection(
    params: AdminSectionCreateParams
  ): Promise<AdminBookSectionDetailView> {
    const row = await this.repo.createAdminSection({
      key: params.key,
      title: params.title,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      translations: params.translations,
    });
    log.info(
      { event: "books_admin_section_created", id: row.id, key: row.key },
      "section created"
    );
    return row;
  }

  /**
   * TAM-112: `translations`, when provided (including `[]`), REPLACES the whole
   * override set transactionally with the base-field write; `undefined` leaves
   * it untouched. The repo runs the replace-set inside the precondition tx.
   */
  async updateSection(
    id: string,
    params: AdminSectionUpdateParams
  ): Promise<AdminBookSectionDetailView> {
    const data: AdminBookSectionUpdateInput = {};
    if (params.title !== undefined) data.title = params.title;
    if (params.sortOrder !== undefined) data.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) data.isActive = params.isActive;
    const row = await this.writeWithPrecondition(
      "Section",
      () =>
        this.repo.updateSectionWithPrecondition({
          id,
          expectedUpdatedAt: new Date(params.expectedUpdatedAt),
          data,
          translations: params.translations,
        }),
      () => this.repo.sectionExistsById(id),
      () => this.getSectionById(id)
    );
    log.info({ event: "books_admin_section_updated", id }, "section updated");
    return row;
  }

  /** "Delete" = deactivate (`isActive = false`); hides the section from `/books/home`. */
  async deactivateSection(
    id: string,
    expectedUpdatedAt: string
  ): Promise<AdminBookSectionDetailView> {
    const row = await this.writeWithPrecondition(
      "Section",
      () =>
        this.repo.updateSectionWithPrecondition({
          id,
          expectedUpdatedAt: new Date(expectedUpdatedAt),
          data: { isActive: false },
        }),
      () => this.repo.sectionExistsById(id),
      () => this.getSectionById(id)
    );
    log.info({ event: "books_admin_section_deactivated", id }, "section deactivated");
    return row;
  }

  // =======================================================================
  // internals
  // =======================================================================

  /**
   * The single write that carries the optimistic-concurrency precondition, and
   * the single place 404 vs 409 is decided (ADR §C3) — shared by the soft-delete
   * entities. A 0-count from the `updateMany` is ambiguous (the row could be
   * GONE → 404, or the caller's `updatedAt` STALE → 409), so a follow-up
   * existence check disambiguates. On success it re-reads the fresh row.
   */
  private async writeWithPrecondition<T>(
    label: string,
    update: () => Promise<number>,
    exists: () => Promise<boolean>,
    reload: () => Promise<T>
  ): Promise<T> {
    const count = await update();
    if (count === 0) {
      if (!(await exists())) {
        throw new AppError(`${label} not found`, 404, "NOT_FOUND");
      }
      throw new AppError(
        `${label} was modified by someone else; reload and retry`,
        409,
        "STALE_WRITE"
      );
    }
    return reload();
  }

  /**
   * The two-hierarchy invariants at CREATE (#EXPORT_CRITICAL) — the DB cannot
   * express them. `direct_scripture` carries its text inline (`contentBody`
   * REQUIRED) and a `category` (one of the four); `major_book` carries neither
   * (its text lives in chapters, and it has no category — confirmed against the
   * seed).
   */
  private validateContentInvariantsOnCreate(
    contentType: BookContentTypeValue,
    category: BookCategoryValue | null,
    contentBody: string | null
  ): void {
    if (contentType === "direct_scripture") {
      if (contentBody === null) {
        throw new ValidationError(
          "contentBody is required for a direct_scripture",
          "CONTENT_BODY_REQUIRED"
        );
      }
      if (category === null) {
        throw new ValidationError(
          "category is required for a direct_scripture",
          "CATEGORY_REQUIRED"
        );
      }
    } else {
      if (contentBody !== null) {
        throw new ValidationError(
          "a major_book must not carry contentBody (its text lives in chapters)",
          "CONTENT_BODY_FORBIDDEN"
        );
      }
      if (category !== null) {
        throw new ValidationError(
          "a major_book must not carry a category",
          "CATEGORY_FORBIDDEN"
        );
      }
    }
  }

  /**
   * The same invariants at PATCH, relative to the row's immutable `contentType`.
   * A `direct_scripture` may not have its `contentBody`/`category` nulled; a
   * `major_book` may not have either set to a value. (`contentType` itself is
   * absent from the PATCH body, so it can never flip.)
   */
  private validateContentInvariantsOnPatch(
    contentType: BookContentTypeValue,
    patch: { category?: BookCategoryValue | null; contentBody?: string | null }
  ): void {
    if (contentType === "direct_scripture") {
      if (patch.contentBody === null) {
        throw new ValidationError(
          "a direct_scripture's contentBody cannot be null",
          "CONTENT_BODY_REQUIRED"
        );
      }
      if (patch.category === null) {
        throw new ValidationError(
          "a direct_scripture's category cannot be null",
          "CATEGORY_REQUIRED"
        );
      }
    } else {
      if (patch.contentBody !== undefined && patch.contentBody !== null) {
        throw new ValidationError(
          "a major_book must not carry contentBody (its text lives in chapters)",
          "CONTENT_BODY_FORBIDDEN"
        );
      }
      if (patch.category !== undefined && patch.category !== null) {
        throw new ValidationError(
          "a major_book must not carry a category",
          "CATEGORY_FORBIDDEN"
        );
      }
    }
  }

  /** Assert a content id exists and is a `major_book` (never a direct_scripture). */
  private async ensureMajorBook(contentId: string, childLabel: string): Promise<void> {
    const contentType = await this.repo.findContentTypeById(contentId);
    if (contentType === null) {
      throw new ValidationError(
        `Unknown content id "${contentId}"`,
        "UNKNOWN_CONTENT_ID"
      );
    }
    if (contentType !== "major_book") {
      throw new ValidationError(
        `A ${childLabel} can only belong to a major_book, not a direct_scripture`,
        "PARENT_NOT_MAJOR_BOOK"
      );
    }
  }

  /**
   * Validate a chapter's parents on create: content is a `major_book`, and
   * `subBookId` (if set) belongs to the SAME content. #EXPORT_CRITICAL.
   */
  private async validateChapterParent(
    contentId: string,
    subBookId: string | null
  ): Promise<void> {
    await this.ensureMajorBook(contentId, "chapter");
    if (subBookId !== null) {
      const subContentId = await this.repo.findSubBookContentId(subBookId);
      if (subContentId === null) {
        throw new ValidationError(
          `Unknown sub-book id "${subBookId}"`,
          "UNKNOWN_SUB_BOOK_ID"
        );
      }
      if (subContentId !== contentId) {
        throw new ValidationError(
          "A chapter's sub-book must belong to the same book",
          "SUB_BOOK_CONTENT_MISMATCH"
        );
      }
    }
  }

  /**
   * Media-URL ownership validation (ADR §A4) — called BEFORE persisting ANY
   * media column, reaching `IMediaApi.validateOwnedUrl` (TAM-84) ONLY via
   * `performServiceCall`. It throws (→ 400) unless the URL was minted by our
   * presign flow for this exact `(module, entity, field)` triple and the object
   * exists with an allowlisted content-type. The frozen TAM-84 registry tokens
   * for this module are `books.bookContent.coverImageUrl` (image, 10 MB) and
   * `books.bookChapter.audioUrl` (audio/mpeg, 50 MB). #EXPORT_CRITICAL.
   */
  private async validateMediaUrl(
    url: string,
    entity: "bookContent" | "bookChapter",
    field: "coverImageUrl" | "audioUrl"
  ): Promise<void> {
    await performServiceCall(
      "media",
      (m) => m.validateOwnedUrl({ url, module: "books", entity, field }),
      "books:admin:media",
      "media URL validation failed"
    );
  }
}

/** Parse an optional/nullable ISO-8601 string to a `Date | null`. */
function parseNullableDate(value: string | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value);
}
