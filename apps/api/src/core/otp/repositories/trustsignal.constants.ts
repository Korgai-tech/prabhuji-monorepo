/**
 * TrustSignal wire-level constants — the endpoint, the auth parameter, and the
 * request/response field names. The one greppable place for every TrustSignal
 * string (mirrors `msg91.constants.ts` and `cashfree.constants.ts`).
 *
 * Nothing here is a business rule; it is all translation data.
 *
 * ## Why this endpoint and not the obvious ones
 *
 * TrustSignal publishes three hosts and only one of them sends SMS. The other
 * two look plausible and are dead ends — recording that here so nobody
 * re-derives it against a billed API:
 *
 *   - `rcsapi.trustsignal.io/api/v1/rcs/with_fallback` — the RCS-with-SMS-
 *     fallback endpoint. Rejects every template id this account owns (DLT ids
 *     and TrustSignal's own short codes alike) with `118 INVALID_TEMPLATE_ID`,
 *     because no RCS agent is provisioned. Unusable regardless of payload.
 *   - `api.trustsignal.io/v1/sms/send` — authenticates, demands a
 *     `"version": "2.0"` body field, then answers `2002 Empty message body`
 *     whatever the message field is named. Unusable.
 *   - `sms.trustsignal.io/v1/sms/countrycode` — the one that works. Verified
 *     end-to-end against a live handset.
 */

/** Send endpoint, relative to `TRUSTSIGNAL_BASE_URL`. */
export const TRUSTSIGNAL_PATHS = {
  /** `countrycode` = the destination carries its own `+<cc>` prefix. */
  send: "/v1/sms/countrycode",
} as const;

/**
 * The credential is a QUERY PARAMETER, not a header. That is TrustSignal's
 * design and it has one consequence worth stating loudly: the request URL is a
 * secret. Log the path, never the URL.
 */
export const TRUSTSIGNAL_QUERY = {
  apiKey: "api_key",
} as const;

/** Request body keys. `to` is an array even for a single recipient. */
export const TRUSTSIGNAL_BODY = {
  senderId: "sender_id",
  to: "to",
  route: "route",
  message: "message",
  templateId: "template_id",
} as const;

/**
 * Response keys. A send answers
 * `{ success: true, message: "Request process successfully",
 *    results: [{ phone, transaction_id, sms_cost }] }`
 * and a rejection answers
 * `{ success: false, errors: [{ code, codeMsg, message }] }`.
 */
export const TRUSTSIGNAL_RESPONSE = {
  success: "success",
  message: "message",
  results: "results",
  errors: "errors",
  transactionId: "transaction_id",
} as const;

/**
 * The DLT variable tokens inside `TRUSTSIGNAL_MESSAGE_TEMPLATE`.
 *
 * These are DLT's own syntax, not ours, and that is the point: the env var
 * holds the registered body verbatim, so there is no dialect for ops to
 * translate and a mismatch against the portal is a literal string diff.
 *
 * `{#num#}` is the numeric slot (the OTP) and `{#alp#}` the alphanumeric one
 * (the Google SMS Retriever hash). A template registered with different tokens
 * — DLT also allows a bare `{#var#}` — needs this table updated to match.
 */
export const TRUSTSIGNAL_TEMPLATE_VARS = {
  otp: "{#num#}",
  hash: "{#alp#}",
} as const;
