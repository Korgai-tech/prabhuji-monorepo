import { z } from "zod";

/**
 * Phase 1 constraints:
 *   - `phoneCountryCode` is fixed to "+91" (India only). Every other value
 *     is rejected with a descriptive error.
 *   - `phoneNumber` is a 10-digit Indian mobile: starts [6-9], no leading zero.
 *   - `otp` is 4 digits (q2).
 *   - `otpSessionId` is a UUID v4 minted by the provider.
 */

export const SendOtpBody = z
  .object({
    phoneCountryCode: z.literal("+91", {
      message: "Only +91 country code is supported in Phase 1",
    }),
    phoneNumber: z.string().regex(/^[6-9]\d{9}$/, {
      message: "phoneNumber must be a 10-digit Indian mobile starting 6-9",
    }),
    /**
     * TAM-123 — the running Android APK's Google SMS Retriever hash, base64
     * encoded, exactly 11 chars. MSG91 appends it to the OTP SMS body so the
     * on-device retriever matches and auto-fills the code.
     *
     * Runtime-computed on the client (`SmartAuth.getAppSignature()`) because
     * it varies across debug / release / Play-signed builds. Optional so iOS
     * and older clients that don't ship the field still work — MSG91 then
     * omits the suffix and the OTP is delivered normally, just without
     * auto-fill on that install.
     */
    appSignatureHash: z
      .string()
      .regex(/^[A-Za-z0-9+/]{11}$/, {
        message:
          "appSignatureHash must be the 11-char SMS Retriever hash (base64 without padding)",
      })
      .optional(),
    /**
     * Firebase's install-scoped `app_instance_id` (GA4's "pseudo user id"),
     * the same value the client stamps on its own events as `pseudo_id`.
     * Captured here because this is the first request of the signup — the
     * server stashes it on the OTP session and stamps it on
     * `bk_account_created`, which is what lets a backend signup row join the
     * client-side rows for the same install.
     *
     * Optional and loosely typed on purpose: it is analytics-only, never an
     * identity we act on, so a missing or odd value must never fail a login.
     * Bounded because it lands in a warehouse column.
     *
     * `nullish`, not `optional`: the generated Dart DTO writes an EXPLICIT
     * `null` for every unset optional field, and `optional()` alone rejects
     * null — an install whose Firebase id didn't resolve would 400 the whole
     * send and get no OTP at all. Null and absent both mean "not known".
     */
    pseudoId: z.string().min(1).max(64).nullish(),
  })
  .meta({ id: "SendOtpBody" });

export const VerifyOtpBody = z
  .object({
    otpSessionId: z.string().uuid({ message: "otpSessionId must be a UUID v4" }),
    otp: z.string().regex(/^\d{4}$/, { message: "otp must be exactly 4 digits" }),
  })
  .meta({ id: "VerifyOtpBody" });

export const ResendOtpBody = z
  .object({
    otpSessionId: z.string().uuid({ message: "otpSessionId must be a UUID v4" }),
  })
  .meta({ id: "ResendOtpBody" });

export const SendOtpData = z
  .object({
    otpSessionId: z.string(),
    /**
     * The lead row `ensureUserForPhone` just wrote — the SAME id `/verify`
     * returns as `user.id`. Present before the phone is verified, so it
     * identifies a lead, not an authenticated user: it carries no session and
     * must never be treated as proof of anything.
     */
    userId: z.string(),
    resendAvailableAfterSeconds: z.number().int().nonnegative(),
    otpLength: z.number().int().positive(),
  })
  .meta({ id: "SendOtpData" });

/**
 * Returns the PHONE, not an email. An OTP account has no email at all — it used
 * to carry a synthetic `otp-<id>@prabhuji.internal` that existed only to satisfy
 * a NOT NULL column, and shipping that to the client meant the app rendered "O"
 * as the user's avatar initial. The phone is the identity the caller just
 * proved, so it is what comes back.
 */
export const OtpPublicUser = z
  .object({
    id: z.string(),
    phoneCountryCode: z.string().nullable(),
    phoneNumber: z.string().nullable(),
  })
  .meta({ id: "OtpPublicUser" });

export const VerifyOtpData = z
  .object({
    token: z.string(),
    user: OtpPublicUser,
    isNewUser: z.boolean(),
  })
  .meta({ id: "VerifyOtpData" });

export const ResendOtpData = z
  .object({
    resendAvailableAfterSeconds: z.number().int().nonnegative(),
  })
  .meta({ id: "ResendOtpData" });

export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "OtpErrorEnvelope" });
