import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import type { ChatAdminService } from "@api/core/chat/services";
import type { AdminChatTranscriptQueryInput } from "@api/core/chat/routes/chat.admin.schemas";

/**
 * HTTP boundary for `/admin/chat/*`. Orchestration only.
 *
 * It does NOT resolve `req.user`: unlike the mobile controller, the subject of
 * this read is the `userId` in the querystring, not the caller. Who the caller
 * is has already been settled by the `[authMiddleware, adminMiddleware]` pair
 * `registerAdminRoute` applies, and re-checking it here would imply the route
 * could be reached without it.
 */
export class ChatAdminController {
  constructor(private readonly service: ChatAdminService) {}

  getTranscript = async (
    req: FastifyRequest<{ Querystring: AdminChatTranscriptQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const result = await this.service.getTranscript({
      userId: req.query.userId,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return sendSuccess(reply, result, "OK");
  };
}
