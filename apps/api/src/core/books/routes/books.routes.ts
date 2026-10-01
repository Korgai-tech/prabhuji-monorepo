import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { BooksController } from "@api/core/books/controllers";
import type { BooksService } from "@api/core/books/services";
import {
  BookCardPageResponse,
  BookContentsResponse,
  BooksHomeQuery,
  type BooksHomeQueryInput,
  BooksHomeResponse,
  BooksListQuery,
  type BooksListQueryInput,
  CategoryListQuery,
  type CategoryListQueryInput,
  CategoryParam,
  type CategoryParamInput,
  ChapterContentResponse,
  ChapterParams,
  type ChapterParamsInput,
  ContentIdParam,
  type ContentIdParamInput,
  ErrorEnvelope,
  ScriptureContentResponse,
} from "./books.schemas.js";

/**
 * Register the Books & Scriptures routes under `/books` (TAM-75). Every route is
 * JWT-guarded (`authMiddleware`). DISCOVERY is free (home, listings, category);
 * READING is Pro-gated server-side in the service (contents, chapter, scripture)
 * — a free caller gets `403` with no reading payload.
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/books/home`, `/books`, `/books/categories/:category`, etc.
 */
export function registerBooksRoutes(
  app: FastifyInstance,
  service: BooksService
): void {
  const controller = new BooksController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ---- discovery (FREE) ---------------------------------------------------

  r.get(
    "/books/home",
    {
      schema: {
        querystring: BooksHomeQuery,
        response: {
          200: BooksHomeResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: BooksHomeQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getHome(req, reply);
    }
  );

  r.get(
    "/books",
    {
      schema: {
        querystring: BooksListQuery,
        response: {
          200: BookCardPageResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: BooksListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listBooks(req, reply);
    }
  );

  r.get(
    "/books/categories/:category",
    {
      schema: {
        params: CategoryParam,
        querystring: CategoryListQuery,
        response: {
          200: BookCardPageResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{
        Params: CategoryParamInput;
        Querystring: CategoryListQueryInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listCategory(req, reply);
    }
  );

  // ---- reading (PRO-GATED) ------------------------------------------------

  r.get(
    "/books/:contentId/contents",
    {
      schema: {
        params: ContentIdParam,
        response: {
          200: BookContentsResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: ContentIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getContents(req, reply);
    }
  );

  r.get(
    "/books/:contentId/chapters/:chapterId",
    {
      schema: {
        params: ChapterParams,
        response: {
          200: ChapterContentResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: ChapterParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getChapter(req, reply);
    }
  );

  r.get(
    "/books/:contentId/scripture",
    {
      schema: {
        params: ContentIdParam,
        response: {
          200: ScriptureContentResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: ContentIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getScripture(req, reply);
    }
  );
}
