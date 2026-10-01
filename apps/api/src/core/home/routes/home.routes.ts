import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { HomeController } from "@api/core/home/controllers";
import type { HomeService } from "@api/core/home/services";
import {
  ErrorEnvelope,
  HomeBannersResponse,
  HomeEngagementBody,
  type HomeEngagementBodyInput,
  HomeFeedQuery,
  type HomeFeedQueryInput,
  HomeFeedResponse,
  HomeLikeResponse,
  HomeLocaleQuery,
  type HomeLocaleQueryInput,
  HomeShareBody,
  type HomeShareBodyInput,
  HomeShareResponse,
  HomeShortcutsResponse,
  HomeViewResponse,
} from "./home.schemas.js";

/**
 * Register the Home routes under `/home` (TAM-61). Every route is JWT-guarded
 * (`authMiddleware`) and has NO entitlement gate — banners, shortcuts, feed and
 * the engagement write forwarders are served identically to free + Pro users.
 *
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are exactly `/home/banners`, `/home/feed`, `/home/engagement/like`, etc.
 */
export function registerHomeRoutes(
  app: FastifyInstance,
  service: HomeService
): void {
  const controller = new HomeController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/home/banners",
    {
      schema: {
        querystring: HomeLocaleQuery,
        response: {
          200: HomeBannersResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: HomeLocaleQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getBanners(req, reply);
    }
  );

  /**
   * The feature-shortcut grid. A DEDICATED resource route rather than a
   * `shortcuts[]` array bolted onto `/home/banners` — this module's convention is
   * one route per resource with a resource-named envelope (`/home/banners` →
   * `{banners}`, `/home/feed` → `{items,nextCursor}`), and shortcuts are chrome
   * with an independent cache/failure profile: the grid must still render when
   * banners fail (PRD §9/§16), which a shared response would prevent.
   */
  r.get(
    "/home/shortcuts",
    {
      schema: {
        querystring: HomeLocaleQuery,
        response: {
          200: HomeShortcutsResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: HomeLocaleQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getShortcuts(req, reply);
    }
  );

  r.get(
    "/home/feed",
    {
      schema: {
        querystring: HomeFeedQuery,
        response: {
          200: HomeFeedResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: HomeFeedQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getFeed(req, reply);
    }
  );

  r.post(
    "/home/engagement/like",
    {
      schema: {
        body: HomeEngagementBody,
        response: {
          200: HomeLikeResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: HomeEngagementBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.like(req, reply);
    }
  );

  r.post(
    "/home/engagement/view",
    {
      schema: {
        body: HomeEngagementBody,
        response: {
          200: HomeViewResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: HomeEngagementBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.view(req, reply);
    }
  );

  r.post(
    "/home/engagement/share",
    {
      schema: {
        body: HomeShareBody,
        response: {
          200: HomeShareResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: HomeShareBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.share(req, reply);
    }
  );
}
