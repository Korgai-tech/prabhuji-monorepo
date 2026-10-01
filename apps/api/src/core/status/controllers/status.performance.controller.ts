import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type {
  StatusPerformancePage,
  StatusPerformanceService,
} from "@api/core/status/services";
import type {
  AdminStatusPerformanceDeityCsvQueryInput,
  AdminStatusPerformanceDeityListQueryInput,
  AdminStatusPerformanceItemCsvQueryInput,
  AdminStatusPerformanceItemListQueryInput,
} from "@api/core/status/routes/status.admin.schemas";

/**
 * HTTP boundary for the read-only `/admin/status/performance/*` surface
 * (TAM-256). Thin: validated query in, envelope or CSV out. Auth is applied
 * centrally by `registerAdminRoute`.
 */

/** Export cap. Past this the export is truncated and SAYS so in a final row. */
const CSV_MAX_ROWS = 50_000;

/** RFC 4180: quote when the value could otherwise break the row. */
type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(cells: CsvValue[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

/** `YYYY-MM-DD` slice of an ISO timestamp, or blank. */
function dateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

const ITEM_CSV_HEADER = [
  "status_id",
  "slug",
  "title",
  "deity_slug",
  "deity_name",
  "media_type",
  "active",
  "created_at",
  "days_live",
  "status_pin_position",
  "status_pin_position_all_gods",
  "status_pin_position_deity",
  "homepage_pin_position",
  "avg_observed_position_1_based",
  "on_homepage_since",
  "views",
  "viewers_approx",
  "share_intents",
  "shares",
  "share_rate",
  "completion",
];

const DEITY_CSV_HEADER = [
  "deity_slug",
  "deity_name",
  "total_items",
  "active_items",
  "items_in_feed",
  "views",
  "viewers_approx",
  "share_intents",
  "shares",
  "share_rate",
  "completion",
  "views_per_item",
  "shares_per_item",
  "best_item_slug",
  "best_item_share_rate",
];

export class StatusPerformanceController {
  constructor(private readonly service: StatusPerformanceService) {}

  listByItem = async (
    req: FastifyRequest<{ Querystring: AdminStatusPerformanceItemListQueryInput }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const page = await this.service.listByItem(req.query);
    return sendSuccess(reply, page, "OK");
  };

  listByDeity = async (
    req: FastifyRequest<{ Querystring: AdminStatusPerformanceDeityListQueryInput }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const page = await this.service.listByDeity(req.query);
    return sendSuccess(reply, page, "OK");
  };

  /**
   * A CSV export must REFUSE rather than emit a file of empty metric columns
   * when the warehouse is degraded.
   *
   * On screen an "unavailable" banner explains the blanks. A downloaded file
   * carries no banner — opened next week it is indistinguishable from a
   * catalogue nobody engaged with, and someone will make a content decision on
   * it. Failing loudly is the only honest option.
   */
  private assertExportable(page: StatusPerformancePage<unknown>): void {
    if (!page.warehouseAvailable) {
      throw new AppError(
        "The analytics warehouse is unavailable, so this export would contain no metrics. Retry once the report loads on screen.",
        503,
        "WAREHOUSE_UNAVAILABLE",
      );
    }
  }

  private sendCsv(reply: FastifyReply, filename: string, body: string): FastifyReply {
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      // Excel reads a BOM-less UTF-8 CSV as the local ANSI codepage, which
      // mangles every Devanagari title in the file.
      .send("﻿" + body);
  }

  exportItemsCsv = async (
    req: FastifyRequest<{ Querystring: AdminStatusPerformanceItemCsvQueryInput }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const page = await this.service.listByItem({
      ...req.query,
      page: 1,
      pageSize: CSV_MAX_ROWS,
    });
    this.assertExportable(page);

    let body = csvRow(ITEM_CSV_HEADER);
    for (const row of page.items) {
      body += csvRow([
        row.id,
        row.slug,
        row.title,
        row.deitySlug,
        row.deityName,
        row.mediaType,
        row.isActive,
        dateOnly(row.createdAt),
        row.daysLive,
        row.statusPinPosition,
        row.statusPinPositionAllGods,
        row.statusPinPositionDeity,
        row.homepagePinPosition,
        row.avgObservedPosition,
        dateOnly(row.onHomepageSince),
        row.views,
        row.viewers,
        row.shareIntents,
        row.shares,
        row.shareRate,
        row.completion,
      ]);
    }
    body += this.truncationNotice(page.total, ITEM_CSV_HEADER.length);

    return this.sendCsv(reply, this.filename("status-performance-items", req.query), body);
  };

  exportDeitiesCsv = async (
    req: FastifyRequest<{ Querystring: AdminStatusPerformanceDeityCsvQueryInput }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const page = await this.service.listByDeity({
      ...req.query,
      page: 1,
      pageSize: CSV_MAX_ROWS,
    });
    this.assertExportable(page);

    let body = csvRow(DEITY_CSV_HEADER);
    for (const row of page.items) {
      body += csvRow([
        row.deitySlug,
        row.deityName,
        row.totalItems,
        row.activeItems,
        row.itemsInFeed,
        row.views,
        row.viewers,
        row.shareIntents,
        row.shares,
        row.shareRate,
        row.completion,
        row.viewsPerItem,
        row.sharesPerItem,
        row.bestItem?.slug ?? null,
        row.bestItem?.shareRate ?? null,
      ]);
    }
    body += this.truncationNotice(page.total, DEITY_CSV_HEADER.length);

    return this.sendCsv(reply, this.filename("status-performance-deities", req.query), body);
  };

  /**
   * A truncated export says so IN THE FILE. A row count that silently stops at
   * the cap is the same failure mode as a blank metric column: it looks
   * complete.
   */
  private truncationNotice(total: number, columns: number): string {
    if (total <= CSV_MAX_ROWS) return "";
    const cells: CsvValue[] = new Array<CsvValue>(columns).fill("");
    cells[0] = `TRUNCATED: ${total} rows matched, ${CSV_MAX_ROWS} exported`;
    return csvRow(cells);
  }

  private filename(
    prefix: string,
    query: { dateFrom?: string | undefined; dateTo?: string | undefined },
  ): string {
    const from = query.dateFrom ?? "start";
    const to = query.dateTo ?? "today";
    return `${prefix}_${from}_to_${to}.csv`;
  }
}
