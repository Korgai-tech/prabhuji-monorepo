import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { PaywallAdminController } from "@api/core/paywall/controllers";
import type { PaywallAdminService } from "@api/core/paywall/services";
import {
  AdminPaywallConfigParams,
  type AdminPaywallConfigParamsInput,
  AdminPaywallConfigPatchBody,
  type AdminPaywallConfigPatchInput,
  AdminPaywallConfigResponse,
  AdminPaywallListResponse,
  ErrorEnvelope,
} from "./paywall.admin.schemas.js";

/**
 * The `/admin/paywall/*` write surface (TAM-159; ADR §B5). Mounted on the
 * module's own `/admin`-prefixed scope by `initPaywallModule`, deliberately
 * SEPARATE from the public `/paywall/config` route — the mobile app's read
 * contract must not churn to serve admin.
 *
 * **Every route goes through `registerAdminRoute`** — it applies
 * `[authMiddleware, adminMiddleware]` (fail-closed) and the `admin` OpenAPI tag
 * (which TAM-85 uses to keep these operations out of `openapi.public.json`). A
 * hand-rolled `r.patch("/admin/…")` is a review-blocker AND fails the
 * `admin-route-guard.contract` test, which enumerates the live route table.
 *
 * TAM-159 replaced TAM-130's singleton `/paywall/config` with a `:paywallId`
 * collection: there are several paywalls now (the A/B variants), and the old
 * PATCH wrote the flat `paywall_translations.video_*` columns, which the wire no
 * longer reads — an editor uploading a hero there would have changed nothing.
 *
 * There is no POST. A new paywall id does nothing until the bucket map in
 * `services/paywall.buckets.ts` routes traffic to it, and that is code — so
 * creation is coupled to a deploy either way and lives in the seed, where it is
 * reviewable, rather than behind a button that produces an unreachable row.
 */
export function registerPaywallAdminRoutes(
  app: FastifyInstance,
  service: PaywallAdminService
): void {
  const controller = new PaywallAdminController(service);

  const collection = "/paywall/configs";
  const item = "/paywall/configs/:paywallId";

  registerAdminRoute(app, {
    method: "GET",
    url: collection,
    schema: {
      response: {
        200: AdminPaywallListResponse,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.listConfigs(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "GET",
    url: item,
    schema: {
      params: AdminPaywallConfigParams,
      response: {
        200: AdminPaywallConfigResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Params: AdminPaywallConfigParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getConfig(req, reply);
    },
  });

  registerAdminRoute(app, {
    method: "PATCH",
    url: item,
    schema: {
      params: AdminPaywallConfigParams,
      body: AdminPaywallConfigPatchBody,
      response: {
        200: AdminPaywallConfigResponse,
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
        Params: AdminPaywallConfigParamsInput;
        Body: AdminPaywallConfigPatchInput;
      }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateConfig(req, reply);
    },
  });
}
