import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { SubscriptionService } from "@api/core/subscription/services";

/**
 * Thin HTTP boundary for `GET /subscription/status` (TAM-47).
 *
 * `authMiddleware` (registered as `preHandler` in the route) populates
 * `req.user`; the `!req.user` guard keeps types honest for the service
 * call and matches `users/controllers/users.controller.ts`. There is no
 * request body / query — the endpoint is scoped entirely by the JWT.
 */
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  getStatus = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const data = await this.service.getStatus(req.user.id);
    return sendSuccess(reply, data, "OK");
  };
}
