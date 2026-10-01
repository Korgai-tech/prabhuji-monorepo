import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { LanguagesController } from "@api/core/languages/controllers";
import type { LanguagesService } from "@api/core/languages/services";
import {
  ErrorEnvelope,
  LanguageCatalogResponse,
} from "./languages.schemas.js";

/**
 * Register `GET /languages` — the supported content languages + the default.
 *
 * The full path is declared here (no nested prefix) so the emitted OpenAPI path
 * is exactly `/languages`.
 *
 * DELIBERATELY UNAUTHENTICATED — no `preHandler: authMiddleware`. Auth is opt-in
 * per route in this codebase, and this is static reference data with no user
 * scope: the app needs it to render the onboarding language picker, and making
 * it depend on token state would couple the picker to auth timing for nothing.
 */
export function registerLanguagesRoutes(
  app: FastifyInstance,
  service: LanguagesService
): void {
  const controller = new LanguagesController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/languages",
    {
      schema: {
        response: {
          200: LanguageCatalogResponse,
          500: ErrorEnvelope,
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.list(req, reply);
    }
  );
}
