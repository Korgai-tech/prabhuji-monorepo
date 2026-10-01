import type { MandateState, PdnStatus } from "@api/core/payment/types";

/**
 * Decentro wire-level constants — endpoint paths, mandate flags, the
 * status→state map, and the callback field names.
 *
 * Extracted from the adapter so every Decentro-specific string lives in one
 * greppable place (mirrors `cashfree.constants.ts`). No behaviour here — only
 * data the adapter and the Decentro gateway translate against.
 */

/** Decentro's autopay endpoints, relative to `DECENTRO_BASE_URL`. */
export const DECENTRO_PATHS = {
  create: "/v3/payments/upi/autopay/mandate/link",
  status: "/v3/payments/upi/autopay/mandate/status",
  notify: "/v3/payments/upi/autopay/mandate/notify",
  presentation: "/v3/payments/upi/autopay/mandate/presentation",
  /**
   * NOTE THE MISSING `/mandate` SEGMENT. This path previously read
   * `/autopay/mandate/presentation/status`, guessed by appending `/status` to the
   * presentation path by analogy with the mandate endpoints. It is wrong: a
   * presentation and a notification are resources in their OWN right, hanging off
   * `/autopay` directly rather than off `/autopay/mandate`.
   */
  presentationStatus: "/v3/payments/upi/autopay/presentation/status",
  /**
   * THE endpoint whose absence broke every recurring debit.
   *
   * Decentro's notify API is ASYNCHRONOUS: it may accept the notification and
   * issue no `presentation_sequence_id` at all, leaving the id to arrive by
   * callback. With no way to READ it back, a notification that came back without
   * one had no path to ever becoming presentable — so the adapter threw instead,
   * and the cycle failed. This is that read.
   */
  notificationStatus: "/v3/payments/upi/autopay/notification/status",
  manage: "/v3/payments/upi/autopay/mandate/manage",
} as const;

/**
 * Query keys the status endpoints are addressed by.
 *
 * EXACTLY ONE is ever sent — see `firstPresentQuery` in the adapter. Decentro's
 * status endpoints take a single identifier; sending several is not belt-and-braces
 * but a different request, and the previous code's "send reference_id AND
 * consumer_urn AND the mandate id AND the sequence id and hope one is right" was a
 * documented guess rather than the contract.
 */
export const DECENTRO_QUERY_KEYS = {
  mandateId: "decentro_mandate_id",
  referenceId: "reference_id",
  presentationSequenceId: "presentation_sequence_id",
} as const;

/**
 * Envelope fields Decentro wraps EVERY response in, whatever the endpoint.
 *
 * `api_status` is the load-bearing one: Decentro signals application-level
 * failure inside an HTTP **200**. The client used to gate on `response.ok` alone,
 * so a `200 {api_status: "FAILURE"}` was read as success — the adapter then found
 * the fields it wanted missing and fabricated a `pending` outcome, leaving a
 * rejected debit unsettled forever.
 */
export const DECENTRO_ENVELOPE_KEYS = {
  apiStatus: "api_status",
  message: "message",
  /** The MACHINE-READABLE error key. See `DECENTRO_ERROR_KEYS`. */
  responseKey: "response_key",
} as const;

/** The `api_status` value that means the call actually did what we asked. */
export const DECENTRO_API_STATUS_SUCCESS = "SUCCESS";

/**
 * `response_key` values the flow has to branch on, as opposed to merely report.
 *
 * These are why `response_key` matters: without reading it, every failure is an
 * opaque 4xx and none of the three decisions below can be made.
 */
