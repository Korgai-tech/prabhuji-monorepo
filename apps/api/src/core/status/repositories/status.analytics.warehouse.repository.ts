import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import {
  STATUS_PERFORMANCE_NO_DEITY,
  STATUS_SHARE_INTENT_AVAILABLE_FROM,
} from "@api/core/status/types";

const log = createModuleLogger("status:analytics-warehouse");

/**
 * ClickHouse side of the admin status-performance report (TAM-256).
 *
 * ── The rule this sits inside ──────────────────────────────────────────────
 * `core/users/repositories/deity-preference-warehouse.repository.ts` says the
 * warehouse is reached "never by a request handler". That sentence is really
 * TWO invariants, and only one of them is about request handlers:
 *
 *   1. No PUBLIC/MOBILE request path may depend on the warehouse. Its rationale
 *      is entirely `GET /home/feed` — the app's cold-start screen must not gain
 *      a warehouse round trip per app open, nor couple its uptime to a hosted
 *      store over the public internet. UNCHANGED by this file: these queries
 *      are reachable only from admin routes behind `adminMiddleware`.
 *   2. The serving API must BOOT, and stay ALB-healthy, with zero ClickHouse
 *      configuration. Applies here in full force, and is what actually shapes
 *      this file: nothing is constructed at module load, missing config is a
 *      typed outcome rather than a throw, and no failure here may reach
 *      `/health` (which is the ALB target-group path).
 *
 * Approved by the System Architect on 2026-09-22 as a scoped exception. A
 * SECOND consumer of this pattern needs fresh sign-off — see
 * `patterns_library/api/warehouse-read-on-request-path.md`.
 *
 * ── Why live, and not a Postgres rollup ────────────────────────────────────
 * Not a freshness preference: a per-day-per-item rollup CANNOT serve the
 * report's Viewers column. Summing daily uniques over-counts (one devotee on
 * three days becomes three viewers), and the by-deity "unique users across the
 * deity's items" is not derivable from per-item rollups at all. Correct rollup
 * grain would be per-day-per-item-per-USER — i.e. copying the event stream into
 * Postgres — or `uniqState` sketches, which Postgres cannot merge.
 *
 * ── The table ──────────────────────────────────────────────────────────────
 * `saas_events`, NOT the `events` table declared in `apps/events/db/schema.sql`
 * (that one is legacy; its last row is 2026-08-18). `saas_events` is managed
 * OUTSIDE this repo, so `pnpm nx run events:ch-check` gives no drift protection
 * for anything below. That is why `eventCounts` exists — see the canary note on
 * `aggregateByItem`.
 */

/** Every way a warehouse read can end, as data rather than as a thrown error. */
export type WarehouseOutcome<T> =
  | { status: "ok"; data: T }
  /** No credentials on this task. Local dev and any unconfigured env. */
  | { status: "unconfigured" }
  /**
   * Distinct from "unreachable" on purpose: ClickHouse Cloud idles after ~15
   * minutes and the twice-daily sync will not keep it warm, so the first admin
   * query of a session pays WAKE latency — seconds to tens of seconds, at
   * near-zero compute. That is a retryable cold start, not an outage, and the
   * UI must say "waking — Retry" rather than "unavailable".
   */
  | { status: "timeout" }
  | { status: "unreachable" };

/** Window metrics for one canonical `status_items.id`. */
export interface StatusWindowMetrics {
  views: number;
  /** `uniq` — HLL, ~0.5% error. NOT summable across rows. */
  viewers: number;
  shareIntents: number;
  /** Successes only, over the WHOLE window. */
  shares: number;
  /**
   * Successes on or after `STATUS_SHARE_INTENT_AVAILABLE_FROM` — the ONLY
   * correct numerator for Completion. See the note on `aggregateByItem`.
   */
  sharesInIntentWindow: number;
  /** RAW 0-based `avg(position_index)`; the response mapper adds 1 for display. */
  avgPositionIndex: number | null;
}

export interface StatusItemAggregate {
  byStatusId: Map<string, StatusWindowMetrics>;
  /**
   * Per-event-type row counts in the window — the silent-zero canary.
   *
   * The dominant failure mode here is NOT a table-column rename (that throws).
   * It is a rename of an `event_properties` KEY (`status_id`, `result`,
   * `position_index`) or of an `event_type` VALUE. Neither errors: JSON access
   * on a missing key yields nothing, aggregation returns zero, every ratio
   * renders blank, and the page reads as a healthy, quiet catalogue while an
   * editor retires artwork on it. If the catalogue is non-empty and all three
   * of these are 0, the service flags `metricsSuspect`.
   */
  eventCounts: { viewed: number; shareIntents: number; shareResults: number };
}

