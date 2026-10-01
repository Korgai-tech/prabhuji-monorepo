import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@api/shared/errors";
import { sendSuccess } from "@api/shared/response";
import type { ChatService } from "@api/core/chat/services";
import type {
  ChatHistoryQueryInput,
  SendMessageBodyInput,
} from "@api/core/chat/routes/chat.schemas";

/**
 * Thin HTTP boundary for the Chat module. Orchestration only — resolves the JWT
 * subject and delegates; session ownership, the agent allowlist and the
 * provider call all live in the service.
 */
export class ChatController {
  constructor(private readonly service: ChatService) {}

  sendMessage = async (
    req: FastifyRequest<{ Body: SendMessageBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const result = await this.service.sendMessage({
      userId,
      message: req.body.message,
      agentId: req.body.agentId,
      ...(req.body.sessionId ? { sessionId: req.body.sessionId } : {}),
    });
    return sendSuccess(reply, result, "OK");
  };

  getHistory = async (
    req: FastifyRequest<{ Querystring: ChatHistoryQueryInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const userId = this.requireUserId(req);
    const history = await this.service.getHistory({
      userId,
      ...(req.query.sessionId ? { sessionId: req.query.sessionId } : {}),
      ...(req.query.cursor ? { cursor: req.query.cursor } : {}),
      limit: req.query.limit,
    });
    return sendSuccess(reply, history, "OK");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
