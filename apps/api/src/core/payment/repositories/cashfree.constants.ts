import type { MandateState } from "@api/core/payment/types";

/**
 * Cashfree wire-level constants — endpoints, headers, status maps, and webhook
 * event-type names. The one greppable place for every Cashfree-specific string
 * (mirrors `decentro.constants.ts`).
 *
 * Cashfree UPI Autopay rides the PG Subscriptions API. The exact paths, field
 * names, status spellings, and event types below are the adapter's primary
 * risk — CONFIRM each against the pinned `CASHFREE_API_VERSION` before the first
 * live debit. Nothing here is a business rule; it is all translation data.
 */

/** PG Subscriptions endpoints, relative to `CASHFREE_BASE_URL` (…/pg). */
export const CASHFREE_PATHS = {
  subscriptions: "/subscriptions",
  /**
   * THE endpoint that moves money on a subscription — for BOTH legs.
   *
   * `payment_type: "AUTH"` mints the authorization link at registration;
   * `payment_type: "CHARGE"` raises a recurring debit. One route, two verbs.
   *
   * Do NOT reach for `payments(id)` below to raise a charge. That path exists,
   * but only for GET: a POST to it returns
   * `404 endpoint or method is not valid` on EVERY api version Cashfree
   * accepts (verified live against 2023-08-01, 2025-01-01 and 2026-01-01 on
   * 2026-07-29). Using it is what silently stopped every debit in prod while
   * registration kept working — registration was already on this route.
   */
  subscriptionsPay: "/subscriptions/pay",
  /**
   * THE CONTROLLED FLOW — the NPCI-compliant two-call recurring debit, and what
   * `notifyPreDebit` / `presentDebit` map onto.
   *
   *   notify  — tell the payer what is about to be taken. This is the PDN, and
   *             WE send it; it moves no money.
   *   execute — take it. Irreversible. The amount MUST equal the notified
   *             amount exactly or the issuing bank declines.
   *
   * Confirmed with Cashfree support and probed live on 2026-07-29: both exist on
   * every accepted api version. Note their own sample omits `payment_id` and
   * `notification_id`/`execution_id`, all of which are required.
   */
  controlledNotify: "/subscriptions/pay/controlled/notify-mandate",
  controlledExecute: "/subscriptions/pay/controlled/execute-mandate",
  subscription: (id: string) => `/subscriptions/${encodeURIComponent(id)}`,
  /** READ ONLY — list a subscription's payments. POST 404s; see above. */
  payments: (id: string) => `/subscriptions/${encodeURIComponent(id)}/payments`,
  payment: (id: string, paymentId: string) =>
    `/subscriptions/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}`,
  manage: (id: string) => `/subscriptions/${encodeURIComponent(id)}/manage`,
} as const;

/** Auth headers. Cashfree keys on these three; there is no HMAC on requests. */
export const CASHFREE_HEADERS = {
  clientId: "x-client-id",
  clientSecret: "x-client-secret",
  apiVersion: "x-api-version",
} as const;

/** Headers Cashfree sends ON a webhook (used to verify the HMAC signature). */
export const CASHFREE_WEBHOOK_HEADER = {
  signature: "x-webhook-signature",
  timestamp: "x-webhook-timestamp",
} as const;

/**
 * Subscription status → our `MandateState`. Keys are lower-cased at lookup.
 * Unknown → `pending` (never `active`), same fail-safe as Decentro.
 */
export const CASHFREE_STATE_BY_SUBSCRIPTION_STATUS: Readonly<
  Record<string, MandateState>
> = {
  initialized: "pending",
  pending: "pending",
  bank_approval_pending: "pending",
  active: "active",
  on_hold: "paused",
  paused: "paused",
  cancelled: "revoked",
  completed: "completed",
  link_expired: "expired",
  expired: "expired",
  failed: "failed",
  bank_declined: "rejected",
  rejected: "rejected",
};

/** Charge/payment status tokens → our debit outcome. Unknown → `pending`. */
export const CASHFREE_SUCCESS_STATUSES = [
  "success",
  "successful",
  "completed",
  "paid",
];
export const CASHFREE_FAILURE_STATUSES = [
  "failed",
  "failure",
  "declined",
  "cancelled",
];

/**
 * Webhook event `type` → our callback kind. A subscription/authorization event
 * is a mandate-lifecycle trigger; a payment event is a presentation trigger.
 * Matched case-insensitively; an unlisted type is ignored (200, no action).
 */
export const CASHFREE_MANDATE_EVENT_TYPES = [
  "SUBSCRIPTION_STATUS_CHANGED",
  "SUBSCRIPTION_STATUS_UPDATE",
  "SUBSCRIPTION_AUTH_STATUS",
];
export const CASHFREE_PRESENTATION_EVENT_TYPES = [
  "SUBSCRIPTION_PAYMENT_SUCCESS",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_PAYMENT_DECLINED",
  "SUBSCRIPTION_NEW_PAYMENT",
];

/**
 * Controlled-execution status tokens → our debit outcome.
 *
 * Separate from `CASHFREE_*_STATUSES` above because an execution reports its own
 * lifecycle (`execution_status`) alongside the parent payment's, and the two do
 * not share a vocabulary. Unknown → `pending`, which is the safe default: it
 * leaves the row unsettled for the reconciliation sweep rather than inventing an
 * outcome for money we are unsure about.
 */
export const CASHFREE_EXECUTION_SUCCESS_STATUSES = [
  "success",
  "successful",
  "completed",
  "paid",
  "executed",
];
export const CASHFREE_EXECUTION_FAILURE_STATUSES = [
  "failed",
  "failure",
  "declined",
  "cancelled",
  "rejected",
];

/** Candidate keys, in preference order, for values Cashfree spells variably. */
export const CASHFREE_SUBSCRIPTION_ID_KEYS = [
  "subscription_id",
  "cf_subscription_id",
  "subReferenceId",
];
export const CASHFREE_PAYMENT_ID_KEYS = [
  "cf_payment_id",
  "payment_id",
  "cfPaymentId",
];
export const CASHFREE_SUBSCRIPTION_STATUS_KEYS = [
  "subscription_status",
  "status",
  "state",
];
export const CASHFREE_PAYMENT_STATUS_KEYS = [
  "payment_status",
  "status",
  "cf_payment_status",
];
/**
 * An execution's OWN status, preferred over the parent payment's.
 *
 * `execute-mandate` returns both. The parent stays whatever the mandate-level
 * payment says, so reading `payment_status` for a cycle's outcome would report
 * the authorization's result forever.
 */
export const CASHFREE_EXECUTION_STATUS_KEYS = [
  "execution_status",
  "cf_execution_status",
];
export const CASHFREE_EXECUTION_ID_KEYS = ["cf_execution_id", "execution_id"];
export const CASHFREE_NOTIFICATION_ID_KEYS = [
  "cf_notification_id",
  "notification_id",
];

/** PII fields Cashfree may carry, masked at the boundary / redacted in audit. */
export const CASHFREE_PAYER_VPA_KEYS = ["payer_vpa", "upi_id", "vpa"];
export const CASHFREE_PAYER_NAME_KEYS = ["payer_name", "customer_name", "name"];
