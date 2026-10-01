import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { PinnedContentAdminController } from "@api/core/pinned-content/controllers";
import type { PinnedContentService } from "@api/core/pinned-content/services";
import {
  AdminPinAuditResponse,
  AdminPinCreateBody,
  type AdminPinCreateInput,
  AdminPinDeleteBody,
  type AdminPinDeleteInput,
  AdminPinDetailResponse,
  AdminPinIdParams,
  type AdminPinIdParamsInput,
  AdminPinListQuery,
  type AdminPinListQueryInput,
  AdminPinListResponse,
  AdminPinPatchBody,
  type AdminPinPatchInput,
  AdminPinRestoreBody,
  type AdminPinRestoreInput,
  ErrorEnvelope,
} from "./pinned-content.admin.schemas.js";

/**
 * `/admin/pinned-content/*` write surface (TAM-173). Every route goes through
 * `registerAdminRoute` — it applies the `authMiddleware` + `adminMiddleware`
 * guard pair (fail-closed) and stamps the `admin` OpenAPI tag, which is what
 * TAM-85 uses to keep these operations out of `openapi.public.json`. A
 * hand-rolled `r.route("/admin/…")` here would be an #EXPORT_CRITICAL review
 * blocker (spec § "do not add `isPinned` to any public schema").
 */
export function registerPinnedContentAdminRoutes(
  app: FastifyInstance,
  service: PinnedContentService
): void {
  const controller = new PinnedContentAdminController(service);
  const base = "/pinned-content";

  // --- collection ------------------------------------------------------------

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminPinListQuery,
      response: {
        200: AdminPinListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminPinListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminPinCreateBody,
      response: {
        201: AdminPinDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminPinCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    },
  });

  // --- single row ------------------------------------------------------------

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminPinIdParams,
      response: {
        200: AdminPinDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminPinIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getOne(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminPinIdParams,
      body: AdminPinPatchBody,
      response: {
        200: AdminPinDetailResponse,
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
        Params: AdminPinIdParamsInput;
        Body: AdminPinPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.update(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminPinIdParams,
      body: AdminPinDeleteBody,
      response: {
        200: AdminPinDetailResponse,
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
        Params: AdminPinIdParamsInput;
        Body: AdminPinDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.softDelete(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: `${base}/:id/restore`,
    schema: {
      params: AdminPinIdParams,
      body: AdminPinRestoreBody,
      response: {
        200: AdminPinDetailResponse,
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
        Params: AdminPinIdParamsInput;
        Body: AdminPinRestoreInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.restore(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id/audit`,
    schema: {
      params: AdminPinIdParams,
      response: {
        200: AdminPinAuditResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminPinIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.audit(req, reply);
    },
  });
}
