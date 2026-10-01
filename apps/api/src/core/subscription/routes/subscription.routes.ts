import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { SubscriptionController } from "@api/core/subscription/controllers";
import type { SubscriptionService } from "@api/core/subscription/services";
import {
  ErrorEnvelope,
  SubscriptionStatusData,
  envelope,
} from "./subscription.schemas.js";

/**
 * Register `GET /subscription/status` (TAM-47).
 *
 * Protected — JWT required (`authMiddleware`); response is scoped to the
 * token's `userId`. No query params, no body — no way to fetch another
 * user's state.
 *
 * The route is mounted at the module root; the composition root's
 * `app.register(..., { prefix: "/subscription" })` provides the
 * `/subscription` prefix so the handler ends up at `/subscription/status`.
 */
export function registerSubscriptionRoutes(
  app: FastifyInstance,
  service: SubscriptionService
): void {
  const controller = new SubscriptionController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/status",
    {
      schema: {
        response: {
          200: envelope(SubscriptionStatusData),
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.getStatus(req, reply);
    }
  );
}
