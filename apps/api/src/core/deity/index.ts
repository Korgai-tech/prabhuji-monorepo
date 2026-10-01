import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { DeityRepository } from "@api/core/deity/repositories";
import { DeityAdminService, DeityService } from "@api/core/deity/services";
import { DeityApi } from "@api/core/deity/api";
import {
  registerDeityAdminRoutes,
  registerDeityRoutes,
} from "@api/core/deity/routes";

const log = createModuleLogger("deity:bootstrap");

/**
 * Composition root for the deity module (TAM-57).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IDeityApi` facade into `GlobalServiceMap` so content modules
 * validate a deity tag via `performServiceCall("deity", …)`, and mounts
 * `GET /deities`.
 */
export function initDeityModule(app: FastifyInstance): void {
  const repo = new DeityRepository();
  const service = new DeityService(repo);
  const adminService = new DeityAdminService(repo);
  const api = new DeityApi(service);
  registerGlobalService("deity", api);

  // No prefix — `registerDeityRoutes` declares the full `/deities` path so the
  // OpenAPI path is exactly `/deities` (not `/deities/`). Still wrapped in a
  // plugin scope for encapsulation, matching the other modules.
  void app.register((scoped) => {
    registerDeityRoutes(scoped, service);
  });

  // TAM-88: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/deities` route with a guard bolted on — the mobile
  // read contract must not churn to serve admin. `registerDeityAdminRoutes`
  // declares paths under `/taxonomy/deities`, so the full paths are
  // `/admin/taxonomy/deities…`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerDeityAdminRoutes(scoped, adminService);
    },
    { prefix: "/admin" }
  );

  log.info("deity module initialised");
}
