import type { BookSummary } from "@api/core/books/types";

/**
 * Public facade for the Books & Scriptures module (TAM-75).
 *
 * The ONLY surface sibling modules use to reach books content — via
 * `performServiceCall("books", …)`, never by importing this module's files.
 * Registered into `GlobalServiceMap` from the composition root.
 *
 * Exposes a minimal `getBookSummary` (metadata card) for a sibling (e.g. Home/
 * TAM-61) that references a book by id. The reading bodies + audio URL are
 * intentionally absent: entitlement gating is per-request and owned by the books
 * module's own HTTP surface, never resolved for a sibling caller.
 */
export interface IBooksApi {
  /** Compact summary for a content id, or `null` if unknown/inactive. */
  getBookSummary(contentId: string): Promise<BookSummary | null>;
}
