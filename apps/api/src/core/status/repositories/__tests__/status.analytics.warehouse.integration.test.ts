import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { resetEnvCache } from "@api/shared/config";
import { STATUS_PERFORMANCE_NO_DEITY } from "@api/core/status/types";
import {
  StatusAnalyticsWarehouseRepository,
  closeStatusWarehouseClient,
} from "../status.analytics.warehouse.repository.js";

/**
 * Integration coverage for the warehouse half of the status-performance report
 * (TAM-256) — a real ClickHouse via testcontainers, not a stub.
 *
 * A fake cannot prove any of what matters here, because what matters is
 * ClickHouse's own semantics:
 *
 *  - `event_date` is MATERIALIZED, so it is absent from `SELECT *`. A dedup
 *    subquery that forgets to name it loses the outer date predicate's column
 *    — and a stub would happily return rows anyway.
 *  - `transform()` remaps Home-feed ids BEFORE `GROUP BY`. Applying it after
 *    aggregation is impossible (uniq returns unmergeable sketches), so the only
 *    way to know the remap works is to run it.
 *  - `LIMIT 1 BY insert_id` is the at-least-once dedup. Duplicate delivery is
 *    normal for the pipeline, so "does a replayed event double-count" is a
 *    question only the engine answers.
 *
 * Uses the same table shape as production `saas_events`, including the leading
 * `tenant` column and `user_id UUID`.
 */

const TENANT = "prabhuji";
const DB = "warehouse_test";
const OTHER_TENANT = "someone-else";

let container: StartedTestContainer;
let admin: ClickHouseClient;
let repo: StatusAnalyticsWarehouseRepository;

/** Matches production's shape closely enough that its quirks are reproduced. */
const CREATE_TABLE = `
CREATE TABLE ${DB}.saas_events
(
  tenant           LowCardinality(String),
  insert_id        String,
  event_type       LowCardinality(String),
  user_id          UUID,
  device_id        String DEFAULT '',
  event_time       DateTime64(3),
  server_time      DateTime64(3),
  client_upload_time DateTime64(3) DEFAULT 0,
  event_properties JSON DEFAULT '{}',
  corrected_time   DateTime64(3) MATERIALIZED fromUnixTimestamp64Milli(
    multiIf(
      toUnixTimestamp64Milli(client_upload_time) = 0, toUnixTimestamp64Milli(event_time),
      toUnixTimestamp64Milli(client_upload_time) < toUnixTimestamp64Milli(event_time), toUnixTimestamp64Milli(event_time),
      toUnixTimestamp64Milli(server_time) - (toUnixTimestamp64Milli(client_upload_time) - toUnixTimestamp64Milli(event_time))
    )),
  event_date       Date MATERIALIZED toDate(corrected_time, 'Asia/Kolkata')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(server_time, 'Asia/Kolkata')
ORDER BY (event_date, event_type, user_id)
`;

/** A deterministic UUID per logical person, so uniq counts are predictable. */
function userUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

interface EventSeed {
  insertId: string;
  type: "status_viewed" | "status_share_cta_clicked" | "status_share_result";
  statusId: string;
  user: number;
  daysAgo?: number;
  props?: Record<string, string | number>;
  tenant?: string;
}

async function insert(events: EventSeed[]): Promise<void> {
  const now = Date.now();
  await admin.insert({
    table: `${DB}.saas_events`,
    format: "JSONEachRow",
    values: events.map((e) => {
      const ts = new Date(now - (e.daysAgo ?? 1) * 86_400_000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 23);
      return {
        tenant: e.tenant ?? TENANT,
        insert_id: e.insertId,
        event_type: e.type,
        user_id: userUuid(e.user),
        device_id: `dev-${e.user}`,
        event_time: ts,
        server_time: ts,
        event_properties: { status_id: e.statusId, ...(e.props ?? {}) },
      };
    }),
  });
}

const WINDOW = { dateFrom: "2000-01-01", dateTo: "2999-01-01" };
const NO_ALIAS = new Map<string, string>();

