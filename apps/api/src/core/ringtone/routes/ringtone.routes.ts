import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { RingtoneController } from "@api/core/ringtone/controllers";
import type { RingtoneService } from "@api/core/ringtone/services";
import {
  ErrorEnvelope,
  PlayCountBody,
  type PlayCountBodyInput,
  RingtoneDetailResponse,
  RingtoneGridQuery,
  type RingtoneGridQueryInput,
  RingtoneGridResponse,
  RingtoneIdParam,
  type RingtoneIdParamInput,
  RingtoneLikeResponse,
  RingtonePlayCountResponse,
  RingtoneSearchQuery,
  type RingtoneSearchQueryInput,
  RingtoneSearchResponse,
  RingtoneSetCountResponse,
  RingtoneShareCountResponse,
  SetCountBody,
  type SetCountBodyInput,
} from "./ringtone.schemas.js";

/**
 * Register the Ringtone routes under `/ringtones` (TAM-67). Every route is
 * JWT-guarded (`authMiddleware`). Discovery (grid, search, detail) is free to any
 * authenticated user; only the DETAIL `audioUrl` FIELD + the write paths
 * (play-count, set-count, like, share-count) are entitlement-gated inside the
 * service.
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/ringtones`, `/ringtones/search`, `/ringtones/:id`, etc. Note the
 * `/ringtones/search` literal is registered before `/ringtones/:id` so it is
 * never captured by the id param.
 */
export function registerRingtoneRoutes(
  app: FastifyInstance,
  service: RingtoneService
): void {
  const controller = new RingtoneController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/ringtones",
    {
      schema: {
        querystring: RingtoneGridQuery,
        response: {
          200: RingtoneGridResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: RingtoneGridQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getGrid(req, reply);
    }
  );

  r.get(
    "/ringtones/search",
    {
      schema: {
        querystring: RingtoneSearchQuery,
        response: {
          200: RingtoneSearchResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: RingtoneSearchQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.search(req, reply);
    }
  );

  r.get(
    "/ringtones/:id",
    {
      schema: {
        params: RingtoneIdParam,
        response: {
          200: RingtoneDetailResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: RingtoneIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getDetail(req, reply);
    }
  );

  r.post(
    "/ringtones/:id/play-count",
    {
      schema: {
        params: RingtoneIdParam,
        body: PlayCountBody,
        response: {
          200: RingtonePlayCountResponse,
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
        Params: RingtoneIdParamInput;
        Body: PlayCountBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.recordPlayCount(req, reply);
    }
  );

  r.post(
    "/ringtones/:id/set-count",
    {
      schema: {
        params: RingtoneIdParam,
        body: SetCountBody,
        response: {
          200: RingtoneSetCountResponse,
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
        Params: RingtoneIdParamInput;
        Body: SetCountBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.recordSetCount(req, reply);
    }
  );

  r.post(
    "/ringtones/:id/like",
    {
      schema: {
        params: RingtoneIdParam,
        response: {
          200: RingtoneLikeResponse,
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
      req: FastifyRequest<{ Params: RingtoneIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.toggleLike(req, reply);
    }
  );

  r.post(
    "/ringtones/:id/share-count",
    {
      schema: {
        params: RingtoneIdParam,
        response: {
          200: RingtoneShareCountResponse,
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
      req: FastifyRequest<{ Params: RingtoneIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.recordShare(req, reply);
    }
  );
}
