import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { BooksService } from "@api/core/books/services";
import type {
  BooksHomeQueryInput,
  BooksListQueryInput,
  CategoryListQueryInput,
  CategoryParamInput,
  ChapterParamsInput,
  ContentIdParamInput,
} from "@api/core/books/routes/books.schemas";

/**
 * Thin HTTP boundary for the Books & Scriptures module (TAM-75).
 *
 * Orchestration only — resolves the JWT subject (`req.user.id`), delegates to the
 * service, and replies via `sendSuccess`. The #EXPORT_CRITICAL Pro-entitlement
 * gate on the reading paths lives in the SERVICE; the controller never assembles
 * or inspects a reading payload for a free caller.
 */
export class BooksController {
  constructor(private readonly service: BooksService) {}

  // ---- discovery (FREE) ---------------------------------------------------

  getHome = async (
    req: FastifyRequest<{ Querystring: BooksHomeQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req); // JWT required for identity (FREE — no Pro gate)
    const data = await this.service.getHome({ locale: req.query.locale });
    return sendSuccess(reply, data, "OK");
  };

  listBooks = async (
    req: FastifyRequest<{ Querystring: BooksListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req);
    const { cursor, limit, locale } = req.query;
    const page = await this.service.listMajorBooks({ cursor, limit, locale });
    return sendSuccess(reply, page, "OK");
  };

  listCategory = async (
    req: FastifyRequest<{
      Params: CategoryParamInput;
      Querystring: CategoryListQueryInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    this.requireUserId(req);
    const { cursor, limit, locale } = req.query;
    const page = await this.service.listCategory({
      category: req.params.category,
      cursor,
      limit,
      locale,
    });
    return sendSuccess(reply, page, "OK");
  };

  // ---- reading (PRO-GATED) ------------------------------------------------

  getContents = async (
    req: FastifyRequest<{ Params: ContentIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getContents({
      userId,
      contentId: req.params.contentId,
    });
    return sendSuccess(reply, data, "OK");
  };

  getChapter = async (
    req: FastifyRequest<{ Params: ChapterParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getChapter({
      userId,
      contentId: req.params.contentId,
      chapterId: req.params.chapterId,
    });
    return sendSuccess(reply, data, "OK");
  };

  getScripture = async (
    req: FastifyRequest<{ Params: ContentIdParamInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const data = await this.service.getScripture({
      userId,
      contentId: req.params.contentId,
    });
    return sendSuccess(reply, data, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
