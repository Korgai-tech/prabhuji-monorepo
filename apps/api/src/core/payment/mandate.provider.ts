import type { FailureSubCode } from "@api/core/payment/failure-sub-code";

import type {
  ChargePhase,
  RazorpayCheckout,
  MandateState,
  MandateType,
  PdnStatus,
} from "@api/core/payment/types";

/**
 * The payment-provider seam.
 *
 * Mirrors the `OtpProvider` pattern (`core/otp/services/otp.provider.ts`): the
 * INTERFACE lives in `services/` so business code can depend on it without
 * reaching into `repositories/`, while the IMPLEMENTATIONS live in
 * `repositories/` alongside the network client — matching how
 * `s3-media.repository.ts` confines a third-party SDK. Selected at the
 * composition root by `PAYMENT_PROVIDER`.
 *
 * Every type here is domain-shaped: paise (never rupee floats), real booleans
 * (never Decentro's `"true"` strings), `Date`s (never the vendor's date
 * format), and our `MandateState` (never the provider's status spellings).
 * Translation is the adapter's entire job.
 */
export interface MandateProvider {
  readonly name: string;

  /**
   * Which of OUR calls irreversibly moves money for this gateway.
   *
   * Declared here rather than inferred from `name`, because the adapters
   * genuinely differ and every service that needs the answer would otherwise
   * grow a `if (provider === "decentro")`. Decentro's `presentDebit` is a POST
   * that moves money (`submission`); Cashfree's is a GET, and its
   * `notifyPreDebit` schedules the charge (`notification`).
   *
   * Recorded on every ledger row, because "may I re-claim this cycle after a
   * transport failure?" reduces to "did the failure happen at or after this
   * phase?".
   */
  readonly chargePhase: ChargePhase;

  /**
   * Does registering a mandate take money? Both live gateways say yes, by the
   * same route: the deposit is debited with the UPI PIN entry that authorizes
   * the mandate (Cashfree's authorization payment, Decentro's
   * `is_first_txn_amount`). Neither makes a second call for it, which is why
   * the mandate going `active` is what settles the deposit.
   *
   * Read by `PaymentController.resolvePlan` to decide whether a plan
   * misconfigured with a zero deposit is a purchasable-plan error or simply how
   * this gateway works. Kept on the port even with no `false` implementation
   * left: a gateway that registers at ₹0 is a normal thing to add, and the
   * alternative is that plan validation silently starts assuming otherwise.
   */
  readonly supportsInitialDeposit: boolean;

  /**
   * How far ahead of the debit this gateway's pre-debit notification must be
   * raised, in hours.
   *
   * Declared here rather than as a module constant in `npci-window.ts` because
   * the band is a VENDOR contract, not the regulation. The 24h floor is RBI's
   * and is common to all of them; the ceiling is not. Decentro documents
   * "at least 24 to 48 hours before the actual debit"; Cashfree publishes no
   * ceiling, so ours is a self-imposed 48h that keeps the cancellation window
   * narrow; Razorpay debits ~25h after the notification is DELIVERED, so an
   * order raised 48h out can fall outside its window entirely and simply never
   * debit.
   *
   * The NPCI execution windows and the 23:50 IST blackout deliberately stay
   * global in `npci-window.ts` — those are law, and a gateway does not get to
   * have an opinion about them.
   *
   * ⚠️ THE BAND IS SAMPLED AT DAY GRANULARITY, so it MUST span a whole
   * multiple of 24 hours or it can never be satisfied at all.
   *
   * `canSendPreDebitNotification` computes the lead as
   * `cycleDate - istDateOnly(now)`. Both sides are calendar dates at UTC
   * midnight (`cycle_date` and `next_debit_date` are `@db.Date`), so the lead
   * is ALWAYS 24h or 48h — never 25, never 30 — no matter what time of day the
   * scheduler ticks. A band of `{min:25, max:30}` looks like a tighter version
   * of `{24,48}` and is in fact empty: every tick reports
   * `skippedOutsideWindow` and that gateway silently never bills anyone.
   *
   * That is not hypothetical — it is exactly what the first Razorpay band did,
   * and nothing failed loudly. `gateways.test.ts` now asserts every registered
   * adapter's band contains a multiple of 24h, so this cannot be reintroduced.
   */
  readonly pdnLeadHours: { min: number; max: number };

