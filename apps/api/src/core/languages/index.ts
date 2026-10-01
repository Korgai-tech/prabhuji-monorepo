import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { LanguagesService } from "@api/core/languages/services";
import { registerLanguagesRoutes } from "@api/core/languages/routes";

const log = createModuleLogger("languages:bootstrap");

/**
 * Composition root for the languages module.
 *
 * No repository and no facade: the catalogue is `SUPPORTED_LANGUAGES`
 * (`shared/language.schema.ts`) — the same constant `LanguageCodeSchema` derives
 * from — so there is nothing to read from the database and nothing another
 * module needs to reach through `performServiceCall` (they import the constant).
 * The module exists purely to put that constant on the wire so clients stop
 * hardcoding it.
 */
export function initLanguagesModule(app: FastifyInstance): void {
  const service = new LanguagesService();

  // No prefix — `registerLanguagesRoutes` declares the full `/languages` path so
  // the OpenAPI path is exactly `/languages` (not `/languages/`). Still wrapped
  // in a plugin scope for encapsulation, matching the other modules.
  void app.register((scoped) => {
    registerLanguagesRoutes(scoped, service);
  });

  log.info("languages module initialised");
}
