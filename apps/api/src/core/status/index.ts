import type { FastifyInstance } from "fastify";
import { registerGlobalService } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import {
  StatusAnalyticsWarehouseRepository,
  StatusPerformanceRepository,
  StatusRepository,
  closeStatusWarehouseClient,
} from "@api/core/status/repositories";
import {
  StatusAdminService,
  StatusPerformanceService,
  StatusService,
} from "@api/core/status/services";
import { StatusApi } from "@api/core/status/api";
import {
  registerStatusAdminRoutes,
  registerStatusPerformanceRoutes,
  registerStatusRoutes,
} from "@api/core/status/routes";

const log = createModuleLogger("status:bootstrap");

/**
 * Composition root for the Status Sharing module (TAM-71).
 *
 * Wires the layered dependencies (repo → service → controller/facade),
 * publishes the `IStatusApi` facade into `GlobalServiceMap` so sibling modules
 * (e.g. a cross-module share sheet / home embed) reference status content via
 * `performServiceCall("status", …)`, and mounts the `/status/*` routes.
 *
 * Depends (at request time, via `performServiceCall`) on the `engagement`
 * facade (like/view counts + likedByMe + like toggle + view record) — registered
 * by its own module init in `bootstrap.ts`. There is NO `subscription`
 * dependency: everything in status is free and has no server entitlement gate
 * (the Pro Share render is enforced CLIENT-SIDE, TAM-72).
 */
export function initStatusModule(app: FastifyInstance): void {
  const repo = new StatusRepository();
  const service = new StatusService(repo);
  const adminService = new StatusAdminService(repo);
  // TAM-256 — the read-only performance report. Constructing the warehouse
  // repository here is free: it builds NO ClickHouse client until the first
  // admin request, so an API with no warehouse configuration boots normally.
  const performanceService = new StatusPerformanceService(
    new StatusPerformanceRepository(),
    new StatusAnalyticsWarehouseRepository()
  );
  const api = new StatusApi(service);
  registerGlobalService("status", api);

  void app.register((scoped) => {
    registerStatusRoutes(scoped, service);
  });

  // TAM-98: the admin write surface is a SEPARATE `/admin`-prefixed scope (ADR
  // §B5), not the public `/status/*` routes with a guard bolted on — the mobile
  // read contract must not churn to serve admin. `registerStatusAdminRoutes`
  // declares paths under `/status/<entity>`, so the full paths are
  // `/admin/status/…`. Every route inside is `registerAdminRoute`-guarded.
  void app.register(
    (scoped) => {
      registerStatusAdminRoutes(scoped, adminService);
      registerStatusPerformanceRoutes(scoped, performanceService);
    },
    { prefix: "/admin" }
  );

  // The shared warehouse client is process-wide and keep-alive, so it is
  // released with the server rather than per request.
  app.addHook("onClose", async () => {
    await closeStatusWarehouseClient();
  });

  log.info("status module initialised");
}
