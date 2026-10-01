import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import type { SubscriptionCancelRequestService } from "@api/core/subscription/services";

interface CreateBody {
  reason?: string;
}

/**
 * Thin HTTP boundary for the cancellation-request endpoints (TAM-125).
 *
 * `authMiddleware` (registered as `preHandler` on both routes) populates
 * `req.user`; the `!req.user` guard is redundant at runtime but keeps types
 * honest for the service call and matches every other controller in this
 * repo.
 *
 * Neither method accepts a `userId` — the caller acts on their own row,
 * scoped entirely by the JWT.
 */
export class SubscriptionCancelRequestController {
  constructor(private readonly service: SubscriptionCancelRequestService) {}

  create = async (
    req: FastifyRequest<{ Body: CreateBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const data = await this.service.createRequest({
      userId: req.user.id,
      reason: req.body?.reason ?? null,
    });
    return sendSuccess(reply, data, "Cancellation request raised", 201);
  };

  getMineLatest = async (
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const data = await this.service.getLatestForUser(req.user.id);
    return sendSuccess(reply, data, "OK");
  };
}
