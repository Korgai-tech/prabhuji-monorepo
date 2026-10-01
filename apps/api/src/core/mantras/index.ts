import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { MantrasRepository } from "@api/core/mantras/repositories";
import { MantrasAdminService, MantrasService } from "@api/core/mantras/services";
import { MantrasApi } from "@api/core/mantras/api";
import {
  registerMantrasAdminRoutes,
  registerMantrasRoutes,
} from "@api/core/mantras/routes";

const log = createModuleLogger("mantras:bootstrap");

/**
 * Composition root for the Mantras & Stutis module (TAM-65).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IMantrasApi` facade into `GlobalServiceMap` so sibling modules
 * reference mantra content via `performServiceCall("mantras", …)`, and mounts
 * the `/mantras/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) on the `subscription`
 * (entitlement), `engagement` (counts + likedByMe + like toggle) and `deity`
 * (taxonomy) facades — all registered by their own module inits in
 * `bootstrap.ts`.
 */
export function initMantrasModule(app: FastifyInstance): void {
  const repo = new MantrasRepository();
  const service = new MantrasService(repo);
  const adminService = new MantrasAdminService(repo);
  const api = new MantrasApi(service);
  registerGlobalService("mantras", api);

  void app.register((scoped) => {
    registerMantrasRoutes(scoped, service);
  });

  // TAM-92: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/mantras/*` routes with a guard bolted on — the mobile
  // read contract and its fail-closed Pro gate must not churn to serve admin.
  // `registerMantrasAdminRoutes` declares paths under `/mantras/*`, so the full
  // paths are `/admin/mantras/*`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerMantrasAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("mantras module initialised");
}