  /**
   * How long after the notification this gateway refuses to accept a
   * presentation — or `null` when it TELLS us that instant itself.
   *
   * NPCI's 24h notice runs from when the payer was NOTIFIED, not from midnight
   * of the debit day, so every gateway has an instant before which a
   * presentation is rejected. The two ways of learning it are what this member
   * distinguishes:
   *
   *   `null`   the gateway reports it. Decentro answers a notification status
   *            read with a real `debit_date` (~notify + 24h), which
   *            `PdnService` writes to `pdn_notifications.scheduled_debit_at`.
   *            The vendor's own number always wins; nothing is synthesised.
   *
   *   a number the gateway reports NOTHING. Razorpay's `getPreDebitStatus`
   *            returns status, order id and failure fields and no debit
   *            instant, so without a synthesised one the row keeps its seed and
   *            `canPresentDebit` presents from the cycle date's midnight —
   *            possibly hours after the notification, far under the gateway's
   *            turnaround, and every presentation is rejected.
   *
   * DECLARED, not derived from the gateway's name. The billing engine reads
   * this member; `if (provider.name === "razorpay")` in `PdnService` or
   * `BillingCycleService` is the thing this exists to prevent
   * (`add_new_gateway.md`).
   *
   * ⚠️ IT CAN ONLY EVER DELAY A PRESENTATION. `cycleDate` stays a hard floor in
   * `canPresentDebit`, so a wrong value here bills LATE, never EARLY. That
   * asymmetry is deliberate: the number is a vendor contract we may have
   * mis-read, and the safe direction to be wrong in is the one that does not
   * take money before it is due.
   */
  readonly presentationTatHours: number | null;

  /**
   * The idempotency key this gateway will see for a given cycle's debit, or
   * `null` if it does not accept one.
   *
   * Exists so the ledger and the wire agree on one key BY CONSTRUCTION rather
   * than by two copies of the same template string. It is what the recovery
   * sweep asks the gateway about after a transport failure, so a drift between
   * the stored key and the sent key would silently make every failed cycle
   * unrecoverable.
   */
  debitRequestId(referenceId: string, cycleDate: Date): string | null;

  /**
   * Register a mandate and get back a URL the user approves at.
   *
   * MUST NOT be retried by the caller on timeout: the provider may have
   * created the mandate even if we never saw the response. Reconcile via
   * `getMandateStatus(referenceId)` instead — which is exactly why
   * `referenceId` is persisted before this is called.
   */
  createMandate(input: CreateMandateInput): Promise<CreateMandateResult>;

  /**
   * Authoritative state read. This — not the callback body — is what
   * entitlement decisions are made from. The India v3 callbacks carry no HMAC,
   * so a callback is a trigger to call THIS, never a fact in itself.
   */
  getMandateStatus(input: {
    referenceId: string;
    providerMandateId: string | null;
    /**
     * The registration order this mandate was authorized against — Razorpay's
     * `order_xxx`, off the stored checkout block. Razorpay-only.
     *
     * It is how that gateway IDENTIFIES a registration attempt. There is exactly
     * one order per attempt, where a customer is one per person and outlives
     * every attempt — so the order is the only handle with the right
     * cardinality. Its authorization payment carries `token_id`, `customer_id`
     * and the `pay_xxx` together, which is what makes the token attributable to
     * THIS mandate and what settles the registration deposit (the ledger's
     * `transactions_settled_has_gateway_id` constraint refuses a `succeeded` row
     * without a gateway payment id, and Razorpay's token entity carries none —
     * verified against the live API, not assumed).
     *
     * Nullable so a mandate registered before the checkout block was stored
     * degrades to "unresolvable, report pending" rather than failing the poll.
     */
    registrationRef?: string | null;
  }): Promise<MandateStatusResult>;

  /**
   * Pre-debit notification. NPCI requires it 24–48h before the debit, the
   * provider does NOT fire it for us, and a debit without one fails.
   *
   * MAY RETURN NO SEQUENCE ID, and callers must handle that. Decentro's notify is
   * ASYNCHRONOUS: it answers "accepted" and the id arrives later, by callback or
   * by `getPreDebitStatus`. Modelling that as an error is what made every Decentro
   * cycle fail at notify.
   */
  notifyPreDebit(input: PreDebitInput): Promise<PreDebitResult>;

