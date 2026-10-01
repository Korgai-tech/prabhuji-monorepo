/**
 * MSG91 wire-level constants — the endpoint, headers, and body/response field
 * names. The one greppable place for every MSG91-specific string (mirrors
 * `payment/repositories/cashfree.constants.ts`).
 *
 * We use the **Flow API v5** as a pure delivery pipe: MSG91 renders our
 * DLT-registered template with the OTP substituted in. We do NOT use MSG91's
 * `/api/v5/otp*` product — the OTP itself is generated, hashed, expired and
 * verified by `LocalOtpProvider`, so every provider behaves identically against
 * our own `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS`.
 *
 * Nothing here is a business rule; it is all translation data.
 */

/** Flow API endpoint, relative to `MSG91_BASE_URL`. */
export const MSG91_PATHS = {
  flow: "/api/v5/flow/",
} as const;

/** Auth header. MSG91 takes a bare auth key — no signature scheme. */
export const MSG91_HEADERS = {
  authKey: "authkey",
} as const;

/** Request body keys. `recipients[].mobiles` carries the destination number. */
export const MSG91_BODY = {
  templateId: "template_id",
  sender: "sender",
  shortUrl: "short_url",
  recipients: "recipients",
  mobiles: "mobiles",
} as const;

/**
 * Response keys. MSG91 answers `{ type: "success" | "error", message: string }`
 * — on success `message` is its request id, on failure it is the reason.
 */
export const MSG91_RESPONSE = {
  type: "type",
  message: "message",
} as const;

/**
 * The ONLY value of `type` that means the SMS was accepted.
 *
 * MSG91 returns **HTTP 200 with `{"type":"error"}`** for application-level
 * failures (bad template, blocked number, no balance). Any check that trusts
 * the status code alone reports "OTP sent" for an SMS that never left, and the
 * user waits for a code that is not coming. Read the body, not the status.
 */
export const MSG91_SUCCESS_TYPE = "success";

/**
 * `short_url` off. URL shortening is for marketing sends; on an OTP it adds a
 * rewritten link to a message that has none, and some DLT templates reject it.
 */
export const MSG91_SHORT_URL_OFF = "0";