export const DECENTRO_ERROR_KEYS = {
  /**
   * The gateway has no record of this notification. THE signal that lets a
   * stranded cycle be superseded — until it was wired, `NoSuchDebitError` was
   * declared but unthrowable, so recovery could only ever defer.
   */
  noPdnRecord: "error_no_pre_debit_notification_found",
  /**
   * A reference id we already used. Means the PREVIOUS attempt landed after all,
   * so the answer is to reconcile by reading status — never to re-arm, which
   * would abandon a live notification.
   */
  duplicateReference: "error_duplicate_reference_id",
  /** Too early in the 24–48h window. Deferred, not failed: the next tick retries. */
  pdnTooSoon: "error_pdn_creation_not_allowed",
  /**
   * `debit_date` fell outside the notification window. Probed live on
   * 2026-08-05: today+1 and today+2 are accepted, today+3 is refused with
   * "Debit date should not be more than 48 hours ahead of the current date."
   *
   * A TIMING rejection, so deferred — `canSendPreDebitNotification` already
   * refuses to send outside 24–48h, and a date that is wrong now is right one
   * tick later. Treating it as a failure burned a re-arm attempt per tick on a
   * cycle that had done nothing wrong.
   *
   * ⚠ THIS KEY IS AN UMBRELLA. The same value also carries
   * "debit_date is invalid for MONTHLY frequency." — which is terminal, not a
   * timing problem: a calendar-frequency mandate has already spent the cycle its
   * registration debit consumed, and no date inside that cycle will ever work.
   * Since TAM-152 every mandate registers `AS_PRESENTED`, so that variant is
   * unreachable and deferring the key is safe. `isCadenceRejection` below exists
   * to shout if that stops being true.
   */
  invalidDebitDate: "error_invalid_debit_date",
  /**
   * `debit_date` was today. Same family as the ceiling above, opposite end:
   * "Debit Date cannot be equal to the Present Date."
   *
   * Also deferred. Unreachable through the sweep — `canSendPreDebitNotification`
   * requires a full day of lead — so this only fires on a hand-driven call, and
   * it must not write off a cycle when it does.
   */
  debitDateIsToday: "error_debit_date_equal_to_present_date",
  /** The presentation window has not opened yet. Also deferred, not failed. */
  presentationWindowNotStarted: "error_presentation_window_not_started",
} as const;

/**
 * Mandate behaviour flags.
 *
 * These are JSON BOOLEANS, verified against Decentro staging — their public
 * docs describe them as `"true"`/`"false"` strings, and the sandbox rejects
 * that outright:
 *
 *     400 Generate PSP URI is not of type boolean.
 *         Hint: generate_psp_uri (boolean).
 *
 * Trust the running API over the docs here. Each value is a product decision:
 *
 * `is_downpayment` — false, ALWAYS. It and `is_first_txn_amount` are mutually
 * exclusive ("mandate creation will fail if both flags are enabled") and the
 * registration charge is taken through the other one. Not interchangeable: a
 * downpayment is a separate auto-debit raised within 5 minutes of registration,
 * carrying its own `downpayment_reference_id` to reconcile, where
 * `is_first_txn_amount` is simply the first debit of this mandate — which is
 * what our ledger already models (`transactions.kind = 'initial_deposit'`,
 * settled by the mandate reaching `active`).
 *
 * `is_first_txn_amount` is NOT here — it is per-registration, derived in
 * `createMandate` from whether the plan carries a deposit. Both it and
 * `is_downpayment` are refused by Decentro when `start_date` is in the future,
 * which is why `MandateService` registers every mandate from today and carries
 * the trial on `nextDebitDate` instead.
 *
 * `is_collect_request` — false, i.e. the INTENT flow (NPCI restricted collect
 * from 28 Feb 2026). `is_qr_requested` — false (we deep-link into the UPI app).
 * `generate_psp_uri` — true; this is what makes the response carry the `upi://`
 * intent link the client launches. `is_block_funds` — false (one-shot holds
 * only). `is_revokable` — true (user can cancel from their UPI app). `is_tpv` —
 * false (a capital-markets control, irrelevant here).
 *
 * `is_managed_by_decentro` — false: we drive PDN + presentation ourselves from
 * `BillingCycleService`. If it in fact means Decentro schedules them, both
 * sides presenting a debit is a duplicate charge (see PAYMENT_MANDATE_MANAGED_BY_PROVIDER).
 */
export const DECENTRO_WIRE_FLAGS = {
  is_downpayment: false,
  generate_psp_uri: true,
  is_managed_by_decentro: false,
  is_qr_requested: false,
  is_block_funds: false,
  is_revokable: true,
  is_collect_request: false,
  is_tpv: false,
} as const;

/**
 * Our frequency vocabulary → Decentro's, which is LOWER CASE and unseparated.
 *
 * `AS_PRESENTED` is the one that matters. A calendar frequency anchors the
 * mandate to a recurrence cycle, and the registration debit (`is_first_txn_amount`)
 * consumes the first one — so every `debit_date` inside it is refused with
 * `error_invalid_debit_date`, which is exactly what stalled prod billing between
 * 2026-08-03 and 2026-08-05. Under `aspresented` the mandate carries no cadence,
 * every debit names its own date and amount under the `MAX` cap, and the schedule
 * lives here in `BillingCycleService`.
 *
 * An unknown key falls back to `aspresented` at the call site rather than
 * throwing — a plan misconfiguration must not take registration down, and the
 * fallback must not be `monthly`. Falling back to a calendar frequency would
 * register the exact unbillable shape described above, so a typo would produce a
 * mandate that looks healthy and can never be charged. As-presented bills
 * correctly whatever the plan meant, because `BillingCycleService` owns the
 * cadence and never reads this field back.
 */
