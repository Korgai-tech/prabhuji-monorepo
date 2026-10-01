import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { DeityPreferenceSyncRow } from "@api/core/users/types";

const log = createModuleLogger("users:deity-warehouse");

/**
 * ClickHouse side of the deity-preference mirror (TAM-175).
 *
 * ── The rule, stated as the TWO invariants it actually is ──────────────────
 *
 * This comment used to say "the ONLY place in `apps/api` that talks to the
 * analytics warehouse… never by a request handler". That read as one absolute
 * ban, but it was always two separate rules, and only one of them is about
 * request handlers. TAM-256 needed the boundary named, so here it is:
 *
 *   **Invariant 1 — no PUBLIC or MOBILE request path may depend on the
 *   warehouse.** The rationale below is entirely `GET /home/feed`: it is the
 *   app's cold-start screen, ClickHouse Cloud is a hosted store over the public
 *   internet, and putting it on that path would add a warehouse round trip per
 *   app open and couple the feed's uptime to the warehouse's. The feed reads
 *   the Postgres mirror instead. **This invariant is unchanged and absolute.**
 *
 *   **Invariant 2 — the serving API must BOOT, and stay ALB-healthy, with zero
 *   ClickHouse configuration.** Only the jobs need credentials; no task's boot
 *   or health check may depend on a warehouse credential being present.
 *
 * ── The one approved exception ─────────────────────────────────────────────
 *
 * `core/status/repositories/status.analytics.warehouse.repository.ts` (TAM-256)
 * reads the warehouse **on an admin request path**, approved by the System
 * Architect on 2026-09-22 as a scoped exception. It satisfies Invariant 1
 * (admin-only, behind `adminMiddleware` — no mobile surface touches it) and
 * Invariant 2 (nothing built at module load, missing config is a typed
 * `unconfigured` outcome rather than a throw, no failure reaches `/health`).
 *
 * `arch-boundaries.json` can enforce "ClickHouse only inside `repositories/`"
 * but CANNOT enforce "admin only", so that exception is guarded by an
 * import-graph test instead. **A third consumer needs fresh architect sign-off**
 * — see `patterns_library/api/warehouse-read-on-request-path.md`.
 *
 * ── This file specifically ─────────────────────────────────────────────────
 *
 * Reached exclusively by the periodic sync job. Config comes from `process.env`
 * rather than the validated `loadEnv()` schema on purpose — the same call this
 * repo already makes for `apps/events/db` — and it fails loudly here when a
 * credential is missing, which is correct for a JOB. A REQUEST path must do the
 * opposite and degrade; do not copy this throwing constructor onto one.
 */
export class DeityPreferenceWarehouseRepository {
  private readonly client: ClickHouseClient;
  private readonly database: string;

  constructor() {
    const url = process.env["CLICKHOUSE_URL"];
    const password = process.env["CLICKHOUSE_PASSWORD"];
    // EXPLICIT, WITH NO DEFAULT. Each environment reads its own warehouse
    // database — stage `staging`, prod `production` — and defaulting would mean
    // a stage task that lost this variable silently mirrors PRODUCTION users'
    // deity preferences into the stage database. A missing value must stop the
    // job, not pick an environment for us.
    const database = process.env["CLICKHOUSE_DATABASE"];

    if (!url || !password || !database) {
      throw new AppError(
        "CLICKHOUSE_URL, CLICKHOUSE_PASSWORD and CLICKHOUSE_DATABASE are all required to sync deity preferences",
        500,
        "WAREHOUSE_NOT_CONFIGURED"
      );
    }
    // The database name is spliced into the query as an IDENTIFIER (ClickHouse
    // has no bind parameter for one), so it is allowlisted rather than trusted
    // — same guard as `apps/events/db/migrate.ts`.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
      throw new AppError(
        `Unsafe CLICKHOUSE_DATABASE identifier "${database}"`,
        500,
        "WAREHOUSE_NOT_CONFIGURED"
      );
    }

