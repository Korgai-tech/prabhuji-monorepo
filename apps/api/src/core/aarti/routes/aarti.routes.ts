import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { AartiController } from "@api/core/aarti/controllers";
import type { AartiService } from "@api/core/aarti/services";
import {
  AartiDetailResponse,
  AartiLikeResponse,
  AartiListQuery,
  type AartiListQueryInput,
  AartiListResponse,
  AartiLocaleQuery,
  type AartiLocaleQueryInput,
  AartiMainResponse,
  AartiPlayBody,
  type AartiPlayBodyInput,
  AartiPlayResponse,
  AudioIdParam,
  type AudioIdParamInput,
  ErrorEnvelope,
} from "./aarti.schemas.js";

/**
 * Register the Aarti & Bhajans routes under `/aarti` (TAM-63). Every route is
 * JWT-guarded (`authMiddleware`). Only the stream-URL FIELD and `/play` are
 * entitlement-gated — discovery is available to any authenticated user.
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/aarti/main`, `/aarti/audios`, etc.
 */
export function registerAartiRoutes(
  app: FastifyInstance,
  service: AartiService
): void {
  const controller = new AartiController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/aarti/main",
    {
      schema: {
        querystring: AartiLocaleQuery,
        response: {
          200: AartiMainResponse,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: AartiLocaleQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getMain(req, reply);
    }
  );

  r.get(
    "/aarti/audios",
    {
      schema: {
        querystring: AartiListQuery,
        response: {
          200: AartiListResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: AartiListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listAudios(req, reply);
    }
  );

  r.get(
    "/aarti/audios/:id",
    {
      schema: {
        params: AudioIdParam,
        querystring: AartiLocaleQuery,
        response: {
          200: AartiDetailResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{
        Params: AudioIdParamInput;
        Querystring: AartiLocaleQueryInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getDetail(req, reply);
    }
  );

  r.post(
    "/aarti/audios/:id/play",
    {
      schema: {
        params: AudioIdParam,
        body: AartiPlayBody,
        response: {
          200: AartiPlayResponse,
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
      req: FastifyRequest<{
        Params: AudioIdParamInput;
        Body: AartiPlayBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.play(req, reply);
    }
  );

  r.post(
    "/aarti/audios/:id/like",
    {
      schema: {
        params: AudioIdParam,
        response: {
          200: AartiLikeResponse,
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
      req: FastifyRequest<{ Params: AudioIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.toggleLike(req, reply);
    }
  );
}
