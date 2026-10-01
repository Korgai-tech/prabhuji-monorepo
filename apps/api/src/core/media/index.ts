import type { FastifyInstance } from "fastify";
import { loadEnv } from "@api/shared/config";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { MediaObjectRepository, S3MediaRepository } from "@api/core/media/repositories";
import { MediaService } from "@api/core/media/services";
import { MediaApi } from "@api/core/media/api";
import { registerMediaAdminRoutes } from "@api/core/media/routes";

const log = createModuleLogger("media:bootstrap");

/**
 * Composition root for the media module (TAM-84).
 *
 * Wires the layered dependencies (S3 repo + ledger repo → service →
 * controller/facade), publishes `IMediaApi` into `GlobalServiceMap` so module
 * admin services call `validateOwnedUrl`/`head` via `performServiceCall("media",
 * …)`, and mounts `POST /admin/media/presign` + `GET /admin/media/status`
 * (TAM-267) on its own `/admin` scope.
 */
export function initMediaModule(app: FastifyInstance): void {
  const env = loadEnv();
  // Trim a trailing slash so `${base}/${key}` never doubles it.
  const publicBaseUrl = env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, "");

  const s3 = new S3MediaRepository(env.MEDIA_BUCKET);
  const ledger = new MediaObjectRepository();
  const service = new MediaService(s3, ledger, publicBaseUrl, {
    optimizeUploads: env.MEDIA_OPTIMIZE_UPLOADS,
  });
  const api = new MediaApi(service);
  registerGlobalService("media", api);

  // Admin surface — a SEPARATE `/admin` scope (ADR §B5), registered via
  // registerAdminRoute so the guard pair + `admin` tag are applied centrally.
  void app.register(
    (scoped) => {
      registerMediaAdminRoutes(scoped, service);
    },
    { prefix: "/admin" }
  );

  log.info("media module initialised");
}
