/**
 * Phase 1 OTP configuration constants (TAM-43, q2 resolved 2026-07-11).
 *
 * These live in one place so the stub provider, the service, the response
 * payloads (which surface them to the mobile client), and any future real
 * provider all read from the same source of truth. Changing a Phase 1 value
 * is a single edit here + a spec update.
 */

export const OTP_LENGTH = 4;
export const OTP_RESEND_SECONDS = 20;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TEMP_BLOCK_MINUTES = 10;
export const OTP_EXPIRY_MINUTES = 15;

/** Convenience: expiry in milliseconds. */
export const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;

/** Convenience: temp-block window in milliseconds. */
export const OTP_TEMP_BLOCK_MS = OTP_TEMP_BLOCK_MINUTES * 60 * 1000;

/** Rate-limit windows (see patterns_library/security/rate-limiting.md). */
export const SEND_RATE_LIMIT_MAX = 3;
export const SEND_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;

/**
 * Resend limits. A resend is a billable SMS on exactly the same footing as a
 * send, so it gets the same treatment — capped per session (one session cannot
 * be milked) and per phone (a fresh session per resend cannot route around the
 * first cap). Both windows match the OTP's own lifetime: a session that has
 * outlived its codes has nothing left to resend.
 */
export const RESEND_RATE_LIMIT_MAX = 3;
export const RESEND_RATE_LIMIT_WINDOW_SECONDS = OTP_EXPIRY_MINUTES * 60;

/**
 * The per-phone ceiling on BILLABLE messages, enforced by `LocalOtpProvider`
 * at the moment of delivery.
 *
 * The send and resend caps above are per-entry-point and cannot see each other:
 * `OtpService.resendOtp` is handed a session id, not a number, so it can only
 * cap a single session — and an abuser opens a fresh session per resend. Three
 * sessions x (one send + three resends) is twelve messages to one handset that
 * neither cap notices.
 *
 * This one sits where the phone is actually known, covers both paths, and is
 * therefore the number that bounds the bill. Only real providers pass through
 * it; the stub sends nothing and is unaffected.
 */
export const DELIVERY_RATE_LIMIT_MAX = 6;
export const DELIVERY_RATE_LIMIT_WINDOW_SECONDS = OTP_EXPIRY_MINUTES * 60;

/** The stub provider always accepts this OTP for local dev + integration tests. */
export const STUB_FIXED_OTP = "1234";

/**
 * How long a verify will WAIT for the first UTM capture to settle before
 * replying anyway (TAM-258 follow-up).
 *
 * ── WHY A VERIFY WAITS AT ALL ───────────────────────────────────────────────
 * The capture writes `users.first_utm_group`, and `GET /users/me` reads that
 * column to decide the ad landing. Both used to happen concurrently: verify
 * `void`ed the capture and replied, the app took the token and called
 * `/users/me` immediately, and the two raced. Measured on prod 2026-09-25, the
 * capture settles ~70–80 ms after `phone_verified_at` — which is exactly the
 * window the app's first `/users/me` lands in.
 *
 * Losing that race is not a delayed landing, it is a LOST one. The `/users/me`
 * that arrives first reads an unstamped row, answers `utm_missing`, and the app
 * routes Home. The next `/users/me` — a refresh the app is not routing on —
 * then matches, serves the deeplink and SPENDS `ad_landing_consumed_at`, which
 * is once-only. The user lands Home and can never be given the landing again.
 * Prod showed 9 markers consumed against 2 landings actually delivered.
 *
 * ── WHY THIS NUMBER ─────────────────────────────────────────────────────────
 * ~10x the measured p50 (~80 ms), so an ordinary capture is never truncated,
 * while a referral service having a bad day cannot hold a signup for long. It
 * is deliberately NOT `ANALYTICS_EVENTS_TIMEOUT_MS` (5 s): that budget is for a
 * fire-and-forget call nobody is waiting on, and inheriting it here would put a
 * five-second stall in front of the login button.
 *
 * ── WHAT HAPPENS WHEN IT FIRES ──────────────────────────────────────────────
 * Nothing is cancelled. The capture keeps running and still stamps, just after
 * the reply — i.e. exactly the old behaviour, which is the worst case rather
 * than a new failure mode. The user lands Home with an UNSPENT marker, so their
 * next login can still deliver the landing.
 */
export const UTM_CAPTURE_VERIFY_BUDGET_MS = 800;
