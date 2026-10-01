import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import {
  STATUS_PERFORMANCE_NO_DEITY,
  STATUS_SHARE_INTENT_AVAILABLE_FROM,
  type StatusMediaType,
  type StatusPerformanceDeitySortField,
  type StatusPerformanceItemSortField,
} from "@api/core/status/types";
import type {
  DeityWindowMetrics,
  StatusPerformanceCatalogueRow,
  StatusPerformanceRepository,
  StatusAnalyticsWarehouseRepository,
  StatusWindowMetrics,
  WarehouseOutcome,
} from "@api/core/status/repositories";

const log = createModuleLogger("status:performance");

/**
 * Admin status-performance report (TAM-256) — orchestration only.
 *
 * Joins CMS truth (Postgres) to window metrics (ClickHouse) on the canonical
 * `status_items.id`, derives every ratio, and sorts/pages the RESULT. No data
 * access lives here: no Prisma, no ClickHouse client.
 *
 * Sorting and paging happen after the join on purpose. The warehouse aggregate
 * is window-scoped and page-independent, so pushing ORDER BY/LIMIT down would
 * buy a fresh scan per header click; and half the sortable columns (every
 * ratio, Days live) do not exist in either store until this file computes them.
 */

/** IST is UTC+05:30, fixed — India observes no DST, so an offset is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for an instant, in IST. */
function toIstDate(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole IST calendar days between two IST date strings. */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * A ratio, or `null` when it is undefined rather than zero (D-10).
 *
 * The distinction is the point: a status nobody shared has a share rate of 0,
 * while a status nobody has SEEN has no share rate at all. Collapsing the
 * second into `0` would rank unseen content alongside unshared content and
 * quietly invite an editor to retire it.
 */
function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** Every value a sortable column can hold. Bounds what `compare` may stringify. */
type Comparable = string | number | boolean | null | undefined;

export interface StatusPerformanceWindowInput {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}

export interface StatusPerformanceItemQuery extends StatusPerformanceWindowInput {
  page: number;
  pageSize: number;
  sort?: StatusPerformanceItemSortField | undefined;
  order: "asc" | "desc";
  q?: string | undefined;
  deitySlug?: string | undefined;
  mediaType?: StatusMediaType | undefined;
  isActive?: boolean | undefined;
  minViews: number;
}

export interface StatusPerformanceDeityQuery extends StatusPerformanceWindowInput {
  page: number;
  pageSize: number;
  sort?: StatusPerformanceDeitySortField | undefined;
  order: "asc" | "desc";
  q?: string | undefined;
  mediaType?: StatusMediaType | undefined;
}

export interface StatusPerformanceItemRow {
  id: string;
  slug: string;
  title: string;
  thumbnailUrl: string;
  deitySlug: string | null;
  deityName: string | null;
  mediaType: StatusMediaType;
  isActive: boolean;
  createdAt: string;
  daysLive: number;
  statusPinPosition: number | null;
  statusPinPositionAllGods: number | null;
  statusPinPositionDeity: number | null;
  homepagePinPosition: number | null;
  avgObservedPosition: number | null;
  onHomepageSince: string | null;
  views: number;
  viewers: number;
  shareIntents: number | null;
  shares: number;
  shareRate: number | null;
  completion: number | null;
}

export interface StatusPerformanceDeityRow {
  deitySlug: string;
  deityName: string;
  totalItems: number;
  activeItems: number;
  itemsInFeed: number;
  views: number;
  viewers: number;
  shareIntents: number | null;
  shares: number;
  shareRate: number | null;
  completion: number | null;
  viewsPerItem: number | null;
  sharesPerItem: number | null;
  bestItem: { id: string; slug: string; title: string; shareRate: number; views: number } | null;
}

export interface StatusPerformancePage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  warehouseAvailable: boolean;
  partialAttribution: boolean;
  metricsSuspect: boolean;
  metricsAvailableFrom: string;
}

/** The 100-view floor that also gates "Best item" (D-14). */
const BEST_ITEM_MIN_VIEWS = 100;

/** Default window when the caller names neither end: the trailing 30 IST days. */
const DEFAULT_WINDOW_DAYS = 30;

export class StatusPerformanceService {
  constructor(
    private readonly repo: StatusPerformanceRepository,
    private readonly warehouse: StatusAnalyticsWarehouseRepository,
  ) {}

