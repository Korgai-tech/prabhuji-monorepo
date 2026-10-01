import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { FirebaseTokenRepository } from "@api/core/firebase-tokens/repositories";
import { FirebaseTokenService } from "@api/core/firebase-tokens/services";
import { registerFirebaseTokenRoutes } from "@api/core/firebase-tokens/routes";

const log = createModuleLogger("firebase-tokens:bootstrap");

/**
 * Composition root for the Firebase Tokens module. Wires the layered
 * dependencies (repo → service → controller) and mounts the
 * `/firebase-tokens` routes. No cross-module facade is published because no
 * other module currently consumes token internals — add one to
 * `src/shared/workspace/context.ts` + `registerGlobalService` here if that
 * changes (e.g. a notification-sender module reading tokens by userId).
 */
export function initFirebaseTokensModule(app: FastifyInstance): void {
  const repo = new FirebaseTokenRepository();
  const service = new FirebaseTokenService(repo);

  void app.register((scoped) => {
    registerFirebaseTokenRoutes(scoped, service);
  });

  log.info("firebase-tokens module initialised");
}