  /**
   * Read a pre-debit notification's status — and, critically, the sequence id it
   * may not have carried when it was accepted.
   *
   * THE counterpart to an asynchronous notify. Without it a notification that came
   * back with no sequence id has no path to ever becoming presentable, which is
   * precisely the hole that stranded every cycle: the adapter had only
   * `getDebitStatus`, which reads a PRESENTATION, so recovery was asking the wrong
   * question with the wrong key.
   *
   * A READ, therefore safe on the retrying `get` and never on `post`. Throws
   * {@link NoSuchDebitError} on a definitive "no such notification" — the one
   * signal that lets a stranded cycle be superseded.
   */
  getPreDebitStatus(input: PreDebitStatusInput): Promise<PreDebitStatusResult>;

  /**
   * Present the debit. NOT idempotent and NOT safe to retry — a duplicate
   * presentation is a duplicate charge. The `(mandateId, cycleDate)` unique
   * constraint upstream is what guarantees it is called once per cycle.
   */
  presentDebit(input: PresentDebitInput): Promise<PresentDebitResult>;

  /**
   * Read the outcome of an already-presented debit.
   *
   * The counterpart to `getMandateStatus`, and load-bearing for the same
   * reason: `presentDebit` answering `pending` is the NORMAL case — the debit
   * settles asynchronously at the bank — so without a way to read the outcome
   * back, a submitted debit has no path to `succeeded` at all. Every
   * asynchronous settlement route (the presentation callback, the straggler
   * sweep) resolves through THIS call rather than believing a callback body,
   * exactly as mandate state does.
   *
   * A READ, therefore safe on `DecentroClient.get` (which retries) and never
   * on `post`. Calling this must never move money.
   */
  getDebitStatus(input: DebitStatusInput): Promise<PresentDebitResult>;

  /**
   * Revoke a mandate. Note there is no `pause`: Decentro documents pause as
   * user-initiated from their UPI app, observable but not commandable.
   */
  revokeMandate(input: {
    referenceId: string;
    providerMandateId: string;
  }): Promise<void>;
}

/**
 * Resolve the adapter for the gateway a given ROW was written under.
 *
 * The seam that makes two gateways coexist. Selection used to happen once at
 * boot — one `PAYMENT_PROVIDER`, one adapter, injected everywhere — which is
 * correct only while a single gateway has ever existed. The moment a second one
 * takes new registrations, every mandate already on the first must keep being
 * notified, presented, polled, settled and revoked through the FIRST, or it is
 * charged against a gateway that has never heard of its ids.
 *
 * So `PAYMENT_PROVIDER` now means only "the gateway new mandates register on",
 * and everything touching an existing mandate resolves through this from
 * `mandates.provider` / `transactions.provider` — columns that already existed
 * and were, until now, written but never read.
 *
 * A function rather than a class: there is exactly one implementation, built at
 * the composition root over the `GATEWAYS` registry, and a class would add a
 * type to import for no behaviour.
 *
 * @throws {UnknownProviderError} if the row names a gateway this process has not
 * been configured to construct.
 */
export type ProviderResolver = (name: string) => MandateProvider;

/**
 * A row names a gateway this process cannot construct.
 *
 * Every gateway in the registry is resolvable, so this means the ROW is wrong,
 * not the configuration: a `provider` value that names no gateway we have — a
 * hand-edited row, a restore from an older schema, a typo in a backfill.
 *
 * Thrown per row rather than swallowed, and callers log it at error and skip
 * that row. One unreadable row must not stop every other subscriber's billing,
 * but it must never be silent either — the affected user simply stops being
 * charged otherwise.
 */
export class UnknownProviderError extends Error {
  constructor(readonly provider: string) {
    super(
      `no gateway is registered for provider "${provider}" — the row names a gateway this build does not have`
    );
    this.name = "UnknownProviderError";
  }
}

/**
 * The gateway answered, definitively, that it has no such payment.
 *
 * The ONLY signal that lets `BillingCycleService` re-claim a billing cycle whose
 * notification failed, so the bar is deliberately high: it must mean "I looked
 * and it is not there", never "I could not reach you" and never "I do not
 * recognise this status string". A transport error thrown as this would become a
 * double charge.
 *
 * WIRED FOR DECENTRO, from `getPreDebitStatus`, on the confirmed
 * `response_key: "error_no_pre_debit_notification_found"`. That is what makes the
 * supersede branch reachable at all — previously this class was declared but
 * unthrowable, so a cycle whose notify failed in transport stayed claimed forever
 * and every later tick skipped the mandate in silence.
 *
 * STILL NOT WIRED FOR CASHFREE: its 404 body for an unknown subscription payment
 * remains unconfirmed against the pinned API version, so that adapter continues to
 * ADOPT or DEFER only — the safe direction, leaving a stuck cycle visible in the
 * logs rather than risking a second debit. Confirm the body, with a test, before
 * throwing it there.
 */
