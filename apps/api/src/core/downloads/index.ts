import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { DownloadsService } from "@api/core/downloads/services";
import { registerDownloadsRoutes } from "@api/core/downloads/routes";

const log = createModuleLogger("downloads:bootstrap");

/**
 * Composition root for the Downloads module (TAM-125).
 *
 * The module owns no repository (Phase 1: no downloads registry table — see
 * spec #PATH_DECISION on device-local index vs DB registry). All data lookups
 * are cross-module via `performServiceCall`:
 *   - `aarti`   → `IAartiApi.getDownloadSource(id, type)`   (aarti + bhajan)
 *   - `mantras` → `IMantrasApi.getDownloadSource(id)`       (mantra)
 *   - `media`   → `IMediaApi.presignGet(objectKey, ttlSeconds)`
 *
 * No `IDownloadsApi` facade is registered in Phase 1 — no other module calls
 * INTO downloads (per spec §Scaffold `api/downloads.api.ts` note). Phase 2 may
 * add one for the "restore downloads" affordance if a device-server sync lands
 * (open question q2).
 *
 * MUST init AFTER `media`, `aarti`, `mantras` in `src/modules.ts` — those
 * facades are resolved at REQUEST time via `performServiceCall`, which throws
 * `SERVICE_UNAVAILABLE` if the callee is not yet registered. See the TAM-47
 * ordering note in `modules.ts` for the same hazard.
 */
export function initDownloadsModule(app: FastifyInstance): void {
  const service = new DownloadsService();

  void app.register((scoped) => {
    registerDownloadsRoutes(scoped, service);
  });

  log.info("downloads module initialised");
}
