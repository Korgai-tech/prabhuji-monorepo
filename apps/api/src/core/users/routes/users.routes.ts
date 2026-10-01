import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { UsersController } from "@api/core/users/controllers";
import type { UsersService } from "@api/core/users/services";
import type { UpdateMeInput } from "@api/core/users/types";
import {
  ErrorEnvelope,
  MeResponse,
  UpdateMeRequest,
  UpdateMeResponse,
  envelope,
} from "./users.schemas.js";

export function registerUsersRoutes(
  app: FastifyInstance,
  service: UsersService
): void {
  const controller = new UsersController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Both routes are protected — every request must carry a valid JWT.
  // Controllers resolve `reply.send()` and return `FastifyReply` for
  // internal consistency; the Zod-aware handler type infers its return
  // from the `response` schema, so return `void` here instead.
  r.get(
    "/me",
    {
      schema: {
        response: {
          200: envelope(MeResponse),
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.getMe(req, reply);
    }
  );

  r.patch(
    "/me",
    {
      schema: {
        body: UpdateMeRequest,
        response: {
          200: envelope(UpdateMeResponse),
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: UpdateMeInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.updateMe(req, reply);
    }
  );
}
