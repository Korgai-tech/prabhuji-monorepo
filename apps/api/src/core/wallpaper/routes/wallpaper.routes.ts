import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { WallpaperController } from "@api/core/wallpaper/controllers";
import type { WallpaperService } from "@api/core/wallpaper/services";
import {
  ErrorEnvelope,
  WallpaperCountBody,
  type WallpaperCountBodyInput,
  WallpaperCountResponse,
  WallpaperDetailResponse,
  WallpaperHomeQuery,
  type WallpaperHomeQueryInput,
  WallpaperHomeResponse,
  WallpaperIdParam,
  type WallpaperIdParamInput,
  WallpaperLikeResponse,
  WallpaperListQuery,
  type WallpaperListQueryInput,
  WallpaperListResponse,
} from "./wallpaper.schemas.js";

/**
 * Register the Wallpaper routes under `/wallpaper` (TAM-69). Every route is
 * JWT-guarded (`authMiddleware`) but has NO entitlement gate — discovery, home,
 * listing, detail, like, share and set-count are all free (the device Set action
 * is Pro but gated CLIENT-SIDE, TAM-70).
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/wallpaper/home`, `/wallpaper/list`, `/wallpaper/:id`, etc. The
 * `/wallpaper/home` and `/wallpaper/list` literals are registered before
 * `/wallpaper/:id` so they are never captured by the id param.
 */
export function registerWallpaperRoutes(
  app: FastifyInstance,
  service: WallpaperService
): void {
  const controller = new WallpaperController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/wallpaper/home",
    {
      schema: {
        querystring: WallpaperHomeQuery,
        response: {
          200: WallpaperHomeResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: WallpaperHomeQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getHome(req, reply);
    }
  );

  r.get(
    "/wallpaper/list",
    {
      schema: {
        querystring: WallpaperListQuery,
        response: {
          200: WallpaperListResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: WallpaperListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    }
  );

  r.get(
    "/wallpaper/:id",
    {
      schema: {
        params: WallpaperIdParam,
        response: {
          200: WallpaperDetailResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: WallpaperIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getDetail(req, reply);
    }
  );

  r.post(
    "/wallpaper/:id/like",
    {
      schema: {
        params: WallpaperIdParam,
        response: {
          200: WallpaperLikeResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: WallpaperIdParamInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.toggleLike(req, reply);
    }
  );

  r.post(
    "/wallpaper/:id/count",
    {
      schema: {
        params: WallpaperIdParam,
        body: WallpaperCountBody,
        response: {
          200: WallpaperCountResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          // `type: "set"` is a Pro action. `type: "share"` stays free, so this
          // route is 403-able on one branch only.
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{
        Params: WallpaperIdParamInput;
        Body: WallpaperCountBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.recordCount(req, reply);
    }
  );
}
