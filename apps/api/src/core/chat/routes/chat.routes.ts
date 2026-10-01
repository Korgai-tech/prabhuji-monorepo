import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { ChatController } from "@api/core/chat/controllers";
import type { ChatService } from "@api/core/chat/services";
import {
  ChatHistoryQuery,
  ChatHistoryResponse,
  ErrorEnvelope,
  SendMessageBody,
  SendMessageResponse,
  type ChatHistoryQueryInput,
  type SendMessageBodyInput,
} from "./chat.schemas.js";

/**
 * Register the Chat routes. Both are JWT-guarded (`authMiddleware`) — a chat
 * transcript belongs to exactly one user, and there is no anonymous variant.
 * Full paths are declared here (no nested prefix) so the emitted OpenAPI paths
 * are literal.
 */
export function registerChatRoutes(
  app: FastifyInstance,
  service: ChatService
): void {
  const controller = new ChatController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/chat/messages",
    {
      schema: {
        body: SendMessageBody,
        response: {
          200: SendMessageResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          // KULDEVTA_NOT_ASSIGNED — the caller is in the kuldevta arm but has
          // not completed kuldevta-khoj, so there is no deity to speak as.
          // Declared here or the app never learns to route them to the six
          // questions: an undeclared status is absent from the OpenAPI
          // contract and from the generated Dart/TS clients.
          409: ErrorEnvelope,
          500: ErrorEnvelope,
          502: ErrorEnvelope,
          503: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: SendMessageBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.sendMessage(req, reply);
    }
  );

  // The chat screen's opening read. `sessionId` is a QUERY param and optional,
  // so a first-time user with no session can still fetch the config it needs to
  // render — a path param would have forced an id nobody has yet.
  r.get(
    "/chat/history",
    {
      schema: {
        querystring: ChatHistoryQuery,
        response: {
          200: ChatHistoryResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Querystring: ChatHistoryQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getHistory(req, reply);
    }
  );
}
