import { z } from "zod";
import { localeQuery, mediaUrl, paginationQuery } from "@api/shared/schemas";
import {
  BOOK_CATEGORIES,
  BOOK_CONTENT_TYPES,
  BOOK_HOME_SECTION_KEYS,
} from "@api/core/books/types";

/**
 * A book/scripture's language availability set on the wire (TAM-108): the ISO
 * 639-1 codes it is offered in. An EMPTY array means "available in all
 * languages" (supersedes the single `language` field, dropped in step 3).
 */
const languagesField = z.array(z.string());

/**
 * Zod schemas for the Books & Scriptures module (TAM-75) — the single source of
 * truth for the OpenAPI contract emitted by `pnpm nx run api:openapi` and the
 * generated TS + Dart clients.
 *
 * #EXPORT_CRITICAL: there is NO free-tier variant of the reading shapes. The
 * reader bodies (`ChapterContent.bodyText`, `ScriptureContent.contentBody`) and
 * the chapter `audioUrl` are only ever serialized for a Pro caller — a free
 * caller is stopped with a `403` ErrorEnvelope in the SERVICE before any reading
 * payload is assembled, so no partial/preview payload exists to leak. Discovery
 * shapes (cards, contents TOC) carry metadata only — never a body. `audioUrl`
 * lives ONLY on the chapter shape; `ScriptureContentSchema` has no audio field
 * (audio is major-book-only, r7).
 */

// ---- request --------------------------------------------------------------

/**
 * `GET /books/home` query (TAM-112) — an OPTIONAL `locale` used ONLY to localize
 * the CMS-owned section `title` labels (`BookSection.title`). Absent ⇒ the base
 * titles are served exactly as before, so existing mobile calls are unaffected.
 * Reuses `LanguageCodeSchema` (the eight Phase-1 client languages).
 */
export const BooksHomeQuery = z.object({
  ...localeQuery.shape,
});
export type BooksHomeQueryInput = z.infer<typeof BooksHomeQuery>;

/**
 * `GET /books` listing query — shared cursor pagination (cursor + limit) plus an
 * OPTIONAL `locale` (TAM-108). When present, the listing is filtered to books
 * whose `languages` set contains `locale` (or is empty = all languages); when
 * absent, all books are returned. `locale` reuses `LanguageCodeSchema` (the eight
 * Phase-1 client languages), matching the deity listing.
 */
export const BooksListQuery = paginationQuery.extend({
  ...localeQuery.shape,
});
export type BooksListQueryInput = z.infer<typeof BooksListQuery>;

/** `GET /books/categories/:category` — the category path param (enum-validated). */
export const CategoryParam = z.object({
  category: z.enum(BOOK_CATEGORIES),
});
export type CategoryParamInput = z.infer<typeof CategoryParam>;

/**
 * `GET /books/categories/:category` query — shared cursor pagination plus the
 * same OPTIONAL `locale` language-membership filter as `GET /books` (TAM-108).
 */
export const CategoryListQuery = paginationQuery.extend({
  ...localeQuery.shape,
});
export type CategoryListQueryInput = z.infer<typeof CategoryListQuery>;

/** `:contentId` path param for contents + scripture. */
export const ContentIdParam = z.object({ contentId: z.uuid() });
export type ContentIdParamInput = z.infer<typeof ContentIdParam>;

/** `:contentId/:chapterId` path params for the chapter reader. */
export const ChapterParams = z.object({
  contentId: z.uuid(),
  chapterId: z.uuid(),
});
export type ChapterParamsInput = z.infer<typeof ChapterParams>;

// ---- response components --------------------------------------------------

/** The field set of a discovery card — shared by the listing + section shapes. */
const bookCardFields = {
  contentId: z.string(),
  contentType: z.enum(BOOK_CONTENT_TYPES),
  category: z.enum(BOOK_CATEGORIES).nullable(),
  title: z.string(),
  coverImageUrl: mediaUrl,
  author: z.string().nullable(),
  languages: languagesField,
  offlineCacheEligible: z.boolean(),
} as const;

/** The field set of a category card — shared by the section shape. */
const bookCategoryCardFields = {
  category: z.enum(BOOK_CATEGORIES),
  title: z.string(),
  itemCount: z.number().int(),
} as const;

/** A discovery card (listings / newly-added). Metadata only. */
export const BookCardSchema = z.object(bookCardFields).meta({ id: "BookCard" });

/** A category card on the books home. */
export const BookCategoryCardSchema = z
  .object(bookCategoryCardFields)
  .meta({ id: "BookCategoryCard" });

