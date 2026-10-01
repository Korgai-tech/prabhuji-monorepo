import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AartiRepository } from "@api/core/aarti/repositories";
import { AartiAdminService, AartiService } from "@api/core/aarti/services";
import { AartiApi } from "@api/core/aarti/api";
import {
  registerAartiAdminRoutes,
  registerAartiRoutes,
} from "@api/core/aarti/routes";

const log = createModuleLogger("aarti:bootstrap");

/**
 * Composition root for the Aarti & Bhajans module (TAM-63).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IAartiApi` facade into `GlobalServiceMap` so sibling modules
 * (Home/TAM-61) reference aarti content via `performServiceCall("aarti", …)`,
 * and mounts the `/aarti/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) on the `subscription`
 * (entitlement), `engagement` (counts + likedByMe) and `deity` (taxonomy)
 * facades — all registered by their own module inits in `bootstrap.ts`.
 */
export function initAartiModule(app: FastifyInstance): void {
  const repo = new AartiRepository();
  const service = new AartiService(repo);
  const adminService = new AartiAdminService(repo);
  const api = new AartiApi(service);
  registerGlobalService("aarti", api);

  void app.register((scoped) => {
    registerAartiRoutes(scoped, service);
  });

  // TAM-90: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/aarti/*` routes with a guard bolted on — the mobile
  // read contract must not churn to serve admin. `registerAartiAdminRoutes`
  // declares paths under `/aarti/<entity>`, so the full paths are
  // `/admin/aarti/…`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerAartiAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("aarti module initialised");
}