beforeAll(async () => {
  // This suite needs no Postgres, but `loadEnv()` validates as a unit and the
  // integration project deliberately leaves DATABASE_URL unset so testcontainers
  // can own it. A placeholder satisfies the schema; nothing here connects to it.
  process.env.DATABASE_URL ??= "postgres://u:p@localhost:5432/db";

  container = await new GenericContainer("clickhouse/clickhouse-server:25.3")
    .withExposedPorts(8123)
    .withEnvironment({
      CLICKHOUSE_USER: "default",
      CLICKHOUSE_PASSWORD: "test",
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: "1",
    })
    .withWaitStrategy(Wait.forHttp("/ping", 8123).forStatusCode(200))
    .withStartupTimeout(180_000)
    .start();

  const url = `http://${container.getHost()}:${container.getMappedPort(8123)}`;
  admin = createClient({ url, username: "default", password: "test" });
  await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${DB}` });
  await admin.command({ query: CREATE_TABLE });

  // The repository reads config through loadEnv(), so set it before it caches.
  process.env.CLICKHOUSE_URL = url;
  process.env.CLICKHOUSE_USER = "default";
  process.env.CLICKHOUSE_PASSWORD = "test";
  process.env.CLICKHOUSE_DATABASE = DB;
  process.env.CLICKHOUSE_TENANT = TENANT;
  resetEnvCache();

  repo = new StatusAnalyticsWarehouseRepository();
}, 240_000);

afterAll(async () => {
  await closeStatusWarehouseClient();
  await admin?.close();
  await container?.stop();
});

beforeEach(async () => {
  await admin.command({ query: `TRUNCATE TABLE ${DB}.saas_events` });
  await closeStatusWarehouseClient();
});

/** Unwraps an outcome, failing loudly with its status if it is not `ok`. */
function ok<T>(outcome: { status: string } & Record<string, unknown>): T {
  if (outcome.status !== "ok") {
    throw new Error(`expected ok, got "${outcome.status}"`);
  }
  return outcome["data"] as T;
}

describe("aggregateByItem", () => {
  const A = "11111111-1111-4111-8111-111111111111";

  test("counts views, viewers, intents and successful shares", async () => {
    await insert([
      { insertId: "v1", type: "status_viewed", statusId: A, user: 1, props: { position_index: 2 } },
      { insertId: "v2", type: "status_viewed", statusId: A, user: 1, props: { position_index: 4 } },
      { insertId: "v3", type: "status_viewed", statusId: A, user: 2, props: { position_index: 6 } },
      { insertId: "i1", type: "status_share_cta_clicked", statusId: A, user: 1 },
      { insertId: "s1", type: "status_share_result", statusId: A, user: 1, props: { result: "success" } },
      { insertId: "s2", type: "status_share_result", statusId: A, user: 2, props: { result: "failure" } },
    ]);

    const data = ok<{ byStatusId: Map<string, Record<string, number | null>> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );
    const m = data.byStatusId.get(A);

    expect(m?.["views"]).toBe(3);
    expect(m?.["viewers"]).toBe(2); // two distinct users, three views
    expect(m?.["shareIntents"]).toBe(1);
    expect(m?.["shares"]).toBe(1); // the failure is excluded
    expect(m?.["avgPositionIndex"]).toBe(4); // (2+4+6)/3 — still 0-based here
  });

  test("deduplicates a replayed event by insert_id", async () => {
    const dup: EventSeed = { insertId: "same", type: "status_viewed", statusId: A, user: 1 };
    await insert([dup]);
    await insert([dup]); // at-least-once delivery replays the same row

    const data = ok<{ byStatusId: Map<string, Record<string, number>> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );

    expect(data.byStatusId.get(A)?.["views"]).toBe(1);
  });

  test("remaps Home-feed ids onto the canonical status id before grouping", async () => {
    const homeCardId = "99999999-9999-4999-8999-999999999999";
    await insert([
      { insertId: "v1", type: "status_viewed", statusId: A, user: 1 },
      // A share that originated on Home carries the CARD's id.
      { insertId: "s1", type: "status_share_result", statusId: homeCardId, user: 2, props: { result: "success" } },
    ]);

    const without = ok<{ byStatusId: Map<string, Record<string, number>> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );
    const withAlias = ok<{ byStatusId: Map<string, Record<string, number>> }>(
      await repo.aggregateByItem(WINDOW, new Map([[homeCardId, A]])),
    );

    // Without the map the share lands under an id no status item has, and is
    // lost — this is the ~25% measured on production.
    expect(without.byStatusId.get(A)?.["shares"] ?? 0).toBe(0);
    expect(withAlias.byStatusId.get(A)?.["shares"]).toBe(1);
  });

  test("counts every tenant when none is configured — the single-tenant deploy path", async () => {
    await insert([
      { insertId: "mine", type: "status_viewed", statusId: A, user: 1 },
      { insertId: "theirs", type: "status_viewed", statusId: A, user: 2, tenant: OTHER_TENANT },
    ]);

    const tenant = process.env.CLICKHOUSE_TENANT;
    delete process.env.CLICKHOUSE_TENANT;
    resetEnvCache();
    await closeStatusWarehouseClient();

    try {
      const data = ok<{ byStatusId: Map<string, Record<string, number>> }>(
        await repo.aggregateByItem(WINDOW, NO_ALIAS),
      );
      // Unset must NOT mean `tenant = ''` — that matches nothing and would
      // render an empty report that reads as zero engagement. It means "do not
      // filter", which is correct while exactly one tenant exists.
      expect(data.byStatusId.get(A)?.["views"]).toBe(2);
    } finally {
      process.env.CLICKHOUSE_TENANT = tenant;
      resetEnvCache();
      await closeStatusWarehouseClient();
    }
  });

  test("counts only the configured tenant", async () => {
    await insert([
      { insertId: "mine", type: "status_viewed", statusId: A, user: 1 },
      { insertId: "theirs", type: "status_viewed", statusId: A, user: 2, tenant: OTHER_TENANT },
    ]);

    const data = ok<{ byStatusId: Map<string, Record<string, number>> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );

    expect(data.byStatusId.get(A)?.["views"]).toBe(1);
  });

  test("honours the date window on the MATERIALIZED event_date", async () => {
    await insert([
      { insertId: "old", type: "status_viewed", statusId: A, user: 1, daysAgo: 400 },
      { insertId: "new", type: "status_viewed", statusId: A, user: 2, daysAgo: 1 },
    ]);

    const today = new Date();
    const from = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);

    const data = ok<{ byStatusId: Map<string, Record<string, number>> }>(
      await repo.aggregateByItem({ dateFrom: from, dateTo: to }, NO_ALIAS),
    );

    // `event_date` is MATERIALIZED and absent from SELECT *; if the dedup
    // subquery stopped naming it, this predicate would fail to compile rather
    // than silently widen — which is exactly why it is asserted here.
    expect(data.byStatusId.get(A)?.["views"]).toBe(1);
  });

  test("counts shares for Completion only from the intent-availability date", async () => {
    await insert([
      // A share long before status_share_cta_clicked existed.
      { insertId: "s-old", type: "status_share_result", statusId: A, user: 1, daysAgo: 400, props: { result: "success" } },
      { insertId: "s-new", type: "status_share_result", statusId: A, user: 2, daysAgo: 1, props: { result: "success" } },
    ]);

    const data = ok<{ byStatusId: Map<string, Record<string, number>> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );
    const m = data.byStatusId.get(A);

    // `shares` is a real count over the whole window; only the Completion
    // numerator is clipped, or the ratio divides a full-window numerator by a
    // partial-window denominator and reads over 100%.
    expect(m?.["shares"]).toBe(2);
    expect(m?.["sharesInIntentWindow"]).toBe(1);
  });

  test("reports per-event-type counts for the silent-zero canary", async () => {
    const data = ok<{ eventCounts: Record<string, number> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );

    // An empty warehouse and a renamed event key look identical from here, so
    // the service compares these against a non-empty catalogue.
    expect(data.eventCounts).toEqual({ viewed: 0, shareIntents: 0, shareResults: 0 });
  });

  test("ignores rows whose status_id is missing", async () => {
    await admin.insert({
      table: `${DB}.saas_events`,
      format: "JSONEachRow",
      values: [
        {
          tenant: TENANT,
          insert_id: "no-id",
          event_type: "status_viewed",
          user_id: userUuid(1),
          event_time: "2026-09-20 10:00:00.000",
          server_time: "2026-09-20 10:00:00.000",
          event_properties: { media_type: "image" },
        },
      ],
    });

    const data = ok<{ byStatusId: Map<string, unknown> }>(
      await repo.aggregateByItem(WINDOW, NO_ALIAS),
    );

    expect(data.byStatusId.has("")).toBe(false);
    expect(data.byStatusId.size).toBe(0);
  });
});

describe("aggregateByDeity", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  test("groups by the CMS deity mapping, not by anything on the events", async () => {
    await insert([
      { insertId: "v1", type: "status_viewed", statusId: A, user: 1 },
      { insertId: "v2", type: "status_viewed", statusId: B, user: 2 },
    ]);

    const byDeity = ok<Map<string, Record<string, number>>>(
      await repo.aggregateByDeity(
        WINDOW,
        NO_ALIAS,
        new Map([
          [A, "hanuman"],
          [B, "hanuman"],
        ]),
      ),
    );

    expect(byDeity.get("hanuman")?.["views"]).toBe(2);
  });

  test("counts a person who viewed two of a deity's items as ONE viewer", async () => {
    await insert([
      { insertId: "v1", type: "status_viewed", statusId: A, user: 7 },
      { insertId: "v2", type: "status_viewed", statusId: B, user: 7 },
    ]);

    const byDeity = ok<Map<string, Record<string, number>>>(
      await repo.aggregateByDeity(
        WINDOW,
        NO_ALIAS,
        new Map([
          [A, "hanuman"],
          [B, "hanuman"],
        ]),
      ),
    );

    // This is the whole reason the deity roll-up is its own query: summing the
    // per-item rows would report 2 viewers for one devotee.
    expect(byDeity.get("hanuman")?.["views"]).toBe(2);
    expect(byDeity.get("hanuman")?.["viewers"]).toBe(1);
  });

  test("items with no mapping fall into the (no deity) bucket rather than vanishing", async () => {
    await insert([{ insertId: "v1", type: "status_viewed", statusId: A, user: 1 }]);

    const byDeity = ok<Map<string, Record<string, number>>>(
      await repo.aggregateByDeity(WINDOW, NO_ALIAS, new Map()),
    );

    expect(byDeity.get(STATUS_PERFORMANCE_NO_DEITY)?.["views"]).toBe(1);
  });
});

describe("degraded outcomes", () => {
  test("returns `unconfigured` rather than throwing when credentials are absent", async () => {
    const url = process.env.CLICKHOUSE_URL;
    delete process.env.CLICKHOUSE_URL;
    resetEnvCache();

    try {
      const outcome = await repo.aggregateByItem(WINDOW, NO_ALIAS);
      // A request path must degrade, never 500 — the serving API is required to
      // run with no warehouse configuration at all.
      expect(outcome.status).toBe("unconfigured");
    } finally {
      process.env.CLICKHOUSE_URL = url;
      resetEnvCache();
    }
  });

  test("returns `unreachable` rather than throwing when the server is not there", async () => {
    const url = process.env.CLICKHOUSE_URL;
    process.env.CLICKHOUSE_URL = "http://127.0.0.1:1";
    resetEnvCache();
    await closeStatusWarehouseClient();

    try {
      const outcome = await repo.aggregateByItem(WINDOW, NO_ALIAS);
      expect(["unreachable", "timeout"]).toContain(outcome.status);
    } finally {
      process.env.CLICKHOUSE_URL = url;
      resetEnvCache();
      await closeStatusWarehouseClient();
    }
  }, 60_000);
});
