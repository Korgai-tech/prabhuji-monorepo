import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registerAdminRoute } from "@api/core/auth/routes";
import { MediaAdminController } from "@api/core/media/controllers";
import type { MediaService } from "@api/core/media/services";
import {
  ErrorEnvelope,
  MediaStatusData,
  MediaStatusQuery,
  PresignBody,
  PresignData,
  envelope,
} from "./media.admin.schemas.js";

/**
 * The `/admin/media/*` surface (TAM-84; `status` TAM-267). Mounted on its own `/admin`-prefixed
 * scope by `initMediaModule`.
 *
 * Registered via `registerAdminRoute` (TAM-82), so `[authMiddleware,
 * adminMiddleware]` + the `admin` tag are applied centrally and cannot be
 * forgotten — the guard contract test enumerates the live route table and would
 * fail if this path escaped the pair.
 */
export function registerMediaAdminRoutes(app: FastifyInstance, service: MediaService): void {
  const controller = new MediaAdminController(service);

  registerAdminRoute(app, {
    method: "POST",
    url: "/media/presign",
    schema: {
      body: PresignBody,
      response: {
        201: envelope(PresignData),
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.presign(req, reply);
    },
  });

  // TAM-267: polled by the CMS after a `processing: true` presign, until the
  // media optimizer has written the final key. Same guard pair + `admin` tag.
  registerAdminRoute(app, {
    method: "GET",
    url: "/media/status",
    schema: {
      querystring: MediaStatusQuery,
      response: {
        200: envelope(MediaStatusData),
        400: ErrorEnvelope,
        401: ErrorEnvelope,
        403: ErrorEnvelope,
        500: ErrorEnvelope,
      },
    },
    handler: async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      await controller.status(req, reply);
    },
  });
}
