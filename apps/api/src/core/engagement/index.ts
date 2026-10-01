import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { EngagementRepository } from "@api/core/engagement/repositories";
import { EngagementService } from "@api/core/engagement/services";
import { EngagementApi } from "@api/core/engagement/api";

const log = createModuleLogger("engagement:bootstrap");

/**
 * Composition root for the engagement module (TAM-57).
 *
 * Facade-first: this module ships NO public HTTP routes in Phase 1 — it wires
 * the layered dependencies (repo → service → facade) and publishes the
 * `IEngagementApi` facade into `GlobalServiceMap` so content modules record
 * likes/views/shares via `performServiceCall("engagement", …)`. Each module
 * ticket adds its own route that delegates here if it needs one.
 *
 * Takes no `app` — nothing to mount.
 */
export function initEngagementModule(): void {
  const repo = new EngagementRepository();
  const service = new EngagementService(repo);
  const api = new EngagementApi(service);
  registerGlobalService("engagement", api);

  log.info("engagement module initialised");
}