/**
 * The gateway refused the notification because it is too early in the window.
 *
 * DEFERRED, not failed — and the distinction is money. NPCI requires 24–48h of
 * notice; a notification raised at hour 49 is simply premature, and the next
 * scheduler tick (30 minutes later) will be inside the window. Recording it as a
 * failure would burn a re-arm from a finite budget and, once exhausted, abandon a
 * cycle that nothing was ever wrong with.
 *
 * Lives here rather than beside the provider's error keys because `services/`
 * cannot import `repositories/` (arch-boundaries.json), and the service is what
 * has to make the defer-or-fail decision. The adapter translates the vendor's
 * `response_key` into this at the seam, which is where provider vocabulary is
 * supposed to stop.
 */
export class PreDebitTooSoonError extends Error {
  constructor(message = "gateway refused the notification as premature") {
    super(message);
    this.name = "PreDebitTooSoonError";
  }
}

/**
 * The gateway rejected our reference id as one it has already seen.
 *
 * Means the PREVIOUS attempt landed after all — so the answer is to RECONCILE by
 * reading status, never to re-arm. Re-arming would mint a new reference and
 * abandon a notification the gateway considers live, which loses the cycle while
 * looking like progress.
 */
export class DuplicateReferenceError extends Error {
  constructor(message = "gateway has already seen this reference id") {
    super(message);
    this.name = "DuplicateReferenceError";
  }
}

export class NoSuchDebitError extends Error {
  constructor(message = "gateway has no record of this debit") {
    super(message);
    this.name = "NoSuchDebitError";
  }
}

export interface CreateMandateInput {
  /** Ours, already persisted. Sent as the provider's `reference_id`. */
  referenceId: string;
  /**
   * The gateway's existing handle for this payer, when we have one.
   *
   * Supplied by the service from the user's previous mandates so an adapter can
   * SKIP creating a customer it already created. Razorpay refuses a duplicate
   * outright ("Customer already exists for the merchant"), which is what made
   * re-registration impossible for anyone who had ever tried once.
   *
   * Null on a user's first registration, and ignored by the gateways that have
   * no customer object.
   */
  providerCustomerId?: string | null;
  type: MandateType;
  mandateName: string;
  purposeMessage: string;
  amountPaise: number;
  currency: string;
  frequency: string;
  amountRule: string;
  ruleType: string;
  ruleValue: number;
  /**
   * When the MANDATE becomes valid — the day it is registered, always.
   *
   * NOT the first debit date, which is `mandates.next_debit_date` and never
   * reaches an adapter: our scheduler owns the clock, so no gateway is told
   * when to charge. Decentro additionally refuses `is_first_txn_amount` on a
   * mandate starting in the future, which is why a trial cannot be expressed
   * by moving this date.
   */
  startDate: Date;
  endDate: Date;
  /**
   * What to debit AT REGISTRATION, in paise. Resolved by `MandateService` from
   * the plan (`paywall_plans.initial_deposit_paise` during a trial, the full
   * price otherwise) — never derived inside the adapter.
   *
   * It used to be: the Cashfree adapter compared `startDate` to `Date.now()` and
   * substituted a hardcoded ₹2. That put a money decision in a translation
   * layer, keyed off a weaker signal than the one the service already had
   * (`trialDays`, which includes the one-trial-per-user check), and left the
   * charged amount unrecorded anywhere but a TypeScript constant.
   *
   * 0 means take nothing at registration.
   */
  initialDepositPaise: number;
  /** Approval-link validity, 1–1440 minutes. */
  expiryMinutes: number;
  /**
   * The real payer. Cashfree's create-subscription REQUIRES customer details,
   * and every mandate previously carried the SAME hardcoded placeholder
   * (`9999999999` / a shared address) — so at the provider, every customer
   * looked like one person. That breaks reconciliation, the provider's own
   * fraud checks, and any dispute that starts from a phone number.
   *
   * Optional on the interface because Decentro and the stub have no use for it;
   * the Cashfree adapter is where it becomes load-bearing.
   */
  payer?: PayerContact;
}

/**
 * Identity of the human being debited, as the gateway needs to see them.
 *
 * `phone` is the national number WITHOUT a country code — Cashfree expects a
 * bare 10-digit Indian mobile, and prefixing `+91` is rejected.
 */
export interface PayerContact {
  phone: string | null;
  email: string;
}

