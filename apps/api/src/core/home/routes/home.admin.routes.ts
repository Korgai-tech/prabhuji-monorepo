import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { HomeAdminController } from "@api/core/home/controllers";
import type { HomeAdminService } from "@api/core/home/services";
import {
  AdminBannerCreateBody,
  type AdminBannerCreateInput,
  AdminBannerDetailResponse,
  AdminBannerListQuery,
  type AdminBannerListQueryInput,
  AdminBannerListResponse,
  AdminBannerPatchBody,
  type AdminBannerPatchInput,
  AdminFeedCreateBody,
  type AdminFeedCreateInput,
  AdminFeedDetailResponse,
  AdminFeedListQuery,
  type AdminFeedListQueryInput,
  AdminFeedListResponse,
  AdminFeedPatchBody,
  type AdminFeedPatchInput,
  AdminHomeDeleteBody,
  type AdminHomeDeleteInput,
  AdminHomeIdParams,
  type AdminHomeIdParamsInput,
  AdminSettingsPatchBody,
  type AdminSettingsPatchInput,
  AdminSettingsResponse,
  AdminShortcutCreateBody,
  type AdminShortcutCreateInput,
  AdminShortcutDetailResponse,
  AdminShortcutListQuery,
  type AdminShortcutListQueryInput,
  AdminShortcutListResponse,
  AdminShortcutPatchBody,
  type AdminShortcutPatchInput,
  ErrorEnvelope,
} from "./home.admin.schemas.js";

/**
 * The `/admin/home/*` write surface owned by the Home module (TAM-104; ADR §B5).
 * Mounted on the module's own `/admin`-prefixed scope by `initHomeModule`,
 * deliberately SEPARATE from the public `/home/*` routes — the mobile read
 * contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (TAM-85 uses it to keep these operations out of `openapi.public.json`).
 *
 * ROUTE ORDERING (AC (a)): the literal collection/singleton paths are declared
 * before the `/:id` routes so a `/:id` route can never shadow a literal one —
 * `HomeSettings` in particular is the bare `/settings` singleton (GET + PATCH,
 * no `:id`), which must not be captured by any `/:id` matcher.
 */
export function registerHomeAdminRoutes(
  app: FastifyInstance,
  service: HomeAdminService
): void {
  const controller = new HomeAdminController(service);

  // === HomeSettings — the singleton (literal path, no `:id`) ================

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/settings",
    schema: {
      response: {
        200: AdminSettingsResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.getSettings(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: "/home/settings",
    schema: {
      body: AdminSettingsPatchBody,
      response: {
        200: AdminSettingsResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminSettingsPatchInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateSettings(req, reply);
    },
  });

  // === HomeBanner ==========================================================

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/banners",
    schema: {
      querystring: AdminBannerListQuery,
      response: {
        200: AdminBannerListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminBannerListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listBanners(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: "/home/banners",
    schema: {
      body: AdminBannerCreateBody,
      response: {
        201: AdminBannerDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminBannerCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createBanner(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/banners/:id",
    schema: {
      params: AdminHomeIdParams,
      response: {
        200: AdminBannerDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getBanner(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: "/home/banners/:id",
    schema: {
      params: AdminHomeIdParams,
      body: AdminBannerPatchBody,
      response: {
        200: AdminBannerDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminBannerPatchInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateBanner(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), NEVER a hard delete (ADR §C4).
  registerAdminRoute(app, {
    method: "DELETE",
    url: "/home/banners/:id",
    schema: {
      params: AdminHomeIdParams,
      body: AdminHomeDeleteBody,
      response: {
        200: AdminBannerDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminHomeDeleteInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateBanner(req, reply);
    },
  });

  // === HomeFeedItem ========================================================

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/feed-items",
    schema: {
      querystring: AdminFeedListQuery,
      response: {
        200: AdminFeedListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminFeedListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listFeedItems(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: "/home/feed-items",
    schema: {
      body: AdminFeedCreateBody,
      response: {
        201: AdminFeedDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminFeedCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createFeedItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/feed-items/:id",
    schema: {
      params: AdminHomeIdParams,
      response: {
        200: AdminFeedDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getFeedItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: "/home/feed-items/:id",
    schema: {
      params: AdminHomeIdParams,
      body: AdminFeedPatchBody,
      response: {
        200: AdminFeedDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminFeedPatchInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateFeedItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: "/home/feed-items/:id",
    schema: {
      params: AdminHomeIdParams,
      body: AdminHomeDeleteBody,
      response: {
        200: AdminFeedDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminHomeDeleteInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateFeedItem(req, reply);
    },
  });

  // === HomeShortcut ========================================================

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/shortcuts",
    schema: {
      querystring: AdminShortcutListQuery,
      response: {
        200: AdminShortcutListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminShortcutListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listShortcuts(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: "/home/shortcuts",
    schema: {
      body: AdminShortcutCreateBody,
      response: {
        201: AdminShortcutDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminShortcutCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createShortcut(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: "/home/shortcuts/:id",
    schema: {
      params: AdminHomeIdParams,
      response: {
        200: AdminShortcutDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getShortcut(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: "/home/shortcuts/:id",
    schema: {
      params: AdminHomeIdParams,
      body: AdminShortcutPatchBody,
      response: {
        200: AdminShortcutDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminShortcutPatchInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateShortcut(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: "/home/shortcuts/:id",
    schema: {
      params: AdminHomeIdParams,
      body: AdminHomeDeleteBody,
      response: {
        200: AdminShortcutDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminHomeIdParamsInput; Body: AdminHomeDeleteInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateShortcut(req, reply);
    },
  });
}
