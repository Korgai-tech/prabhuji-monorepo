import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { STATUS_PERFORMANCE_NO_DEITY } from "@api/core/status/types";
import type {
  StatusHomeFeedAliasMap,
  StatusItemAggregate,
  StatusPerformanceCatalogueRow,
  StatusPinPositions,
  StatusWindowMetrics,
  WarehouseOutcome,
  DeityWindowMetrics,
} from "../../repositories/index.js";
import type { StatusPerformanceRepository } from "../../repositories/status.performance.repository.js";
import type { StatusAnalyticsWarehouseRepository } from "../../repositories/status.analytics.warehouse.repository.js";
import { StatusPerformanceService } from "../status.performance.service.js";

/**
 * Unit coverage for `StatusPerformanceService` (TAM-256).
 *
 * Both repositories are hand-rolled fakes: the service is pure orchestration,
 * and every behaviour worth asserting here is a derivation rule that a real
 * Postgres or a real warehouse would only make slower to exercise.
 *
 * The cases are chosen to pin the rules that are easy to "simplify" wrongly
 * later — blank-vs-zero, the intent-window numerator, blanks sorting last, the
 * IST clamp, and the two flags that keep a blank page from reading as a quiet
 * catalogue.
 */

const NOW = new Date("2026-09-22T06:00:00.000Z"); // 11:30 IST on 2026-09-22

function item(
  over: Partial<StatusPerformanceCatalogueRow> = {},
): StatusPerformanceCatalogueRow {
  return {
    id: "item-1",
    slug: "ganesh-morning",
    title: "Ganesh Morning",
    thumbnailUrl: "https://cdn.test/thumb.jpg",
    deitySlug: "ganesha",
    mediaType: "image",
    isActive: true,
    createdAt: new Date("2026-09-12T00:00:00.000Z"),
    ...over,
  };
}

function metrics(over: Partial<StatusWindowMetrics> = {}): StatusWindowMetrics {
  return {
    views: 200,
    viewers: 150,
    shareIntents: 40,
    shares: 50,
    sharesInIntentWindow: 20,
    avgPositionIndex: 2,
    ...over,
  };
}

const EMPTY_ALIAS: StatusHomeFeedAliasMap = {
  homeFeedIdToStatusId: new Map(),
  statusIdToHomeFeedId: new Map(),
};

function fakeRepo(
  catalogue: StatusPerformanceCatalogueRow[],
  opts: {
    alias?: StatusHomeFeedAliasMap;
    pins?: Map<string, StatusPinPositions>;
    cardDates?: Map<string, Date>;
  } = {},
): StatusPerformanceRepository {
  return {
    listCatalogue: () => Promise.resolve(catalogue),
    buildHomeFeedAliasMap: () => Promise.resolve(opts.alias ?? EMPTY_ALIAS),
    findHomeFeedCardDates: () => Promise.resolve(opts.cardDates ?? new Map()),
    findActivePinPositions: () => Promise.resolve(opts.pins ?? new Map()),
  } as Partial<StatusPerformanceRepository> as StatusPerformanceRepository;
}

function fakeWarehouse(
  byStatusId: Map<string, StatusWindowMetrics>,
  opts: {
    outcome?: WarehouseOutcome<StatusItemAggregate>;
    deity?: Map<string, DeityWindowMetrics>;
    capture?: { window?: { dateFrom: string; dateTo: string } };
  } = {},
): StatusAnalyticsWarehouseRepository {
  const counts = { viewed: 0, shareIntents: 0, shareResults: 0 };
  for (const m of byStatusId.values()) {
    counts.viewed += m.views;
    counts.shareIntents += m.shareIntents;
    counts.shareResults += m.shares;
  }
  return {
    aggregateByItem: (window: { dateFrom: string; dateTo: string }) => {
      if (opts.capture) opts.capture.window = window;
      return Promise.resolve(
        opts.outcome ?? { status: "ok", data: { byStatusId, eventCounts: counts } },
      );
    },
    aggregateByDeity: () =>
      Promise.resolve({
        status: "ok" as const,
        data: opts.deity ?? new Map<string, DeityWindowMetrics>(),
      }),
  } as Partial<StatusAnalyticsWarehouseRepository> as StatusAnalyticsWarehouseRepository;
}

const baseQuery = {
  page: 1,
  pageSize: 25,
  order: "desc" as const,
  minViews: 0,
};

beforeEach(() => {
  registerGlobalService("deity", {
    getActiveDeities: () =>
      Promise.resolve([
        { slug: "ganesha", displayName: "Ganesha", iconUrl: "https://cdn/i.png", sortOrder: 1 },
      ]),
    getBySlug: () => Promise.resolve(null),
  });
});

afterEach(() => {
  clearGlobalServices();
});

