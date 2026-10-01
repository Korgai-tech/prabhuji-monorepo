import type { MandateState, PdnStatus } from "@api/core/payment/types";

/**
 * Razorpay wire-level constants — endpoints, headers, status maps and webhook
 * event names. The one greppable place for every Razorpay-specific string
 * (mirrors `cashfree.constants.ts` / `decentro.constants.ts`).
 *
 * Razorpay UPI Autopay rides the core Payments API, not a separate
 * subscriptions product: a mandate is a TOKEN hanging off a CUSTOMER, each
 * cycle is an ORDER, and a debit is a PAYMENT against that order. Nothing here
 * is a business rule; it is all translation data.
 *
 * TWO THINGS THAT ARE NOT LIKE THE OTHER GATEWAYS AND MUST STAY THAT WAY:
 *
 *   1. AMOUNTS ARE PAISE, everywhere, in both directions. There is no rupee
 *      conversion anywhere in this adapter. Adding one would divide every
 *      charge by a hundred.
 *   2. There is NO sandbox host. `https://api.razorpay.com/v1` serves both, and
 *      test-vs-live is decided purely by the `rzp_test_` / `rzp_live_` prefix on
 *      the key id. So a "am I pointed at prod?" check reads the KEY, never the
 *      URL.
 */

/** Endpoints, relative to `RAZORPAY_BASE_URL` (…/v1). */
export const RAZORPAY_PATHS = {
  customers: "/customers",
  customer: (id: string) => `/customers/${encodeURIComponent(id)}`,
  /**
   * Orders serve two different jobs here, which is why one path appears in two
   * places in the flow:
   *   - at registration, an order carries the `token{}` block that describes the
   *     mandate being asked for;
   *   - at every cycle, an order carries the `notification{}` block that IS the
   *     pre-debit notification. Razorpay has no merchant "notify" endpoint.
   */
  orders: "/orders",
  order: (id: string) => `/orders/${encodeURIComponent(id)}`,
  /**
   * The payments raised against one order.
   *
   * This — not `GET /payments/:id` — is what `getDebitStatus` can actually call:
   * `DebitStatusInput` carries the order id (as `presentationSequenceId`) and no
   * payment id, so addressing a payment directly is unreachable from the port.
   * See the method's docblock.
   */
  orderPayments: (id: string) => `/orders/${encodeURIComponent(id)}/payments`,
  // NOTE: no `/payments/create/upi`. Registration's authorization payment is
  // raised by Razorpay Checkout on the DEVICE, from the order — see the "STEP 3
  // IS THE APP'S" note in `razorpay-mandate.repository.ts`. That endpoint is
  // S2S-gated per merchant account and 400s with "The requested URL was not
  // found on the server." where it is not enabled, which is why nothing calls
  // it. Re-adding it would race the SDK for the same authorization.
  /** Every cycle after the first: THE call that moves money. */
  createRecurringPayment: "/payments/create/recurring",
  payment: (id: string) => `/payments/${encodeURIComponent(id)}`,
  customerToken: (customerId: string, tokenId: string) =>
    `/customers/${encodeURIComponent(customerId)}/tokens/${encodeURIComponent(tokenId)}`,
  // NO `customerTokens` (`GET /customers/:cid/tokens`). Listing a customer's
  // tokens was how the approved token used to be discovered, and it is the wrong
  // question: a customer is per-PERSON and reused across every registration that
  // person starts, so the list accumulates and nothing in it says which attempt a
  // token belongs to. It was disambiguated by a timestamp floor, which a stale
  // approval landing after a newer attempt began sails straight past — activating
  // the wrong row. `orderPayments` answers the right question instead: one order
  // per attempt, and its authorization payment names its own `token_id`.
  /**
   * THE cancel. A `PUT`, and the `/cancel` suffix is load-bearing.
   *
   * `DELETE /customers/:cid/tokens/:tid` looks like the cancel and is NOT one —
   * Razorpay's own docs say in as many words that it does not cancel the
   * mandate. It deletes THEIR record of the token while leaving the NPCI mandate
   * live and debitable, i.e. it destroys our ability to stop the debits without
   * stopping the debits. `razorpay-mandate.repository.test.ts` asserts we issue
   * the PUT and never a DELETE.
   */
  cancelCustomerToken: (customerId: string, tokenId: string) =>
    `/customers/${encodeURIComponent(customerId)}/tokens/${encodeURIComponent(tokenId)}/cancel`,
} as const;

