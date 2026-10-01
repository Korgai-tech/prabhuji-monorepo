import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { registerGlobalService } from "@api/shared/workspace";
import { ChatApi } from "@api/core/chat/api";
import {
  ChatAdminRepository,
  ChatRepository,
  ContentRepository,
} from "@api/core/chat/repositories";
import { ChatAdminService, ChatService } from "@api/core/chat/services";
import { registerChatAdminRoutes, registerChatRoutes } from "@api/core/chat/routes";

const log = createModuleLogger("chat:bootstrap");

/**
 * Composition root for the Chat module (RAGFlow-backed assistant).
 *
 * Registers `IChatApi` so `core/users` can publish the user's chat config on
 * `GET /users/me`. No ordering constraint: the facade is resolved at REQUEST
 * time, by which point every module has registered.
 *
 * The RAGFlow client is deliberately NOT constructed here. It is built lazily
 * inside the service on the first message so a deployment without credentials
 * (local, CI, the OpenAPI emitter) boots normally and fails with a 503 on the
 * one endpoint that needs them.
 *
 * The CMS transcript viewer is wired as its own service on its own repository
 * and its own `/admin`-prefixed scope. Nothing is shared with the conversation
 * path but the tables — see `ChatAdminRepository` for why the two repositories
 * are separate.
 */
export function initChatModule(app: FastifyInstance): void {
  const repo = new ChatRepository();
  const service = new ChatService(repo, new ContentRepository());
  registerGlobalService("chat", new ChatApi(service));

  void app.register((scoped) => {
    registerChatRoutes(scoped, service);
  });

  // Admin read surface — a SEPARATE `/admin`-prefixed scope, matching the
  // TAM-88 exemplar. Every route inside goes through `registerAdminRoute`.
  void app.register(
    (scoped) => {
      registerChatAdminRoutes(
        scoped,
        // The SAME catalogue repository the conversation path uses, so a
        // recommendation resolves to the same title in the CMS as in the app.
        new ChatAdminService(new ChatAdminRepository(), new ContentRepository())
      );
    },
    { prefix: "/admin" }
  );

  log.info("chat module initialised");
}
