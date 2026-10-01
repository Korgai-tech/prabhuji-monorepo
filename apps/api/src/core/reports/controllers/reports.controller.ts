import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "@api/shared/response";
import { AppError } from "@api/shared/errors";
import type { ReportsService } from "@api/core/reports/services";
import type { CreateReportBodyInput } from "@api/core/reports/routes/reports.schemas";

/**
 * HTTP boundary for the Reports module. Resolves the JWT subject
 * (`req.user.id`), delegates to the service, replies via `sendSuccess`.
 *
 * `reporterUserId` comes from the token and nowhere else — the body has no such
 * field, and neither does it carry the reported account (the service resolves
 * that from the status).
 */
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  create = async (
    req: FastifyRequest<{ Body: CreateReportBodyInput }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    const reporterUserId = this.requireUserId(req);
    const result = await this.service.create({
      type: req.body.type,
      statusId: req.body.statusId,
      reporterUserId,
      reporterEmail: req.body.reporterEmail,
      reason: req.body.reason,
    });
    return sendSuccess(reply, result, "Reported successfully");
  };

  private requireUserId(req: FastifyRequest): string {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    return req.user.id;
  }
}
