/**
 * TEMPORARY dev-only module (remove before prod) — see core/devtools/index.ts.
 *
 * Marks a user Pro by phone number so stage/local is testable without a real
 * payment provider (the 'free' → 'active' write path is otherwise deferred to
 * the payment-provider ticket). Gated behind `ENABLE_DEV_TOOLS`.
 */

export interface MarkProInput {
  /** Phase-1 India-only, mirrors the OTP schema so the phone hash matches. */
  phoneCountryCode: "+91";
  /** 10-digit Indian mobile (validated at the route boundary). */
  phoneNumber: string;
  /**
   * Optional ISO-8601 expiry. When omitted the row is set to an effectively-
   * never expiry (~100 years out). Must be in the future when provided.
   */
  expiresAt?: string;
}

export interface MarkProResult {
  userId: string;
  status: string;
  /** ISO-8601 string. */
  expiresAt: string | null;
}
