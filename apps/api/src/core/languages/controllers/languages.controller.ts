import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { LanguagesService } from "@api/core/languages/services";

/**
 * Thin HTTP boundary for `GET /languages`.
 *
 * UNAUTHENTICATED (no `authMiddleware` on the route) — static reference data
 * with no user scope, so the app can fetch it without depending on token state.
 * Hence no `req.user` guard here, unlike every content controller.
 */
export class LanguagesController {
  constructor(private readonly service: LanguagesService) {}

  list = async (
    _req: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    return sendSuccess(reply, this.service.list(), "OK");
  };
}