describe("blank is not zero (D-10)", () => {
  test("an item with no views has NO share rate, rather than a share rate of 0", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map([["item-1", metrics({ views: 0, shares: 0 })]])),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);

    // The distinction an editor acts on: unseen content must not rank beside
    // unshared content, or they retire the wrong thing.
    expect(page.items[0]?.shareRate).toBeNull();
    expect(page.items[0]?.views).toBe(0);
  });

  test("an item seen but never shared HAS a share rate, and it is 0", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map([["item-1", metrics({ views: 300, shares: 0 })]])),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);
    expect(page.items[0]?.shareRate).toBe(0);
  });
});

describe("completion uses the intent-window numerator", () => {
  test("divides intent-window shares by intents, NOT full-window shares", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(
        new Map([["item-1", metrics({ shares: 50, sharesInIntentWindow: 20, shareIntents: 40 })]]),
      ),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);

    // 20/40, not 50/40. The full-window form reads 125% on real data because
    // status_share_cta_clicked only exists from 2026-09-12 while
    // status_share_result goes back further.
    expect(page.items[0]?.completion).toBe(0.5);
    expect(page.items[0]?.shares).toBe(50); // the count itself stays full-window
  });

  test("intents and completion are blank for a window entirely before intents existed", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map([["item-1", metrics()]])),
    );

    const page = await svc.listByItem(
      { ...baseQuery, dateFrom: "2026-08-01", dateTo: "2026-09-01" },
      NOW,
    );

    // Blank, never 0 — a zero intent count would read as "nobody tried to
    // share", when the truth is the event did not exist yet.
    expect(page.items[0]?.shareIntents).toBeNull();
    expect(page.items[0]?.completion).toBeNull();
    expect(page.metricsAvailableFrom).toBe("2026-09-12");
  });
});

describe("the IST window", () => {
  test("clamps dateTo to today, because the warehouse holds future-dated rows", async () => {
    const capture: { window?: { dateFrom: string; dateTo: string } } = {};
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map(), { capture }),
    );

    await svc.listByItem({ ...baseQuery, dateFrom: "2026-09-01", dateTo: "2026-12-31" }, NOW);

    // Client clock skew survives corrected_time: measured max(event_date) was
    // six days ahead of today. Unclamped, "today" silently includes them.
    expect(capture.window?.dateTo).toBe("2026-09-22");
  });

  test("days live counts IST calendar days and ignores the window", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item({ createdAt: new Date("2026-09-12T00:00:00.000Z") })]),
      fakeWarehouse(new Map([["item-1", metrics()]])),
    );

    const page = await svc.listByItem(
      { ...baseQuery, dateFrom: "2026-09-20", dateTo: "2026-09-22" },
      NOW,
    );
    expect(page.items[0]?.daysLive).toBe(10);
  });
});

describe("observed position", () => {
  test("is converted to 1-based, so the top of the feed reads 1.0 not 0.0", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map([["item-1", metrics({ avgPositionIndex: 0 })]])),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);
    expect(page.items[0]?.avgObservedPosition).toBe(1);
  });

  test("stays blank when the item had no views in the window", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map([["item-1", metrics({ avgPositionIndex: null })]])),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);
    expect(page.items[0]?.avgObservedPosition).toBeNull();
  });
});

describe("sorting", () => {
  test("blanks sort LAST in both directions", async () => {
    const pins = new Map<string, StatusPinPositions>([
      ["item-2", { statusAllGods: 3, statusDeity: null, home: null }],
      ["item-3", { statusAllGods: 1, statusDeity: null, home: null }],
    ]);
    const catalogue = [
      item({ id: "item-1", slug: "a" }),
      item({ id: "item-2", slug: "b" }),
      item({ id: "item-3", slug: "c" }),
    ];
    const m = new Map(catalogue.map((c) => [c.id, metrics()]));
    const svc = new StatusPerformanceService(
      fakeRepo(catalogue, { pins }),
      fakeWarehouse(m),
    );

    const asc = await svc.listByItem(
      { ...baseQuery, sort: "statusPinPosition", order: "asc" },
      NOW,
    );
    const desc = await svc.listByItem(
      { ...baseQuery, sort: "statusPinPosition", order: "desc" },
      NOW,
    );

    // Otherwise one direction renders a screen of empty cells and the column is
    // useless — "sort by pin position" means "show me the pinned ones".
    expect(asc.items.map((r) => r.statusPinPosition)).toEqual([1, 3, null]);
    expect(desc.items.map((r) => r.statusPinPosition)).toEqual([3, 1, null]);
  });
});