  /**
   * Resolve the window to two IST dates, clamping the upper end to today.
   *
   * The clamp is not defensive tidiness. Client clock skew survives the
   * collector's `corrected_time` calculation, so the warehouse genuinely holds
   * future-dated rows — measured 2026-09-22, `max(event_date)` was 2026-09-28.
   * Without the clamp a "today" or "last 7 days" range silently sweeps them in
   * and the newest bucket reads wrong for reasons nobody can see.
   */
  private resolveWindow(input: StatusPerformanceWindowInput, now: Date) {
    const today = toIstDate(now);
    const dateTo = input.dateTo && input.dateTo < today ? input.dateTo : today;
    const dateFrom =
      input.dateFrom ??
      toIstDate(new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000));
    return { dateFrom: dateFrom > dateTo ? dateTo : dateFrom, dateTo };
  }

  /**
   * English deity display names, by slug.
   *
   * Through the deity facade, never a direct read of `deities` — arch
   * boundaries forbid reaching into another module's tables. A missing
   * translation falls back to the slug (D-13); a failure of the whole call
   * degrades to slugs rather than failing the report, because a deity's English
   * label is not worth a 500 on a metrics page.
   */
  private async deityNames(): Promise<Map<string, string>> {
    try {
      const deities = await performServiceCall(
        "deity",
        (svc) => svc.getActiveDeities({ locale: "en" }),
        "status:performance",
        "failed to load deity display names",
      );
      return new Map(deities.map((d) => [d.slug, d.displayName]));
    } catch (err) {
      log.warn({ err }, "deity display names unavailable — falling back to slugs");
      return new Map();
    }
  }

  /**
   * Blanks sort LAST in BOTH directions.
   *
   * Not a normal null-ordering choice: three of the four position columns are
   * blank for most rows, so folding nulls in with `-Infinity`/`Infinity` would
   * make one sort direction render a screen of empty cells and the column
   * useless. "Sort by pin position" means "show me the pinned ones", whichever
   * arrow is lit.
   */
  private compare(a: Comparable, b: Comparable, order: "asc" | "desc"): number {
    const aBlank = a === null || a === undefined;
    const bBlank = b === null || b === undefined;
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;

    let cmp: number;
    if (typeof a === "number" && typeof b === "number") cmp = a - b;
    else if (typeof a === "boolean" && typeof b === "boolean") cmp = Number(a) - Number(b);
    else cmp = String(a).localeCompare(String(b));


    return order === "asc" ? cmp : -cmp;
  }

  private paginate<T>(rows: T[], page: number, pageSize: number): T[] {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }

  /** Empty per-item metrics — the shape a degraded or unseen item reports. */
  private emptyMetrics(): StatusWindowMetrics {
    return {
      views: 0,
      viewers: 0,
      shareIntents: 0,
      shares: 0,
      sharesInIntentWindow: 0,
      avgPositionIndex: null,
    };
  }

  async listByItem(
    query: StatusPerformanceItemQuery,
    now: Date = new Date(),
  ): Promise<StatusPerformancePage<StatusPerformanceItemRow>> {
    const window = this.resolveWindow(query, now);

    const catalogue = await this.repo.listCatalogue({
      q: query.q,
      deitySlug: query.deitySlug,
      mediaType: query.mediaType,
      isActive: query.isActive,
    });
    const statusIds = catalogue.map((row) => row.id);

    const [alias, cardDates, names] = await Promise.all([
      this.repo.buildHomeFeedAliasMap(statusIds),
      this.repo.findHomeFeedCardDates(statusIds),
      this.deityNames(),
    ]);
    const pins = await this.repo.findActivePinPositions(statusIds, alias, now);

    const aggregate = await this.warehouse.aggregateByItem(
      window,
      alias.homeFeedIdToStatusId,
    );

    const warehouseAvailable = aggregate.status === "ok";
    const metrics =
      aggregate.status === "ok" ? aggregate.data.byStatusId : new Map<string, StatusWindowMetrics>();
    const counts =
      aggregate.status === "ok"
        ? aggregate.data.eventCounts
        : { viewed: 0, shareIntents: 0, shareResults: 0 };

    // The silent-zero canary. A rename of an `event_properties` key or an
    // `event_type` value does not error — it returns nothing — so a non-empty
    // catalogue with zero of all three event kinds is the signature of an
    // upstream change, not of a quiet week.
    const metricsSuspect =
      warehouseAvailable &&
      catalogue.length > 0 &&
      counts.viewed === 0 &&
      counts.shareIntents === 0 &&
      counts.shareResults === 0;

    const today = toIstDate(now);

    let rows: StatusPerformanceItemRow[] = catalogue.map((row) => {
      const m = metrics.get(row.id) ?? this.emptyMetrics();
      const pin = pins.get(row.id);
      const cardDate = cardDates.get(row.id) ?? null;
      const intentsKnown = window.dateTo >= STATUS_SHARE_INTENT_AVAILABLE_FROM;

      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        thumbnailUrl: row.thumbnailUrl,
        deitySlug: row.deitySlug,
        deityName: row.deitySlug ? (names.get(row.deitySlug) ?? row.deitySlug) : null,
        mediaType: row.mediaType,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        daysLive: daysBetween(toIstDate(row.createdAt), today),
        // All-gods wins the single on-screen cell; both ride the CSV (N-1).
        statusPinPosition: pin?.statusAllGods ?? pin?.statusDeity ?? null,
        statusPinPositionAllGods: pin?.statusAllGods ?? null,
        statusPinPositionDeity: pin?.statusDeity ?? null,
        homepagePinPosition: pin?.home ?? null,
        // 1-BASED for display (D-1b), converted exactly here — not in the
        // query (a hand-written query must keep showing the raw warehouse
        // value) and not in the UI or the CSV writer (they must agree).
        avgObservedPosition:
          m.avgPositionIndex === null ? null : m.avgPositionIndex + 1,
        onHomepageSince: cardDate ? cardDate.toISOString() : null,
        views: m.views,
        viewers: m.viewers,
        shareIntents: intentsKnown ? m.shareIntents : null,
        shares: m.shares,
        shareRate: ratio(m.shares, m.views),
        // Intent-window numerator — see the warehouse repository's note. A
        // full-window `shares` here would read up to 143% on real data.
        completion: intentsKnown ? ratio(m.sharesInIntentWindow, m.shareIntents) : null,
      };
    });

    // D-8: a HARD filter, applied before paging so `total` reflects what the
    // editor is actually looking at. Skipped entirely when the warehouse is
    // down, or a degraded report would hide the whole catalogue behind a
    // threshold no row can meet.
    if (warehouseAvailable && query.minViews > 0) {
      rows = rows.filter((row) => row.views >= query.minViews);
    }

    const total = rows.length;
    if (query.sort) {
      const field = query.sort;
      rows = [...rows].sort((a, b) =>
        this.compare(
          (a as unknown as Record<string, Comparable>)[field],
          (b as unknown as Record<string, Comparable>)[field],
          query.order,
        ),
      );
    }

    return {
      items: this.paginate(rows, query.page, query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
      warehouseAvailable,
      partialAttribution: this.hasUnattributedCards(catalogue, alias.statusIdToHomeFeedId),
      metricsSuspect,
      metricsAvailableFrom: STATUS_SHARE_INTENT_AVAILABLE_FROM,
    };
  }

  /**
   * True when some status items have no Home-feed card carrying their id.
   *
   * Those items' Home-originated shares cannot be canonicalised, so their
   * numbers are a floor rather than a count. Surfaced as a flag instead of
   * being silently absorbed.
   */
  private hasUnattributedCards(
    catalogue: StatusPerformanceCatalogueRow[],
    statusIdToHomeFeedId: Map<string, string>,
  ): boolean {
    return catalogue.some((row) => !statusIdToHomeFeedId.has(row.id));
  }

  async listByDeity(
    query: StatusPerformanceDeityQuery,
    now: Date = new Date(),
  ): Promise<StatusPerformancePage<StatusPerformanceDeityRow>> {
    const window = this.resolveWindow(query, now);

    const catalogue = await this.repo.listCatalogue({ mediaType: query.mediaType });
    const statusIds = catalogue.map((row) => row.id);

    const [alias, names] = await Promise.all([
      this.repo.buildHomeFeedAliasMap(statusIds),
      this.deityNames(),
    ]);

    const statusIdToDeitySlug = new Map(
      catalogue.map((row) => [row.id, row.deitySlug ?? STATUS_PERFORMANCE_NO_DEITY]),
    );

    const [itemAggregate, deityAggregate] = await Promise.all([
      this.warehouse.aggregateByItem(window, alias.homeFeedIdToStatusId),
      this.warehouse.aggregateByDeity(
        window,
        alias.homeFeedIdToStatusId,
        statusIdToDeitySlug,
      ),
    ]);

    const warehouseAvailable =
      itemAggregate.status === "ok" && deityAggregate.status === "ok";
    const itemMetrics =
      itemAggregate.status === "ok"
        ? itemAggregate.data.byStatusId
        : new Map<string, StatusWindowMetrics>();
    const deityMetrics = this.unwrapDeity(deityAggregate);

    const intentsKnown = window.dateTo >= STATUS_SHARE_INTENT_AVAILABLE_FROM;

    // Group the catalogue by deity. Null and unknown slugs both get a row —
    // nothing silently vanishes from a report an editor spends budget on.
    const groups = new Map<string, StatusPerformanceCatalogueRow[]>();
    for (const row of catalogue) {
      const key = row.deitySlug ?? STATUS_PERFORMANCE_NO_DEITY;
      const bucket = groups.get(key);
      if (bucket) bucket.push(row);
      else groups.set(key, [row]);
    }

    let rows: StatusPerformanceDeityRow[] = [...groups.entries()].map(([slug, items]) => {
      const m: DeityWindowMetrics = deityMetrics.get(slug) ?? {
        views: 0,
        viewers: 0,
        shareIntents: 0,
        shares: 0,
        sharesInIntentWindow: 0,
      };
      const activeItems = items.filter((i) => i.isActive).length;

      return {
        deitySlug: slug,
        deityName:
          slug === STATUS_PERFORMANCE_NO_DEITY ? "(no deity)" : (names.get(slug) ?? slug),
        totalItems: items.length,
        activeItems,
        // Every active status item IS in the status feed — the catalogue is the
        // feed (there is no separate membership table), so this equals
        // activeItems by construction rather than by coincidence.
        itemsInFeed: activeItems,
        views: m.views,
        // Its own `uniq` over the deity's whole item set — deliberately NOT the
        // sum of the item rows, which would triple-count one devotee who viewed
        // three of this deity's items. Tab 2 will not reconcile with Tab 1 by
        // addition, and that is correct.
        viewers: m.viewers,
        shareIntents: intentsKnown ? m.shareIntents : null,
        shares: m.shares,
        shareRate: ratio(m.shares, m.views),
        completion: intentsKnown ? ratio(m.sharesInIntentWindow, m.shareIntents) : null,
        // Views and Shares sum over ALL items while the divisor is ACTIVE
        // items, exactly as specified. The asymmetry is deliberate — an
        // inactive item's past views still cost production budget.
        viewsPerItem: ratio(m.views, activeItems),
        sharesPerItem: ratio(m.shares, activeItems),
        bestItem: this.bestItem(items, itemMetrics),
      };
    });

    if (query.q) {
      const needle = query.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.deitySlug.toLowerCase().includes(needle) ||
          r.deityName.toLowerCase().includes(needle),
      );
    }

    const total = rows.length;
    if (query.sort) {
      const field = query.sort;
      rows = [...rows].sort((a, b) =>
        this.compare(
          (a as unknown as Record<string, Comparable>)[field],
          (b as unknown as Record<string, Comparable>)[field],
          query.order,
        ),
      );
    }

    return {
      items: this.paginate(rows, query.page, query.pageSize),
      total,
      page: query.page,
      pageSize: query.pageSize,
      warehouseAvailable,
      partialAttribution: this.hasUnattributedCards(catalogue, alias.statusIdToHomeFeedId),
      metricsSuspect:
        warehouseAvailable &&
        catalogue.length > 0 &&
        itemAggregate.status === "ok" &&
        itemAggregate.data.eventCounts.viewed === 0 &&
        itemAggregate.data.eventCounts.shareIntents === 0 &&
        itemAggregate.data.eventCounts.shareResults === 0,
      metricsAvailableFrom: STATUS_SHARE_INTENT_AVAILABLE_FROM,
    };
  }

  private unwrapDeity(
    outcome: WarehouseOutcome<Map<string, DeityWindowMetrics>>,
  ): Map<string, DeityWindowMetrics> {
    return outcome.status === "ok"
      ? outcome.data
      : new Map<string, DeityWindowMetrics>();
  }

  /**
   * The deity's highest share rate among items clearing the 100-view floor.
   *
   * Blank is the EXPECTED result for most deities, not an error: of 505 items
   * with views over 30 days, 57 cleared 100. Without the floor "best" would be
   * an item with one view and one share at 100%.
   */
  private bestItem(
    items: StatusPerformanceCatalogueRow[],
    metrics: Map<string, StatusWindowMetrics>,
  ): StatusPerformanceDeityRow["bestItem"] {
    let best: StatusPerformanceDeityRow["bestItem"] = null;

    for (const item of items) {
      const m = metrics.get(item.id);
      if (!m || m.views < BEST_ITEM_MIN_VIEWS) continue;
      const rate = ratio(m.shares, m.views);
      if (rate === null) continue;

      // Ties break on the larger view count — the better-evidenced item wins.
      if (!best || rate > best.shareRate || (rate === best.shareRate && m.views > best.views)) {
        best = {
          id: item.id,
          slug: item.slug,
          title: item.title,
          shareRate: rate,
          views: m.views,
        };
      }
    }
    return best;
  }
}
