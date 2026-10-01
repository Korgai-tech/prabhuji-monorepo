import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { ModalsRepository } from "@api/core/modals/repositories";
import { ModalsService } from "@api/core/modals/services";
import { registerModalsRoutes } from "@api/core/modals/routes";

const log = createModuleLogger("modals:bootstrap");

/**
 * Composition root for the generalized modal module (TAM-174).
 *
 * No cross-module facade is published: nothing else in the API asks about
 * modals, and the module deliberately reads no other module's data — in
 * particular NOT `UserStatusProfile`, because having a name and photo saved is
 * not the halt condition. Only an actual share is.
 */
export function initModalsModule(app: FastifyInstance): void {
  const repo = new ModalsRepository();
  const service = new ModalsService(repo);

  void app.register((scoped) => {
    registerModalsRoutes(scoped, service);
  });

  log.info("modals module initialised");
}