/** Window metrics for one deity, aggregated INSIDE ClickHouse (see below). */
export interface DeityWindowMetrics {
  views: number;
  viewers: number;
  shareIntents: number;
  /** Successes over the WHOLE window. */
  shares: number;
  /**
   * Successes on or after `STATUS_SHARE_INTENT_AVAILABLE_FROM` — the only
   * correct Completion numerator, for exactly the reason spelled out on
   * `aggregateByItem`. Both tabs MUST use it or they disagree on the same
   * metric for the same window.
   */
  sharesInIntentWindow: number;
}

export interface WarehouseWindow {
  /** IST calendar dates, inclusive both ends. */
  dateFrom: string;
  dateTo: string;
}

/**
 * Bound on the alias map spliced into a query.
 *
 * The map is passed as two parallel arrays to `transform()`. At the current
 * catalogue size (hundreds of items) this is nowhere near the bound; it exists
 * so the query cannot grow without limit if the home feed ever does. Past it,
 * the right answer is a ClickHouse dictionary, not a bigger array.
 */
const MAX_ALIAS_PAIRS = 20_000;

/** D-2 condition 5 — the SERVER-side compute bound, in seconds. */
const MAX_EXECUTION_TIME_S = 10;
/** Client socket budget. Wider than the compute bound to survive an idle wake. */
const REQUEST_TIMEOUT_MS = 30_000;
/** D-2 condition 8 — process-wide cap on concurrent warehouse queries. */
const MAX_IN_FLIGHT = 3;

/**
 * ONE lazily-created client, reused across requests (keep-alive).
 *
 * Never per request: a TLS handshake per page load would dominate the latency
 * budget. Never constructed at module load: Invariant 2 — an API with no
 * warehouse configuration must boot normally, so the first admin request is the
 * earliest anything here may be built.
 */
let client: ClickHouseClient | null = null;
let inFlight = 0;
/** D-2 condition 8 — single-flight coalescing, keyed on the WINDOW only. */
const coalescing = new Map<string, Promise<unknown>>();

interface WarehouseConfig {
  url: string;
  username: string;
  password: string;
  database: string;
  /**
   * OPTIONAL, and deliberately so.
   *
   * `saas_events.tenant` separates one app's rows from another's, but there is
   * exactly one tenant today — measured 2026-09-23: `prabhuji`, 1,244,049 rows
   * in `production` and 13,898 in `staging`, no other value in either. So the
   * predicate is a no-op, and REQUIRING it would mean the report stays dark
   * until an infrastructure change lands, to filter on something that filters
   * nothing.
   *
   * Set it and the query scopes to that tenant. Leave it unset and the query
   * counts every row in the database — correct while single-tenant, and
   * reported at boot so it is visible rather than assumed. The day a second
   * tenant appears, setting this is what stops their numbers being counted as
   * ours.
   */
  tenant: string | undefined;
}

function readConfig(): WarehouseConfig | null {
  const env = loadEnv();
  const url = env.CLICKHOUSE_URL;
  const password = env.CLICKHOUSE_PASSWORD;
  const database = env.CLICKHOUSE_DATABASE;
  const tenant = env.CLICKHOUSE_TENANT;

  // NOTE the tenant is NOT required here — see the field's comment.
  if (!url || !password || !database) return null;

  // The database name is spliced in as an IDENTIFIER (ClickHouse has no bind
  // parameter for one), so it is allowlisted rather than trusted — the same
  // guard `deity-preference-warehouse.repository.ts` and `migrate.ts` use.
  // Unlike those, a bad value here returns "unconfigured" rather than throwing:
  // this is a request path, and a misconfigured env must degrade the report,
  // not 500 it.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
    log.error({ database }, "unsafe CLICKHOUSE_DATABASE identifier — warehouse reads disabled");
    return null;
  }

  return { url, username: env.CLICKHOUSE_USER ?? "default", password, database, tenant };
}

function getClient(config: WarehouseConfig): ClickHouseClient {
  client ??= createClient({
    url: config.url,
    username: config.username,
    password: config.password,
    database: config.database,
    request_timeout: REQUEST_TIMEOUT_MS,
    keep_alive: { enabled: true },
  });
  return client;
}

