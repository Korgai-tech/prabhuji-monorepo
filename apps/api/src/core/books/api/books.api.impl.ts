import type { BooksService } from "@api/core/books/services";
import type { BookSummary } from "@api/core/books/types";
import type { IBooksApi } from "./books.api.js";

/**
 * Facade implementation — a thin passthrough to the module's `BooksService`
 * singleton built in the composition root, so cross-module callers and the
 * module's own HTTP controller share identical behavior.
 */
export class BooksApi implements IBooksApi {
  constructor(private readonly service: BooksService) {}

  async getBookSummary(contentId: string): Promise<BookSummary | null> {
    return this.service.getBookSummary(contentId);
  }
}
