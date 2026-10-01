/** What the reporter is objecting to. Mirrors the `report_type` Postgres enum. */
export type ReportType = "user" | "content";

/**
 * A report as the service receives it.
 *
 * `reportedUserId` is absent BY DESIGN — the service resolves it from the
 * reported status, never from the caller. See `reports.service.ts`.
 */
export interface CreateReportInput {
  type: ReportType;
  statusId: string;
  reporterUserId: string;
  reporterEmail: string;
  reason: string;
}

/** What the caller gets back: the new row's id, and nothing else. */
export interface CreateReportResult {
  id: string;
}

/** A report row as written. `reason`/`reporterEmail` never leave the service. */
export interface ReportRecord {
  id: string;
  type: ReportType;
  statusId: string;
  reportedUserId: string;
  reporterUserId: string;
  reporterEmail: string;
  reason: string;
  createdAt: Date;
}
