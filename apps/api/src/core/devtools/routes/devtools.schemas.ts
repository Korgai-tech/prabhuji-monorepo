import { z } from "zod";

/**
 * Mirrors the OTP schema (core/otp/routes/otp.schemas.ts) for the phone fields so
 * the value fed into the phone hash is identical — a mismatch here would hash to
 * a different digest and never find the user.
 */
export const MarkProBody = z
  .object({
    phoneCountryCode: z.literal("+91", {
      message: "Only +91 country code is supported in Phase 1",
    }),
    phoneNumber: z.string().regex(/^[6-9]\d{9}$/, {
      message: "phoneNumber must be a 10-digit Indian mobile starting 6-9",
    }),
    expiresAt: z
      .string()
      .datetime({ message: "expiresAt must be an ISO-8601 datetime" })
      .refine((v) => new Date(v).getTime() > Date.now(), {
        message: "expiresAt must be in the future",
      })
      .optional(),
  })
  .meta({ id: "DevtoolsMarkProBody" });

export const MarkProData = z
  .object({
    userId: z.string(),
    status: z.string(),
    expiresAt: z.string().datetime().nullable(),
  })
  .meta({ id: "DevtoolsMarkProData" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}
