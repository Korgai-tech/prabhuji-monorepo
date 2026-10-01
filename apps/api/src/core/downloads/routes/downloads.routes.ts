import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { DownloadsController } from "@api/core/downloads/controllers";
import type { DownloadsService } from "@api/core/downloads/services";
import {
  DownloadManifestResponse,
  DownloadPathParams,
  type DownloadPathParamsInput,
  ErrorEnvelope,
} from "./downloads.schemas.js";

/**
 * Register the Downloads routes (TAM-125). The route is JWT-guarded
 * (`authMiddleware`) and Pro-gated inside the service; a free / lapsed caller
 * gets `403 FORBIDDEN` and NO signed URL. The full path is declared here (no
 * nested prefix) so the emitted OpenAPI path is exactly
 * `/content/:type/:id/download`.
 */
export function registerDownloadsRoutes(
  app: FastifyInstance,
  service: DownloadsService
): void {
  const controller = new DownloadsController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/content/:type/:id/download",
    {
      schema: {
        params: DownloadPathParams,
        response: {
          200: DownloadManifestResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          403: ErrorEnvelope,
          404: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Params: DownloadPathParamsInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.getManifest(req, reply);
    }
  );
}