export const DECENTRO_FREQUENCY: Readonly<Record<string, string>> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  HALF_YEARLY: "halfyearly",
  YEARLY: "yearly",
  AS_PRESENTED: "aspresented",
};

/** The wire value for a merchant-scheduled mandate. See {@link DECENTRO_FREQUENCY}. */
export const DECENTRO_AS_PRESENTED = "aspresented";

/**
 * Frequencies for which Decentro REJECTS `rule_type` / `rule_value`.
 *
 * A recurrence rule only means something against a cadence, so sending one on a
 * merchant-scheduled mandate is a 400 on the field set — Decentro validates
 * those (the `generate_psp_uri` boolean rejection above is the same class).
 */
export const DECENTRO_FREQUENCIES_WITHOUT_RULE_TYPE: readonly string[] = [
  "onetime",
  DECENTRO_AS_PRESENTED,
  "daily",
];

/**
 * Provider status → our state. ONE table, so the mapping is greppable from
 * either vocabulary and testable without a network.
 *
 * `Cancelled` maps to `revoked`: both mean the mandate is dead and re-consent
 * is required. Keys are lower-cased at lookup — the vendor documents `Active`
 * but has been observed sending `ACTIVE` on callbacks.
 */
export const DECENTRO_STATE_BY_PROVIDER_STATUS: Readonly<
  Record<string, MandateState>
> = {
  active: "active",
  revoked: "revoked",
  pending: "pending",
  expired: "expired",
  completed: "completed",
  rejected: "rejected",
  paused: "paused",
  failed: "failed",
  cancelled: "revoked",
};

/**
 * Provider `notification_status` → our `PdnStatus`.
 *
 * Note `pending` → `sent`, which is the crux of the asynchronous flow: the
 * provider saying "PENDING" means it ACCEPTED the notification and has not yet
 * issued a sequence id. That is a success with more to come, not a failure, and
 * treating it as one is what made every cycle fail.
 *
 * `success` → `accepted`, which claims the notification is ADDRESSABLE. The
 * repository refuses to record that without a sequence id, and the database
 * refuses it too.
 *
 * Keys are lower-cased at lookup. An UNRECOGNISED status maps to `failed` — see
 * `mapPdnStatus` in the adapter for why that direction was chosen and what stops
 * it destroying a valid notification.
 *
 * These EIGHT keys are exactly the set the working reference implementation
 * handles (`crickmate-monorepo` `PDN_STATUS_BY_PROVIDER_CODE`), and no more. Extra
 * spellings are deliberately NOT guessed at: inventing a mapping for a status
 * Decentro may never send is how this adapter accumulated the wrong field names in
 * the first place, and the unknown→`failed` fallback already covers them.
 */
export const DECENTRO_PDN_STATE_BY_PROVIDER_STATUS: Readonly<
  Record<string, PdnStatus>
> = {
  pending: "sent",
  sent: "sent",
  success: "accepted",
  accepted: "accepted",
  rejected: "rejected",
  expired: "expired",
  failure: "failed",
  failed: "failed",
};

/** Candidate keys, in preference order, for ids the vendor spells variably. */
export const DECENTRO_MANDATE_ID_KEYS = [
  "decentro_mandate_id",
  "decentroMandateId",
  "mandate_id",
];
export const DECENTRO_TXN_ID_KEYS = [
  "decentro_txn_id",
  "decentroTxnId",
  "transaction_id",
];
export const DECENTRO_STATUS_KEYS = ["mandate_status", "mandateStatus", "status"];

/**
 * The fields the Decentro gateway reads out of an (untrusted) callback body to
 * route on. The body itself is never believed — these only decide which
 * mandate/debit to ask the provider's status API about.
 */
export const DECENTRO_CALLBACK_FIELDS = {
  referenceId: "reference_id",
  providerMandateId: "decentro_mandate_id",
  callbackTxnId: "callback_txn_id",
  callbackAttempt: "callback_attempt",
  presentationSequenceId: "presentation_sequence_id",
  /**
   * The three status fields that CLASSIFY a callback. Decentro does not label its
   * callbacks, so the kind is inferred from which of these the body carries —
   * checked most-specific-first, because a presentation callback also echoes the
   * mandate id and the notification's sequence id.
   */
  mandateStatus: "mandate_status",
  notificationStatus: "notification_status",
  presentationStatus: "presentation_status",
} as const;
