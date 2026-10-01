import type { ReportType as PrismaReportType } from "@prisma/client";
import { getPrisma } from "@api/shared/database";
import type { ReportRecord } from "@api/core/reports/types";

/**
 * Reports repository — the ONLY place `@prisma/client` is reached for this
 * module.
 *
 * `reports` is append-only: this class writes and never updates or deletes.
 * There is no read method because nothing in the product reads reports back yet
 * (an admin surface is a separate ticket, and it must go through
 * `registerAdminRoute`).
 */
export class ReportsRepository {
  async create(input: {
    type: PrismaReportType;
    statusId: string;
    reportedUserId: string;
    reporterUserId: string;
    reporterEmail: string;
    reason: string;
  }): Promise<ReportRecord> {
    const prisma = getPrisma();
    const row = await prisma.report.create({ data: input });
    return {
      id: row.id,
      type: row.type,
      statusId: row.statusId,
      reportedUserId: row.reportedUserId,
      reporterUserId: row.reporterUserId,
      reporterEmail: row.reporterEmail,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }
}