/**
 * Release the shared client. Wired to Fastify's `onClose` by the module's
 * composition root — never called per request.
 */
export async function closeStatusWarehouseClient(): Promise<void> {
  const current = client;
  client = null;
  if (current) await current.close();
}

/**
 * Classify a driver failure into the two outcomes the UI renders differently.
 *
 * A timeout and an abort both mean "we gave up waiting", which on an idling
 * ClickHouse Cloud service overwhelmingly means a cold start rather than a
 * fault — so they map to the retryable state.
 */
function classify(err: unknown): { status: "timeout" } | { status: "unreachable" } {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("socket hang up")
  ) {
    return { status: "timeout" };
  }
  return { status: "unreachable" };
}

/**
 * Run `fn` under the concurrency cap and the single-flight map.
 *
 * Coalescing is keyed on the window only, so two editors loading the same range
 * — or one editor clicking a sort header repeatedly — share ONE query. This is
 * not caching: no result is retained past the in-flight promise, so it adds no
 * staleness and does not reopen the decision to ship without a TTL. The cap is
 * the backstop for genuinely different windows, and it deliberately covers the
 * CSV routes too, since an unbounded export is the most expensive thing here.
 */
async function guarded<T>(key: string, fn: () => Promise<T>): Promise<WarehouseOutcome<T>> {
  const existing = coalescing.get(key);
  if (existing) {
    try {
      return { status: "ok", data: (await existing) as T };
    } catch (err) {
      return classify(err);
    }
  }

  if (inFlight >= MAX_IN_FLIGHT) {
    log.warn({ inFlight, key }, "warehouse concurrency cap reached — degrading this read");
    return { status: "timeout" };
  }

  inFlight += 1;
  const promise = fn().finally(() => {
    inFlight -= 1;
    coalescing.delete(key);
  });
  coalescing.set(key, promise);

  try {
    return { status: "ok", data: await promise };
  } catch (err) {
    log.error({ err, key }, "warehouse read failed");
    return classify(err);
  }
}

/**
 * The shared FROM clause: deduplicated, tenant-scoped, window-scoped rows.
 *
 * `LIMIT 1 BY insert_id` is the read-time dedup. The column list is EXPLICIT
 * and must stay so: `event_date`, `corrected_time` and `synthetic_sequence_time`
 * are MATERIALIZED and therefore absent from `SELECT *`, so a `SELECT *`
 * subquery would drop `event_date` and the outer IST predicate would lose its
 * column.
 *
 * The window predicate sits INSIDE the subquery so the partition/sort key prunes
 * before dedup rather than after.
 */
function dedupedEvents(
  database: string,
  eventTypes: readonly string[],
  tenant: string | undefined,
): string {
  const typeList = eventTypes.map((t) => `'${t}'`).join(", ");
  // Omitted rather than compared to '' when unset: `tenant = ''` would match
  // nothing and render an empty report that looks like zero engagement.
  const tenantPredicate = tenant ? "tenant = {tenant:String} AND" : "";
  return `
    SELECT insert_id, event_type, user_id, event_date, event_properties
    FROM ${database}.saas_events
    WHERE ${tenantPredicate}
      event_type IN (${typeList})
      AND event_date >= {dateFrom:Date}
      AND event_date <= {dateTo:Date}
    LIMIT 1 BY insert_id
  `;
}

interface ItemRow {
  statusId: string;
  views: string;
  viewers: string;
  shareIntents: string;
  shares: string;
  sharesInIntentWindow: string;
  avgPositionIndex: string | null;
}

interface DeityRow {
  deitySlug: string;
  views: string;
  viewers: string;
  shareIntents: string;
  shares: string;
  sharesInIntentWindow: string;
}

const EVENT_VIEWED = "status_viewed";
const EVENT_SHARE_INTENT = "status_share_cta_clicked";
const EVENT_SHARE_RESULT = "status_share_result";
const ALL_EVENTS = [EVENT_VIEWED, EVENT_SHARE_INTENT, EVENT_SHARE_RESULT] as const;

