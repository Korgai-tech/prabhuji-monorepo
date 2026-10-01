/**
 * Payment module domain types.
 *
 * Deliberately free of both Prisma and vendor vocabulary. Decentro's wire
 * format is string-typed booleans (`"true"`), rupee floats (`299.0`), and nine
 * `mandate_status` spellings; none of that appears here. The adapter in
 * `repositories/` translates at the boundary so the service layer reasons in
 * paise, `Date`s, and OUR state vocabulary.
 */

import type { SubscriptionStatus } from "@api/shared/entitlement/types.js";
import type { CallbackKind } from "@api/core/payment/constants.js";

/** Instrument behind a mandate. `enach` is not implemented yet. */
export type MandateType = "upi" | "enach";

/**
 * Our mandate state vocabulary. The adapter maps the provider's onto this.
 *
 *   initiated — row written, provider not yet called (or call in flight).
 *   pending   — provider accepted; waiting for the user to approve in their app.
 *   active    — approved and live. Debits can be presented.
 *   paused    — user paused it from their UPI app. Merchant-initiated pause is
 *               NOT supported by Decentro, so we only ever observe this.
 *   revoked   — killed after creation: user revoked, or NPCI auto-revoked after
 *               a failed first debit.
 *   rejected  — the user declined the approval prompt.
 *   expired   — the approval link timed out before the user acted.
 *   failed    — registration itself errored.
 *   completed — reached its end date normally.
 */
export type MandateState =
  | "initiated"
  | "pending"
  | "active"
  | "paused"
  | "revoked"
  | "rejected"
  | "expired"
  | "failed"
  | "completed";

/** States from which no further transition is expected. */
export const TERMINAL_MANDATE_STATES: readonly MandateState[] = [
  "revoked",
  "rejected",
  "expired",
  "failed",
  "completed",
];

/**
 * Lifecycle of one ledger row. ONE vocabulary across every `TransactionKind`,
 * so nothing has to branch on a gateway's phase names.
 *
 *   pending   — row written, nothing dispatched yet.
 *   notified  — pre-debit notification accepted; `presentationSequenceId` held.
 *               Recurring debits only.
 *   submitted — handed to the gateway, awaiting the outcome. Also an initial
 *               deposit awaiting the user's UPI approval.
 *   succeeded — money moved. The DB additionally requires `gatewayPaymentId`.
 *   failed    — terminal decline or terminal error; `failurePhase` says where.
 *   abandoned — terminal by our choice: retries exhausted, mandate died, or the
 *               user never approved.
 *
 * Deliberately absent: `refunded` / `disputed` (a refund is its own row, so
 * refunded-ness is derived — see `sumRefundedForTransaction`) and `superseded`
 * (bookkeeping, not an outcome; it would erase WHY the row failed).
 */
export type TransactionStatus =
  | "pending"
  | "notified"
  | "submitted"
  | "succeeded"
  | "failed"
  | "abandoned";

/** Statuses no callback, however late or out of order, may move a row off. */
export const TERMINAL_TRANSACTION_STATUSES = [
  "succeeded",
  "failed",
  "abandoned",
] as const satisfies readonly TransactionStatus[];

/**
 * Lifecycle of ONE pre-debit notification — the NPCI notice that must precede
 * every recurring debit by 24–48h.
 *
 *   pending  — row written; nothing dispatched yet, or dispatch is in flight.
 *   sent     — the provider ACCEPTED the notification but has not issued a
 *              presentation sequence id yet. This is the NORMAL answer from an
 *              asynchronous gateway, and having nowhere to put it is why the
 *              Decentro adapter used to throw on every cycle.
 *   accepted — sequence id held, so the debit is ADDRESSABLE. The only status a
 *              presentation may be made from, enforced in the database by
 *              `pdn_notifications_accepted_has_sequence_id`.
 *   rejected — the provider refused it. NPCI permits no debit this cycle.
 *   expired  — it aged out before the debit date.
 *   failed   — dispatch errored, or the provider reported failure.
 *
 * Separate from `TransactionStatus` on purpose: a notification can fail and be
 * re-armed several times inside ONE money claim, so collapsing the two would
 * lose either the retry count or the reason.
 */
export type PdnStatus =
  | "pending"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "failed";

/** Statuses from which no debit can be presented for the cycle. */
export const TERMINAL_PDN_STATUSES = [
  "rejected",
  "expired",
  "failed",
] as const satisfies readonly PdnStatus[];

