import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { ChatAdminController } from "@api/core/chat/controllers";
import type { ChatAdminService } from "@api/core/chat/services";
import {
  AdminChatTranscriptQuery,
  type AdminChatTranscriptQueryInput,
  AdminChatTranscriptResponse,
  ErrorEnvelope,
} from "./chat.admin.schemas.js";

/**
 * `/admin/chat/*` — the CMS chat-transcript viewer. READ ONLY.
 *
 * Registered through `registerAdminRoute`, which applies
 * `[authMiddleware, adminMiddleware]` with no opt-out and stamps the `admin`
 * OpenAPI tag. Both halves matter here: the guard is what stops any holder of a
 * phone-OTP token from reading a stranger's conversations, and the tag is what
 * keeps these schemas out of `openapi.public.json` and therefore out of the
 * APK — the tag⇔path invariant in `pnpm check:openapi` fails the build if this
 * route is ever tagged or mounted only halfway.
 *
 * There is no write route and there must never be one: chat rows are immutable
 * by design (`ChatMessage` carries no `updatedAt`), so an admin edit would be a
 * silent rewrite of a record someone may later be asked to trust.
 */
export function registerChatAdminRoutes(
  app: FastifyInstance,
  service: ChatAdminService
): void {
  const controller = new ChatAdminController(service);

  registerAdminRoute(app, {
    method: "GET",
    url: "/chat/transcript",
    schema: {
      querystring: AdminChatTranscriptQuery,
      response: {
        200: AdminChatTranscriptResponse,
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        // No such user. Declared so the CMS can tell a mistyped id from a user
        // who has simply never chatted — see `AdminChatUser`.
        404: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (
      req: FastifyRequest<{ Querystring: AdminChatTranscriptQueryInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getTranscript(req, reply);
    },
  });
}
