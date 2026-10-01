import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { RingtoneRepository } from "@api/core/ringtone/repositories";
import { RingtoneAdminService, RingtoneService } from "@api/core/ringtone/services";
import { RingtoneApi } from "@api/core/ringtone/api";
import {
  registerRingtoneAdminRoutes,
  registerRingtoneRoutes,
} from "@api/core/ringtone/routes";

const log = createModuleLogger("ringtone:bootstrap");

/**
 * Composition root for the Ringtone module (TAM-67).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IRingtoneApi` facade into `GlobalServiceMap` so sibling modules
 * (e.g. a cross-module share sheet) reference ringtone content via
 * `performServiceCall("ringtone", …)`, and mounts the `/ringtones/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) on the `subscription`
 * (entitlement), `engagement` (like/share counts + likedByMe + like toggle) and
 * `deity` (taxonomy display names) facades — all registered by their own module
 * inits in `bootstrap.ts`.
 */
export function initRingtoneModule(app: FastifyInstance): void {
  const repo = new RingtoneRepository();
  const service = new RingtoneService(repo);
  const adminService = new RingtoneAdminService(repo);
  const api = new RingtoneApi(service);
  registerGlobalService("ringtone", api);

  void app.register((scoped) => {
    registerRingtoneRoutes(scoped, service);
  });

  // TAM-94: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/ringtones` route with a guard bolted on — the mobile
  // read contract and its fail-closed Pro gate must not churn to serve admin.
  // `registerRingtoneAdminRoutes` declares paths under `/ringtones`, so the full
  // paths are `/admin/ringtones…`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerRingtoneAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("ringtone module initialised");
}