/**
 * What kind of money movement a row records.
 *
 * `initial_deposit` is the one the old `payment_attempts` table structurally
 * could not hold — it has no billing cycle, so a cycle-keyed table had nowhere
 * to put it, and the charge went unrecorded.
 */
export type TransactionKind =
  | "initial_deposit"
  | "one_time"
  | "recurring_debit"
  | "refund"
  | "chargeback";

/**
 * Which of OUR calls is the irreversible, money-moving one for a given gateway.
 *
 * Declared by the adapter (`MandateProvider.chargePhase`) rather than inferred
 * from a provider name, because the adapters genuinely differ: Decentro's
 * `presentDebit` is a POST that moves money (`submission`), while Cashfree's is
 * a GET and its `notifyPreDebit` schedules the charge (`notification`).
 *
 * Load-bearing for recovery: "may I re-claim this cycle after a transport
 * failure?" reduces to "did the failure happen at or after `chargePhase`?".
 */
export type ChargePhase = "none" | "deposit" | "notification" | "submission";

/**
 * Where a failed row died. Separates a transport failure that CANNOT have moved
 * money from a decline that reached the bank — the difference between a
 * recoverable cycle and water under the bridge.
 */
export type FailurePhase = "notify" | "submit" | "settle";

/**
 * Razorpay Checkout's options block — the alternative to `authUrl`, never an
 * addition to it.
 *
 * Razorpay's UPI Autopay authorization is created by Razorpay Checkout running
 * on the device. The server raises the customer and the order and stops; the
 * `upi://` intent is minted by the SDK, so there is no link to hand back. A
 * gateway answers registration with a link OR with an SDK block, never both and
 * never neither (`MandateService.createMandate` refuses a provider that returns
 * neither).
 *
 * NAMED PER GATEWAY, and carried on the view under the gateway's own key
 * (`MandateView.razorpay`) rather than in one shared `checkout` object. Two
 * gateways' SDKs do not take the same fields, and a single merged shape would
 * either be a union of optional keys — where the client cannot tell which are
 * populated without re-deriving the provider — or a lowest common denominator
 * that fits neither. `MandateView.provider` is the discriminator; each gateway
 * that needs an SDK block gets its own, typed exactly.
 *
 * Note what is NOT here: a `subscriptionId`. That belongs to Razorpay's
 * Subscriptions product, where RAZORPAY owns the billing schedule. This
 * integration is deliberately S2S recurring with `token.frequency:
 * as_presented` so `BillingCycleService` owns it — there is no `sub_xxx`, and
 * introducing one would mean two schedulers billing the same cycle.
 *
 * Only ids and the PUBLISHABLE key live here. `keyId` (`rzp_live_…`) is the
 * half of the credential pair Razorpay designs to ship inside clients; the
 * secret signs server-side calls only and must never reach this object.
 */
export interface RazorpayCheckout {
  /** Razorpay's publishable `key_id`. Safe on a device, by design. */
  keyId: string;
  /** The order the SDK authorizes against — `order_xxx`. */
  orderId: string;
  /** The payer at the gateway — `cust_xxx`. */
  customerId: string;
  /**
   * Razorpay's recurring flag, verbatim.
   *
   * A STRING `"1"`, not a boolean — Razorpay's checkout options take the string
   * form while `/payments/create/recurring` takes a real `true`. Passed through
   * rather than left for the app to hardcode, so the gateway's quirk stays on
   * this side of the wire.
   */
  recurring: string;
}

/**
 * What Decentro's SDK is handed — everything registration produced for this
 * mandate, under the gateway's own key.
 *
 * ## Backward compatibility is the point of how this is built
 *
 * Entirely DERIVED in `toView` from columns the mandate row already carries.
 * The Decentro adapter is not touched, nothing new is stored, and no migration
 * is involved — so the existing UPI-link flow cannot change: `authUrl` keeps
 * its exact value, its expiry rule and its meaning, and a client that ignores
 * this block behaves precisely as it does today. `intentUrl` is the SAME string
 * as `authUrl`, and being derived from it rather than stored beside it means
 * the two cannot drift.
 *
 * A client can therefore read `data[data.provider]` uniformly across gateways,
 * or keep launching `authUrl` — both stay correct indefinitely.
 *
 * Everything here is either a gateway id or a link the payer is meant to open;
 * no credential exists on this gateway to leak, unlike Razorpay's `keyId`.
 */
