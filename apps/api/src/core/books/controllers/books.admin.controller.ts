import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { BooksAdminService } from "@api/core/books/services";
import type {
  AdminBookChapterCreateInput,
  AdminBookChapterDeleteInput,
  AdminBookChapterListQueryInput,
  AdminBookChapterPatchInput,
  AdminBookContentCreateInput,
  AdminBookContentDeleteInput,
  AdminBookContentListQueryInput,
  AdminBookContentPatchInput,
  AdminBookSectionCreateInput,
  AdminBookSectionDeleteInput,
  AdminBookSectionListQueryInput,
  AdminBookSectionPatchInput,
  AdminBookSubBookCreateInput,
  AdminBookSubBookDeleteInput,
  AdminBookSubBookListQueryInput,
  AdminBookSubBookPatchInput,
  AdminBooksIdParamsInput,
} from "@api/core/books/routes/books.admin.schemas";

/**
 * HTTP boundary for the `/admin/books/*` surface (TAM-102).
 *
 * Thin — parse-validated input in, envelope out via `sendSuccess`; all business
 * logic and error semantics (the two-hierarchy invariants, 404/409, slug/key
 * conflicts, cascade-count) live in `BooksAdminService`. The guard pair
 * (`authMiddleware` + `adminMiddleware`) is applied centrally by
 * `registerAdminRoute`, so these handlers never touch auth.
 */
export class BooksAdminController {
  constructor(private readonly service: BooksAdminService) {}

  // ---- BookContent --------------------------------------------------------

  listContent = async (
    req: FastifyRequest<{ Querystring: AdminBookContentListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listContent(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getContent = async (
    req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getContentById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createContent = async (
    req: FastifyRequest<{ Body: AdminBookContentCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createContent(req.body);
    return sendSuccess(reply, row, "Book created", 201);
  };

  updateContent = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookContentPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateContent(req.params.id, req.body);
    return sendSuccess(reply, row, "Book updated");
  };

  deactivateContent = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookContentDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateContent(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Book deactivated");
  };

  // ---- BookSubBook --------------------------------------------------------

  listSubBooks = async (
    req: FastifyRequest<{ Querystring: AdminBookSubBookListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listSubBooks(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getSubBook = async (
    req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getSubBookById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createSubBook = async (
    req: FastifyRequest<{ Body: AdminBookSubBookCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createSubBook(req.body);
    return sendSuccess(reply, row, "Sub-book created", 201);
  };

  updateSubBook = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookSubBookPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateSubBook(req.params.id, req.body);
    return sendSuccess(reply, row, "Sub-book updated");
  };

  deleteSubBook = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookSubBookDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.deleteSubBook(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, result, "Sub-book deleted");
  };

  // ---- BookChapter --------------------------------------------------------

  listChapters = async (
    req: FastifyRequest<{ Querystring: AdminBookChapterListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listChapters(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getChapter = async (
    req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getChapterById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createChapter = async (
    req: FastifyRequest<{ Body: AdminBookChapterCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createChapter(req.body);
    return sendSuccess(reply, row, "Chapter created", 201);
  };

  updateChapter = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookChapterPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateChapter(req.params.id, req.body);
    return sendSuccess(reply, row, "Chapter updated");
  };

  deleteChapter = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookChapterDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.deleteChapter(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, result, "Chapter deleted");
  };

  // ---- BookSection --------------------------------------------------------

  listSections = async (
    req: FastifyRequest<{ Querystring: AdminBookSectionListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.listSections(req.query);
    return sendSuccess(reply, result, "OK");
  };

  getSection = async (
    req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.getSectionById(req.params.id);
    return sendSuccess(reply, row, "OK");
  };

  createSection = async (
    req: FastifyRequest<{ Body: AdminBookSectionCreateInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.createSection(req.body);
    return sendSuccess(reply, row, "Section created", 201);
  };

  updateSection = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookSectionPatchInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.updateSection(req.params.id, req.body);
    return sendSuccess(reply, row, "Section updated");
  };

  deactivateSection = async (
    req: FastifyRequest<{
      Params: AdminBooksIdParamsInput;
      Body: AdminBookSectionDeleteInput;
    }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const row = await this.service.deactivateSection(
      req.params.id,
      req.body.expectedUpdatedAt
    );
    return sendSuccess(reply, row, "Section deactivated");
  };
}