    this.database = database;
    this.client = createClient({
      url,
      username: process.env["CLICKHOUSE_USER"] ?? "default",
      password,
      database,
    });
  }

  /**
   * One batch of users whose preference changed at or after `since`, oldest
   * first.
   *
   * WHY `argMax` + `GROUP BY` RATHER THAN A PLAIN SELECT: the source table is a
   * `SharedMergeTree` ordered by `user_id` — NOT a `ReplacingMergeTree` — so
   * several rows can legitimately exist for one user and nothing collapses
   * them. Reading rows directly would let an arbitrary one win. `argMax(col,
   * updated_at)` picks each column from that user's newest row, which is the
   * value the product actually means.
   *
   * PAGED ON THE `(updated_at, user_id)` TUPLE, not on `updated_at` alone.
   *
   * This is not theoretical tidiness. Production's warehouse rewrites the WHOLE
   * table in one batch job, so all ~8,600 users carry the SAME `updated_at` to
   * the millisecond. Keyed on the timestamp alone, a run reads the first
   * `limit` users, finds the next page's cursor identical to the last, and has
   * to either loop forever or step past the timestamp — the first version
   * stepped past it, and every user beyond the first batch was silently never
   * mirrored. 42% of production users, getting the unpersonalised feed with
   * nothing anywhere to say so.
   *
   * The tuple always advances (user_id breaks the tie), so the walk terminates
   * AND covers everyone. The inner `>=` keeps the scan bounded; the outer
   * comparison is the actual keyset. Re-reading the boundary row each run is
   * absorbed by the idempotent upsert.
   *
   * TIME CROSSES THIS BOUNDARY AS EPOCH MILLISECONDS, NEVER AS A FORMATTED
   * STRING. `updated_at` is declared `DateTime64(3, 'Asia/Kolkata')`, and a
   * ClickHouse timestamp RENDERS in its column timezone — so an instant of
   * 10:00Z comes back as the text "2026-09-17 15:30:00.000". Reading that as if
   * it were UTC pushes the watermark 5h30m into the FUTURE, and the next run
   * then skips every change inside that window: silent, permanent data loss
   * that looks like "personalisation is stale for some users". Going both ways
   * through `toUnixTimestamp64Milli` / `fromUnixTimestamp64Milli` removes the
   * ambiguity entirely — an epoch is an instant, with no timezone to misread.
   */
  async findChangedSince(
    since: Date,
    sinceUserId: string,
    limit: number
  ): Promise<DeityPreferenceSyncRow[]> {
    const result = await this.client.query({
      query: `
        SELECT * FROM (
          SELECT
            toString(user_id)                                    AS userId,
            argMax(first_preferred_shared_deity_id, updated_at)  AS primaryDeitySlug,
            argMax(second_preferred_shared_deity_id, updated_at) AS secondaryDeitySlug,
            argMax(ad_god_name, updated_at)                      AS adDeitySlug,
            argMax(preferred_shared_deity_source, updated_at)    AS source,
            toUnixTimestamp64Milli(max(updated_at))              AS warehouseUpdatedAtMs
          FROM ${this.database}.custom_user_properties
          WHERE updated_at >= fromUnixTimestamp64Milli({sinceMs:Int64})
          GROUP BY user_id
        )
        WHERE warehouseUpdatedAtMs > {sinceMs:Int64}
           OR (warehouseUpdatedAtMs = {sinceMs:Int64} AND userId > {sinceUserId:String})
        ORDER BY warehouseUpdatedAtMs ASC, userId ASC
        LIMIT {limit:UInt32}
      `,
      query_params: { sinceMs: since.getTime(), sinceUserId, limit },
      format: "JSONEachRow",
    });

    const rows = await result.json<WarehouseRow>();
    log.debug(
      { event: "deity_preference_warehouse_read", rows: rows.length, since: since.toISOString() },
      "read deity preferences from the warehouse"
    );
    return rows.map(toSyncRow);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/** The wire shape ClickHouse returns for the query above (all strings). */
export interface WarehouseRow {
  userId: string;
  primaryDeitySlug: string | null;
  secondaryDeitySlug: string | null;
  adDeitySlug: string | null;
  source: string | null;
  /**
   * Epoch milliseconds. Typed `string | number` because ClickHouse emits 64-bit
   * integers as JSON STRINGS — a number would silently lose precision in a
   * language whose only numeric type is a double.
   */
  warehouseUpdatedAtMs: string | number;
}

/**
 * Map one warehouse row onto the mirror's shape.
 *
 * EXPORTED FOR TESTING. It is the half of the timezone contract that lives in
 * TypeScript — `warehouseUpdatedAtMs` must stay epoch milliseconds, and the
 * query above must keep producing them via `toUnixTimestamp64Milli`. The two
 * change together or the watermark silently drifts by the column's UTC offset.
 */
export function toSyncRow(row: WarehouseRow): DeityPreferenceSyncRow {
  return {
    userId: row.userId,
    primaryDeitySlug: canonicalSlug(row.primaryDeitySlug),
    secondaryDeitySlug: canonicalSlug(row.secondaryDeitySlug),
    adDeitySlug: canonicalSlug(row.adDeitySlug),
    // NOT a slug — a free-text provenance token, left exactly as written.
    source: blankToNull(row.source),
    warehouseUpdatedAt: new Date(Number(row.warehouseUpdatedAtMs)),
  };
}

/**
 * Warehouse slug -> CMS slug, for spellings the warehouse emits that
 * `deities.slug` does not have.
 *
 * FOUND ON PRODUCTION, NOT STAGE. The warehouse writes both `ganesh` (371
 * users) and `ganesha` (26), and both `ram` (8) and `rama` (16); only the
 * longer spelling exists in the CMS. An unmatched slug is not an error — the
 * pool comes back empty and the user falls through to the unpersonalised feed —
 * which is precisely the problem: ~8% of users with a preference would have had
 * the feature silently do nothing, with no error anywhere to notice.
 *
 * THIS IS A BRIDGE, NOT THE FIX. The right correction is upstream, in whatever
 * derives `custom_user_properties`, so that every environment and every
 * consumer sees one spelling. Normalising here keeps those users working in the
 * meantime; delete this map once the warehouse emits CMS slugs.
 *
 * Deliberately NOT a general fuzzy match. Only exact, reviewed pairs belong
 * here: guessing that `narsingh` means some CMS deity would be inventing
 * product data, and the log line below is what surfaces that case instead.
 */
const DEITY_SLUG_ALIASES: Readonly<Record<string, string>> = {
  ganesh: "ganesha",
  ram: "rama",
};

/**
 * Normalise a warehouse slug to the CMS spelling. Case- and whitespace-tolerant
 * because the value is data we do not control.
 */
function canonicalSlug(value: string | null): string | null {
  const trimmed = blankToNull(value);
  if (trimmed === null) return null;
  const lower = trimmed.toLowerCase();
  return DEITY_SLUG_ALIASES[lower] ?? lower;
}

/**
 * An empty string is NOT a deity. `argMax` over a `Nullable(String)` column
 * returns `null`, but a warehouse write that stored `''` instead would
 * otherwise become a slug that matches no content and silently empties a whole
 * pool. Normalising here keeps "no preference" a single representable state.
 */
function blankToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
