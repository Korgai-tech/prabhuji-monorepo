import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { SubscriptionCancelRequestController } from "@api/core/subscription/controllers";
import type { SubscriptionCancelRequestService } from "@api/core/subscription/services";
import {
  CancellationRequestData,
  CreateCancellationRequestBody,
  ErrorEnvelope,
  envelope,
} from "./subscription-cancel-request.schemas.js";

/**
 * Register the two cancellation-request routes (TAM-125):
 *
 *   POST /subscription/cancel-requests   — cancel: record, then revoke.
 *   GET  /subscription/cancel-requests/me — the caller's latest, or null.
 *
 * The POST revokes at the payment gateway inline and returns a `completed`
 * row; it is no longer the enqueue-only endpoint its name suggests. The name
 * and shape are kept EXACTLY as they were on purpose — this is the endpoint
 * the shipped app already calls, and changing either would need a release.
 *
 * Both are JWT-scoped (`authMiddleware`); neither takes a `userId` — the
 * caller acts on their own row. The composition root's
 * `app.register(..., { prefix: "/subscription" })` provides the `/subscription`
 * prefix so the handlers land at `/subscription/cancel-requests[/me]`.
 */
export function registerSubscriptionCancelRequestRoutes(
  app: FastifyInstance,
  service: SubscriptionCancelRequestService
): void {
  const controller = new SubscriptionCancelRequestController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/cancel-requests",
    {
      schema: {
        body: CreateCancellationRequestBody,
        response: {
          201: envelope(CancellationRequestData),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          409: ErrorEnvelope,
          // The gateway refused the revoke. Matches
          // `POST /payment/mandate/cancel`, which this endpoint now drives.
          502: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: { reason?: string } }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    }
  );

  r.get(
    "/cancel-requests/me",
    {
      schema: {
        response: {
          // Nullable: "has never raised a request" is a normal state the client
          // renders as "no active cancellation", not an error. Matches
          // `GET /payment/mandate`'s null-vs-404 decision.
          200: envelope(CancellationRequestData.nullable()),
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.getMineLatest(req, reply);
    }
  );
}