export interface DecentroCheckout {
  /**
   * The `upi://` intent to launch. Byte-identical to `MandateView.authUrl` and
   * gated on the same expiry — an expired link is withheld from both, because
   * launching one drops the payer on a dead page with no way back.
   */
  intentUrl: string;
  /** Decentro's handle for the mandate, from `mandates.provider_mandate_id`. */
  decentroMandateId: string | null;
  /** Decentro's handle for the registration txn, from `provider_txn_id`. */
  decentroTxnId: string | null;
  /**
   * OUR reference for this mandate — constant for its whole life, and what any
   * support or reconciliation conversation with Decentro starts from.
   */
  referenceId: string;
}

/** What the app needs to drive the approval flow. */
export interface MandateView {
  mandateId: string;
  /**
   * The gateway this mandate lives on, from `mandates.provider`.
   *
   * NOT the active gateway. Once two gateways are live those are different
   * answers for most users: the active one is where NEW mandates register,
   * while an existing subscriber stays on whichever gateway they signed with.
   * The app used to carry a hardcoded provider name for analytics, which was
   * wrong for everyone the moment the server switched.
   */
  provider: string;
  state: MandateState;
  /** Null once expired — an approval URL past its expiry is worse than none. */
  authUrl: string | null;
  /**
   * Razorpay Checkout's options, when `provider` is `razorpay`.
   *
   * Null on every other gateway, and nulled on the same expiry as `authUrl` —
   * an order past its window opens a sheet that can only fail. Keyed by gateway
   * name so a second SDK gateway adds a sibling field rather than overloading
   * this one; `provider` is the discriminator.
   *
   * Cashfree has no counterpart yet — it answers with a `upi://` intent in
   * `authUrl` and nothing has needed a block for it.
   */
  razorpay: RazorpayCheckout | null;
  /**
   * Decentro's SDK parameters, when `provider` is `decentro`. Null otherwise.
   *
   * PURELY ADDITIVE, and derived rather than stored: `authUrl` still carries the
   * same intent link it always has, so the existing launch-the-link flow is
   * untouched and a client that never reads this field is unaffected. See
   * `DecentroCheckout`.
   */
  decentro: DecentroCheckout | null;
  authExpiresAt: string | null;
  planId: string;
  amountPaise: number;
  currency: string;
  /**
   * The mandate died in a way the user can fix by re-consenting. Drives the
   * "set up autopay again" CTA rather than a generic error.
   */
  requiresReRegistration: boolean;
  /**
   * `transactions.id` of this mandate's registration deposit — the payment
   * `POST /payment/mandate` created. The same value on every read of the
   * mandate, so a client event keyed on it names one payment. Null when the
   * mandate has no deposit row.
   */
  paymentReferenceId: string | null;
  /** Mirrors the subscription facade so the client needs one round trip. */
  subscription: SubscriptionStatus;
  nextDebitDate: string | null;
  /**
   * "Member since" — sourced from `subscriptions.startedAt`, threaded through
   * `MandateService.toView` (TAM-125). Null when the subscription has never
   * been started or on legacy rows. Renders as the Membership-since row on
   * the mobile Manage Subscription screen.
   */
  startedAt: string | null;
}

/** A callback body reduced to the only fields we route on. */
export interface CallbackRef {
  /**
   * Derived from `CALLBACK_KIND` rather than spelled out, so a new kind cannot be
   * added to the taxonomy while this union quietly disagrees with it.
   */
  kind: CallbackKind;
  /**
   * OUR reference from the body. WHOSE reference depends on the kind: a mandate or
   * presentation callback carries the mandate's, a PDN callback carries the
   * NOTIFICATION's. That difference is why resolution has to be kind-aware —
   * looking a mandate up by a notification's reference misses every time.
   */
  referenceId: string | null;
  providerMandateId: string | null;
  /** Routing key on a PDN or presentation callback. Never believed as state. */
  presentationSequenceId: string | null;
  /** Provider's per-delivery id; the dedupe key when present. */
  callbackTxnId: string | null;
  callbackAttempt: number | null;
  /**
   * When the gateway says the pre-debit notification reached the PAYER — set
   * only by a delivery-confirmation webhook, `null` on every other callback
   * (TAM-164).
   *
   * It matters because a gateway's turnaround runs from DELIVERY, not from our
   * dispatch call. A synthesised presentation instant measured from dispatch is
   * therefore optimistic by however long delivery took, and optimistic is the
   * expensive direction: presenting before the gateway will accept it spends the
   * order, burns the retry budget, and NPCI revokes a mandate whose first debit
   * fails. This is the only place the real instant is ever knowable, so it is
   * carried out of the body here and used to push the stored instant later.
   *
   * It can only ever DELAY. See `PdnService.recordNotificationDelivered`.
   */
  notificationDeliveredAt: Date | null;
}

