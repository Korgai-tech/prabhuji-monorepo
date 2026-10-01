import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { MantrasController } from "@api/core/mantras/controllers";
import type { MantrasService } from "@api/core/mantras/services";
import {
  CategoryPlaylistParam,
  type CategoryPlaylistParamInput,
  CounterPreferenceBody,
  type CounterPreferenceBodyInput,
  DeityPlaylistParam,
  type DeityPlaylistParamInput,
  ErrorEnvelope,
  ItemIdParam,
  type ItemIdParamInput,
  MantraCounterPreferenceResponse,
  MantraDetailQuery,
  type MantraDetailQueryInput,
  MantraDetailResponse,
  MantraLikeResponse,
  MantraListQuery,
  type MantraListQueryInput,
  MantraListResponse,
  MantraPlaylistResponse,
  MantraRecentlyPlayedResponse,
  MantraSectionsQuery,
  type MantraSectionsQueryInput,
  MantraSectionsResponse,
  RecentlyPlayedBody,
  type RecentlyPlayedBodyInput,
} from "./mantras.schemas.js";

/**
 * Register the Mantras & Stutis routes under `/mantras` (TAM-65). Every route is
 * JWT-guarded (`authMiddleware`). Only the `audioUrl` FIELD + the write paths
 * (recently-played, like) are entitlement-gated — discovery is available to any
 * authenticated user.
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/mantras/sections`, `/mantras/items`, etc.
 */
export function registerMantrasRoutes(
  app: FastifyInstance,
  service: MantrasService
): void {
  const controller = new MantrasController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/mantras/sections",
    {
      schema: {
        querystring: MantraSectionsQuery,
        response: {
          200: MantraSectionsResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: MantraSectionsQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getSections(req, reply);
    }
  );

  r.get(
    "/mantras/items",
    {
      schema: {
        querystring: MantraListQuery,
        response: {
          200: MantraListResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: MantraListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listItems(req, reply);
    }
  );

  r.get(
    "/mantras/items/:id",
    {
      schema: {
        params: ItemIdParam,
        querystring: MantraDetailQuery,
        response: {
          200: MantraDetailResponse,
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
        Params: ItemIdParamInput;
        Querystring: MantraDetailQueryInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getDetail(req, reply);
    }
  );

  r.get(
    "/mantras/deities/:deityId/playlist",
    {
      schema: {
        params: DeityPlaylistParam,
        response: {
          200: MantraPlaylistResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: DeityPlaylistParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getDeityPlaylist(req, reply);
    }
  );

  r.get(
    "/mantras/categories/:categoryId/playlist",
    {
      schema: {
        params: CategoryPlaylistParam,
        response: {
          200: MantraPlaylistResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: CategoryPlaylistParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getCategoryPlaylist(req, reply);
    }
  );

  r.post(
    "/mantras/items/:id/recently-played",
    {
      schema: {
        params: ItemIdParam,
        body: RecentlyPlayedBody,
        response: {
          200: MantraRecentlyPlayedResponse,
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
        Params: ItemIdParamInput;
        Body: RecentlyPlayedBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.recordRecentlyPlayed(req, reply);
    }
  );

  r.post(
    "/mantras/items/:id/like",
    {
      schema: {
        params: ItemIdParam,
        response: {
          200: MantraLikeResponse,
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
      req: FastifyRequest<{ Params: ItemIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.toggleLike(req, reply);
    }
  );

  r.get(
    "/mantras/counter-preference",
    {
      schema: {
        response: {
          200: MantraCounterPreferenceResponse,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.getCounterPreference(req, reply);
    }
  );

  r.put(
    "/mantras/counter-preference",
    {
      schema: {
        body: CounterPreferenceBody,
        response: {
          200: MantraCounterPreferenceResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: CounterPreferenceBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.setCounterPreference(req, reply);
    }
  );
}