/** A book card INSIDE a home section (union member — discriminated on `kind`). */
export const BookSectionBookItem = z
  .object({ kind: z.literal("book"), ...bookCardFields })
  .meta({ id: "BookSectionBookItem" });

/** A category card INSIDE a home section (union member). */
export const BookSectionCategoryItem = z
  .object({ kind: z.literal("category"), ...bookCategoryCardFields })
  .meta({ id: "BookSectionCategoryItem" });

/** A section's typed item — discriminated on `kind` (mirrors `AartiSectionItem`). */
export const BookSectionItemSchema = z.discriminatedUnion("kind", [
  BookSectionBookItem,
  BookSectionCategoryItem,
]);

/**
 * One ordered `GET /books/home` section — mirrors `AartiSection`. The section
 * carries its own CMS-owned `title` + `sortOrder` so the client never hardcodes a
 * heading ("Books" / "Browse Categories" / "Newly Added Books" used to be app
 * constants). Empty sections are omitted by the service (hide-when-empty).
 */
export const BooksHomeSectionSchema = z
  .object({
    key: z
      .enum(BOOK_HOME_SECTION_KEYS)
      .describe(
        "Stable section identity (carousel | categories | newly_added) — the client keys layout off THIS, never off the title."
      ),
    title: z
      .string()
      .describe("CMS-owned section heading — render verbatim, never hardcode."),
    sortOrder: z.number().int().describe("CMS-owned render order (ascending)."),
    items: z.array(BookSectionItemSchema),
  })
  .meta({ id: "BooksHomeSection" });

export const BooksHomeResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({ sections: z.array(BooksHomeSectionSchema) }),
  })
  .meta({ id: "BooksHomeResponse" });

export const BookCardPageResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      title: z
        .string()
        .describe(
          "CMS/server-owned heading for this listing screen — the all-books title on `GET /books` (the client used to hardcode \"All Books\"), the category's own title on `GET /books/categories/:category`."
        ),
      items: z.array(BookCardSchema),
      nextCursor: z.string().nullable(),
    }),
  })
  .meta({ id: "BookCardPageResponse" });

/** Chapter discovery metadata inside a book's contents (no body / no audio URL). */
export const ChapterSummarySchema = z
  .object({
    chapterId: z.string(),
    title: z.string(),
    order: z.number().int(),
    hasAudio: z.boolean(),
  })
  .meta({ id: "BookChapterSummary" });

/** A sub-book / kanda inside a book's contents, with ordered chapter metadata. */
export const SubBookSummarySchema = z
  .object({
    subBookId: z.string(),
    title: z.string(),
    order: z.number().int(),
    chapterCount: z.number().int(),
    chapters: z.array(ChapterSummarySchema),
  })
  .meta({ id: "BookSubBookSummary" });

/** `GET /books/:id/contents` — Pro-gated table of contents (no bodies). */
export const BookContentsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      contentId: z.string(),
      title: z.string(),
      coverImageUrl: mediaUrl,
      author: z.string().nullable(),
      languages: languagesField,
      offlineCacheEligible: z.boolean(),
      subBooks: z.array(SubBookSummarySchema),
      chapters: z.array(ChapterSummarySchema),
      totalChapterCount: z.number().int(),
    }),
  })
  .meta({ id: "BookContentsResponse" });

/**
 * `GET /books/:id/chapters/:chapterId` — Pro-gated chapter reader.
 * #EXPORT_CRITICAL — `bodyText` present ONLY on a Pro response (the free caller
 * gets a `403` ErrorEnvelope, not this shape). `audioUrl` is `mediaUrl.nullable()`
 * (major-book chapters only; null when the chapter has no audio).
 */
export const ChapterContentResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      contentId: z.string(),
      chapterId: z.string(),
      title: z.string(),
      order: z.number().int(),
      bodyText: z.string(),
      audioUrl: mediaUrl.nullable(),
      hasAudio: z.boolean(),
      offlineCacheEligible: z.boolean(),
    }),
  })
  .meta({ id: "BookChapterContentResponse" });

/**
 * `GET /books/:id/scripture` — Pro-gated direct-scripture reader.
 * #EXPORT_CRITICAL — `contentBody` present ONLY on a Pro response. There is NO
 * `audioUrl` field: a direct-scripture response never carries audio (r7).
 */
export const ScriptureContentResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      contentId: z.string(),
      category: z.enum(BOOK_CATEGORIES).nullable(),
      title: z.string(),
      coverImageUrl: mediaUrl,
      author: z.string().nullable(),
      languages: languagesField,
      contentBody: z.string(),
      offlineCacheEligible: z.boolean(),
    }),
  })
  .meta({ id: "BookScriptureContentResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "BooksErrorEnvelope" });
