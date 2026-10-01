/**
 * The vendor seam — the ONLY thing a new SMS provider has to write.
 *
 * `LocalOtpProvider` owns the entire OTP lifecycle (generation, hashing,
 * expiry, attempt counting, one-shot invalidation, resend). A vendor supplies
 * delivery and nothing else, which is why this interface has one method: adding
 * Twilio / Gupshup / Kaleyra later is one small file plus one registry line,
 * and every provider behaves identically against `OTP_EXPIRY_MINUTES` and
 * `OTP_MAX_ATTEMPTS`.
 *
 * `sendOtp` takes the OTP as a **variable, not a formatted message**. Indian
 * SMS delivery is DLT-gated: the body is a pre-registered template and the
 * sender substitutes values into it, so we never control the copy and must not
 * pretend to. A vendor that genuinely composes its own text (Twilio) formats it
 * inside its own adapter.
 *
 * ## Contract
 *
 * - Resolve ONLY when the vendor accepted the message. A resolved promise is
 *   read as "the SMS is on its way" and the user is sent to a code screen.
 * - Throw on anything else. `LocalOtpProvider` invalidates the session on a
 *   throw, so a failed send never leaves a live session behind.
 * - Never retry internally: a retry is a second SMS (duplicate code, double
 *   cost, and on a timeout you cannot tell whether the first one went out).
 * - Implementations hold live PII and a live credential. Never log the number
 *   and never log the OTP.
 */
export interface OtpSmsSender {
  /** Provider name, surfaced as the `provider` field in OTP service logs. */
  readonly name: string;
  sendOtp(input: {
    phoneCountryCode: string;
    phoneNumber: string;
    otp: string;
    /**
     * TAM-123 — Google SMS Retriever 11-char hash. Optional: when present, the
     * adapter renders it into the vendor's DLT template variable so MSG91
     * appends `\n\n<##>{hash}` to the message body. When absent, the SMS is
     * sent unchanged and on-device auto-fill is a no-op for that install.
     */
    appSignatureHash?: string;
  }): Promise<void>;
}
