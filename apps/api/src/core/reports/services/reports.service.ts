import { performServiceCall } from "@api/shared/workspace";
import { createModuleLogger } from "@api/shared/logs";
import { AppError } from "@api/shared/errors";
import { RedisRateLimiter } from "@api/shared/rate-limit";
import type { ReportsRepository } from "@api/core/reports/repositories";
import type {
  CreateReportInput,
  CreateReportResult,
} from "@api/core/reports/types";
import {
  REPORT_RATE_LIMIT_KEY_PREFIX,
  REPORT_RATE_LIMIT_MAX,
  REPORT_RATE_LIMIT_WINDOW_SECONDS,
} from "./reports.config.js";

const log = createModuleLogger("reports:service");

/**
 * Reporting business logic (TAM-N) — Prisma-free.
 *
 * ONE RULE GOVERNS THIS SERVICE: the reported account is resolved from the
 * reported status, never from the caller. `CreateReportInput` deliberately has
 * no `reportedUserId` field, so there is no way to plumb a client-supplied
 * value through even by accident. Without that, `POST /reports` would let any
 * authenticated user file an unlimited number of reports against any user id
 * they can guess.
 *
 * Nothing here logs `reason` or `reporterEmail`. They are private free text from
 * a member of the public; the only places they belong are the row and, later, an
 * admin moderation screen.
 */
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly rateLimiter: RedisRateLimiter = new RedisRateLimiter()
  ) {}

  async create(input: CreateReportInput): Promise<CreateReportResult> {
    await this.enforceRateLimit(input.reporterUserId);

    // Existence check AND attribution in one cross-module call. `null` means the
    // status is unknown or inactive — a 404, not a silently dropped report.
    const target = await performServiceCall(
      "status",
      (api) => api.getReportTarget(input.statusId),
      "reports:status",
      "failed to resolve the reported status"
    );
    if (!target) {
      throw new AppError("Status not found", 404, "STATUS_NOT_FOUND");
    }

    const row = await this.repo.create({
      type: input.type,
      statusId: input.statusId,
      // Server-resolved. See the class doc — never `input.reportedUserId`,
      // which does not exist.
      reportedUserId: target.creatorId,
      reporterUserId: input.reporterUserId,
      reporterEmail: input.reporterEmail,
      reason: input.reason,
    });

    // Ids and the classification only. The reason and the email stay out of the
    // logs, and out of telemetry with them.
    log.info(
      {
        reportId: row.id,
        type: row.type,
        statusId: row.statusId,
        reportedUserId: row.reportedUserId,
      },
      "report filed"
    );

    return { id: row.id };
  }

  /**
   * Per-reporter throttle.
   *
   * CAVEAT: `RedisRateLimiter` is a NO-OP that allows everything when
   * `ENABLE_REDIS=false`, which is the default local setup. That is fine on a
   * laptop but means this endpoint is effectively unthrottled anywhere Redis is
   * not wired — check that before assuming the limit is in force.
   */
  private async enforceRateLimit(userId: string): Promise<void> {
    const verdict = await this.rateLimiter.consume(
      `${REPORT_RATE_LIMIT_KEY_PREFIX}:${userId}`,
      REPORT_RATE_LIMIT_MAX,
      REPORT_RATE_LIMIT_WINDOW_SECONDS
    );
    if (verdict.allowed) return;
    log.warn({ userId, retryAfterSeconds: verdict.retryAfterSeconds }, "report rate limited");
    throw new AppError(
      "Too many reports. Please try again later.",
      429,
      "RATE_LIMITED"
    );
  }
}
