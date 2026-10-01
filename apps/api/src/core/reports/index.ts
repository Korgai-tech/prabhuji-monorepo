import type { FastifyInstance } from "fastify";
import { createModuleLogger } from "@api/shared/logs";
import { ReportsRepository } from "@api/core/reports/repositories";
import { ReportsService } from "@api/core/reports/services";
import { registerReportRoutes } from "@api/core/reports/routes";

const log = createModuleLogger("reports:bootstrap");

/**
 * Composition root for the Reports module (TAM-N).
 *
 * Wires repo → service → controller and mounts `POST /reports`. Depends at
 * request time on the `status` facade (`getReportTarget`) to validate the
 * reported status and resolve who it is attributed to.
 *
 * No `IReportsApi` facade is published: nothing reads reports back yet. Add one
 * here (plus `src/shared/workspace/context.ts`) if an admin moderation module
 * ever needs them — a `GET /admin/reports` surface must go through
 * `registerAdminRoute` inside an `/admin`-prefixed scope.
 */
export function initReportsModule(app: FastifyInstance): void {
  const repo = new ReportsRepository();
  const service = new ReportsService(repo);

  void app.register((scoped) => {
    registerReportRoutes(scoped, service);
  });

  log.info("reports module initialised");
}
