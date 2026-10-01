import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time comparison that tolerates length differences by comparing
// SHA-256 digests (timingSafeEqual throws on unequal buffer lengths).
// Used to validate the Amplitude V2 payload's `api_key` against EVENTS_API_KEY.
export function safeKeyCompare(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
