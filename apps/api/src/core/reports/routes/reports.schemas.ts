import { z } from "zod";

/**
 * Zod schemas for the Reports module (TAM-N) — the single source of truth for
 * the emitted OpenAPI contract and the generated TS + Dart clients.
 *
 * NOTE WHAT IS NOT HERE: there is no `reportedUserId` in the body. The account
 * being reported is resolved SERVER-SIDE from the reported status, so a client
 * cannot name a victim. Zod's default object behaviour strips unknown keys, and
 * the contract test asserts a body carrying `reportedUserId` does not influence
 * the written row.
 */

export const ReportTypeSchema = z.enum(["user", "content"]).meta({
  id: "ReportType",
});

/** Hard cap on the free-text reason. The app mirrors this with an input formatter. */
export const REPORT_REASON_MAX = 1000;

export const CreateReportBody = z
  .object({
    /** `user` reports the account the status is attributed to; `content` the status itself. */
    type: ReportTypeSchema,
    /** The status the report was filed from. Must be a real, active status. */
    statusId: z.uuid(),
    /**
     * Contact address typed into the sheet. Seeded from the account's email
     * when it has one (OTP accounts do not), but freely editable — so this is
     * NOT necessarily the reporter's account email.
     */
    reporterEmail: z.email().max(320),
    /** Free-text reason. Private: never echoed back, never logged. */
    reason: z.string().trim().min(1).max(REPORT_REASON_MAX),
  })
  .meta({ id: "CreateReportBody" });
export type CreateReportBodyInput = z.infer<typeof CreateReportBody>;

export const CreateReportResult = z
  .object({
    id: z.string(),
  })
  .meta({ id: "CreateReportResult" });

export const CreateReportResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: CreateReportResult,
  })
  .meta({ id: "CreateReportResponse" });

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "ReportErrorEnvelope" });
