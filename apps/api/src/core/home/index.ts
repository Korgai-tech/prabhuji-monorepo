import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { HomeRepository } from "@api/core/home/repositories";
import { HomeAdminService, HomeService } from "@api/core/home/services";
import { HomeApi } from "@api/core/home/api";
import {
  registerHomeAdminRoutes,
  registerHomeRoutes,
} from "@api/core/home/routes";

const log = createModuleLogger("home:bootstrap");

/**
 * Composition root for the Home module (TAM-61).
 *
 * Wires the layered dependencies (repo → service → controller/facade), publishes
 * the `IHomeApi` facade into `GlobalServiceMap`, and mounts the `/home/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) ONLY on the `engagement`
 * facade (feed enrichment counts + `likedByMe` and the like/view/share write
 * forwarders) — registered by its own module init in `bootstrap.ts`. There is NO
 * `subscription` dependency: Home ranking + content are identical for free and
 * Pro users (PRD §5, §10), so nothing here consults an entitlement gate.
 */
export function initHomeModule(app: FastifyInstance): void {
  const repo = new HomeRepository();
  const service = new HomeService(repo);
  const adminService = new HomeAdminService(repo);
  const api = new HomeApi(service);
  registerGlobalService("home", api);

  void app.register((scoped) => {
    registerHomeRoutes(scoped, service);
  });

  // TAM-104: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/home/*` routes with a guard bolted on — the mobile
  // read contract must not churn to serve admin. `registerHomeAdminRoutes`
  // declares paths under `/home/…`, so the full paths are `/admin/home/…`.
  // Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerHomeAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("home module initialised");
}
