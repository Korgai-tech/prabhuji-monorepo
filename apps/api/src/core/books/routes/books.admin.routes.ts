import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { BooksAdminController } from "@api/core/books/controllers";
import type { BooksAdminService } from "@api/core/books/services";
import {
  AdminBookChapterCreateBody,
  type AdminBookChapterCreateInput,
  AdminBookChapterDeleteBody,
  type AdminBookChapterDeleteInput,
  AdminBookChapterDeleteResponse,
  AdminBookChapterListQuery,
  type AdminBookChapterListQueryInput,
  AdminBookChapterListResponse,
  AdminBookChapterPatchBody,
  type AdminBookChapterPatchInput,
  AdminBookChapterResponse,
  AdminBookContentCreateBody,
  type AdminBookContentCreateInput,
  AdminBookContentDeleteBody,
  type AdminBookContentDeleteInput,
  AdminBookContentListQuery,
  type AdminBookContentListQueryInput,
  AdminBookContentListResponse,
  AdminBookContentPatchBody,
  type AdminBookContentPatchInput,
  AdminBookContentResponse,
  AdminBooksIdParams,
  type AdminBooksIdParamsInput,
  AdminBookSectionCreateBody,
  type AdminBookSectionCreateInput,
  AdminBookSectionDeleteBody,
  type AdminBookSectionDeleteInput,
  AdminBookSectionListQuery,
  type AdminBookSectionListQueryInput,
  AdminBookSectionListResponse,
  AdminBookSectionPatchBody,
  type AdminBookSectionPatchInput,
  AdminBookSectionResponse,
  AdminBookSubBookCreateBody,
  type AdminBookSubBookCreateInput,
  AdminBookSubBookDeleteBody,
  type AdminBookSubBookDeleteInput,
  AdminBookSubBookDeleteResponse,
  AdminBookSubBookListQuery,
  type AdminBookSubBookListQueryInput,
  AdminBookSubBookListResponse,
  AdminBookSubBookPatchBody,
  type AdminBookSubBookPatchInput,
  AdminBookSubBookResponse,
  ErrorEnvelope,
} from "./books.admin.schemas.js";

/**
 * The `/admin/books/*` write surface owned by the books module (TAM-102;
 * ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initBooksModule`, deliberately SEPARATE from the public `/books/*` routes —
 * the mobile app's read contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json`). A
 * hand-rolled `r.post("/admin/…")` is a review-blocker.
 *
 * Route prefix `/admin/books/<entity>` — `books` is the ADR's module name,
 * matching the TAM-88 exemplar's `/admin/<module>/…` convention. FOUR entities:
 * `content`, `sub-books`, `chapters`, `sections`. Sub-book/chapter DELETE is a
 * genuine HARD delete (cascade-FK children, no liveness flag; ADR §C4); content
 * and section DELETE are deactivations.
 */
export function registerBooksAdminRoutes(
  app: FastifyInstance,
  service: BooksAdminService
): void {
  const controller = new BooksAdminController(service);

  // =======================================================================
  // BookContent — /admin/books/content
  // =======================================================================

  const content = "/books/content";

  registerAdminRoute(app, {
    method: "GET",
    url: content,
    schema: {
      querystring: AdminBookContentListQuery,
      response: {
        200: AdminBookContentListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminBookContentListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listContent(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: content,
    schema: {
      body: AdminBookContentCreateBody,
      response: {
        201: AdminBookContentResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminBookContentCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createContent(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${content}/:id`,
    schema: {
      params: AdminBooksIdParams,
      response: {
        200: AdminBookContentResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getContent(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${content}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookContentPatchBody,
      response: {
        200: AdminBookContentResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookContentPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateContent(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), NEVER a hard delete (ADR §C4).
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${content}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookContentDeleteBody,
      response: {
        200: AdminBookContentResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookContentDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateContent(req, reply);
    },
  });

  // =======================================================================
  // BookSubBook — /admin/books/sub-books
  // =======================================================================

  const subBooks = "/books/sub-books";

  registerAdminRoute(app, {
    method: "GET",
    url: subBooks,
    schema: {
      querystring: AdminBookSubBookListQuery,
      response: {
        200: AdminBookSubBookListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminBookSubBookListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listSubBooks(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: subBooks,
    schema: {
      body: AdminBookSubBookCreateBody,
      response: {
        201: AdminBookSubBookResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminBookSubBookCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createSubBook(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${subBooks}/:id`,
    schema: {
      params: AdminBooksIdParams,
      response: {
        200: AdminBookSubBookResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getSubBook(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${subBooks}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookSubBookPatchBody,
      response: {
        200: AdminBookSubBookResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookSubBookPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateSubBook(req, reply);
    },
  });

  // HARD delete: no liveness flag + real cascade FK (ADR §C4). CASCADES to
  // chapters; the response surfaces the count so TAM-103 can warn.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${subBooks}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookSubBookDeleteBody,
      response: {
        200: AdminBookSubBookDeleteResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookSubBookDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deleteSubBook(req, reply);
    },
  });

  // =======================================================================
  // BookChapter — /admin/books/chapters
  // =======================================================================

  const chapters = "/books/chapters";

  registerAdminRoute(app, {
    method: "GET",
    url: chapters,
    schema: {
      querystring: AdminBookChapterListQuery,
      response: {
        200: AdminBookChapterListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminBookChapterListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listChapters(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: chapters,
    schema: {
      body: AdminBookChapterCreateBody,
      response: {
        201: AdminBookChapterResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminBookChapterCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createChapter(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${chapters}/:id`,
    schema: {
      params: AdminBooksIdParams,
      response: {
        200: AdminBookChapterResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getChapter(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${chapters}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookChapterPatchBody,
      response: {
        200: AdminBookChapterResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookChapterPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateChapter(req, reply);
    },
  });

  // HARD delete: cascade-FK child, no liveness flag (ADR §C4). Recomputes the
  // owning sub-book's `chapterCount` transactionally (in the repo).
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${chapters}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookChapterDeleteBody,
      response: {
        200: AdminBookChapterDeleteResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookChapterDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deleteChapter(req, reply);
    },
  });

  // =======================================================================
  // BookSection — /admin/books/sections
  // =======================================================================

  const sections = "/books/sections";

  registerAdminRoute(app, {
    method: "GET",
    url: sections,
    schema: {
      querystring: AdminBookSectionListQuery,
      response: {
        200: AdminBookSectionListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminBookSectionListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listSections(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: sections,
    schema: {
      body: AdminBookSectionCreateBody,
      response: {
        201: AdminBookSectionResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminBookSectionCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createSection(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${sections}/:id`,
    schema: {
      params: AdminBooksIdParams,
      response: {
        200: AdminBookSectionResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminBooksIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getSection(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${sections}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookSectionPatchBody,
      response: {
        200: AdminBookSectionResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookSectionPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateSection(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`); hides the section from `/books/home`.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${sections}/:id`,
    schema: {
      params: AdminBooksIdParams,
      body: AdminBookSectionDeleteBody,
      response: {
        200: AdminBookSectionResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminBooksIdParamsInput;
        Body: AdminBookSectionDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateSection(req, reply);
    },
  });
}
