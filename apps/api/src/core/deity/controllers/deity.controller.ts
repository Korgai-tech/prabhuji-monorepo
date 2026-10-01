import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { DeityService } from "@api/core/deity/services";
import type { DeityListQueryInput } from "@api/core/deity/routes/deity.schemas";

/**
 * Thin HTTP boundary for `GET /deities` (TAM-57).
 *
 * JWT-guarded (`authMiddleware` populates `req.user`) for Phase-1 uniformity —
 * deity taxonomy carries no PII or entitlement, but every content surface
 * requires a token (TAM-56 Architecture Constraint). The `!req.user` guard
 * keeps types honest and matches the other modules' controllers.
 */
export class DeityController {
  constructor(private readonly service: DeityService) {}

  list = async (
    req: FastifyRequest<{ Querystring: DeityListQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const { locale, cursor, limit } = req.query;
    // TAM-175 — the JWT subject drives the chip row's "your gods first" order.
    const page = await this.service.listDeities({
      locale,
      cursor,
      limit,
      userId: req.user.id,
    });
    return sendSuccess(reply, page, "OK");
  };
}
