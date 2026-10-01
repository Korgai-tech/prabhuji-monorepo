import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { PaywallController } from "@api/core/paywall/controllers";
import type { PaywallService } from "@api/core/paywall/services";
import {
  ErrorEnvelope,
  PaywallConfigData,
  PaywallConfigQuery,
  type PaywallConfigQueryInput,
  envelope,
} from "./paywall.schemas.js";

/**
 * Register `GET /paywall/config?locale=<code>` (TAM-45).
 *
 * Protected — the config isn't secret, but requiring a JWT keeps random
 * scraping off the CMS surface and gives us a hook for Phase 2 per-user
 * segmentation (see spec #PATH_DECISION).
 *
 * The route is mounted at the module root; the composition root's
 * `app.register(..., { prefix: "/paywall" })` provides the `/paywall`
 * prefix so this handler ends up at `/paywall/config`.
 */
export function registerPaywallRoutes(
  app: FastifyInstance,
  service: PaywallService
): void {
  const controller = new PaywallController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/config",
    {
      schema: {
        querystring: PaywallConfigQuery,
        response: {
          200: envelope(PaywallConfigData),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: PaywallConfigQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getConfig(req, reply);
    }
  );
}
