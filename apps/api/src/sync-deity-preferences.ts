/**
 * TAM-175 — mirror `custom_user_properties` (ClickHouse) into
 * `user_deity_preferences` (Postgres).
 *
 * A ONE-OFF TASK, not a server loop. It is meant to run the way the Prisma
 * migration task already does — an ECS one-off on a schedule — so that:
 *
 *   * the serving tasks never hold a ClickHouse connection, and never need a
 *     warehouse credential to boot;
 *   * a slow or unavailable warehouse delays personalisation refresh and
 *     nothing else. `GET /home/feed` keeps serving from the mirror.
 *
 * Safe to run at any time and any number of times: the watermark is derived
 * from the mirror's own `MAX(warehouse_updated_at)` and the write is an
 * idempotent upsert, so a re-run is a no-op and an interrupted run resumes
 * exactly where it stopped.
 *
 *   pnpm nx run api:sync-deity-preferences
 *
 * Requires CLICKHOUSE_URL + CLICKHOUSE_PASSWORD (and optionally
 * CLICKHOUSE_USER / CLICKHOUSE_DATABASE) alongside the usual DATABASE_URL.
 */
import { disconnectPrisma } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";
import {
  DeityPreferenceRepository,
  DeityPreferenceWarehouseRepository,
} from "@api/core/users/repositories";
import { DeityPreferenceService } from "@api/core/users/services";
import { assertStatusWarehouseSchema } from "@api/core/status/repositories";

const log = createModuleLogger("users:deity-preference-sync");

async function main(): Promise<void> {
  const warehouse = new DeityPreferenceWarehouseRepository();
  const service = new DeityPreferenceService(new DeityPreferenceRepository(), warehouse);
  try {
    const result = await service.sync();
    log.info(
      {
        event: "deity_preference_sync_result",
        synced: result.synced,
        batches: result.batches,
        with_primary: result.withPrimary,
      },
      "deity preference sync complete"
    );

    // TAM-256 condition 4 — the status-performance report's schema alarm rides
    // this task because it already holds warehouse credentials and already
    // surfaces as FAILED. It must never live at startup or on `/health`, which
    // is the ALB target-group path: an assertion there would deregister every
    // API task on a warehouse outage and take the mobile app down over a CMS
    // report's dependency.
    //
    // It runs AFTER this task's own work and never fails it: drift in a
    // report's columns is not a reason to stop mirroring deity preferences.
    // The error log is the alarm.
    try {
      const assertion = await assertStatusWarehouseSchema();
      if (assertion.checked && assertion.missing.length > 0) {
        log.error(
          {
            event: "status_warehouse_schema_drift",
            missing: assertion.missing,
          },
          "status-performance report will silently under-report — see TAM-257"
        );
      }
    } catch (err) {
      log.warn({ err }, "status-performance schema assertion could not run");
    }
  } finally {
    // Both clients are closed even on failure — a one-off task that leaves a
    // connection open holds the ECS task alive past its work.
    await warehouse.close();
    await disconnectPrisma();
  }
}

main().catch((err: unknown) => {
  log.error({ err, event: "deity_preference_sync_failed" }, "deity preference sync failed");
  // A non-zero exit is what makes a scheduled task show up as FAILED rather
  // than silently doing nothing twice a day.
  process.exit(1);
});
