import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { WallpaperAdminController } from "@api/core/wallpaper/controllers";
import type { WallpaperAdminService } from "@api/core/wallpaper/services";
import {
  AdminWallpaperCreateBody,
  type AdminWallpaperCreateInput,
  AdminWallpaperDeleteBody,
  type AdminWallpaperDeleteInput,
  AdminWallpaperDetailResponse,
  AdminWallpaperIdParams,
  type AdminWallpaperIdParamsInput,
  AdminWallpaperListQuery,
  type AdminWallpaperListQueryInput,
  AdminWallpaperListResponse,
  AdminWallpaperPatchBody,
  type AdminWallpaperPatchInput,
  AdminWallpaperRowCreateBody,
  type AdminWallpaperRowCreateInput,
  AdminWallpaperRowDeleteBody,
  type AdminWallpaperRowDeleteInput,
  AdminWallpaperRowDetailResponse,
  AdminWallpaperRowIdParams,
  type AdminWallpaperRowIdParamsInput,
  AdminWallpaperRowItemsBody,
  type AdminWallpaperRowItemsInput,
  AdminWallpaperRowItemsResponse,
  AdminWallpaperRowListQuery,
  type AdminWallpaperRowListQueryInput,
  AdminWallpaperRowListResponse,
  AdminWallpaperRowPatchBody,
  type AdminWallpaperRowPatchInput,
  ErrorEnvelope,
} from "./wallpaper.admin.schemas.js";

/**
 * The `/admin/wallpapers/*` write surface owned by the wallpaper module
 * (TAM-96; ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initWallpaperModule`, deliberately SEPARATE from the public `/wallpaper/*`
 * routes — the mobile app's read contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json`, and
 * therefore out of the mobile Dart codegen).
 *
 * ROUTE ORDERING FOOTGUN (AC (a)): the literal `/wallpapers/rows` routes are
 * registered BEFORE the parametric `/wallpapers/:id` routes so `:id` can never
 * shadow `rows`. (Fastify's radix router prioritizes static over parametric
 * regardless, but the explicit ordering honours the AC and is defensive.)
 */
export function registerWallpaperAdminRoutes(
  app: FastifyInstance,
  service: WallpaperAdminService
): void {
  const controller = new WallpaperAdminController(service);
  const base = "/wallpapers";

  // --- wallpaper collection -------------------------------------------------

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminWallpaperListQuery,
      response: {
        200: AdminWallpaperListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminWallpaperListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminWallpaperCreateBody,
      response: {
        201: AdminWallpaperDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminWallpaperCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    },
  });

  // --- homepage rows (LITERAL path — registered BEFORE `/wallpapers/:id`) ----

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/rows`,
    schema: {
      querystring: AdminWallpaperRowListQuery,
      response: {
        200: AdminWallpaperRowListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminWallpaperRowListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listRows(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: `${base}/rows`,
    schema: {
      body: AdminWallpaperRowCreateBody,
      response: {
        201: AdminWallpaperRowDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminWallpaperRowCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createRow(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/rows/:id`,
    schema: {
      params: AdminWallpaperRowIdParams,
      response: {
        200: AdminWallpaperRowDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminWallpaperRowIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getRow(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/rows/:id`,
    schema: {
      params: AdminWallpaperRowIdParams,
      body: AdminWallpaperRowPatchBody,
      response: {
        200: AdminWallpaperRowDetailResponse,
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
        Params: AdminWallpaperRowIdParamsInput;
        Body: AdminWallpaperRowPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateRow(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), reversible via PATCH { isActive: true }.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/rows/:id`,
    schema: {
      params: AdminWallpaperRowIdParams,
      body: AdminWallpaperRowDeleteBody,
      response: {
        200: AdminWallpaperRowDetailResponse,
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
        Params: AdminWallpaperRowIdParamsInput;
        Body: AdminWallpaperRowDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateRow(req, reply);
    },
  });

  // Curated items — `custom` rows ONLY (the service 400s any other row type).
  registerAdminRoute(app, {
    method: "PUT",
    url: `${base}/rows/:id/items`,
    schema: {
      params: AdminWallpaperRowIdParams,
      body: AdminWallpaperRowItemsBody,
      response: {
        200: AdminWallpaperRowItemsResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminWallpaperRowIdParamsInput;
        Body: AdminWallpaperRowItemsInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.setRowItems(req, reply);
    },
  });

  // --- single wallpaper (parametric — registered AFTER the `/rows` literals) -

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminWallpaperIdParams,
      response: {
        200: AdminWallpaperDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminWallpaperIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getOne(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminWallpaperIdParams,
      body: AdminWallpaperPatchBody,
      response: {
        200: AdminWallpaperDetailResponse,
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
        Params: AdminWallpaperIdParamsInput;
        Body: AdminWallpaperPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.update(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), reversible via PATCH { isActive: true }.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminWallpaperIdParams,
      body: AdminWallpaperDeleteBody,
      response: {
        200: AdminWallpaperDetailResponse,
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
        Params: AdminWallpaperIdParamsInput;
        Body: AdminWallpaperDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivate(req, reply);
    },
  });
}