export interface CreateMandateResult {
  providerMandateId: string | null;
  providerTxnId: string | null;
  /**
   * UPI intent link today; a bank redirect under eNACH.
   *
   * NULL on a gateway that approves through a client SDK, where the intent is
   * minted on the device and never exists server-side — return that gateway's
   * SDK block instead. Returning neither is a broken registration and
   * `MandateService.createMandate` refuses it: the user would be handed a
   * mandate they have no way to approve.
   */
  authUrl: string | null;
  /**
   * Razorpay Checkout's options, on the gateway that has no link to give.
   *
   * Named per gateway rather than a shared `checkout`: two SDKs do not take the
   * same fields, and one merged shape would be a bag of optionals the client
   * cannot discriminate. See `authUrl`.
   */
  razorpay?: RazorpayCheckout | null;
  /**
   * The gateway's handle for the payer — whether freshly created or the one
   * that was passed in. Returned so the service can persist it and the user's
   * NEXT registration skips the create entirely.
   */
  providerCustomerId?: string | null;
  authExpiresAt: Date;
  state: MandateState;
}

export interface MandateStatusResult {
  state: MandateState;
  stateReason: string | null;
  providerMandateId: string | null;
  providerTxnId: string | null;
  npciTransactionId: string | null;
  /** Already masked by the adapter — the full handle is never returned. */
  payerHandleMasked: string | null;
  payerNameMasked: string | null;
  nextDebitDate: Date | null;
  /**
   * The registration payment, when EVERY attempt on it has failed and the
   * mandate is still `pending` — the ₹2 deposit was declined.
   *
   * ANALYTICS ONLY. It never moves state: the payer may retry inside the same
   * checkout, so `state` stays `pending` and this is merely what `bk_trial_failed`
   * reports (TAM-188 — without it a declined deposit on a gateway that keeps the
   * mandate pending emitted nothing at all). Omitted by gateways that cannot
   * see a registration attempt.
   */
  failedRegistrationPayment?: {
    gatewayPaymentId: string;
    failureCode: string | null;
    failureReason: string | null;
  };
}

export interface PreDebitInput {
  /**
   * The MANDATE's reference — constant for its whole life.
   *
   * This is how a gateway identifies the subscription: Cashfree derives its base
   * payment id from it, and the stub looks its registered mandates up by it. It is
   * NOT what Decentro puts in `reference_id` on the wire — see `notificationRef`.
   */
  referenceId: string;
  /**
   * THE NOTIFICATION's own reference, fresh per attempt.
   *
   * A SEPARATE field rather than an overload of `referenceId`, and the distinction
   * is load-bearing in both directions. Decentro rejects a reused wire
   * `reference_id` with `error_duplicate_reference_id`, so sending the mandate's
   * means cycle 2 onward is refused outright — but Cashfree and the stub NEED the
   * mandate's, so overloading the one field breaks them instead. Supplied from
   * `pdn_notifications.reference_id`, which rotates on every re-arm.
   */
  notificationRef: string;
  providerMandateId: string;
  amountPaise: number;
  currency: string;
  /** The debit's target date (IST). */
  cycleDate: Date;
  /**
   * The earliest instant this gateway will accept a presentation, when we had
   * to SYNTHESISE it — `notifiedAt + presentationTatHours`. `null` for a
   * gateway that reports its own (Decentro) or declares no turnaround.
   *
   * Passed in rather than computed inside the adapter so the value on the WIRE
   * and the value in `pdn_notifications.scheduled_debit_at` are the same object
   * by construction. Deriving it twice — once here, once at persistence — would
   * put two clock readings a few milliseconds apart into a field the
   * presentation gate compares against, and the drift would be invisible until
   * a debit landed on the wrong side of an NPCI window boundary. Same reasoning
   * as `debitRequestId`: one key, minted once, used everywhere.
   */
  notBefore: Date | null;
}

export interface PreDebitResult {
  /**
   * The provider's handle for the notification, or NULL when it accepted the
   * notification without issuing one yet.
   *
   * NULLABLE, and that is the entire point. Decentro's notify answers
   * `notification_status: "PENDING"` with no id, and the id arrives minutes later
   * by callback or status poll. The old non-nullable type forced the adapter to
   * THROW on the normal case, so every cycle was recorded `failure_phase='notify'`
   * and no debit was ever raised.
   */
  presentationSequenceId: string | null;

  /**
   * What the provider says about the NOTIFICATION itself, in our vocabulary.
   *
   * REQUIRED rather than optional: a default would let an asynchronous adapter
   * look `accepted` when it is merely `sent`, and `accepted` is the status that
   * unlocks a debit.
   */
  status: PdnStatus;