/** Headers Razorpay sends ON a webhook. */
export const RAZORPAY_WEBHOOK_HEADER = {
  /** `hex(HMAC_SHA256(webhook_secret, RAW body))`. See `razorpay-callback-auth.ts`. */
  signature: "x-razorpay-signature",
  /**
   * Razorpay's per-DELIVERY id — the natural dedupe key, and deliberately NOT
   * what `CallbackRef.callbackTxnId` carries. `PaymentGateway.extractRef` is
   * handed the parsed BODY and nothing else, so a header is not reachable from
   * it; the gateway derives a body-only key instead. Named here so the day the
   * seam grows a headers argument, the right answer is one edit away.
   */
  eventId: "x-razorpay-event-id",
} as const;

/** The response header Razorpay support asks for first. */
export const RAZORPAY_REQUEST_ID_HEADER = "x-razorpay-request-id";

/**
 * `recurring_details.status` on a token → our `MandateState`.
 *
 * `cancellation_initiated` maps to **active**, and that is not a typo. Razorpay
 * documents it as a request in flight with NPCI, explicitly not a final state —
 * the token only becomes `cancelled` once NPCI confirms. Treating it as terminal
 * would strip a paying user's entitlement (and stop us presenting a debit they
 * still owe) on the strength of a cancellation that may yet fail.
 *
 * Anything absent or unrecognised maps to `pending`, NEVER `active` — the same
 * fail-safe as the other two gateways, for the same reason: entitlement is
 * granted off this value, and guessing optimistically gives away paid content
 * unrecoverably.
 */
export const RAZORPAY_STATE_BY_TOKEN_STATUS: Readonly<
  Record<string, MandateState>
> = {
  initiated: "pending",
  confirmed: "active",
  rejected: "rejected",
  paused: "paused",
  cancellation_initiated: "active",
  cancelled: "revoked",
  expired: "expired",
};

/**
 * Payment `status` → our debit outcome.
 *
 * **`created` MEANS PENDING, NOT FAILED.** HDFC and Axis settle UPI Autopay
 * debits from a batch file, so a perfectly healthy debit can sit in `created`
 * for hours. Reading it as a failure would dun a user whose money is simply
 * still in flight, and — worse — free the cycle to be retried into a second
 * charge.
 *
 * `refunded` is deliberately ABSENT: a refunded payment did succeed and was then
 * given back, which in our ledger is a second row, not a mutation of the first.
 * It therefore falls through to the unknown → `pending` default rather than being
 * mapped to something plausible. TODO(razorpay): confirm whether the original
 * debit's payment entity really flips to `refunded` (rather than keeping
 * `captured` with a refund attached) before deciding which of `succeeded` /
 * `pending` is right; until then an unsettled row and a warn line is the honest
 * answer.
 */
export const RAZORPAY_OUTCOME_BY_PAYMENT_STATUS: Readonly<
  Record<string, "pending" | "succeeded" | "failed">
> = {
  created: "pending",
  authorized: "succeeded",
  captured: "succeeded",
  failed: "failed",
};

/**
 * An order's `notification.status` → our `PdnStatus`.
 *
 * Unknown/absent resolves to a NON-TERMINAL status (see `mapPdnStatus` in the
 * adapter), which is the opposite of the Decentro adapter's `failed` default and
 * deliberately so: for Razorpay a re-arm means minting a whole new order, and
 * this gateway's receipt-as-idempotency-key makes a duplicate order a 400 rather
 * than a silent second notification.
 */
export const RAZORPAY_PDN_STATUS_BY_NOTIFICATION_STATUS: Readonly<
  Record<string, PdnStatus>
> = {
  pending: "sent",
  delivered: "accepted",
  failed: "failed",
  cancelled: "rejected",
};

