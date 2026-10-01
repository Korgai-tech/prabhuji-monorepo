/**
 * WHY a payment died, in our vocabulary rather than the gateway's (TAM-186).
 *
 * `failure_code` carries the provider's own string and cannot answer the only
 * question anyone asks of it. Razorpay replies `GATEWAY_ERROR` to 91.9% of
 * declines, and behind that one bucket sit at least fifteen distinct
 * reasons — **91% of them "insufficient balance"**. Read off `failure_code`,
 * a user who simply had no money looks identical to a bank outage, and every
 * funnel built on it reports an infrastructure problem we do not have. That
 * misreading is not hypothetical: it is what the first pass of this
 * investigation concluded.
 *
 * So this module owns a second, coarser, OURS vocabulary, and it is the only
 * place allowed to decide one.
 *
 * THE VALUES ARE A PRODUCT DECISION, NOT A TAXONOMY. Each exists because some
 * caller acts differently on it — principally the payment-failure message
 * (Lever A), which may only be sent for `INSUFFICIENT_FUNDS`. Telling someone
 * to top up when their card was simply not permitted is wrong advice, and
 * there is no per-notification opt-out for them to escape it with. Adding a
 * value with no caller that branches on it makes the column longer, not more
 * useful.
 */
export const FAILURE_SUB_CODE = {
  /** No money in the account. The one recoverable class: the user has intent. */
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  /** The request reached them and they did not approve it (or it timed out). */
  USER_DID_NOT_APPROVE: "USER_DID_NOT_APPROVE",
  /** The bank refuses autopay on this account — never recoverable by retrying. */
  ACCOUNT_NOT_PERMITTED: "ACCOUNT_NOT_PERMITTED",
  /** Bank, PSP or NPCI fault. Ours to retry, never the user's to act on. */
  BANK_OR_GATEWAY_ERROR: "BANK_OR_GATEWAY_ERROR",
  /** OUR failure: the debit date passed with no usable pre-debit notification. */
  PDN_ABANDONED: "PDN_ABANDONED",
  /** Captured, but the provider's finer fields did not resolve to any of the above. */
  UNCLASSIFIED: "UNCLASSIFIED",
} as const;

export type FailureSubCode =
  (typeof FAILURE_SUB_CODE)[keyof typeof FAILURE_SUB_CODE];

/**
 * Provider reason -> our sub-code.
 *
 * Keyed on the provider's own MACHINE fields (`error_reason`, `failure_reason`,
 * `error_source`), NEVER on `failure_message`. That message is our user-facing
 * copy — "Insufficient balance in your account." — so matching it would make
 * the series depend on a marketing edit, and nothing would fail when it broke.
 * There is no exception: rows written before the column shipped stay NULL.
 *
 * Razorpay's `error_reason` values are lowercase snake_case; Decentro's are
 * upper. Compared case-insensitively so neither adapter has to normalise.
 */
/**
 * Provider values that are a CATEGORY, not a reason. They must never classify:
 * see the guard in `classifyFailure`, which is what the `GATEWAY_ERROR` test
 * pins.
 */
const BUCKET_CODES: ReadonlySet<string> = new Set([
  "GATEWAY_ERROR",
  "BAD_REQUEST_ERROR",
  "SERVER_ERROR",
]);

const REASON_TO_SUB_CODE: ReadonlyArray<readonly [RegExp, FailureSubCode]> = [
  [/insufficient[_\s-]?(funds|balance)/i, FAILURE_SUB_CODE.INSUFFICIENT_FUNDS],
  [/low[_\s-]?balance/i, FAILURE_SUB_CODE.INSUFFICIENT_FUNDS],
  [/(not|no)[_\s-]?approv|user[_\s-]?(declin|reject|cancel)|collect[_\s-]?expired/i,
    FAILURE_SUB_CODE.USER_DID_NOT_APPROVE],
  [/timed?[_\s-]?out|expired/i, FAILURE_SUB_CODE.USER_DID_NOT_APPROVE],
  [/not[_\s-]?(allowed|permitted)|restrict|frozen|dormant|inactive|blocked/i,
    FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED],
  [/bank|gateway|psp|npci|issuer|technical|downtime|unavailable/i,
    FAILURE_SUB_CODE.BANK_OR_GATEWAY_ERROR],
];

/**
 * Classify a failure from the provider's machine-readable reason fields.
 *
 * Returns `UNCLASSIFIED` rather than guessing when nothing matches — a wrong
 * sub-code is worse than an absent one, because `INSUFFICIENT_FUNDS` is what
 * authorises an outbound message to a real person.
 *
 * `null` in means the provider sent us nothing to classify, which is itself
 * `UNCLASSIFIED`: the row still failed.
 */
export function classifyFailure(
  reasons: ReadonlyArray<string | null | undefined>
): FailureSubCode {
  for (const reason of reasons) {
    if (!reason) continue;
    // THE BUCKET CODES CLASSIFY AS NOTHING, and this guard must come first.
    //
    // `GATEWAY_ERROR` contains the word "gateway", so the infrastructure
    // pattern below matches it — which would resolve the single most common
    // value in the table to `BANK_OR_GATEWAY_ERROR` and mislabel 91.9% of all
    // declines as our fault in one stroke. That is the exact defect this
    // column exists to fix, so it must not be reintroduced by the mapper.
    //
    // These are Razorpay's coarse `error_code` values. They name WHERE a
    // failure surfaced, never why, and no amount of pattern matching can
    // recover a reason that was never sent.
    if (BUCKET_CODES.has(reason.trim().toUpperCase())) continue;
    for (const [pattern, subCode] of REASON_TO_SUB_CODE) {
      if (pattern.test(reason)) return subCode;
    }
  }
  return FAILURE_SUB_CODE.UNCLASSIFIED;
}

/**
 * May we tell this user to top up?
 *
 * The single predicate Lever A's outbound message is gated on. Deliberately
 * exact rather than "not obviously something else": `UNCLASSIFIED` must NOT
 * send, because an unclassified row is exactly the case where we do not know
 * what happened, and the cost of being wrong is a real push notification that
 * the recipient has no way to opt out of.
 */
export const isRecoverableByTopUp = (subCode: string | null): boolean =>
  subCode === FAILURE_SUB_CODE.INSUFFICIENT_FUNDS;
