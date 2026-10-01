import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { FirebaseTokenController } from "@api/core/firebase-tokens/controllers";
import type { FirebaseTokenService } from "@api/core/firebase-tokens/services";
import {
  DeleteFirebaseTokenBody,
  type DeleteFirebaseTokenBodyInput,
  DeleteFirebaseTokenResponse,
  ErrorEnvelope,
  RegisterFirebaseTokenBody,
  type RegisterFirebaseTokenBodyInput,
  RegisterFirebaseTokenResponse,
} from "./firebase-tokens.schemas.js";

/**
 * Register the Firebase Tokens routes under `/firebase-tokens`. Every route is
 * JWT-guarded (`authMiddleware`) — anonymous devices don't sync tokens.
 *
 *   POST /firebase-tokens   — register / refresh the current device's token
 *   DELETE /firebase-tokens — remove the current device's token on logout
 */
export function registerFirebaseTokenRoutes(
  app: FastifyInstance,
  service: FirebaseTokenService
): void {
  const controller = new FirebaseTokenController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/firebase-tokens",
    {
      schema: {
        body: RegisterFirebaseTokenBody,
        response: {
          200: RegisterFirebaseTokenResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: RegisterFirebaseTokenBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.register(req, reply);
    }
  );

  r.delete(
    "/firebase-tokens",
    {
      schema: {
        body: DeleteFirebaseTokenBody,
        response: {
          200: DeleteFirebaseTokenResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: DeleteFirebaseTokenBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.unregister(req, reply);
    }
  );
}
