import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { AartiAdminController } from "@api/core/aarti/controllers";
import type { AartiAdminService } from "@api/core/aarti/services";
import {
  AdminAartiIdParams,
  type AdminAartiIdParamsInput,
  AdminAudioCategoryCreateBody,
  type AdminAudioCategoryCreateInput,
  AdminAudioCategoryDeleteBody,
  type AdminAudioCategoryDeleteInput,
  AdminAudioCategoryListQuery,
  type AdminAudioCategoryListQueryInput,
  AdminAudioCategoryListResponse,
  AdminAudioCategoryPatchBody,
  type AdminAudioCategoryPatchInput,
  AdminAudioCategoryResponse,
  AdminAudioCategoryTagsBody,
  type AdminAudioCategoryTagsInput,
  AdminAudioItemCreateBody,
  type AdminAudioItemCreateInput,
  AdminAudioItemDeleteBody,
  type AdminAudioItemDeleteInput,
  AdminAudioItemListQuery,
  type AdminAudioItemListQueryInput,
  AdminAudioItemListResponse,
  AdminAudioItemPatchBody,
  type AdminAudioItemPatchInput,
  AdminAudioItemResponse,
  AdminHomepageSectionCreateBody,
  type AdminHomepageSectionCreateInput,
  AdminHomepageSectionDeleteBody,
  type AdminHomepageSectionDeleteInput,
  AdminHomepageSectionItemsBody,
  type AdminHomepageSectionItemsInput,
  AdminHomepageSectionItemsResponse,
  AdminHomepageSectionListQuery,
  type AdminHomepageSectionListQueryInput,
  AdminHomepageSectionListResponse,
  AdminHomepageSectionPatchBody,
  type AdminHomepageSectionPatchInput,
  AdminHomepageSectionResponse,
  ErrorEnvelope,
} from "./aarti.admin.schemas.js";

/**
 * The `/admin/aarti/*` write surface owned by the aarti module (TAM-90;
 * ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initAartiModule`, deliberately SEPARATE from the public `/aarti/*` routes —
 * the mobile app's read contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json`). A
 * hand-rolled `r.post("/admin/…")` is a review-blocker.
 *
 * Route prefix `/admin/aarti/<entity>` — `aarti` is the ADR's module name,
 * matching the TAM-88 exemplar's `/admin/<module>/…` convention.
 */
export function registerAartiAdminRoutes(
  app: FastifyInstance,
  service: AartiAdminService
): void {
  const controller = new AartiAdminController(service);

  // =======================================================================
  // AudioCategory — /admin/aarti/categories
  // =======================================================================

  const categories = "/aarti/categories";

  registerAdminRoute(app, {
    method: "GET",
    url: categories,
    schema: {
      querystring: AdminAudioCategoryListQuery,
      response: {
        200: AdminAudioCategoryListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminAudioCategoryListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listCategories(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: categories,
    schema: {
      body: AdminAudioCategoryCreateBody,
      response: {
        201: AdminAudioCategoryResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminAudioCategoryCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createCategory(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${categories}/:id`,
    schema: {
      params: AdminAartiIdParams,
      response: {
        200: AdminAudioCategoryResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminAartiIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getCategory(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${categories}/:id`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminAudioCategoryPatchBody,
      response: {
        200: AdminAudioCategoryResponse,
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
        Params: AdminAartiIdParamsInput;
        Body: AdminAudioCategoryPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateCategory(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), NEVER a hard delete (ADR §C4).
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${categories}/:id`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminAudioCategoryDeleteBody,
      response: {
        200: AdminAudioCategoryResponse,
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
        Params: AdminAartiIdParamsInput;
        Body: AdminAudioCategoryDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateCategory(req, reply);
    },
  });

  // TAM-109: the `/admin/aarti/categories/:id/translations` sub-resource is
  // REMOVED — label translations now ride in the category create/patch body.

  // =======================================================================
  // AudioItem — /admin/aarti/items
  // =======================================================================

  const items = "/aarti/items";

  registerAdminRoute(app, {
    method: "GET",
    url: items,
    schema: {
      querystring: AdminAudioItemListQuery,
      response: {
        200: AdminAudioItemListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminAudioItemListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listItems(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: items,
    schema: {
      body: AdminAudioItemCreateBody,
      response: {
        201: AdminAudioItemResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminAudioItemCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${items}/:id`,
    schema: {
      params: AdminAartiIdParams,
      response: {
        200: AdminAudioItemResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminAartiIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getItem(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${items}/:id`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminAudioItemPatchBody,
      response: {
        200: AdminAudioItemResponse,
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
        Params: AdminAartiIdParamsInput;
        Body: AdminAudioItemPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateItem(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), NEVER a hard delete (ADR §C4).
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${items}/:id`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminAudioItemDeleteBody,
      response: {
        200: AdminAudioItemResponse,
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
        Params: AdminAartiIdParamsInput;
        Body: AdminAudioItemDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateItem(req, reply);
    },
  });

  // --- tags: full-set replacement (PUT), one $transaction each (ADR §C4) ----

  registerAdminRoute(app, {
    method: "PUT",
    url: `${items}/:id/category-tags`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminAudioCategoryTagsBody,
      response: {
        200: AdminAudioItemResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminAartiIdParamsInput;
        Body: AdminAudioCategoryTagsInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.setCategoryTags(req, reply);
    },
  });

  // TAM-108: the `PUT /admin/aarti/items/:id/deity-tags` sub-resource is REMOVED —
  // deity is now the scalar `deitySlug` field on the create/patch body.

  // =======================================================================
  // HomepageSection — /admin/aarti/sections
  // =======================================================================

  const sections = "/aarti/sections";

  registerAdminRoute(app, {
    method: "GET",
    url: sections,
    schema: {
      querystring: AdminHomepageSectionListQuery,
      response: {
        200: AdminHomepageSectionListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminHomepageSectionListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.listSections(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: sections,
    schema: {
      body: AdminHomepageSectionCreateBody,
      response: {
        201: AdminHomepageSectionResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminHomepageSectionCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.createSection(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${sections}/:id`,
    schema: {
      params: AdminAartiIdParams,
      response: {
        200: AdminHomepageSectionResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminAartiIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getSection(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${sections}/:id`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminHomepageSectionPatchBody,
      response: {
        200: AdminHomepageSectionResponse,
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
        Params: AdminAartiIdParamsInput;
        Body: AdminHomepageSectionPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateSection(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`); hides the section from `/aarti/main`.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${sections}/:id`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminHomepageSectionDeleteBody,
      response: {
        200: AdminHomepageSectionResponse,
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
        Params: AdminAartiIdParamsInput;
        Body: AdminHomepageSectionDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivateSection(req, reply);
    },
  });

  // TAM-160: curated items — `curated` sections ONLY (the service 400s any
  // built-in section type). Full-set replace, so no `expectedUpdatedAt`.
  registerAdminRoute(app, {
    method: "PUT",
    url: `${sections}/:id/items`,
    schema: {
      params: AdminAartiIdParams,
      body: AdminHomepageSectionItemsBody,
      response: {
        200: AdminHomepageSectionItemsResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{
        Params: AdminAartiIdParamsInput;
        Body: AdminHomepageSectionItemsInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.setSectionItems(req, reply);
    },
  });

  // TAM-109: the `/admin/aarti/sections/:id/translations` sub-resource is
  // REMOVED — label translations now ride in the section create/patch body.
}
