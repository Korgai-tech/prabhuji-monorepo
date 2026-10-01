import { createClient } from "@clickhouse/client";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("status:warehouse-schema-assert");

/**
 * Drift alarm for the `saas_events` columns the status-performance report reads
 * (TAM-256, D-2 condition 4).
 *
 * ── Where this runs, and where it MUST NOT ─────────────────────────────────
 *
 * It runs inside the existing twice-daily deity-preference sync task: that task
 * already holds warehouse credentials, already exits non-zero, and already
 * surfaces as FAILED, so a break is loud within twelve hours.
 *
 * It must **never** run at startup or on `/health`. `/health` is the ALB
 * target-group path (`fargate-service/variables.tf`, `unhealthy_threshold = 5`),
 * so an assertion there would turn a warehouse outage — or an upstream rename —
 * into every API task deregistering. The mobile app would go down over a CMS
 * report's dependency. This is the single most important line in this file.
 *
 * ── What it can and cannot catch ──────────────────────────────────────────
 *
 * It checks TABLE columns, and that is a genuinely narrow guarantee. The
 * report's real dependencies are mostly *inside* the `event_properties` JSON
 * (`status_id`, `result`, `position_index`) and in `event_type` string values,
 * and a rename of any of those **does not error** — JSON access on a missing
 * key yields nothing and aggregation returns zero.
 *
 * So this is the cheap half of the alarm. The other half is the silent-zero
 * canary in the report itself (`metricsSuspect`), which is what actually covers
 * the likely failure. Neither is sufficient alone; `saas_events` is declared in
 * no migration in this repo, so CI protects none of it (TAM-257).
 */

/** The table columns the report's queries name directly. */
const REQUIRED_COLUMNS = [
  "tenant",
  "insert_id",
  "event_type",
  "user_id",
  "event_date",
  "event_properties",
] as const;

export interface WarehouseSchemaAssertion {
  checked: boolean;
  missing: string[];
  reason?: string;
}

/**
 * Returns a result rather than throwing.
 *
 * The caller decides whether a drift is fatal. An unconfigured environment is
 * reported as `checked: false` — not a failure, because plenty of environments
 * legitimately have no warehouse credentials and must not fail a job over it.
 */
export async function assertStatusWarehouseSchema(): Promise<WarehouseSchemaAssertion> {
  const url = process.env["CLICKHOUSE_URL"];
  const password = process.env["CLICKHOUSE_PASSWORD"];
  const database = process.env["CLICKHOUSE_DATABASE"];

  if (!url || !password || !database) {
    return { checked: false, missing: [], reason: "warehouse not configured" };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
    return { checked: false, missing: [], reason: "unsafe CLICKHOUSE_DATABASE identifier" };
  }

  const client = createClient({
    url,
    username: process.env["CLICKHOUSE_USER"] ?? "default",
    password,
    database,
  });

  try {
    const result = await client.query({
      query: `
        SELECT name
        FROM system.columns
        WHERE database = {database:String} AND table = 'saas_events'
      `,
      query_params: { database },
      format: "JSONEachRow",
    });

    const rows = await result.json<{ name: string }>();
    const present = new Set(rows.map((r) => r.name));

    // No rows at all means the TABLE is gone or renamed — report every column
    // as missing so the message says something actionable rather than "0 of 6".
    const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));

    if (missing.length > 0) {
      log.error(
        { event: "status_warehouse_schema_drift", database, missing, table: "saas_events" },
        `status-performance report depends on ${missing.length} saas_events column(s) that no longer exist`,
      );
    } else {
      log.info(
        { event: "status_warehouse_schema_ok", database },
        "status-performance warehouse columns present",
      );
    }

    return { checked: true, missing };
  } finally {
    await client.close();
  }
}
