import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authMiddleware } from "@api/core/auth/middleware";
import { ReportsController } from "@api/core/reports/controllers";
import type { ReportsService } from "@api/core/reports/services";
import {
  CreateReportBody,
  type CreateReportBodyInput,
  CreateReportResponse,
  ErrorEnvelope,
} from "./reports.schemas.js";

/**
 * Register the Reports routes under `/reports`.
 *
 *   POST /reports — file a report against a status or the account it is
 *                   attributed to
 *
 * JWT-guarded: anonymous users cannot file reports, which is what makes the
 * per-reporter rate limit meaningful.
 *
 * This is a PUBLIC (mobile) route: it must never be tagged `admin` and must
 * never move under `/admin/`. The tag⇔path invariant is checked in both
 * directions by `scripts/filter-public-openapi.ts` — a mis-tag here would drop
 * the endpoint from the public contract and the Dart client with it.
 */
export function registerReportRoutes(
  app: FastifyInstance,
  service: ReportsService
): void {
  const controller = new ReportsController(service);
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/reports",
    {
      schema: {
        body: CreateReportBody,
        response: {
          200: CreateReportResponse,
          400: ErrorEnvelope,
          401: ErrorEnvelope,
          404: ErrorEnvelope,
          429: ErrorEnvelope,
          500: ErrorEnvelope,
        },
      },
      preHandler: authMiddleware,
    },
    async (
      req: FastifyRequest<{ Body: CreateReportBodyInput }>,
      reply: FastifyReply
    ): Promise<void> => {
      await controller.create(req, reply);
    }
  );
}
