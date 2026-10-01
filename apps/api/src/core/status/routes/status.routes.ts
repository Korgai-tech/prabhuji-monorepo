import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { StatusController } from "@api/core/status/controllers";
import type { StatusService } from "@api/core/status/services";
import {
  ErrorEnvelope,
  StatusAvatarPresignBody,
  type StatusAvatarPresignBodyInput,
  StatusAvatarPresignResponse,
  StatusCardResponse,
  StatusFeedQuery,
  type StatusFeedQueryInput,
  StatusFeedResponse,
  StatusIdParam,
  type StatusIdParamInput,
  StatusLikeResponse,
  StatusProfileBody,
  type StatusProfileBodyInput,
  StatusProfileResponse,
  StatusViewResponse,
} from "./status.schemas.js";

/**
 * Register the Status Sharing routes under `/status` (TAM-71). Every route is
 * JWT-guarded (`authMiddleware`) but has NO entitlement gate — feed, profile,
 * overlay template, like and view are all FREE (the final Share render is Pro
 * but gated CLIENT-SIDE, TAM-72).
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/status/feed`, `/status/profile`, `/status/:id/like`, etc. The
 * `/status/feed` and `/status/profile` literals are registered before the
 * `/status/:id/*` params so they are never captured.
 */
export function registerStatusRoutes(
  app: FastifyInstance,
  service: StatusService
): void {
  const controller = new StatusController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/status/feed",
    {
      schema: {
        querystring: StatusFeedQuery,
        response: {
          200: StatusFeedResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: StatusFeedQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getFeed(req, reply);
    }
  );

  r.get(
    "/status/profile",
    {
      schema: {
        response: {
          200: StatusProfileResponse,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.getProfile(req, reply);
    }
  );

  // Mount BEFORE `PUT /status/profile` so the literal /avatar/presign path is
  // never captured by an unrelated wildcard, and AFTER the GET so the OpenAPI
  // emitter emits stable route order for the mobile client generator.
  r.post(
    "/status/profile/avatar/presign",
    {
      schema: {
        body: StatusAvatarPresignBody,
        response: {
          200: StatusAvatarPresignResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: StatusAvatarPresignBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.presignAvatar(req, reply);
    }
  );

  r.put(
    "/status/profile",
    {
      schema: {
        body: StatusProfileBody,
        response: {
          200: StatusProfileResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: StatusProfileBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.saveProfile(req, reply);
    }
  );

  // Single-status fetch (TAM-N-status-deep-link). Chat surface pushes the
  // status player over the shell after fetching by id — mirror of
  // `GET /wallpaper/:id`. Registered AFTER `/status/feed` + `/status/profile`
  // (find-my-way already handles specificity, but the file convention keeps
  // literals ahead of `/status/:id/*` params).
  r.get(
    "/status/:id",
    {
      schema: {
        params: StatusIdParam,
        response: {
          200: StatusCardResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: StatusIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getById(req, reply);
    }
  );

  r.post(
    "/status/:id/like",
    {
      schema: {
        params: StatusIdParam,
        response: {
          200: StatusLikeResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: StatusIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.toggleLike(req, reply);
    }
  );

  r.post(
    "/status/:id/view",
    {
      schema: {
        params: StatusIdParam,
        response: {
          200: StatusViewResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: StatusIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.recordView(req, reply);
    }
  );
}
