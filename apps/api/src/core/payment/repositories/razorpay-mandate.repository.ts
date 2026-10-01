import { createHash } from "node:crypto";
import { AppError } from "@api/shared/errors";
import { classifyFailure } from "@api/core/payment/failure-sub-code";
import { createModuleLogger } from "@api/shared/logs";
import type { MandateState, PdnStatus } from "@api/core/payment/types";
import type {
  CreateMandateInput,
  CreateMandateResult,
  DebitStatusInput,
  MandateProvider,
  MandateStatusResult,
  PreDebitInput,
  PreDebitResult,
  PreDebitStatusInput,
  PreDebitStatusResult,
  PresentDebitInput,
  PresentDebitResult,
} from "@api/core/payment/mandate.provider.js";
import {
  DuplicateReferenceError,
  NoSuchDebitError,
} from "@api/core/payment/mandate.provider.js";
import {
  isJsonObject,
  RazorpayApiError,
  RazorpayClient,
  readString,
} from "./razorpay.client.js";
import { maskPayerName, maskVpa } from "./pii-mask.js";
import {
  RAZORPAY_ERROR_KEYS,
  RAZORPAY_MAX_DESCRIPTION_CHARS,
  RAZORPAY_MAX_RECEIPT_CHARS,
  RAZORPAY_MIN_AMOUNT_PAISE,
  RAZORPAY_APPLICATION_ID,
  RAZORPAY_NOTE_KEY,
  RAZORPAY_OUTCOME_BY_PAYMENT_STATUS,
  RAZORPAY_PATHS,
  RAZORPAY_PDN_STATUS_BY_NOTIFICATION_STATUS,
  RAZORPAY_STATE_BY_TOKEN_STATUS,
  RAZORPAY_TOKEN_FREQUENCY,
  RAZORPAY_PRESENTATION_TAT_HOURS,
} from "./razorpay.constants.js";

const log = createModuleLogger("payment:razorpay-provider");

/**
 * Razorpay UPI Autopay adapter — a `MandateProvider` sibling of the Cashfree and
 * Decentro ones, selected at the composition root by `PAYMENT_PROVIDER`. Its
 * entire job is TRANSLATION between our domain types and Razorpay's core
 * Payments API. No business rule lives here.
 *
 * ## The model, in one paragraph
 *
 * Razorpay has no subscriptions object in this flow. A mandate is a **token**
 * hanging off a **customer**; every billing cycle is an **order**; a debit is a
 * **payment** raised against that order. Registration is three calls (customer →
 * order carrying a `token{}` block → UPI intent payment). Each cycle is two
 * (order carrying a `notification{}` block, which IS the pre-debit notification
 * — Razorpay has no merchant notify endpoint — then a recurring payment).
 *
 * ## Three properties that are unlike the other adapters
 *
 * 1. **PAISE EVERYWHERE.** Decentro and Cashfree take rupee floats and this file
 *    deliberately contains no `toRupees`. Adding one divides every charge by 100.
 * 2. **`recurring` changes type between two endpoints.** It is the STRING `"1"`
 *    on `/payments/create/upi` and a real BOOLEAN `true` on
 *    `/payments/create/recurring`. That inconsistency is Razorpay's; it is
 *    preserved here on purpose and is not a bug to tidy.
 * 3. **INTENT ONLY.** UPI Collect has been deprecated for new autopay
 *    registrations since 28 Feb 2026 and we are not in an exempt MCC, so
 *    `upi.flow` is always `intent`. There is no collect fallback to add.
 *
 * ## The composite `providerMandateId`
 *
 * Every per-mandate Razorpay call needs BOTH the customer id and the token id:
 * the token is addressed as `/customers/:cid/tokens/:tid`, and
 * `/payments/create/recurring` takes `customer_id` and `token` as separate
 * fields. `MandateProvider` gives an adapter one opaque `providerMandateId`, so
 * this adapter stores the pair in it as `cust_xxx:token_xxx` and parses it back
 * out (see `parseMandateRef`). A bare `token_xxx` is still accepted so nothing
 * breaks if a row was written before the composite existed — the calls that
 * genuinely cannot proceed without a customer id say so by name rather than
 * sending an `undefined` into a URL.
 */
export class RazorpayMandateProvider implements MandateProvider {
  readonly name = "razorpay";

  /**
   * `presentDebit` — `POST /payments/create/recurring` — is the irreversible,
   * money-moving call. The order raised at `notifyPreDebit` moves nothing: with
   * a `notification{}` block Razorpay schedules no debit of its own and waits
   * for us.
   */
  readonly chargePhase = "submission" as const;

  /**
   * Registration DOES move money: the authorization payment is a real debit
   * (Razorpay's minimum is ₹1), taken with the same UPI PIN entry that approves
   * the mandate. There is no second call for it, so the mandate going `active`
   * is what settles the deposit.
   */
  readonly supportsInitialDeposit = true;

  /**
   * 48h, not the 24h the other two also accept — and NOT the `{25, 30}` this
   * started as, which was an empty band that would have silently prevented
   * Razorpay from ever billing anyone.
   *
   * Why `{25,30}` was wrong: `canSendPreDebitNotification` measures the lead as
   * `cycleDate - istDateOnly(now)`, both calendar dates at UTC midnight, so the
   * lead is only ever exactly 24h or 48h. No tick can ever land inside
   * `[25,30]`; every one reports `skippedOutsideWindow`. See the warning on
   * `MandateProvider.pdnLeadHours`, and the guard in `gateways.test.ts` that
   * now makes an empty band a failing test rather than lost revenue.
   *
   * Why the floor is 24 and not 48 (TAM-164): the floor used to be 48 because
   * the turnaround was enforced by the LEAD, and a 24h lead can put the
   * notification only hours before the cycle date's midnight — far under
   * Razorpay's TAT, so every presentation was rejected. That reasoning was
   * sound while `scheduled_debit_at` for this gateway held nothing but its
   * seed. It no longer holds: `presentationTatHours` below now enforces the
   * turnaround DIRECTLY, on the instant, so the lead no longer has to
   * approximate it in whole days. Freeing the floor to 24 is what makes a
   * one-day trial billable here at all.
   *
   * The 48h ceiling stays, and matters for RENEWALS: a monthly cycle is
   * notified two days out and keeps a comfortable margin over the turnaround.
   * `{24,24}` would also unblock a D+1 cycle and would also pass the
   * `gateways.test.ts` band guard — and would cut every renewal to a bare 24h
   * lead with no margin at all. It is rejected deliberately; see TAM-164.
   *
   * ⚠️ The 36h05m ceiling Razorpay documents for CARDS (and on no UPI page) is
   * no longer a threat to this band — a 24h lead sits under it either way. It
   * survives as a question about `RAZORPAY_PRESENTATION_TAT_HOURS`, which is
   * where the whole timing uncertainty now lives. CONFIRM THE UPI WINDOW IN
   * WRITING BEFORE ARMING THIS GATEWAY (rollout P5 / OQ1).
   */
  readonly pdnLeadHours = { min: 24, max: 48 } as const;

  /**
   * Razorpay reports NO debit instant — `getPreDebitStatus` answers with the
   * order's status, id and failure fields and nothing else — so the turnaround
   * has to be synthesised from this. See the constant for the (unconfirmed)
   * number and what depends on it.
   */
  readonly presentationTatHours = RAZORPAY_PRESENTATION_TAT_HOURS;