export class StatusAnalyticsWarehouseRepository {
  /**
   * Per-item window aggregate.
   *
   * NO `ORDER BY` and NO `LIMIT`: the aggregate is window-scoped and
   * page/sort-independent, so it is computed once per window and the service
   * sorts and pages the joined result in TypeScript. Pushing either down would
   * buy a fresh warehouse scan on every header click.
   *
   * COMPLETION NEEDS ITS OWN NUMERATOR, and this is not a display detail.
   * `status_share_cta_clicked` only exists from 2026-09-12, while
   * `status_share_result` goes back further. A window that straddles that date
   * therefore divides a FULL-window share count by a PARTIAL-window intent
   * count. Measured 2026-09-22 on a 30-day window: 1,696 shares over 2,187
   * intents reads 77.5% complete, where the honest figure over the intents'
   * own window is 40.6% — and per item it exceeds 100% (one item showed 70
   * shares against 49 intents). So `sharesInIntentWindow` is counted
   * separately and is the ONLY correct numerator for Completion; `shares`
   * stays full-window because it is a real count in its own right.
   *
   * EVEN CORRECTED, Completion can exceed 100%, and the UI must tolerate that
   * rather than treat it as a bug. Numerator and denominator come from
   * different funnel populations: a share can complete without a recorded
   * intent (a retry re-fires `status_share_result`; a Home-originated share
   * need not pass the Status module's CTA), so the ratio is "shares per
   * recorded intent", not a true funnel conversion. Measured: an item with 5
   * shares against 1 intent reads 500%.
   *
   * `transform(status_id, from, to, status_id)` canonicalises Home-feed share
   * ids BEFORE `GROUP BY`. It has to happen here rather than afterwards because
   * `uniq()` returns HLL sketches that cannot be merged across two raw ids in
   * TypeScript — and the map itself lives in Postgres, so this cannot be a join.
   */
  async aggregateByItem(
    window: WarehouseWindow,
    homeFeedIdToStatusId: Map<string, string>,
  ): Promise<WarehouseOutcome<StatusItemAggregate>> {
    const config = readConfig();
    if (!config) return { status: "unconfigured" };

    const pairs = [...homeFeedIdToStatusId.entries()].slice(0, MAX_ALIAS_PAIRS);
    const aliasFrom = pairs.map(([from]) => from);
    const aliasTo = pairs.map(([, to]) => to);

    const key = `item|${config.tenant ?? "*"}|${config.database}|${window.dateFrom}|${window.dateTo}|${pairs.length}`;

    return guarded(key, async () => {
      const controller = new AbortController();
      const result = await getClient(config).query({
        query: `
          SELECT
            canonical_status_id                                                   AS statusId,
            countIf(event_type = '${EVENT_VIEWED}')                               AS views,
            uniqIf(user_id, event_type = '${EVENT_VIEWED}')                       AS viewers,
            countIf(event_type = '${EVENT_SHARE_INTENT}')                         AS shareIntents,
            countIf(event_type = '${EVENT_SHARE_RESULT}'
                    AND toString(event_properties.result) = 'success')            AS shares,
            countIf(event_type = '${EVENT_SHARE_RESULT}'
                    AND toString(event_properties.result) = 'success'
                    AND event_date >= {intentFrom:Date})                          AS sharesInIntentWindow,
            avgIf(position_index, event_type = '${EVENT_VIEWED}'
                    AND position_index IS NOT NULL)                               AS avgPositionIndex
          FROM (
            SELECT
              event_type,
              user_id,
              event_date,
              transform(
                toString(event_properties.status_id),
                {aliasFrom:Array(String)},
                {aliasTo:Array(String)},
                toString(event_properties.status_id)
              ) AS canonical_status_id,
              toFloat64OrNull(toString(event_properties.position_index)) AS position_index,
              event_properties
            FROM ( ${dedupedEvents(config.database, ALL_EVENTS, config.tenant)} )
          )
          WHERE canonical_status_id != ''
          GROUP BY canonical_status_id
        `,
        query_params: {
          ...(config.tenant ? { tenant: config.tenant } : {}),
          dateFrom: window.dateFrom,
          dateTo: window.dateTo,
          intentFrom: STATUS_SHARE_INTENT_AVAILABLE_FROM,
          aliasFrom,
          aliasTo,
        },
        clickhouse_settings: {
          max_execution_time: MAX_EXECUTION_TIME_S,
          // Without this, a client-side give-up abandons the socket and leaves
          // the query RUNNING and billed on the server.
          cancel_http_readonly_queries_on_client_close: 1,
        },
        abort_signal: controller.signal,
        format: "JSONEachRow",
      });

      const rows = await result.json<ItemRow>();
      const byStatusId = new Map<string, StatusWindowMetrics>();
      const eventCounts = { viewed: 0, shareIntents: 0, shareResults: 0 };

      for (const row of rows) {
        const views = Number(row.views);
        const shareIntents = Number(row.shareIntents);
        const shares = Number(row.shares);
        eventCounts.viewed += views;
        eventCounts.shareIntents += shareIntents;
        eventCounts.shareResults += shares;
        byStatusId.set(row.statusId, {
          views,
          viewers: Number(row.viewers),
          shareIntents,
          shares,
          sharesInIntentWindow: Number(row.sharesInIntentWindow),
          avgPositionIndex:
            row.avgPositionIndex === null || row.avgPositionIndex === ""
              ? null
              : Number(row.avgPositionIndex),
        });
      }

      return { byStatusId, eventCounts };
    });
  }