  providerTxnId: string | null;

  /**
   * The provider's response, verbatim, for forensics.
   *
   * Persisted to `pdn_notifications.raw_create_response` — REDACTED by the service
   * first, since a raw body carries the payer's handle. This is what answers a
   * "the provider says otherwise" ticket months later, and it is on the RESULT
   * rather than fetched separately because only the adapter ever sees it.
   */
  raw?: unknown;
}

/** Identifies one notification for a status read. */
export interface PreDebitStatusInput {
  /** The notification's own reference — always known, so always usable. */
  referenceId: string;
  /** The provider's handle, once we hold one. Preferred when present. */
  presentationSequenceId: string | null;
}

export interface PreDebitStatusResult {
  status: PdnStatus;
  /** May still be null: the provider has accepted but not yet issued one. */
  presentationSequenceId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /**
   * WHY it died, in our vocabulary (TAM-186). Decided by the ADAPTER, from the
   * provider's own machine-readable reason fields — never from
   * `failureMessage`, which is our user-facing copy. See
   * `core/payment/failure-sub-code.ts`.
   */
  failureSubCode: FailureSubCode | null;
  /**
   * The instant the PROVIDER will actually accept a presentation, when it tells
   * us one.
   *
   * NOT the cycle date. Decentro answers a notification with a timestamp of
   * roughly notify-time + 24h — `"Aug 06, 2026 05:10:55 PM"` for a notice raised
   * the previous afternoon — because NPCI's 24h notice period runs from when the
   * payer was told, not from midnight of the debit day. We had been treating the
   * cycle date's midnight as the floor, so every presentation between 00:00 and
   * that instant was refused with `error_presentation_window_not_started` and
   * retried on the next tick. Correct in the end, and ~34 wasted calls to get
   * there.
   *
   * Nullable because it is an OPTIONAL improvement on the cycle date, never a
   * requirement: a gateway that does not report one, or a value we cannot parse,
   * leaves this null and the caller falls back to the cycle-date gate. A wrong
   * value here delays a debit, so guessing is worse than not knowing.
   */
  scheduledDebitAt?: Date | null;
  /** Persisted to `raw_latest_status`, redacted. See `PreDebitResult.raw`. */
  raw?: unknown;
}

export interface PresentDebitInput {
  /** The MANDATE's reference. See `PreDebitInput.referenceId`. */
  referenceId: string;
  /**
   * The reference for THIS presentation attempt — not the mandate's, and not the
   * notification's either.
   *
   * Decentro rejects a reused wire reference, and a re-presentation after
   * `markForRetry` is a new attempt. Supplied from
   * `transactions.gateway_presentation_ref`, minted per attempt and persisted
   * before dispatch.
   */
  presentationRef: string;
  providerMandateId: string;
  presentationSequenceId: string;
  amountPaise: number;
  currency: string;
  cycleDate: Date;
  /**
   * Which presentation of this cycle this is — `transactions.attempt_no`: `1`
   * for the first, `2+` for the dunning retries `markForRetry` raises. Carried
   * so a gateway can label the charge (Razorpay puts it in the payment's
   * `notes`); it is informational, and no adapter may branch on it.
   */
  attemptNo: number;
  /**
   * Narration for the debit. REQUIRED by Decentro's presentation endpoint, whose
   * omission made every presentation a 400 on a missing mandatory field. A
   * business string, so it is built in `services/`, not here.
   */
  purposeMessage: string;
}

/**
 * Identifies one already-presented debit. Carries the same triple the
 * presentation was made under, because the vendor's status endpoints are
 * inconsistent about which of them they key on — sending all three lets the
 * adapter pick without changing this signature.
 */
export interface DebitStatusInput {
  referenceId: string;
  providerMandateId: string;
  presentationSequenceId: string;
  cycleDate: Date;
}

export interface PresentDebitResult {
  /**
   * `pending` is the normal outcome — settlement arrives by callback, and the
   * straggler sweep polls for it when no callback comes.
   */
  outcome: "pending" | "succeeded" | "failed";
  providerTxnId: string | null;
  bankReferenceNumber: string | null;
  npciTransactionId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /**
   * WHY it died, in our vocabulary (TAM-186). Decided by the ADAPTER, from the
   * provider's own machine-readable reason fields — never from
   * `failureMessage`, which is our user-facing copy. See
   * `core/payment/failure-sub-code.ts`.
   */
  failureSubCode: FailureSubCode | null;
}
