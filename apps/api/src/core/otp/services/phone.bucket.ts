import { createHash } from "node:crypto";

/**
 * Derive the Redis rate-limit bucket for a phone number.
 *
 *
 * The send-OTP limiter keys on the phone rather than the IP, so the key has to
 * identify a number. Putting the raw value in there would leak it everywhere a
 * Redis key surfaces — `MONITOR`, `SLOWLOG`, `KEYS`/`SCAN` dumps, and any
 * managed-Redis metrics view — none of which are places PII should be
 * recoverable from. A peppered digest identifies the same caller without being
 * reversible if a key listing escapes.
 *
 * Keeping the pepper costs nothing (`AUTH_OTP_PEPPER` is already required at
 * boot and provisioned in Secrets Manager) and means a key dump alone cannot be
 * rainbow-tabled back to a phone number.
 *
 * Intentionally synchronous and side-effect-free, so it is trivial to unit-test.
 * Determinism is the property that matters: a bucket that varied between calls
 * would silently disable rate limiting rather than fail loudly.
 */
export function rateLimitBucket(
  pepper: string,
  phoneCountryCode: string,
  phoneNumber: string
): string {
  return createHash("sha256").update(`${pepper}${phoneCountryCode}${phoneNumber}`).digest("hex");
}
