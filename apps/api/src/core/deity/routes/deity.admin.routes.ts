import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { DeityAdminController } from "@api/core/deity/controllers";
import type { DeityAdminService } from "@api/core/deity/services";
import {
  AdminDeityCreateBody,
  type AdminDeityCreateInput,
  AdminDeityDeleteBody,
  type AdminDeityDeleteInput,
  AdminDeityDetailResponse,
  AdminDeityIdParams,
  type AdminDeityIdParamsInput,
  AdminDeityListQuery,
  type AdminDeityListQueryInput,
  AdminDeityListResponse,
  AdminDeityPatchBody,
  type AdminDeityPatchInput,
  ErrorEnvelope,
} from "./deity.admin.schemas.js";

/**
 * The `/admin/taxonomy/*` write surface owned by the deity module (TAM-88;
 * ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initDeityModule`, deliberately SEPARATE from the public `/deities` route —
 * the mobile app's read contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json` and
 * therefore out of the mobile Dart codegen). A hand-rolled `r.post("/admin/…")`
 * is a review-blocker and the TAM-82 contract test catches it mechanically.
 *
 * **EXEMPLAR**: the route prefix is `/admin/taxonomy/deities` — `taxonomy` is
 * the ADR's module name (the code module is `core/deity`), matching the UI
 * route tree `/taxonomy/deities`. Sibling module tickets use `/admin/<module>/…`
 * with the ADR's module name (e.g. `/admin/aarti/…`).
 */
export function registerDeityAdminRoutes(
  app: FastifyInstance,
  service: DeityAdminService
): void {
  const controller = new DeityAdminController(service);
  const base = "/taxonomy/deities";

  // --- collection -----------------------------------------------------------

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminDeityListQuery,
      response: {
        200: AdminDeityListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminDeityListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminDeityCreateBody,
      response: {
        201: AdminDeityDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminDeityCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    },
  });

  // --- single row -----------------------------------------------------------

  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminDeityIdParams,
      response: {
        200: AdminDeityDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminDeityIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getOne(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminDeityIdParams,
      body: AdminDeityPatchBody,
      response: {
        200: AdminDeityDetailResponse,
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
        Params: AdminDeityIdParamsInput;
        Body: AdminDeityPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.update(req, reply);
    },
  });

  // DELETE = deactivate (`active = false`), NEVER a hard delete (ADR §C4).
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminDeityIdParams,
      body: AdminDeityDeleteBody,
      response: {
        200: AdminDeityDetailResponse,
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
        Params: AdminDeityIdParamsInput;
        Body: AdminDeityDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivate(req, reply);
    },
  });

  // Label translations are NOT a sub-resource: they ride in the deity create /
  // patch body (`translations`) and are returned on the detail view, matching
  // the five content modules — the admin is a single-author publishing tool.
}