/** Outcome of one billing-cycle run, for the scheduler's report. */
export interface BillingCycleReport {
  ranAt: string;
  expiredSwept: number;
  pdnSent: number;
  pdnFailed: number;
  /**
   * Notifications the provider ACCEPTED without issuing a presentation sequence
   * id — the normal answer from an asynchronous gateway, and not a failure.
   *
   * A sustained non-zero value alongside a zero `pdnSequenceIdsResolved` is the
   * signature of ids that never arrive: the callback is not reaching us AND the
   * status poll is not finding them.
   */
  pdnAwaitingSequenceId: number;
  /** Notifications whose id arrived later, via the poll or a callback. */
  pdnSequenceIdsResolved: number;
  /**
   * Notifications re-armed for another dispatch attempt. Each one mints a fresh
   * provider-side reference, so a climbing count is worth investigating even while
   * cycles still succeed.
   */
  pdnRearmed: number;
  /**
   * Notifications left untouched on purpose — premature in the 24–48h window, or a
   * provider blip. Distinct from `pdnFailed` because these cost nothing and
   * resolve themselves on a later tick.
   */
  pdnDeferred: number;
  /**
   * Cycles whose debit date passed with no addressable notification — written
   * off by the abandoned sweep.
   *
   * The counter that would have caught the 2026-08-03 stall on the first tick.
   * A deferral costs nothing on any single tick, but a cycle that defers through
   * its entire window is money that will never be collected, and until this
   * existed it left no trace anywhere: `pdnFailed` stayed 0 and the run logged at
   * `info`. Non-zero here is always a bug, never load.
   */
  pdnAbandoned: number;
  presentationsSent: number;
  reconciled: number;
  skippedOutsideWindow: number;
  /**
   * Cycles whose notification failed in transport but which the gateway then
   * confirmed HAD landed — adopted in place rather than re-claimed. A non-zero
   * value means the recovery stage saved a debit that would previously have
   * been stuck forever.
   */
  notificationsAdopted: number;
  /**
   * Cycles the gateway definitively never received, re-claimed under a fresh
   * row. Watch this alongside `notificationsAdopted`: a run of supersedes
   * without adoptions points at our dispatch, not at the gateway.
   */
  cyclesSuperseded: number;
  dryRun: boolean;
  /**
   * The run did nothing because another one was already in flight (or the
   * scheduler is disabled). Distinguished from an all-zero report because
   * "nothing was due" and "we never looked" are very different answers to have
   * in front of you during an incident. Mirrors `SeedRunSummary.lockBusy`.
   */
  lockBusy: boolean;
}

/**
 * WHERE in the pipeline a log line was emitted. The one field that answers
 * "where did it break" without knowing the forty event names by heart.
 *
 * Filter `stage=` to read one leg of the flow across every module that
 * touches it; sort by time within one `user_id` to read the whole story. The
 * legs are the phases of docs/PAYMENT-FLOW.md, and they are the phases a
 * payment can die in:
 *
 *   registration — mandate created, ₹2 authorization, awaiting UPI approval
 *   mandate      — the mandate's own life afterwards: polls, state changes,
 *                  cancellation (no ledger row in hand, the mandate is the unit)
 *   pdn          — the pre-debit notification (claim the cycle, notify NPCI)
 *   presentation — the debit is handed to the gateway
 *   settlement   — the gateway's verdict is applied to the ledger
 *   callback     — a webhook arrived and is being authenticated / routed
 *   dunning      — a failed renewal: retries, grace, lapse
 *   recovery     — a stranded row is being adopted / superseded / deferred
 *   gateway      — the HTTP boundary itself (the clients tag their own lines)
 *
 * Lives here rather than in `services/payment-log.ts` because the HTTP clients
 * in `repositories/` tag their own lines, and a repository may not import a
 * service.
 */
export const PAYMENT_STAGE = {
  registration: "registration",
  /** The mandate's own life after registration: polls, state changes, cancellation. */
  mandate: "mandate",
  pdn: "pdn",
  presentation: "presentation",
  settlement: "settlement",
  callback: "callback",
  dunning: "dunning",
  recovery: "recovery",
  gateway: "gateway",
} as const;
export type PaymentStage = (typeof PAYMENT_STAGE)[keyof typeof PAYMENT_STAGE];
