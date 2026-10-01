import type { SessionMetadata, VerifyProviderResult } from "@api/core/otp/types";

/**
 * Provider seam.
 *
 * Phase 1 ships a `StubOtpProvider` for local dev + integration tests.
 * The real SMS provider (Dostii / MSG91 / Twilio) will implement this same
 * interface — swapping providers is a service-layer wiring change, not a
 * route change.
 *
 * `sendOtp`/`resendOtp` return the session metadata (created or updated),
 * `verifyOtp` returns the verification verdict + the final session state
 * (attempt count, invalidated flag) so the service can decide whether to
 * mint a JWT or throw the appropriate public error.
 *
 * `sendOtp` takes the REAL number. It used to take a SHA-256 digest, which made
 * the seam unimplementable by definition — a provider cannot text a hash — and
 * is why `AUTH_OTP_PROVIDER=dostii` never got past a placeholder. Anything
 * implementing this now holds live PII: it may transmit the number to the
 * upstream gateway and must never log it.
 */
export interface OtpProvider {
  readonly name: string;
  sendOtp(input: {
    phoneCountryCode: string;
    phoneNumber: string;
    /**
     * TAM-123 — Google SMS Retriever hash forwarded from the route body.
     * The provider stores it on the session so `resendOtp` can reuse it
     * without the client having to re-supply it on every resend.
     */
    appSignatureHash?: string;
    /**
     * Firebase `app_instance_id`. Stored on the session like the hash above,
     * but purely so verify can return it — no provider ever sends it anywhere.
     */
    pseudoId?: string;
  }): Promise<SessionMetadata>;
  verifyOtp(input: { otpSessionId: string; otp: string }): Promise<VerifyProviderResult>;
  resendOtp(input: { otpSessionId: string }): Promise<SessionMetadata>;
}
