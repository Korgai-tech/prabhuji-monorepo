import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { PaywallUtmOverrideAdminController } from "@api/core/paywall/controllers";
import type { PaywallUtmOverrideAdminService } from "@api/core/paywall/services";
import { ErrorEnvelope } from "./paywall.admin.schemas.js";
import {
  AdminUtmOverrideCreateBody,
  type AdminUtmOverrideCreateInput,
  AdminUtmOverrideDeleteResponse,
  AdminUtmOverrideListResponse,
  AdminUtmOverrideParams,
  type AdminUtmOverrideParamsInput,
  AdminUtmOverridePatchBody,
  type AdminUtmOverridePatchInput,
  AdminUtmOverrideResponse,
} from "./paywall-utm-override.admin.schemas.js";

/**
 * `/admin/paywall/utm-overrides/*` — full CRUD, mounted on the paywall module's
 * `/admin` scope beside the config routes.
 *
 * **Every route goes through `registerAdminRoute`**, which applies
 * `[authMiddleware, adminMiddleware]` and the `admin` OpenAPI tag. A hand-rolled
 * `app.post("/admin/…")` fails the `admin-route-guard.contract` test.
 *
 * Unlike `/admin/paywall/configs`, this surface HAS a POST and a DELETE. That
 * is not drift: a paywall id is inert until `paywall.buckets.ts` routes traffic
 * to it, so creating one from a button yields an unreachable row — whereas an
 * override row is self-contained data keyed on a string the ad platform already
 * owns, and it takes effect the moment it exists.
 */
export function registerPaywallUtmOverrideAdminRoutes(
  app: FastifyInstance,
  service: PaywallUtmOverrideAdminService
): void {
  const controller = new PaywallUtmOverrideAdminController(service);

  const collection = "/paywall/utm-overrides";
  const item = "/paywall/utm-overrides/:id";

  registerAdminRoute(app, {
    method: "GET",
    url: collection,
    schema: {
      response: {
        200: AdminUtmOverrideListResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.list(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "POST",
    url: collection,
    schema: {
      body: AdminUtmOverrideCreateBody,
      response: {
        201: AdminUtmOverrideResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        409: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Body: AdminUtmOverrideCreateInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: item,
    schema: {
      params: AdminUtmOverrideParams,
      response: {
        200: AdminUtmOverrideResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminUtmOverrideParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.get(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: item,
    schema: {
      params: AdminUtmOverrideParams,
      body: AdminUtmOverridePatchBody,
      response: {
        200: AdminUtmOverrideResponse,
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
        Params: AdminUtmOverrideParamsInput;
        Body: AdminUtmOverridePatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.update(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "DELETE",
    url: item,
    schema: {
      params: AdminUtmOverrideParams,
      response: {
        200: AdminUtmOverrideDeleteResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminUtmOverrideParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.remove(req, reply);
    },
  });
}