  private readonly client: RazorpayClient;

  /** Client built here, as in the sibling adapters; injectable for tests. */
  constructor(client?: RazorpayClient) {
    this.client = client ?? new RazorpayClient();
  }

  /**
   * The per-cycle idempotency key — and for this gateway it is literally the
   * order's `receipt`.
   *
   * Razorpay has NO idempotency header on orders or payments. What it does have
   * is a uniqueness constraint on `receipt`: a second order carrying a receipt
   * we have already used is rejected. That single fact is what makes "did my
   * call land?" answerable after a timeout, and it is why this value must be
   * DETERMINISTIC — same reference, same cycle, same string, forever.
   *
   * **`receipt` is capped at 40 ASCII characters.** The template the other
   * adapters use — `pj_pay_pj_mnd_<uuid>_<date>` — is about 45 and does not fit,
   * so this hashes instead of concatenating: a truncated SHA-256 of the
   * reference, plus the compact cycle date kept in the clear because a human
   * reading a Razorpay dashboard needs to see WHICH DAY at a glance. 28
   * characters, ASCII, and independent of how long a reference id ever gets.
   *
   * 64 bits of digest is far more than enough to separate our references; a
   * collision would have to be between two distinct mandates billing on the same
   * calendar day.
   */
  debitRequestId(referenceId: string, cycleDate: Date): string {
    return capReceipt(`pj_${compactDate(cycleDate)}_${shortHash(referenceId)}`);
  }

  async createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
    // The authorization payment is a REAL debit and Razorpay rejects an order
    // below ₹1. A plan configured with a smaller (or zero) deposit is an ops
    // misconfiguration, not a runtime condition to absorb — refuse it by name
    // rather than letting the gateway answer with a generic 400 two calls later.
    if (input.initialDepositPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
      throw new AppError(
        `Razorpay requires an authorization debit of at least ${RAZORPAY_MIN_AMOUNT_PAISE} paise; this plan asks for ${input.initialDepositPaise}`,
        409,
        "PLAN_NOT_PURCHASABLE"
      );
    }

    // STEP 1 — the customer, and it is SKIPPED when we already hold this payer's.
    //
    // A customer belongs to the human, not to the mandate. Razorpay refuses a
    // second one for the same contact, so reusing the stored handle is both the
    // fix for that refusal and one fewer call on the registration path.
    //
    // ponytail: a handle that is stale at Razorpay would fail the ORDER create
    // below on every retry, with no self-recovery — nulling the column is the
    // manual escape. Not defended against because nothing here deletes a
    // customer; revisit if Razorpay ever starts expiring them.
    const customerId =
      input.providerCustomerId ?? (await this.createCustomer(input));