describe("the minimum-views floor", () => {
  test("hides items below the floor and narrows total to match", async () => {
    const catalogue = [item({ id: "item-1" }), item({ id: "item-2" })];
    const svc = new StatusPerformanceService(
      fakeRepo(catalogue),
      fakeWarehouse(
        new Map([
          ["item-1", metrics({ views: 300 })],
          ["item-2", metrics({ views: 5 })],
        ]),
      ),
    );

    const page = await svc.listByItem({ ...baseQuery, minViews: 100 }, NOW);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  test("is NOT applied when the warehouse is down — every view count would be 0", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map(), { outcome: { status: "unreachable" } }),
    );

    const page = await svc.listByItem({ ...baseQuery, minViews: 100 }, NOW);

    // Applying it would hide the ENTIRE catalogue behind a threshold no row can
    // meet, so a warehouse outage would read as "you have no content".
    expect(page.items).toHaveLength(1);
    expect(page.warehouseAvailable).toBe(false);
  });
});

describe("flags that keep a blank page honest", () => {
  test("metricsSuspect fires when the catalogue is non-empty but every event count is 0", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map()), // no metrics rows => all counts 0
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);

    // A renamed event_properties key or event_type does NOT error — it returns
    // zero, and the page would otherwise read as a healthy, quiet catalogue.
    expect(page.metricsSuspect).toBe(true);
  });

  test("metricsSuspect does NOT fire when the warehouse is simply unavailable", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]),
      fakeWarehouse(new Map(), { outcome: { status: "timeout" } }),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);
    // That case is already reported by warehouseAvailable; two alarms for one
    // fault would teach editors to ignore both.
    expect(page.metricsSuspect).toBe(false);
    expect(page.warehouseAvailable).toBe(false);
  });

  test("partialAttribution fires when an item has no home-feed card carrying its id", async () => {
    const svc = new StatusPerformanceService(
      fakeRepo([item()]), // EMPTY_ALIAS => nothing maps
      fakeWarehouse(new Map([["item-1", metrics()]])),
    );

    const page = await svc.listByItem({ ...baseQuery }, NOW);
    expect(page.partialAttribution).toBe(true);
  });
});

describe("by deity", () => {
  test("groups unmapped items under the (no deity) sentinel rather than dropping them", async () => {
    const catalogue = [
      item({ id: "item-1", deitySlug: "ganesha" }),
      item({ id: "item-2", deitySlug: null }),
    ];
    const svc = new StatusPerformanceService(
      fakeRepo(catalogue),
      fakeWarehouse(new Map(), {
        deity: new Map([
          ["ganesha", { views: 100, viewers: 80, shareIntents: 10, shares: 5, sharesInIntentWindow: 5 }],
          [STATUS_PERFORMANCE_NO_DEITY, { views: 20, viewers: 18, shareIntents: 2, shares: 1, sharesInIntentWindow: 1 }],
        ]),
      }),
    );

    const page = await svc.listByDeity({ page: 1, pageSize: 25, order: "desc" }, NOW);
    const slugs = page.items.map((r) => r.deitySlug);

    expect(slugs).toContain(STATUS_PERFORMANCE_NO_DEITY);
    expect(page.items.find((r) => r.deitySlug === STATUS_PERFORMANCE_NO_DEITY)?.deityName).toBe(
      "(no deity)",
    );
  });

  test("best item respects the 100-view floor and is blank when nothing clears it", async () => {
    const catalogue = [item({ id: "item-1", deitySlug: "ganesha" })];
    const svc = new StatusPerformanceService(
      fakeRepo(catalogue),
      fakeWarehouse(new Map([["item-1", metrics({ views: 99, shares: 99 })]]), {
        deity: new Map([["ganesha", { views: 99, viewers: 80, shareIntents: 10, shares: 99, sharesInIntentWindow: 99 }]]),
      }),
    );

    const page = await svc.listByDeity({ page: 1, pageSize: 25, order: "desc" }, NOW);

    // Without the floor, "best" is an item with one view and one share at 100%.
    expect(page.items[0]?.bestItem).toBeNull();
  });

  test("viewers is the deity's own uniq, not the sum of its items'", async () => {
    const catalogue = [
      item({ id: "item-1", deitySlug: "ganesha" }),
      item({ id: "item-2", deitySlug: "ganesha" }),
    ];
    const svc = new StatusPerformanceService(
      fakeRepo(catalogue),
      fakeWarehouse(
        new Map([
          ["item-1", metrics({ viewers: 100 })],
          ["item-2", metrics({ viewers: 100 })],
        ]),
        { deity: new Map([["ganesha", { views: 400, viewers: 120, shareIntents: 10, shares: 5, sharesInIntentWindow: 5 }]]) },
      ),
    );

    const page = await svc.listByDeity({ page: 1, pageSize: 25, order: "desc" }, NOW);

    // 120, not 200: one devotee who viewed both items is one viewer. Tab 2 will
    // not reconcile with Tab 1 by addition, and that is correct.
    expect(page.items[0]?.viewers).toBe(120);
  });
});