/**
 * Webhook event names, by prefix. Razorpay labels every delivery with an `event`
 * string, so classification is a prefix match rather than the field-shape
 * sniffing Decentro needs.
 *
 * The full set Razorpay can send us: `token.confirmed`, `token.rejected`,
 * `token.cancelled`, `token.paused`, `payment.authorized`, `payment.captured`,
 * `payment.failed`, `order.paid`, `invoice.paid`, `invoice.expired`,
 * `order.notification.delivered`, `order.notification.failed`.
 *
 * NOTE: there is no `token.resumed` event. A token that comes off `paused` is
 * observed on the next status read, not announced — so nothing may be built on
 * waiting for one.
 */
/**
 * The one event that tells us a notification actually REACHED the payer.
 *
 * Named separately because the turnaround before Razorpay accepts a
 * presentation runs from this instant, not from our dispatch call — see
 * `RAZORPAY_PRESENTATION_TAT_HOURS` and `CallbackRef.notificationDeliveredAt`.
 * Its sibling `order.notification.failed` is a PDN event too but says the
 * opposite, so the two must not be treated as one.
 */
export const RAZORPAY_PDN_DELIVERED_EVENT = "order.notification.delivered";

export const RAZORPAY_EVENTS = {
  /** MUST be tested before anything order-shaped: these ARE order events. */
  pdn: [RAZORPAY_PDN_DELIVERED_EVENT, "order.notification.failed"],

  mandate: [
    "token.confirmed",
    "token.rejected",
    "token.paused",
    "token.cancelled",
    // NOT terminal — Razorpay says it becomes `cancelled` only once NPCI
    // confirms, so this is a trigger to re-read, not an ending.
    "token.cancellation_initiated",
    "token.authenticated",
  ],

  presentation: [
    "payment.authorized",
    "payment.captured",
    "payment.failed",
    "order.paid",
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * EXACT event names, not prefixes — and the difference is a money bug.
 *
 * These were prefix matches (`token.`, `payment.`, `order.notification.`), which
 * looks equivalent and is not. Razorpay's `payment.` namespace also contains
 * `payment.dispute.created|won|lost|closed|under_review|action_required` and
 * `payment.downtime.started|updated|resolved`. Every one of those prefix-matched
 * into PRESENTATION — the handler that settles a debit.
 *
 * A dispute event carries presentation-shaped keys (a payment id, an order id),
 * so it would resolve to a real mandate and be handed to the settlement path for
 * a debit that already completed. `docs/PAYMENT-FLOW.md` documents precisely this
 * hazard for Decentro refunds — "its status tokens must be checked FIRST, or it
 * will be read as the original debit and overwrite that debit's outcome with the
 * refund's" — and a prefix match walks straight back into it.
 *
 * A downtime event is worse in a quieter way: it carries no payment entity at
 * all, so it resolves to nothing and burns a status read per delivery.
 *
 * The module's stated rule is that no kind may ever be the fallback. A prefix IS
 * a fallback — it silently claims every future event Razorpay adds under that
 * namespace. An allow-list claims only what we have actually reasoned about, and
 * anything new arrives as `null`: acked, logged unclassified, and never given to
 * the code that moves money.
 */
export function razorpayEventKind(
  event: string
): keyof typeof RAZORPAY_EVENTS | null {
  for (const [kind, names] of Object.entries(RAZORPAY_EVENTS)) {
    if ((names as readonly string[]).includes(event)) {
      return kind as keyof typeof RAZORPAY_EVENTS;
    }
  }
  return null;
}

/**
 * Keys we set in Razorpay's `notes` map, and read back off its webhooks.
 *
 * `notes` is the ONLY way our own reference travels to Razorpay and back.
 * Razorpay echoes no merchant reference on a token entity, and `createMandate`
 * has no `providerMandateId` to return (the token does not exist until the
 * payer approves) — so without this, the `token.confirmed` webhook contains
 * nothing that matches anything we have stored, resolves to
 * `unknown_reference`, and the mandate never activates by any path.
 *
 * Keep this key stable: changing it strands every in-flight mandate registered
 * under the old one.
 */
export const RAZORPAY_NOTE_KEY = {
  referenceId: "prabhuji_reference_id",
  /** Tags every order we create as ours on Razorpay's side. Never read back. */
  applicationId: "x-application-id",
  /**
   * The cycle an order or payment belongs to, as the IST calendar date
   * (`YYYY-MM-DD`). For the dashboard and reconciliation; never read back.
   */
  cycleDate: "prabhuji_cycle_date",
  /**
   * Which presentation of that cycle a PAYMENT is — `transactions.attempt_no`,
   * so `1` is the first and `2+` are dunning retries. Payment-level only: an
   * order is per cycle, not per attempt. Never read back.
   */
  attemptNo: "prabhuji_attempt_no",
} as const;

/** The value sent under {@link RAZORPAY_NOTE_KEY.applicationId}. */
export const RAZORPAY_APPLICATION_ID = "0000000003";

/**
 * `receipt` is Razorpay's ONLY idempotency mechanism on orders — there is no
 * `Idempotency-Key` header on this API — and it is capped at 40 ASCII
 * characters. Our usual `pj_pay_pj_mnd_<uuid>_<date>` template is ~45 and simply
 * does not fit, which is why `debitRequestId` hashes instead of concatenating.
 */
export const RAZORPAY_MAX_RECEIPT_CHARS = 40;

/** `description` is capped, and special characters are rejected. */
export const RAZORPAY_MAX_DESCRIPTION_CHARS = 50;

/** Razorpay rejects an order below ₹1. The authorization debit is a real debit. */
export const RAZORPAY_MIN_AMOUNT_PAISE = 100;

/**
 * The ceiling on `token.max_amount` for a regular (non-exempt) MCC, in paise —
 * ₹99,999. Recorded rather than enforced: our plans are two orders of magnitude
 * below it, and a hard guard here would be dead code in a money path.
 */
export const RAZORPAY_MAX_TOKEN_AMOUNT_PAISE = 9_999_900;

/**
 * `token.frequency`. MERCHANT-DRIVEN billing: `as_presented` is what tells
 * Razorpay to schedule NOTHING and wait for us to present each debit.
 *
 * Any other value hands the schedule to Razorpay, which — with
 * `BillingCycleService` also billing — is two schedulers charging the same
 * cycle. It is the same trap `plan_type: PERIODIC` is on Cashfree.
 * `recurring_value` / `recurring_type` are not applicable under `as_presented`
 * and must not be sent.
 */
export const RAZORPAY_TOKEN_FREQUENCY = "as_presented";

/**
 * Hours after the pre-debit notification before Razorpay accepts a
 * presentation — `MandateProvider.presentationTatHours` for this gateway.
 *
 * ⚠️ NOT CONFIRMED BY RAZORPAY (TAM-164, rollout P5 / OQ1). Razorpay documents
 * a 36h05m ceiling on its CARDS page and publishes nothing for UPI; 25 is this
 * codebase's own reading of "debits roughly 25 hours after the notification is
 * delivered". CONFIRM THE UPI WINDOW IN WRITING BEFORE ARMING THIS GATEWAY.
 *
 * THE WHOLE UNCERTAINTY IS THIS ONE NUMBER, which is why it is one constant
 * with no arithmetic around it. A corrected figure is a one-line change, and
 * the design degrades predictably rather than breaking: the debit lands
 * `activation + this` and slips a day only once that crosses midnight, so a
 * 1-day trial converts on D+1 for activations before `48 - this` o'clock IST
 * (23:00 at 25h, 18:00 at 30h, 12:00 at 36h) and never at all from 48h up.
 *
 * Being wrong HIGH is safe — a presentation is merely delayed, and
 * `canPresentDebit` keeps `cycleDate` as a hard floor so nothing is ever
 * charged early. Being wrong LOW is not: Razorpay rejects the presentation,
 * the order is spent, `MAX_PRESENTATION_RETRIES` burns, the cycle settles
 * failed, and NPCI auto-revokes the mandate on a failed first debit. Round UP
 * when the answer is ambiguous.
 */
export const RAZORPAY_PRESENTATION_TAT_HOURS = 25;

/** Razorpay `error.reason` / `error.code` keys the adapter branches on. */
export const RAZORPAY_ERROR_KEYS = {
  /** Another cancel is already in flight. Retry after >= 60s. */
  concurrentRequest: "concurrent_request_in_progress",
  /** The token is not in a state that can be cancelled. */
  invalidMandateState: "invalid_mandate_state",
  /** The token was never a recurring one, so there is no mandate to cancel. */
  tokenNotRecurring: "token_not_recurring",
} as const;
