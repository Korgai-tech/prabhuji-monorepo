import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { RingtoneAdminController } from "@api/core/ringtone/controllers";
import type { RingtoneAdminService } from "@api/core/ringtone/services";
import {
  AdminRingtoneCreateBody,
  type AdminRingtoneCreateInput,
  AdminRingtoneDeleteBody,
  type AdminRingtoneDeleteInput,
  AdminRingtoneDetailResponse,
  AdminRingtoneIdParams,
  type AdminRingtoneIdParamsInput,
  AdminRingtoneListQuery,
  type AdminRingtoneListQueryInput,
  AdminRingtoneListResponse,
  AdminRingtonePatchBody,
  type AdminRingtonePatchInput,
  ErrorEnvelope,
} from "./ringtone.admin.schemas.js";

/**
 * The `/admin/ringtones/*` write surface owned by the ringtone module (TAM-94;
 * ADR §B5). Mounted on the module's own `/admin`-prefixed scope by
 * `initRingtoneModule`, deliberately SEPARATE from the public `/ringtones` route
 * — the mobile app's read contract (and its fail-closed Pro gate) must not churn
 * to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json` and
 * therefore out of the mobile Dart codegen). A hand-rolled `r.post("/admin/…")`
 * is a review-blocker and the TAM-82 contract test catches it mechanically.
 *
 * Route prefix `/admin/ringtones` — the ADR module name (`/admin/<module>/…`),
 * matching the deity exemplar's convention.
 */
export function registerRingtoneAdminRoutes(
  app: FastifyInstance,
  service: RingtoneAdminService
): void {
  const controller = new RingtoneAdminController(service);
  const base = "/ringtones";

  // --- collection -----------------------------------------------------------

  registerAdminRoute(app, {
    method: "GET",
    url: base,
    schema: {
      querystring: AdminRingtoneListQuery,
      response: {
        200: AdminRingtoneListResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminRingtoneListQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.list(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: base,
    schema: {
      body: AdminRingtoneCreateBody,
      response: {
        201: AdminRingtoneDetailResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminRingtoneCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    },
  });

  // --- single row -----------------------------------------------------------

  // Returns the FULL row including the Pro-gated `audioUrl` — admin reads are
  // not entitlement-gated (#EXPORT_CRITICAL).
  registerAdminRoute(app, {
    method: "GET",
    url: `${base}/:id`,
    schema: {
      params: AdminRingtoneIdParams,
      response: {
        200: AdminRingtoneDetailResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminRingtoneIdParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getOne(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: `${base}/:id`,
    schema: {
      params: AdminRingtoneIdParams,
      body: AdminRingtonePatchBody,
      response: {
        200: AdminRingtoneDetailResponse,
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
        Params: AdminRingtoneIdParamsInput;
        Body: AdminRingtonePatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.update(req, reply);
    },
  });

  // DELETE = deactivate (`isActive = false`), NEVER a hard delete. Reversible
  // via `PATCH { isActive: true }`.
  registerAdminRoute(app, {
    method: "DELETE",
    url: `${base}/:id`,
    schema: {
      params: AdminRingtoneIdParams,
      body: AdminRingtoneDeleteBody,
      response: {
        200: AdminRingtoneDetailResponse,
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
        Params: AdminRingtoneIdParamsInput;
        Body: AdminRingtoneDeleteInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.deactivate(req, reply);
    },
  });
}
