import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { MantrasAdminController } from "@api/core/mantras/controllers";
import type { MantrasAdminService } from "@api/core/mantras/services";
import {
  AdminMantraCategoryCreateBody,
  type AdminMantraCategoryCreateBodyInput,
  AdminMantraCategoryListQuery,
  type AdminMantraCategoryListQueryInput,
  AdminMantraCategoryListResponse,
  AdminMantraCategoryPatchBody,
  type AdminMantraCategoryPatchBodyInput,
  AdminMantraCategoryResponse,
  AdminMantraCategoryTagsBody,
  type AdminMantraCategoryTagsBodyInput,
  AdminMantraDeleteBody,
  type AdminMantraDeleteBodyInput,
  AdminMantraIdParams,
  type AdminMantraIdParamsInput,
  AdminMantraItemCreateBody,
  type AdminMantraItemCreateBodyInput,
  AdminMantraItemDetailResponse,
  AdminMantraItemListQuery,
  type AdminMantraItemListQueryInput,
  AdminMantraItemListResponse,
  AdminMantraItemPatchBody,
  type AdminMantraItemPatchBodyInput,
  AdminMantraSectionCreateBody,
  type AdminMantraSectionCreateBodyInput,
  AdminMantraSectionListQuery,
  type AdminMantraSectionListQueryInput,
  AdminMantraSectionListResponse,
  AdminMantraSectionItemsBody,
  type AdminMantraSectionItemsBodyInput,
  AdminMantraSectionItemsResponse,
  AdminMantraSectionPatchBody,
  type AdminMantraSectionPatchBodyInput,
  AdminMantraSectionResponse,
  ErrorEnvelope,
} from "./mantras.admin.schemas.js";

/**
 * The `/admin/mantras/*` write surface owned by the mantras module (TAM-92;
 * ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initMantrasModule`, deliberately SEPARATE from the public `/mantras/*` routes
 * — the mobile app's read contract must not churn to serve admin, and the public
 * fail-closed Pro gate is untouched.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json`).
 * The route prefix is `/admin/mantras/*`, matching the ADR module name.
 */
export function registerMantrasAdminRoutes(
  app: FastifyInstance,
  service: MantrasAdminService
): void {
  const controller = new MantrasAdminController(service);

  registerCategoryRoutes(app, controller);
  registerItemRoutes(app, controller);
  registerSectionRoutes(app, controller);
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

function registerCategoryRoutes(
  app: FastifyInstance,
  controller: MantrasAdminController
): void {
  const base = "/mantras/categories";

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminMantraCategoryListQuery,
      response: {
        200: AdminMantraCategoryListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminMantraCategoryListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listCategories(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminMantraCategoryCreateBody,
      response: {
        201: AdminMantraCategoryResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminMantraCategoryCreateBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createCategory(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      response: {
        200: AdminMantraCategoryResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminMantraIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getCategory(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraCategoryPatchBody,
      response: {
        200: AdminMantraCategoryResponse,
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
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraCategoryPatchBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateCategory(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), never a hard delete.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraDeleteBody,
      response: {
        200: AdminMantraCategoryResponse,
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
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraDeleteBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateCategory(req, reply);
    },
  });
}

// ---------------------------------------------------------------------------
// audio items
// ---------------------------------------------------------------------------

function registerItemRoutes(
  app: FastifyInstance,
  controller: MantrasAdminController
): void {
  const base = "/mantras/items";

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminMantraItemListQuery,
      response: {
        200: AdminMantraItemListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminMantraItemListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listItems(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminMantraItemCreateBody,
      response: {
        201: AdminMantraItemDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminMantraItemCreateBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      response: {
        200: AdminMantraItemDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminMantraIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraItemPatchBody,
      response: {
        200: AdminMantraItemDetailResponse,
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
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraItemPatchBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraDeleteBody,
      response: {
        200: AdminMantraItemDetailResponse,
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
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraDeleteBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateItem(req, reply);
    },
  });

  // Category tag set-replacement (one `$transaction`) — `category-tags` is a
  // real FK join. TAM-108: the `deity-tags` sub-resource is REMOVED; a mantra's
  // single deity is now the `deitySlug` scalar on the create/patch body.
  registerAdminRoute(app, {
    method: "PUT",
    url: `${base}/:id/category-tags`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraCategoryTagsBody,
      response: {
        200: AdminMantraItemDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraCategoryTagsBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.setCategoryTags(req, reply);
    },
  });
}

// ---------------------------------------------------------------------------
// homepage sections
// ---------------------------------------------------------------------------

function registerSectionRoutes(
  app: FastifyInstance,
  controller: MantrasAdminController
): void {
  const base = "/mantras/sections";

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminMantraSectionListQuery,
      response: {
        200: AdminMantraSectionListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminMantraSectionListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listSections(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminMantraSectionCreateBody,
      response: {
        201: AdminMantraSectionResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminMantraSectionCreateBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createSection(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      response: {
        200: AdminMantraSectionResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminMantraIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getSection(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraSectionPatchBody,
      response: {
        200: AdminMantraSectionResponse,
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
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraSectionPatchBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateSection(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), never a hard delete.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraDeleteBody,
      response: {
        200: AdminMantraSectionResponse,
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
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraDeleteBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateSection(req, reply);
    },
  });

  // TAM-160: curated membership — `curated` sections ONLY (the service 400s any
  // built-in type, whose items resolve server-side).
  registerAdminRoute(app, {
    method: "PUT",
    url: `${base}/:id/items`,
    schema: {
      params: AdminMantraIdParams,
      body: AdminMantraSectionItemsBody,
      response: {
        200: AdminMantraSectionItemsResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminMantraIdParamsInput;
        Body: AdminMantraSectionItemsBodyInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.setSectionItems(req, reply);
    },
  });
}