  /**
   * Per-deity window aggregate, grouped INSIDE ClickHouse.
   *
   * This cannot be a roll-up of `aggregateByItem`'s result: a devotee who
   * viewed three of one deity's items is ONE viewer, not three, and `uniq`
   * sketches cannot be summed in TypeScript. So the CMS deity mapping is pushed
   * down as a second `transform()` and the grouping happens where the sketches
   * live. Items with no mapping fall through to the "(no deity)" bucket rather
   * than vanishing.
   */
  async aggregateByDeity(
    window: WarehouseWindow,
    homeFeedIdToStatusId: Map<string, string>,
    statusIdToDeitySlug: Map<string, string>,
  ): Promise<WarehouseOutcome<Map<string, DeityWindowMetrics>>> {
    const config = readConfig();
    if (!config) return { status: "unconfigured" };

    const aliasPairs = [...homeFeedIdToStatusId.entries()].slice(0, MAX_ALIAS_PAIRS);
    const deityPairs = [...statusIdToDeitySlug.entries()].slice(0, MAX_ALIAS_PAIRS);

    const key = `deity|${config.tenant ?? "*"}|${config.database}|${window.dateFrom}|${window.dateTo}|${deityPairs.length}`;

    return guarded(key, async () => {
      const controller = new AbortController();
      const result = await getClient(config).query({
        query: `
          SELECT
            deity_slug                                                            AS deitySlug,
            countIf(event_type = '${EVENT_VIEWED}')                               AS views,
            uniqIf(user_id, event_type = '${EVENT_VIEWED}')                       AS viewers,
            countIf(event_type = '${EVENT_SHARE_INTENT}')                         AS shareIntents,
            countIf(event_type = '${EVENT_SHARE_RESULT}'
                    AND toString(event_properties.result) = 'success')            AS shares,
            countIf(event_type = '${EVENT_SHARE_RESULT}'
                    AND toString(event_properties.result) = 'success'
                    AND event_date >= {intentFrom:Date})                          AS sharesInIntentWindow
          FROM (
            SELECT
              event_type,
              user_id,
              event_date,
              event_properties,
              transform(
                transform(
                  toString(event_properties.status_id),
                  {aliasFrom:Array(String)},
                  {aliasTo:Array(String)},
                  toString(event_properties.status_id)
                ),
                {deityFrom:Array(String)},
                {deityTo:Array(String)},
                {noDeity:String}
              ) AS deity_slug
            FROM ( ${dedupedEvents(config.database, ALL_EVENTS, config.tenant)} )
          )
          GROUP BY deity_slug
        `,
        query_params: {
          ...(config.tenant ? { tenant: config.tenant } : {}),
          dateFrom: window.dateFrom,
          dateTo: window.dateTo,
          aliasFrom: aliasPairs.map(([from]) => from),
          aliasTo: aliasPairs.map(([, to]) => to),
          intentFrom: STATUS_SHARE_INTENT_AVAILABLE_FROM,
          deityFrom: deityPairs.map(([from]) => from),
          deityTo: deityPairs.map(([, to]) => to),
          noDeity: STATUS_PERFORMANCE_NO_DEITY,
        },
        clickhouse_settings: {
          max_execution_time: MAX_EXECUTION_TIME_S,
          cancel_http_readonly_queries_on_client_close: 1,
        },
        abort_signal: controller.signal,
        format: "JSONEachRow",
      });

      const rows = await result.json<DeityRow>();
      const byDeity = new Map<string, DeityWindowMetrics>();
      for (const row of rows) {
        byDeity.set(row.deitySlug, {
          views: Number(row.views),
          viewers: Number(row.viewers),
          shareIntents: Number(row.shareIntents),
          shares: Number(row.shares),
          sharesInIntentWindow: Number(row.sharesInIntentWindow),
        });
      }
      return byDeity;
    });
  }
}