    // STEP 2 — the order that DESCRIBES the mandate. `amount` here is the
    // authorization debit (the deposit during a trial, the full price
    // otherwise), while `token.max_amount` is the ceiling the mandate may never
    // exceed on any future cycle. Two different numbers with two different jobs;
    // charging `amountPaise` here would take the full price on day zero and
    // defeat the trial.
    const order = await this.client.post(
      RAZORPAY_PATHS.orders,
      {
        amount: input.initialDepositPaise,
        currency: input.currency,
        customer_id: customerId,
        method: "upi",
        token: {
          max_amount: input.amountPaise,
          expire_at: unixSeconds(input.endDate),
          // MERCHANT-DRIVEN. Razorpay must schedule nothing — `BillingCycleService`
          // is the only scheduler. `recurring_value` / `recurring_type` are not
          // applicable under `as_presented` and are deliberately not sent.
          frequency: RAZORPAY_TOKEN_FREQUENCY,
        },
        receipt: registrationReceipt(input.referenceId),
        description: sanitizeDescription(input.purposeMessage),
        // OUR reference, so an inbound webhook can be resolved back to this
        // mandate. Load-bearing, not decoration.
        //
        // Razorpay has no field that echoes a merchant reference on a TOKEN
        // entity, and `createMandate` cannot return a `providerMandateId`
        // because the token does not exist until the payer approves. So at the
        // moment `token.confirmed` arrives there is, without this, nothing in
        // the body that matches anything stored: the reference is absent and
        // our `provider_mandate_id` column is still null. The callback resolves
        // to `unknown_reference`, and the reconcile sweep then reads
        // `getMandateStatus` with a null token and answers `pending` without
        // calling anything — so the mandate never activates, ever, by any path.
        //
        // `notes` is Razorpay's documented carry-your-own-id mechanism and it
        // propagates onto the payment entity its webhooks deliver.
        notes: ourNotes({ referenceId: input.referenceId }),
      },
      { operation: "create_mandate", referenceId: input.referenceId }
    );
    const orderId = readString(order, "id");
    if (!orderId) {
      throw new AppError(
        "Razorpay create-order returned no order id",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    // STEP 3 IS THE APP'S. There is deliberately no third call here.
    //
    // The authorization payment — the thing that mints the `upi://` intent the
    // payer approves — is raised by Razorpay Checkout ON THE DEVICE, from the
    // order above. This adapter used to raise it itself with
    // `POST /payments/create/upi`, and that is an S2S endpoint gated per
    // merchant account: on an account without it enabled, Razorpay answers a
    // 400 reading `"The requested URL was not found on the server."` with
    // `source: "internal"` — after the customer and order have already been
    // created. Every registration therefore died at the last step and surfaced
    // as `PAYMENT_PROVIDER_UNAVAILABLE`, with a real order left behind.
    //
    // Handing the order to the SDK removes the dependency on that entitlement
    // entirely: checkout creates the payment under the PUBLISHABLE key, which
    // needs no S2S access. It also means no `authUrl` exists at this point —
    // the intent is minted on the device — so registration answers with
    // `razorpay` instead. `MandateService` refuses a provider that returns
    // neither.
    //
    // Do NOT re-add a server-side create here "as a fallback": a second payment
    // against the same order is a second authorization attempt, and the two
    // race for the same UPI PIN entry.

    // The customer id is not yet stored anywhere: `providerMandateId` is null
    // until the token exists, and `mandates` has no column for a customer. Log
    // it against the reference so a stranded registration can be reconstructed
    // by hand. See the class docblock's composite-id section.
    log.info(
      {
        event: "razorpay_mandate_registered",
        reference_id: input.referenceId,
        razorpay_customer_id: customerId,
        razorpay_order_id: orderId,
      },
      "Razorpay authorization raised; awaiting the token.confirmed webhook"
    );

    return {
      // NULL until the payer approves. The token is what identifies a Razorpay
      // mandate, and it does not exist yet.
      //
      // This column is `@unique`, and the customer id is deliberately STABLE per
      // user (`User.razorpayCustomerId` + `fail_existing: "0"`), so a composite
      // built from the customer alone — `cust_xxx:` — is the SAME string for
      // every registration that user ever starts. The first abandoned attempt
      // took the key and never released it (nothing nulls this column: see
      // `setState`, and `applyStatus` skips nulls), so the user's next attempt
      // collided on the unique index and 500'd, permanently, with no self-heal.
      //
      // Nulls do not collide, so N unapproved rows per user coexist. Nothing is
      // lost by not writing here: `provider_checkout` holds this registration's
      // order and customer, which is where `getMandateStatus` reads them from —
      // and the ORDER is the correct key anyway, being one-per-attempt where the
      // customer is one-per-person.
      providerMandateId: null,
      // Returned whether it was created just now or passed in, so the service
      // stores it once and every later registration skips the create.
      providerCustomerId: customerId,
      // No payment exists yet — the SDK raises it. It arrives later, off the
      // token poll. Writing an order id here instead would mislabel the ledger's
      // `gateway_payment_id`, which is what a refund is chased with.
      providerTxnId: null,
      // No link on this gateway; the intent is minted on the device.
      authUrl: null,
      razorpay: {
        // The PUBLISHABLE half of the credential pair. Razorpay documents
        // `key_id` as belonging in client code; the secret stays server-side and
        // never enters this object.
        keyId: this.client.keyId,
        orderId,
        customerId,
        // A STRING here. It is a real boolean `true` on
        // `/payments/create/recurring`. Razorpay's inconsistency, preserved —
        // and passed through rather than left for the app to hardcode.
        recurring: "1",
      },
      // Computed, not read back: the client needs an absolute instant to expire
      // the CTA on, and Razorpay echoes no expiry for an order either. Doubles
      // as the checkout's window — an order opened past it can only fail.
      authExpiresAt: new Date(Date.now() + input.expiryMinutes * 60_000),
      // Registration only ever yields "awaiting the user". Razorpay returns no
      // mandate status on this call at all, so there is nothing to map — and
      // reading the PAYMENT's `created` status as a mandate state would be a
      // category error.
      state: "pending",
    };
  }

  async getMandateStatus(input: {
    referenceId: string;
    providerMandateId: string | null;
    registrationRef?: string | null;
  }): Promise<MandateStatusResult> {
    const stored = parseMandateRef(input.providerMandateId);
    const pending = (): MandateStatusResult => ({
      state: "pending",
      stateReason: null,
      providerMandateId: input.providerMandateId,
      providerTxnId: null,
      npciTransactionId: null,
      payerHandleMasked: null,
      payerNameMasked: null,
      nextDebitDate: null,
    });

    // THE resolution step, and the only route by which a Razorpay mandate ever
    // activates: `createMandate` cannot return a token id (it is minted when the
    // payer approves), and Razorpay's `token.confirmed` webhook carries only
    // `payload.token.entity` — no `notes`, no `customer_id` — so no inbound
    // callback can be matched back to this mandate.
    //
    // Resolved from THIS registration's ORDER, which is one-per-attempt. The
    // order's authorization payment carries `token_id` and `customer_id`
    // alongside the `pay_xxx` (verified against the live API: all three are
    // present on the captured UPI authorization). That makes attribution exact —
    // the token came from this mandate's own order, so there is nothing to
    // misidentify.
    //
    // The previous route asked the CUSTOMER for its token list. A customer is
    // per-person and is reused across every registration that person starts, so
    // the list accumulates and the only available discriminator was a timestamp
    // floor. A stale approval landing after a newer attempt began sat above the
    // floor and was adopted by the wrong row — activating a mandate against a
    // token minted for a different order, whose own order then had no payment,
    // which is what left mandates `active` against `pending` subscriptions.
    const auth = await this.findAuthorization(
      input.registrationRef,
      input.referenceId
    );

    // Prefer what is already stored: past approval both halves are on the row,
    // and re-deriving them each poll would make a live mandate depend on a read
    // that can fail.
    const customerId = stored.customerId ?? auth?.customerId ?? null;
    const tokenId = stored.tokenId ?? auth?.tokenId ?? null;

    if (!customerId || !tokenId) {
      // The normal pre-approval state — no payment on the order yet, so no
      // token. Also where a row with no stored order lands (registered before
      // the checkout block existed): unresolvable, and `pending` is the
      // fail-safe answer — never `active`, which would hand out paid content.
      log.info(
        {
          event: "razorpay_no_recurring_token_yet",
          reference_id: input.referenceId,
          razorpay_order_id: input.registrationRef ?? null,
          // The tell for "save_vpa is off": the order HAS a captured payment,
          // but Razorpay minted no token against it. Otherwise indistinguishable
          // from "the payer has not approved yet" — which the status separates,
          // since an unsettled attempt deliberately yields no token here.
          authorization_payment_id: auth?.paymentId ?? null,
          authorization_payment_status: auth?.paymentStatus ?? null,
        },
        "no recurring token on this mandate's registration order yet — the payer has not approved, or save_vpa is off"
      );
      // `latestPayment` answers `failed` only when EVERY attempt on the order
      // failed, so a payer who retried and is mid-approval is not reported.
      // State stays `pending` regardless — see the port's docblock.
      if (auth?.paymentStatus === "failed" && auth.paymentId) {
        return {
          ...pending(),
          failedRegistrationPayment: {
            gatewayPaymentId: auth.paymentId,
            failureCode: auth.failureCode,
            failureReason: auth.failureReason,
          },
        };
      }
      return pending();
    }

    const token = await this.client.get(
      RAZORPAY_PATHS.customerToken(customerId, tokenId),
      {},
      { operation: "get_mandate_status", referenceId: input.referenceId }
    );
    const recurring = childObject(token, "recurring_details");
    const payer = readTokenVpa(token);

    return {
      state: mapTokenState(readString(recurring, "status")),
      stateReason: pick(recurring, ["failure_reason", "status_message"]),
      // The COMPOSITE, written only now that BOTH halves are real. It is unique
      // per token, which is what the column's unique index is actually for —
      // unlike the customer-only form, which was one value per person and so
      // collided on that user's second registration.
      //
      // This is also the write that persists it: `applyStatus` stores a non-null
      // `providerMandateId`, which is what finally moves the mandate off
      // `pending`.
      providerMandateId: composeMandateRef(customerId, tokenId),
      // The AUTHORIZATION PAYMENT's id, and the token cannot supply it: a
      // Razorpay token entity carries no `payment_id`/`auth_payment_id` at all
      // (verified against the live API — the keys below have never once hit).
      // Kept as the first read anyway, so an account that does start returning
      // one costs no extra call.
      //
      // Off the SAME payment that supplied the token id above, so the two cannot
      // disagree. That is what closes the failure this once caused: `onStateChanged`
      // settles the registration deposit with this value, and the ledger's
      // `transactions_settled_has_gateway_id` CHECK refuses a `succeeded` row
      // whose `gateway_payment_id` is null. A null here did not merely lose an
      // id — the settle threw, the callback rolled back, and the subscription
      // write that follows it never ran. A live mandate sat `active` against a
      // `pending` subscription: money taken, no Pro, and the self-heal jammed on
      // the same constraint every time it retried.
      providerTxnId:
        pick(token, ["payment_id", "auth_payment_id"]) ??
        (auth?.settled ? auth.paymentId : null),
      npciTransactionId: pick(token, ["npci_txn_id", "npci_transaction_id"]),
      // MASKED HERE, AT THE BOUNDARY — the full VPA/name never leave this frame.
      payerHandleMasked: maskVpa(payer.vpa),
      payerNameMasked: maskPayerName(payer.name),
      // Razorpay schedules nothing under `as_presented`, so it has no opinion
      // about the next debit date. Ours lives on `mandates.next_debit_date`.
      nextDebitDate: null,
    };
  }

  /**
   * CREATING THE ORDER IS THE NOTIFICATION. Razorpay exposes no merchant notify
   * endpoint; an order carrying a `notification{}` block is the pre-debit notice.
   *
   * Sending that block is the "decoupled flow", and it is not optional: it is
   * what says WE choose the debit instant and WE own the retries. Omit it and
   * Razorpay auto-debits roughly 25 hours later on its own initiative — a second
   * scheduler charging the same cycle, which is the exact failure mode
   * `plan_type: PERIODIC` is on Cashfree.
   *
   * `input.notificationRef` is unused: Razorpay has no per-attempt reference
   * field, and its one idempotency surface is the deterministic `receipt` below.
   */
  async notifyPreDebit(input: PreDebitInput): Promise<PreDebitResult> {
    const { tokenId } = parseMandateRef(input.providerMandateId);
    if (!tokenId) {
      throw new AppError(
        "Razorpay pre-debit notification needs a token id",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    let response: Record<string, unknown>;
    try {
      response = await this.client.post(
        RAZORPAY_PATHS.orders,
        {
          amount: input.amountPaise,
          currency: input.currency,
          payment_capture: true,
          // Keyed on the NOTIFICATION's reference, not the cycle's — so a
          // transport retry of this attempt is refused as a duplicate (correct)
          // while a genuine re-arm after a failed debit gets a fresh order
          // (also correct). See `notificationReceipt`.
          receipt: notificationReceipt(input.notificationRef),
          notification: {
            token_id: tokenId,
            // THE SAME instant we store as `scheduled_debit_at`, so the gateway
            // and the ledger cannot disagree about when this debit becomes
            // presentable. It used to be the cycle date's IST midnight, which
            // for a next-day cycle is EARLIER than Razorpay's own turnaround
            // allows: the order then advertised a debit window Razorpay would
            // not honour, and our sweep, reading the same midnight off the row,
            // presented into the rejection.
            //
            // Falls back to that midnight only for a gateway with no declared
            // turnaround — unreachable for this adapter, which declares one, and
            // kept so the field can never go absent on the wire.
            payment_after: unixSeconds(
              input.notBefore ?? istStartOfDay(input.cycleDate),
            ),
          },
          // Same reason as at registration: this is what lets the PDN and
          // presentation callbacks for this cycle resolve back to the mandate.
          // Tagged and dated as well, so every order of ours filters on the
          // dashboard by application and by cycle.
          notes: ourNotes({
            referenceId: input.referenceId,
            cycleDate: input.cycleDate,
          }),
        },
        { operation: "send_pdn", referenceId: input.referenceId }
      );
    } catch (err) {
      // A rejected DUPLICATE RECEIPT means the previous attempt landed after
      // all, so the answer is to RECONCILE, never to re-arm: re-arming would
      // mint a second order for a cycle Razorpay already has a live
      // notification for.
      if (isDuplicateReceipt(err)) {
        throw new DuplicateReferenceError(
          `Razorpay already holds an order for this cycle's receipt (${input.referenceId})`
        );
      }
      throw err;
    }

    const orderId = readString(response, "id");
    if (!orderId) {
      throw new AppError(
        "Razorpay create-order (notification) returned no order id",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    return {
      // THE ORDER ID. The presentation is keyed on the order, not on the
      // notification's own id — `/payments/create/recurring` takes `order_id`.
      presentationSequenceId: orderId,
      // Synchronous: either the order came back or the call threw. There is no
      // pending state to model.
      status: "accepted",
      providerTxnId: null,
      raw: response,
    };
  }

  /**
   * Read the notification back.
   *
   * A READ, on the retrying `get`. Throws {@link NoSuchDebitError} ONLY when
   * Razorpay definitively answers that no such order exists — never on a
   * transport error, never on a status token we do not recognise. That bar is
   * deliberately high: this is the one signal that lets a claimed cycle be
   * re-claimed, and throwing it wrongly is a double charge.
   */
  async getPreDebitStatus(
    input: PreDebitStatusInput
  ): Promise<PreDebitStatusResult> {
    if (!input.presentationSequenceId) {
      // No order id — but the receipt is derived from the notification's own
      // reference, which we DO have, so the order is findable after all. This
      // is the path that answers "my notify call timed out; did it land?", and
      // without it a cycle whose dispatch failed in transport had no way to
      // discover the order it may already have created.
      //
      // Fail-soft in EVERY direction, including on an empty result. An empty
      // list looks like "definitely no order", which would authorise
      // `NoSuchDebitError` and therefore a re-claim of the cycle — but a
      // list-by-receipt query answering empty could equally be index lag at
      // Razorpay, and re-claiming a cycle whose order does exist is a SECOND
      // CHARGE. So this adopts-or-defers only, the same posture the Cashfree
      // adapter takes, leaving a genuinely stranded cycle visible in the logs
      // rather than risking a duplicate debit.
      return this.findNotificationByReceipt(input.referenceId);
    }

    let response: Record<string, unknown>;
    try {
      response = await this.client.get(
        RAZORPAY_PATHS.order(input.presentationSequenceId),
        {},
        { operation: "get_pdn_status", referenceId: input.referenceId }
      );
    } catch (err) {
      if (isNoSuchResource(err)) {
        throw new NoSuchDebitError(
          `Razorpay has no order ${input.presentationSequenceId}`
        );
      }
      throw err;
    }

    const notification = childObject(response, "notification");
    return {
      status: mapPdnStatus(
        readString(notification, "status"),
        input.presentationSequenceId
      ),
      presentationSequenceId: readString(response, "id") ?? input.presentationSequenceId,
      failureCode: pick(notification, ["error_code", "failure_reason"]),
      failureMessage: pick(notification, ["error_description", "description"]),
      // Classified from the FINER machine fields, in the order Razorpay makes
      // them meaningful: `failure_reason` / `error_reason` say WHY, `error_code`
      // is the 3-value bucket that says almost nothing (TAM-186). Never from
      // `error_description` — that is user-facing copy.
      failureSubCode: classifyFailure([
        pick(notification, ["failure_reason"]),
        pick(notification, ["error_reason"]),
        pick(notification, ["error_source"]),
        pick(notification, ["error_code"]),
      ]),
      raw: response,
    };
  }

  /**
   * THIS MOVES MONEY. Irreversible, never retried — `RazorpayClient.post`
   * structurally cannot, and the `(mandateId, cycleDate)` claim upstream is what
   * guarantees it runs once per cycle.
   *
   * `amount` MUST equal the order's amount; Razorpay rejects a mismatch, which
   * is the same amount-freeze the other two gateways enforce at notification
   * time.
   */
  async presentDebit(input: PresentDebitInput): Promise<PresentDebitResult> {
    const { customerId, tokenId } = requireMandateRef(
      input.providerMandateId,
      "presentDebit"
    );

    // Razorpay requires the payer's email/contact on a subsequent payment, and
    // `PresentDebitInput` carries no payer — so we ask Razorpay for the customer
    // it already holds rather than inventing one. A READ, so it is safe on the
    // retrying `get`, and best-effort: a blip reading the customer must not
    // block a debit that is otherwise due. The no-reply fallback matches the
    // Cashfree adapter's convention.
    const contact = await this.fetchCustomerContact(customerId, input.referenceId);

    const response = await this.client.post(
      RAZORPAY_PATHS.createRecurringPayment,
      {
        email: contact.email ?? noReplyEmail(input.referenceId),
        ...(contact.phone ? { contact: contact.phone } : {}),
        amount: input.amountPaise,
        currency: input.currency,
        // The ORDER the notification was raised on. This is what binds the debit
        // to the notice that preceded it.
        order_id: input.presentationSequenceId,
        customer_id: customerId,
        // The `token_xxx` ID, not the whole token object.
        token: tokenId,
        // A real BOOLEAN here. It is the string "1" on `/payments/create/upi`.
        recurring: true,
        description: sanitizeDescription(input.purposeMessage),
        // The payment's OWN notes. Observed on the test-mode API (5 Sep 2026):
        // the payment entity carries the ORDER's notes MERGED with these. We
        // still send the full map rather than only `attempt_no`, so the
        // reference id on the payment — what every `payment.*` webhook resolves
        // by — never depends on that merge, and the shared keys carry the same
        // values on both entities so precedence is moot. `attempt_no` is the
        // one thing an order cannot know: which attempt of the cycle this is.
        notes: ourNotes({
          referenceId: input.referenceId,
          cycleDate: input.cycleDate,
          attemptNo: input.attemptNo,
        }),
      },
      { operation: "present_debit", referenceId: input.referenceId }
    );

    return {
      // Razorpay answers a subsequent payment with ids, not an outcome — the
      // debit settles asynchronously at the bank. `pending` is therefore the
      // NORMAL result here, resolved later by the payment webhook or by
      // `getDebitStatus`.
      outcome: mapDebitOutcome(pick(response, ["status"])),
      providerTxnId:
        pick(response, ["razorpay_payment_id", "id"]) ?? null,
      bankReferenceNumber: pick(response, ["rrn", "bank_reference"]),
      npciTransactionId: pick(response, ["npci_txn_id", "npci_transaction_id"]),
      failureCode: pick(response, ["error_code", "error_reason"]),
      failureMessage: pick(response, ["error_description"]),
      // See the notification mapping above: the finer fields decide, and
      // `error_description` — our user-facing copy — never does (TAM-186).
      failureSubCode: classifyFailure([
        pick(response, ["error_reason"]),
        pick(response, ["error_source"]),
        pick(response, ["error_code"]),
      ]),
    };
  }

  /**
   * Read back the outcome of a debit we already presented.
   *
   * Addressed via `GET /orders/:id/payments`, NOT `GET /payments/:id`:
   * `DebitStatusInput` carries the order id (as `presentationSequenceId`) and no
   * payment id, so the direct payment read is simply unreachable from this port.
   * The order's payment collection answers the same question from the ids we
   * actually hold.
   *
   * Fails CLOSED in both directions. A transport error propagates (the caller
   * leaves the attempt unsettled and the next sweep asks again), and an
   * unrecognised status maps to `pending` — never `succeeded`, which grants an
   * unpaid month, and never `failed`, which duns a user who actually paid.
   */
  async getDebitStatus(input: DebitStatusInput): Promise<PresentDebitResult> {
    const response = await this.client.get(
      RAZORPAY_PATHS.orderPayments(input.presentationSequenceId),
      {},
      { operation: "get_presentation_status", referenceId: input.referenceId }
    );
    const payment = latestPayment(response);

    return {
      outcome: mapDebitOutcome(readString(payment, "status")),
      providerTxnId: readString(payment, "id"),
      bankReferenceNumber: pick(payment, ["rrn", "bank_reference"]),
      npciTransactionId: pick(payment, ["npci_txn_id", "npci_transaction_id"]),
      failureCode: pick(payment, ["error_code", "error_reason"]),
      failureMessage: pick(payment, ["error_description"]),
      // See the notification mapping above: the finer fields decide, and
      // `error_description` — our user-facing copy — never does (TAM-186).
      failureSubCode: classifyFailure([
        pick(payment, ["error_reason"]),
        pick(payment, ["error_source"]),
        pick(payment, ["error_code"]),
      ]),
    };
  }

  /**
   * Cancel the mandate — `PUT /customers/:cid/tokens/:tid/cancel`.
   *
   * **NOT `DELETE /customers/:cid/tokens/:tid`.** Razorpay's own documentation
   * says in as many words that the delete does not cancel the mandate: it
   * removes THEIR record of the token and leaves the NPCI mandate live and
   * debitable, i.e. it takes away our ability to stop the debits without
   * stopping the debits. The test suite asserts the verb and the path.
   */
  async revokeMandate(input: {
    referenceId: string;
    providerMandateId: string;
  }): Promise<void> {
    const { customerId, tokenId } = requireMandateRef(
      input.providerMandateId,
      "revokeMandate"
    );

    try {
      await this.client.put(
        RAZORPAY_PATHS.cancelCustomerToken(customerId, tokenId),
        {},
        { operation: "manage_mandate", referenceId: input.referenceId }
      );
    } catch (err) {
      throw translateCancelError(err);
    }
    // No return value on purpose: the authoritative post-cancel state comes from
    // the next status read — and for Razorpay that matters more than usual,
    // because the token sits in `cancellation_initiated` (which we map to
    // `active`) until NPCI confirms.
  }

  /**
   * Create the Razorpay customer for this payer and return its id.
   *
   * `name` is MANDATORY at Razorpay and `PayerContact` carries none, so we send
   * the email's local part (our own `user-<id>@no-reply…` handle in the common
   * case). If Razorpay's risk checks ever want a real name, `PayerContact` has
   * to grow one — inventing a placeholder here is exactly the
   * shared-fictional-customer mistake the Cashfree adapter's docblock records.
   *
   * `fail_existing: "0"` is the RECOVERY path, not the main one. The main one is
   * the caller's: it skips this method entirely when `User.razorpayCustomerId`
   * is set. This flag covers the gap where Razorpay has a customer and we do
   * not — every user stranded by the registrations that died at the old
   * `/payments/create/upi` call is in exactly that state, their customer created
   * and never recorded. The default ("1") answers those with 400
   * `BAD_REQUEST_ERROR` / "Customer already exists for the merchant", and since
   * Razorpay has no lookup-by-phone endpoint there would be no way back.
   *
   * A STRING, like `recurring` — Razorpay takes "0"/"1" here, not a boolean.
   */
  private async createCustomer(input: CreateMandateInput): Promise<string> {
    const customer = await this.client.post(
      RAZORPAY_PATHS.customers,
      {
        fail_existing: "0",
        name: customerName(input),
        email: payerEmail(input),
        // The BARE 10-digit national number — Razorpay rejects a `+91` prefix.
        // Absent rather than faked when we do not have one: if the gateway
        // objects we want that error, not a mandate attached to a number nobody
        // owns.
        ...(input.payer?.phone ? { contact: input.payer.phone } : {}),
        // Tagged as ours, like every other entity we create on this account —
        // four applications share it, and a customer with no tag is
        // unattributable in the Razorpay dashboard.
        //
        // The APPLICATION TAG ONLY, deliberately not `ourNotes`. A customer is
        // per-PERSON and is reused by every later registration the same payer
        // makes, so stamping the reference of whichever mandate happened to
        // create it would name a reference the customer outlives — wrong the
        // moment they register again, and misleading in exactly the place
        // someone would go looking.
        notes: { ...APPLICATION_NOTE },
      },
      { operation: "create_customer", referenceId: input.referenceId }
    );

    const customerId = readString(customer, "id");
    if (!customerId) {
      throw new AppError(
        "Razorpay create-customer returned no customer id",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }
    return customerId;
  }

  /**
   * What this mandate's registration order was authorized with — the payment id
   * (`pay_xxx`), the token it minted (`token_xxx`) and the customer it belongs
   * to, read off ONE payment entity so they cannot disagree.
   *
   * The order is the right key because there is exactly one per registration
   * attempt, where a customer is one per person and outlives every attempt. All
   * three fields are present on the captured UPI authorization — verified
   * against the live API, not assumed.
   *
   * A READ, on the retrying `get`, and BEST-EFFORT: a blip reaching this must
   * not strand an activation, so a failure reports `null` and the next poll asks
   * again.
   *
   * ⚠️ `token_id` is absent when Razorpay has not enabled `save_vpa` on the
   * account — a support request, not a setting (rollout P1). The caller logs the
   * payment id alongside the miss, so "authorized but no token" is visible as
   * the account misconfiguration it is rather than looking like an unapproved
   * payer.
   *
   * `latestPayment` prefers a settled attempt over position, so an order that
   * carries a failed try followed by the good one answers with the good one —
   * the same rule `getDebitStatus` relies on.
   *
   * The ids come back ONLY from a settled attempt (`settled`); an unsettled one
   * reports its id and status for the log and nothing else. See the body.
   */
  private async findAuthorization(
    registrationRef: string | null | undefined,
    referenceId: string
  ): Promise<{
    paymentId: string | null;
    paymentStatus: string | null;
    settled: boolean;
    tokenId: string | null;
    customerId: string | null;
    /** Razorpay's `error_code` / reason on a `failed` attempt; null otherwise. */
    failureCode: string | null;
    failureReason: string | null;
  } | null> {
    // No stored order — a row registered before the checkout block was kept.
    // Nothing to look up, and that is not an error worth failing a poll over.
    if (!registrationRef) return null;

    try {
      const response = await this.client.get(
        RAZORPAY_PATHS.orderPayments(registrationRef),
        {},
        { operation: "get_registration_payment", referenceId }
      );
      const payment = latestPayment(response);
      const paymentStatus = readString(payment, "status");
      // ONLY a SETTLED authorization may name this mandate's token. Razorpay
      // stamps a `token_id` on an attempt that is merely `created` and on one
      // that has `failed`, and neither token can ever confirm — but adopting one
      // persists it, and `getMandateStatus` prefers the stored halves from then
      // on, so the mandate polls a dead token forever and never leaves
      // `pending`. That is TAM-156: a payer whose first UPI try failed retried
      // in the same checkout, the poll that landed between the two attempts took
      // the failed one's token, and the approval 23s later could not dislodge it.
      const settled = paymentStatus === "captured" || paymentStatus === "authorized";
      const failed = paymentStatus === "failed";
      return {
        paymentId: readString(payment, "id"),
        paymentStatus,
        settled,
        tokenId: settled ? readString(payment, "token_id") : null,
        customerId: settled ? readString(payment, "customer_id") : null,
        failureCode: failed ? readString(payment, "error_code") : null,
        failureReason: failed
          ? pick(payment, ["error_reason", "error_description"])
          : null,
      };
    } catch (err) {
      log.warn(
        {
          event: "razorpay_authorization_payment_lookup_failed",
          reference_id: referenceId,
          razorpay_order_id: registrationRef,
          reason: err instanceof Error ? err.message : "unknown",
        },
        "could not read the registration order's payment — deposit stays unsettled this tick"
      );
      return null;
    }
  }

  /**
   * Find a notification's order by the receipt we minted for it.
   *
   * The recovery read for "my `POST /orders` timed out — did it land?". The
   * receipt is derived from the notification's own reference
   * (`notificationReceipt`), so it is recomputable from the one value this
   * input always carries.
   *
   * NEVER throws `NoSuchDebitError`, including on an empty list. See the caller
   * for why: an empty result is indistinguishable from index lag, and treating
   * it as definitive would authorise re-claiming a cycle whose order exists —
   * a second charge.
   */
  private async findNotificationByReceipt(
    notificationRef: string
  ): Promise<PreDebitStatusResult> {
    const receipt = notificationReceipt(notificationRef);
    const pending: PreDebitStatusResult = {
      status: "sent",
      presentationSequenceId: null,
      failureCode: null,
      failureMessage: null,
      // No failure to classify on this path (TAM-186).
      failureSubCode: null,
    };

    let response: Record<string, unknown>;
    try {
      response = await this.client.get(
        RAZORPAY_PATHS.orders,
        { receipt },
        { operation: "find_pdn_by_receipt", referenceId: notificationRef }
      );
    } catch (err) {
      log.warn(
        { err, event: "razorpay_pdn_receipt_lookup_failed", receipt },
        "could not look the notification's order up by receipt — reporting sent"
      );
      return pending;
    }

    const items = Array.isArray(response.items) ? response.items : [];
    const first = items.find(isJsonObject);
    const orderId = first ? readString(first, "id") : null;
    if (!orderId) {
      log.warn(
        { event: "razorpay_pdn_order_not_found", receipt },
        "no order under this receipt — reporting sent rather than authorising a re-claim"
      );
      return pending;
    }

    return {
      // Found it: the order exists, so the cycle is presentable after all.
      status: "accepted",
      presentationSequenceId: orderId,
      failureCode: null,
      failureMessage: null,
      // No failure to classify on this path (TAM-186).
      failureSubCode: null,
      raw: response,
    };
  }

  /**
   * The payer's contact details, as Razorpay already holds them.
   *
   * Best-effort: a failure here logs and returns nulls rather than aborting a
   * debit that is otherwise due and correctly notified.
   */
  private async fetchCustomerContact(
    customerId: string,
    referenceId: string
  ): Promise<{ email: string | null; phone: string | null }> {
    try {
      const customer = await this.client.get(
        RAZORPAY_PATHS.customer(customerId),
        {},
        { operation: "get_customer", referenceId }
      );
      return {
        email: readString(customer, "email"),
        phone: readString(customer, "contact"),
      };
    } catch (err) {
      log.warn(
        { event: "razorpay_customer_read_failed", reference_id: referenceId, err },
        "could not read the Razorpay customer — presenting the debit with fallback contact details"
      );
      return { email: null, phone: null };
    }
  }
}

/**
 * Token `recurring_details.status` → our state.
 *
 * Unknown or absent maps to `pending`, NEVER `active`: entitlement is granted
 * off this value, so guessing optimistically on a status we do not understand
 * gives away paid content unrecoverably. `pending` costs a poll.
 */
export function mapTokenState(raw: string | null): MandateState {
  if (!raw) return "pending";
  const mapped = RAZORPAY_STATE_BY_TOKEN_STATUS[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  log.warn(
    { event: "razorpay_unknown_token_status", token_status: raw },
    "unrecognised Razorpay token status — treating as pending, not active"
  );
  return "pending";
}

/**
 * Payment `status` → our debit outcome.
 *
 * **`created` is PENDING.** HDFC and Axis settle UPI Autopay from a batch file,
 * so a healthy debit can sit in `created` for hours; reading it as a failure
 * would dun a paying user and free the cycle to be charged again.
 *
 * Unknown → `pending`, which leaves the row for the reconciliation sweep rather
 * than inventing an outcome for money we are not sure about.
 */
export function mapDebitOutcome(raw: string | null): PresentDebitResult["outcome"] {
  if (!raw) return "pending";
  const mapped = RAZORPAY_OUTCOME_BY_PAYMENT_STATUS[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  log.warn(
    { event: "razorpay_unknown_payment_status", payment_status: raw },
    "unrecognised Razorpay payment status — treating as pending"
  );
  return "pending";
}

/**
 * Order `notification.status` → our `PdnStatus`.
 *
 * Absent means the order exists but is not echoing a notification block, which
 * is not evidence that the notification failed — so with an order id in hand it
 * reports `accepted` (the order IS the notification). An unrecognised token
 * reports `sent`: non-terminal, so nothing is lost, and `PdnRepository.rearm`
 * refuses to act on a row that already holds a sequence id anyway.
 *
 * Deliberately NOT the Decentro adapter's `failed` default. There, a re-arm is
 * cheap; here it means minting a whole new order, and the deterministic receipt
 * would make that a 400 rather than a silent duplicate.
 */
export function mapPdnStatus(
  raw: string | null,
  orderId: string | null
): PdnStatus {
  if (!raw) return orderId ? "accepted" : "sent";
  const mapped = RAZORPAY_PDN_STATUS_BY_NOTIFICATION_STATUS[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  log.warn(
    { event: "razorpay_unknown_notification_status", notification_status: raw },
    "unrecognised Razorpay notification status — treating as sent"
  );
  return "sent";
}

/**
 * Split a stored `providerMandateId` into its two halves.
 *
 * Accepts the composite `cust_xxx:token_xxx` this adapter writes, and a bare
 * `token_xxx` for anything written without one. Never throws — the callers that
 * genuinely cannot proceed decide that for themselves, by name.
 */
export function parseMandateRef(value: string | null): {
  customerId: string | null;
  tokenId: string | null;
} {
  if (!value) return { customerId: null, tokenId: null };
  const at = value.indexOf(":");
  if (at < 0) return { customerId: null, tokenId: value };
  const customerId = value.slice(0, at);
  const tokenId = value.slice(at + 1);
  return {
    customerId: customerId.length > 0 ? customerId : null,
    tokenId: tokenId.length > 0 ? tokenId : null,
  };
}

/** The inverse of {@link parseMandateRef}. One function, so the two cannot drift. */
export function composeMandateRef(
  customerId: string,
  tokenId: string | null
): string {
  return `${customerId}:${tokenId ?? ""}`;
}

/** Both halves or a named failure — for the two calls that cannot do without. */
function requireMandateRef(
  value: string | null,
  operation: string
): { customerId: string; tokenId: string } {
  const { customerId, tokenId } = parseMandateRef(value);
  if (!customerId || !tokenId) {
    throw new AppError(
      `Razorpay ${operation} needs both a customer id and a token id (got "${value ?? "null"}")`,
      502,
      "PROVIDER_RESPONSE_INVALID"
    );
  }
  return { customerId, tokenId };
}

/**
 * Did Razorpay reject this because the receipt has been used before?
 *
 * TODO(razorpay): the exact error shape is unconfirmed, so this matches on the
 * description as well as the machine keys. Getting it WRONG in this direction is
 * safe: a false positive raises `DuplicateReferenceError`, which makes the
 * service RECONCILE by reading status — the conservative branch — rather than
 * arm a second notification.
 */
function isDuplicateReceipt(err: unknown): boolean {
  if (!(err instanceof RazorpayApiError)) return false;
  if (err.status !== 400 && err.status !== 409) return false;
  const haystack = `${err.reason ?? ""} ${err.description ?? ""}`.toLowerCase();
  return (
    haystack.includes("receipt") &&
    /unique|duplicate|already/.test(haystack)
  );
}

/**
 * Did Razorpay definitively answer "there is no such resource"?
 *
 * The bar is deliberately high — this is what lets a claimed cycle be
 * re-claimed, and a wrong `true` is a double charge. It requires BOTH a
 * deterministic 400/404 AND a not-found phrase; a transport error is not a
 * `RazorpayApiError` at all and can never reach here.
 */
function isNoSuchResource(err: unknown): boolean {
  if (!(err instanceof RazorpayApiError)) return false;
  if (err.status !== 400 && err.status !== 404) return false;
  const haystack = `${err.reason ?? ""} ${err.description ?? ""}`.toLowerCase();
  return /does not exist|no such|not found|invalid id/.test(haystack);
}

/**
 * Razorpay's cancel rejections → an `AppError` that names what happened.
 *
 * There is no domain error for these: `revokeMandate` returns void and the three
 * outcomes are operationally different, not semantically different money states.
 * Anything unrecognised passes through untouched, so a failure stays a failure
 * rather than being quietly reclassified.
 */
function translateCancelError(err: unknown): unknown {
  if (!(err instanceof RazorpayApiError)) return err;
  const key = `${err.reason ?? ""} ${err.code ?? ""}`.toLowerCase();
  if (key.includes(RAZORPAY_ERROR_KEYS.concurrentRequest)) {
    return new AppError(
      "Razorpay already has a cancellation in flight for this mandate; retry in at least 60 seconds",
      409,
      "PROVIDER_BUSY"
    );
  }
  if (key.includes(RAZORPAY_ERROR_KEYS.invalidMandateState)) {
    return new AppError(
      "this Razorpay mandate is not in a cancellable state",
      409,
      "MANDATE_NOT_CANCELLABLE"
    );
  }
  if (key.includes(RAZORPAY_ERROR_KEYS.tokenNotRecurring)) {
    return new AppError(
      "this Razorpay token is not a recurring mandate, so there is nothing to cancel",
      409,
      "MANDATE_NOT_RECURRING"
    );
  }
  return err;
}

/**
 * The payer's VPA and name off a TOKEN entity.
 *
 * On the token entity `vpa` is an OBJECT — `{username, handle, name}` — while on
 * a PAYMENT entity the same field is a flat string. Both shapes are handled
 * because both reach this adapter, and assuming either one alone silently yields
 * a null handle for half the responses.
 */
export function readTokenVpa(entity: Record<string, unknown>): {
  vpa: string | null;
  name: string | null;
} {
  const raw = entity.vpa;
  if (typeof raw === "string" && raw.length > 0) {
    return { vpa: raw, name: pick(entity, ["customer_name", "name"]) };
  }
  if (isJsonObject(raw)) {
    const username = readString(raw, "username");
    const handle = readString(raw, "handle");
    return {
      vpa: username && handle ? `${username}@${handle}` : null,
      name: readString(raw, "name") ?? pick(entity, ["customer_name"]),
    };
  }
  return { vpa: null, name: pick(entity, ["customer_name", "name"]) };
}

/** The most informative payment in an order's payment collection. */
function latestPayment(response: Record<string, unknown>): Record<string, unknown> {
  const items = response.items;
  if (!Array.isArray(items)) return response;
  const payments = items.filter(isJsonObject);
  if (payments.length === 0) return {};
  // A settled outcome outranks position: an order can carry a failed attempt
  // followed by a good one, and the good one is the answer.
  const settled = payments.find((p) => {
    const status = readString(p, "status");
    return status === "captured" || status === "authorized";
  });
  if (settled) return settled;

  // Nothing settled — fall back to the NEWEST attempt. Razorpay's collection
  // APIs return items newest-first, so that is `[0]`, not the last element.
  // Taking the last one reads the OLDEST attempt: on an order carrying a failed
  // try followed by one still `created`, that reports `failed` and duns a user
  // whose live attempt has not finished.
  //
  // A `failed` attempt is skipped outright while any non-failed one is present,
  // because `created_at` CANNOT break that tie: a payer who retries inside the
  // same checkout gets both attempts stamped with the SAME second, so the sort
  // below is a no-op and raw array order decides — which put the failed try
  // first and made it this order's answer (TAM-156).
  const live = payments.filter((p) => readString(p, "status") !== "failed");
  const candidates = live.length > 0 ? live : payments;

  // Ordering is asserted rather than trusted — if Razorpay ever returns these
  // ascending, `created_at` decides and the index is irrelevant.
  const byNewest = [...candidates].sort((a, b) => {
    const at = typeof a.created_at === "number" ? a.created_at : 0;
    const bt = typeof b.created_at === "number" ? b.created_at : 0;
    return bt - at;
  });
  return byNewest[0] ?? {};
}

/** A nested object at `key`, or `{}` so readers stay null-safe. */
function childObject(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const inner = obj[key];
  return isJsonObject(inner) ? inner : {};
}

/** First non-empty string among `keys`, or null. */
function pick(
  obj: Record<string, unknown>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const found = readString(obj, key);
    if (found) return found;
  }
  return null;
}

/** `Date` → unix seconds, the only time format Razorpay accepts. */
/**
 * IST midnight of a cycle date, as an absolute instant.
 *
 * `cycleDate` is a `@db.Date` and reads back as UTC midnight, which is 05:30
 * IST — five and a half hours AFTER the first NPCI execution window opens
 * (`canPresentDebit` allows 00:00–10:00 IST). Sending that raw as
 * `payment_after` tells Razorpay "do not debit before 05:30", so every
 * presentation in the first eleven ticks of the cycle day asks it to debit
 * before the floor we ourselves set.
 *
 * Subtracting the offset lines `payment_after` up exactly with the moment our
 * own presentation becomes legal.
 */
function istStartOfDay(cycleDate: Date): Date {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
  return new Date(cycleDate.getTime() - IST_OFFSET_MS);
}

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** `YYYYMMDD` — eight ASCII characters of the receipt budget. */
function compactDate(date: Date): string {
  return isoDate(date).replace(/-/g, "");
}

/** `YYYY-MM-DD` of a `@db.Date` value (UTC midnight = the IST calendar day). */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The `notes` map on every order and payment we create.
 *
 * ONE builder rather than three literals, so the reference id cannot be left
 * out of any of them. It is the only thing Razorpay echoes on its webhooks
 * that resolves back to a mandate (see `RAZORPAY_NOTE_KEY`). Razorpay was
 * observed to MERGE an order's notes into its payment's (test mode, 5 Sep
 * 2026), but the payment map still carries the reference itself so that
 * resolution never leans on the merge — the one behaviour here we did not
 * design and cannot test in CI.
 *
 * `cycleDate` is per cycle (orders and payments), `attemptNo` per presentation
 * (payments only). Both are for the dashboard and reconciliation and are never
 * read back. Everything is sent as a string: Razorpay stores notes as text,
 * and a number would only come back as one.
 */
const APPLICATION_NOTE: Record<string, string> = {
  [RAZORPAY_NOTE_KEY.applicationId]: RAZORPAY_APPLICATION_ID,
};

function ourNotes(input: {
  referenceId: string;
  cycleDate?: Date;
  attemptNo?: number;
}): Record<string, string> {
  return {
    ...APPLICATION_NOTE,
    [RAZORPAY_NOTE_KEY.referenceId]: input.referenceId,
    ...(input.cycleDate
      ? { [RAZORPAY_NOTE_KEY.cycleDate]: isoDate(input.cycleDate) }
      : {}),
    ...(input.attemptNo !== undefined
      ? { [RAZORPAY_NOTE_KEY.attemptNo]: String(input.attemptNo) }
      : {}),
  };
}

/** 16 hex characters (64 bits) of SHA-256. Deterministic, ASCII, bounded. */
function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/** The registration order's receipt. Deterministic per mandate, 23 characters. */
function registrationReceipt(referenceId: string): string {
  return capReceipt(`pj_reg_${shortHash(referenceId)}`);
}

/**
 * A cycle's notification order receipt, keyed on the NOTIFICATION's reference
 * rather than on the cycle.
 *
 * Razorpay treats `receipt` as an idempotency key, and that has to line up with
 * WHICH THING is being retried. A per-cycle key is right for "did my call
 * land?" — a transport retry of the SAME attempt must be refused — but wrong
 * for a genuine re-notification, which is a new order for a cycle whose
 * previous order a failed debit has already spent.
 *
 * `pdn_notifications.reference_id` has exactly the lifetime needed: stable for
 * one dispatch attempt, re-minted by `rearm`. Deriving
 * the receipt from it makes a transport retry idempotent AND a re-arm fresh,
 * which one value keyed on the cycle cannot be at once.
 *
 * It keyed on the cycle before, and the consequence was not subtle: after a
 * failed Razorpay debit the cycle re-dispatched with the spent receipt, was
 * refused as a duplicate, and repeated that every thirty minutes forever —
 * never retrying the debit, never failing loudly, until the grace period lapsed
 * the subscriber.
 *
 * Also what makes `getPreDebitStatus` able to find an order when it holds no
 * order id: the receipt is recomputable from the reference it is given.
 */
function notificationReceipt(notificationRef: string): string {
  return capReceipt(`pj_pdn_${shortHash(notificationRef)}`);
}

/**
 * The 40-character ASCII cap, enforced rather than assumed.
 *
 * Every producer above is already well under it; this is the belt on the braces,
 * so a future prefix change fails a length assertion in the test suite instead of
 * a live order.
 */
function capReceipt(value: string): string {
  return value.slice(0, RAZORPAY_MAX_RECEIPT_CHARS);
}

/**
 * Razorpay's `description` rejects special characters and caps at 50. Reduced to
 * letters, digits and single spaces so a purpose message written for humans
 * cannot fail an order.
 */
function sanitizeDescription(message: string): string {
  return message
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RAZORPAY_MAX_DESCRIPTION_CHARS);
}

/** Razorpay requires a customer `name` and `PayerContact` carries none. */
function customerName(input: CreateMandateInput): string {
  const email = payerEmail(input);
  const local = email.slice(0, email.indexOf("@"));
  return local.length > 0 ? local : input.referenceId;
}

function payerEmail(input: CreateMandateInput): string {
  return input.payer?.email ?? noReplyEmail(input.referenceId);
}

function noReplyEmail(referenceId: string): string {
  return `${referenceId}@no-reply.prabhuji.app`;
}
