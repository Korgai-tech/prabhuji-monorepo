import { classifyFailure } from "@api/core/payment/failure-sub-code";
import { loadEnv } from "@api/shared/config";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { MandateState } from "@api/core/payment/types";
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
import { CashfreeClient, isJsonObject, readString } from "./cashfree.client.js";
import { maskPayerName, maskVpa } from "./pii-mask.js";
import {
  CASHFREE_EXECUTION_FAILURE_STATUSES,
  CASHFREE_EXECUTION_ID_KEYS,
  CASHFREE_EXECUTION_STATUS_KEYS,
  CASHFREE_EXECUTION_SUCCESS_STATUSES,
  CASHFREE_FAILURE_STATUSES,
  CASHFREE_NOTIFICATION_ID_KEYS,
  CASHFREE_PATHS,
  CASHFREE_PAYER_NAME_KEYS,
  CASHFREE_PAYER_VPA_KEYS,
  CASHFREE_PAYMENT_ID_KEYS,
  CASHFREE_PAYMENT_STATUS_KEYS,
  CASHFREE_STATE_BY_SUBSCRIPTION_STATUS,
  CASHFREE_SUBSCRIPTION_STATUS_KEYS,
  CASHFREE_SUCCESS_STATUSES,
} from "./cashfree.constants.js";

const log = createModuleLogger("payment:cashfree-provider");

/**
 * Cashfree UPI Autopay adapter — a `MandateProvider` sibling of the Decentro
 * one, selected at the composition root by `PAYMENT_PROVIDER`. Its entire job is
 * TRANSLATION between our domain types (paise, `Date`s, `MandateState`) and
 * Cashfree's PG Subscriptions wire format (rupees, ISO strings, subscription
 * statuses). No business rule lives here.
 *
 * On-demand model: we drive each cycle from `BillingCycleService`. Cashfree
 * couples the pre-debit notification to scheduling a charge, so the two-call
 * interface maps as:
 *   notifyPreDebit → create a subscription payment scheduled for the cycle date
 *                    (this triggers Cashfree's mandatory ~24h notification and
 *                    is the single money-scheduling mutation — never retried);
 *   presentDebit   → READ that scheduled payment's status (Cashfree executes it
 *                    itself at the scheduled time; settlement arrives by webhook
 *                    or the reconciliation sweep).
 *
 * The `(mandateId, cycleDate)` claim upstream still guarantees notify runs once
 * per cycle, so exactly one charge is ever scheduled.
 *
 * TODO(cashfree): confirm every path/field/status against the pinned
 * `CASHFREE_API_VERSION` before the first live debit (see cashfree.constants.ts).
 */
export class CashfreeMandateProvider implements MandateProvider {
  readonly name = "cashfree";

  /**
   * Under the controlled flow `notify-mandate` moves NO money — it is a genuine
   * pre-debit notification — and `execute-mandate` is the irreversible call.
   * Same shape as Decentro.
   *
   * This was `notification` while the adapter used the single-call
   * `/subscriptions/pay` CHARGE, where the notify step really did schedule the
   * money. It drives recovery: a notify that failed in transport now cannot have
   * charged anyone, so its cycle is safely re-claimable once the gateway
   * confirms it never arrived.
   */
  readonly chargePhase = "submission" as const;

  /** The plan's deposit is debited at authorization (`payment_type: "AUTH"`). */
  readonly supportsInitialDeposit = true;

  /**
   * The 24h floor is RBI's. The 48h ceiling is OURS, not a documented Cashfree
   * limit: a narrower band leaves less time for a plan change or cancellation to
   * land after the charge is already registered.
   */
  readonly pdnLeadHours = { min: 24, max: 48 } as const;

  /**
   * `null`, and for a weaker reason than Decentro's — this gateway does not
   * report a debit instant either, so this is "no figure declared", not "the
   * vendor supplies one".
   *
   * Safe today only because of the lead: with the 24h floor and the trials this
   * gateway ever registered, the notification always preceded the cycle date by
   * a whole calendar day. It stops being safe the moment a trial short enough
   * to notify and present inside one day is sold here. Cashfree is out of
   * service (prod holds no rows for it — see PAYMENT-FLOW.md), so the figure is
   * left undeclared rather than guessed. FILL THIS IN BEFORE REVIVING THIS
   * GATEWAY on anything shorter than a two-day trial.
   */
  readonly presentationTatHours = null;


  private readonly client: CashfreeClient;

  /** Client built here, injectable for tests (as the Decentro adapter). */
  constructor(client?: CashfreeClient) {
    this.client = client ?? new CashfreeClient();
  }

  /**
   * Cashfree accepts a caller-supplied `payment_id` on a subscription payment,
   * and it must be deterministic: after a timeout we ask about THIS key to learn
   * whether the charge was scheduled. Built here, next to the call that sends
   * it, so the ledger's stored key and the wire key cannot drift.
   */
  debitRequestId(referenceId: string, cycleDate: Date): string {
    return `pj_pay_${referenceId}_${toWireDate(cycleDate)}`;
  }

  async createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
    // The IMMEDIATE charge at authorization, resolved by MandateService from the
    // plan — during a trial this is the small deposit, otherwise the full price.
    // Charging `amountPaise` unconditionally would debit the full amount on day
    // 0 and defeat the trial; the recurring price is taken later, by our own
    // scheduler, through the controlled flow.
    const authorizationRupees = toRupees(input.initialDepositPaise);

    // Cashfree's create-subscription REQUIRES customer_details. These used to be
    // hardcoded placeholders (`9999999999` / one shared address), which meant
    // every mandate we ever registered described the same fictional person —
    // useless for reconciliation, for Cashfree's own risk checks, and for any
    // dispute that starts from a phone number. `MandateService.resolvePayer`
    // now supplies the real payer. Intent (upi) authorization is requested.
    //
    // A missing phone is sent as an ABSENT field rather than a fake one: if the
    // gateway rejects the subscription we want that error, not a mandate
    // silently attached to a number nobody owns.
    const payerPhone = input.payer?.phone ?? null;
    if (!payerPhone) {
      log.warn(
        { event: "cashfree_payer_phone_missing", reference_id: input.referenceId },
        "registering a mandate with no payer phone — Cashfree may reject it"
      );
    }
    const body: Record<string, unknown> = {
      subscription_id: input.referenceId,
      customer_details: {
        customer_id: input.referenceId,
        customer_email: input.payer?.email ?? `${input.referenceId}@no-reply.prabhuji.app`,
        ...(payerPhone ? { customer_phone: payerPhone } : {}),
      },
      plan_details: {
        plan_name: input.mandateName,
        // ON_DEMAND, not PERIODIC. Under PERIODIC, Cashfree charges on its own
        // schedule — and `BillingCycleService` charges too, which is two
        // schedulers billing the same cycle. ON_DEMAND makes us the sole driver,
        // which is what this codebase was built for and what the controlled
        // flow below requires.
        plan_type: "ON_DEMAND",
        plan_currency: input.currency,
        plan_amount: toRupees(input.amountPaise),
        plan_max_amount: toRupees(input.amountPaise),
        plan_interval_type: cashfreeInterval(input.frequency),
        plan_intervals: 1,
      },
      authorization_details: {
        authorization_amount: authorizationRupees,
        payment_methods: ["upi"],
      },
      // NO `subscription_first_charge_time`. Cashfree rejects it outright on an
      // ON_DEMAND plan — "First charge date can only be set for PERIODIC plans"
      // — because it is the field that tells Cashfree when to charge on its own
      // schedule, and an ON_DEMAND subscription has no schedule of its own.
      //
      // Sending it was the last remnant of the PERIODIC model. Nothing is lost:
      // the first debit date lives on OUR row as `mandates.start_date` /
      // `next_debit_date`, which is what `BillingCycleService` reads and what
      // `onStateChanged` uses to compute `trialEndsAt`. Cashfree never needed a
      // copy — under ON_DEMAND it is not allowed one.
      subscription_expiry_time: toWireDateTime(input.endDate),
      subscription_note: input.purposeMessage,
      // Where Cashfree's hosted authorization page redirects the browser
      // after the user completes / cancels the UPI mandate authorization.
      // With `channel: "link"` below the user goes through a Cashfree-hosted
      // page before the UPI app launches — this is the URL that page then
      // redirects to on return. Default resolves to the Prabhuji paywall
      // App Link so Android intercepts the browser open and lands the user
      // back inside the app; the paywall screen's lifecycle handler already
      // polls the mandate status on resume, so no other client wiring is
      // needed for entitlement to update after a successful payment.
      subscription_meta: {
        return_url: loadEnv().CASHFREE_RETURN_URL,
      },
    };

    // Step 1: create the subscription → a session id + Cashfree's ids/status.
    const created = mergedFields(
      await this.client.post(CASHFREE_PATHS.subscriptions, body, {
        operation: "create_mandate", referenceId: input.referenceId,
      })
    );
    const sessionId = pick(created, ["subscription_session_id"]);
    if (!sessionId) {
      throw new AppError(
        "Cashfree create-subscription returned no session id",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    // Step 2: initiate the UPI AUTH payment on that session — THIS is what mints
    // the authorization link. Cashfree's create does NOT return a `upi://`
    // intent; `channel: "link"` yields per-UPI-app authorization deep links
    // (sandbox: a hosted simulator page). We hand the client the DEFAULT one.
    const pay = mergedFields(
      await this.client.post(
        CASHFREE_PATHS.subscriptionsPay,
        {
          subscription_id: input.referenceId,
          subscription_session_id: sessionId,
          payment_id: `pj_auth_${input.referenceId}`,
          payment_type: "AUTH",
          payment_method: { upi: { channel: "link" } },
        },
        { operation: "authorize_mandate", referenceId: input.referenceId }
      )
    );

    const authUrl = extractAuthLink(pay);
    if (!authUrl) {
      throw new AppError(
        "Cashfree subscription-pay returned no authorization link",
        502,
        "PROVIDER_RESPONSE_INVALID"
      );
    }

    return {
      providerMandateId: pick(created, ["cf_subscription_id", "subscription_id"]),
      providerTxnId: pick(pay, CASHFREE_PAYMENT_ID_KEYS),
      authUrl,
      // Computed, not read back: the client needs an absolute instant to expire
      // the CTA on.
      authExpiresAt: new Date(Date.now() + input.expiryMinutes * 60_000),
      state: mapSubscriptionState(pick(created, CASHFREE_SUBSCRIPTION_STATUS_KEYS)),
    };
  }

  async getMandateStatus(input: {
    referenceId: string;
    providerMandateId: string | null;
  }): Promise<MandateStatusResult> {
    // The Cashfree resource path keys on the merchant `subscription_id`, which
    // we set to our `referenceId` at creation — so `referenceId` IS the path id.
    const response = mergedFields(
      await this.client.get(
        CASHFREE_PATHS.subscription(input.referenceId),
        {},
        { operation: "get_mandate_status", referenceId: input.referenceId }
      )
    );

    return {
      state: mapSubscriptionState(pick(response, CASHFREE_SUBSCRIPTION_STATUS_KEYS)),
      stateReason: pick(response, ["status_reason", "message", "reason"]),
      // Cashfree's own id (cf_subscription_id) — consistent with createMandate,
      // so `provider_mandate_id` reconciles against the Cashfree dashboard rather
      // than duplicating our reference id.
      providerMandateId: pick(response, ["cf_subscription_id", "subscription_id"]),
      providerTxnId: pick(response, CASHFREE_PAYMENT_ID_KEYS),
      npciTransactionId: pick(response, ["npci_txn_id", "npci_transaction_id"]),
      // MASKED HERE, AT THE BOUNDARY — the full VPA/name never leave this frame.
      payerHandleMasked: maskVpa(pick(response, CASHFREE_PAYER_VPA_KEYS)),
      payerNameMasked: maskPayerName(pick(response, CASHFREE_PAYER_NAME_KEYS)),
      nextDebitDate: parseWireDate(
        pick(response, ["next_payment_date", "next_debit_date", "nextScheduledTime"])
      ),
    };
  }

  async notifyPreDebit(input: PreDebitInput): Promise<PreDebitResult> {
    // STEP A of the controlled flow: tell the payer what is about to be taken.
    // NPCI requires this notice, and a debit presented without one is refused —
    // so a failure here loses the cycle outright. It moves no money.
    //
    // Three ids, and they mean different things:
    //   payment_id      the BASE payment from mandate setup, constant for the
    //                   subscription's whole life. Derivable, so it needs no
    //                   column of its own.
    //   notification_id ours, per notification attempt. Deterministic from
    //                   (reference, cycle) and stored as `gateway_request_id`
    //                   BEFORE dispatch, so a timeout still leaves the key the
    //                   recovery sweep asks about.
    //   cf_notification_id  theirs, returned.
    const response = mergedFields(
      await this.client.post(
        CASHFREE_PATHS.controlledNotify,
        {
          subscription_id: input.referenceId,
          payment_id: basePaymentId(input.referenceId),
          notification_id: this.debitRequestId(
            input.referenceId,
            input.cycleDate
          ),
          // The amount is FROZEN here. Cashfree: "the debit amount cannot change
          // after the PDN is initiated" — execute with anything else and the
          // issuing bank declines.
          payment_amount: toRupees(input.amountPaise),
          payment_remarks: "recurring debit",
        },
        { operation: "send_pdn", referenceId: input.referenceId }
      )
    );

    // The presentation call needs the base payment id, not this handle — but the
    // ledger keeps it as the notification's provider-side receipt, and it is
    // what proves to a later reader that the PDN really landed.
    const notificationId =
      pick(response, CASHFREE_NOTIFICATION_ID_KEYS) ??
      this.debitRequestId(input.referenceId, input.cycleDate);

    return {
      presentationSequenceId: notificationId,
      // Cashfree's controlled notify is SYNCHRONOUS: either the response carried a
      // notification id (or we fall back to the deterministic key we sent) or the
      // call threw. There is no pending state to model here, so the notification
      // is addressable the moment this returns.
      status: "accepted",
      providerTxnId: pick(response, CASHFREE_PAYMENT_ID_KEYS),
    };
  }

  /**
   * No-op status read: Cashfree's notify is synchronous, so there is nothing to
   * poll for.
   *
   * Echoing the sequence id back is the honest answer rather than a stub — the
   * caller asked "is this notification addressable, and what is its id?", and for
   * this gateway both were settled at notify time. Reporting `pending` instead
   * would make the sweep poll a gateway that will never have more to say.
   *
   * It deliberately does NOT throw `NoSuchDebitError`: Cashfree's 404 body for an
   * unknown subscription payment is still unconfirmed, and a wrong throw here
   * supersedes a live cycle into a second charge.
   */
  getPreDebitStatus(input: PreDebitStatusInput): Promise<PreDebitStatusResult> {
    return Promise.resolve({
      status: input.presentationSequenceId ? "accepted" : "sent",
      presentationSequenceId: input.presentationSequenceId,
      failureCode: null,
      failureMessage: null,
      // No failure to classify on this path (TAM-186).
      failureSubCode: null,
    });
  }

  async presentDebit(input: PresentDebitInput): Promise<PresentDebitResult> {
    // STEP B: take the money. IRREVERSIBLE, and never retried — the
    // `(mandate_id, cycle_date)` claim upstream is what guarantees it runs once
    // per cycle. `execution_id` is ours, derived from the same per-cycle key as
    // the notification so the pair is traceable to one billing day.
    const response = mergedFields(
      await this.client.post(
        CASHFREE_PATHS.controlledExecute,
        {
          payment_id: basePaymentId(input.referenceId),
          execution_id: executionId(
            this.debitRequestId(input.referenceId, input.cycleDate)
          ),
        },
        { operation: "present_debit", referenceId: input.referenceId }
      )
    );

    return {
      // The EXECUTION's own status, not the parent payment's — the parent stays
      // whatever the authorization left it as, so reading it here would report
      // the mandate's setup result on every cycle forever.
      outcome: mapExecutionOutcome(
        pick(response, CASHFREE_EXECUTION_STATUS_KEYS) ??
          pick(response, CASHFREE_PAYMENT_STATUS_KEYS)
      ),
      providerTxnId:
        pick(response, CASHFREE_EXECUTION_ID_KEYS) ??
        pick(response, CASHFREE_PAYMENT_ID_KEYS),
      bankReferenceNumber: pick(response, [
        "bank_reference",
        "bank_reference_number",
        "rrn",
      ]),
      npciTransactionId: pick(response, ["npci_txn_id", "npci_transaction_id"]),
      failureCode: pick(response, ["failure_code", "error_code"]),
      failureMessage: pick(response, ["failure_reason", "error_description"]),
      // Classified from the provider's MACHINE reason fields, never from
      // the message above — that is user-facing copy (TAM-186).
      failureSubCode: classifyFailure([
        // `failure_reason` is CASHFREE's string, not our user-facing copy, so
        // classifying from it is legitimate — and it is the only field here
        // that actually says why.
        pick(response, ["failure_reason"]),
        pick(response, ["error_reason"]),
        pick(response, ["error_code"]),
      ]),
    };
  }

  /**
   * Post-hoc read of a controlled execution — NOT AVAILABLE, and deliberately
   * not faked.
   *
   * Under the controlled flow `execute-mandate` returns the outcome
   * synchronously, so the common path settles without ever coming here. This is
   * only reached when that call timed out or answered `pending`, and Cashfree
   * exposes no confirmed endpoint for reading a controlled execution afterwards:
   * `GET /subscriptions/pay/controlled/execute-mandate/{id}`,
   * `…/payments/{base}/executions` and `…/notifications` all 404 (probed live
   * 2026-07-29).
   *
   * The tempting fallback is to read the BASE payment. That would be wrong in
   * the expensive direction: the base payment is the AUTHORIZATION, and it has
   * said `SUCCESS` since the day the mandate was approved. Every cycle would
   * resolve as succeeded, extending subscriptions for money that never moved.
   *
   * So: answer `pending`. The row stays unsettled, `reconcileUnsettled` keeps
   * asking, and the warn line makes an execution nobody can resolve visible
   * rather than silently settled. Fix this the moment Cashfree confirms the read
   * — until then a timed-out execute needs a human with the dashboard.
   */
  getDebitStatus(input: DebitStatusInput): Promise<PresentDebitResult> {
    log.warn(
      {
        event: "cashfree_execution_status_unavailable",
        reference_id: input.referenceId,
        cycle_date: input.cycleDate.toISOString().slice(0, 10),
        execution_id: executionId(input.presentationSequenceId),
      },
      "cannot read a controlled execution after the fact — leaving the debit unsettled (see the docblock)"
    );
    return Promise.resolve({
      outcome: "pending",
      providerTxnId: null,
      bankReferenceNumber: null,
      npciTransactionId: null,
      failureCode: null,
      failureMessage: null,
      // No failure to classify on this path (TAM-186).
      failureSubCode: null,
    });
  }

  async revokeMandate(input: {
    referenceId: string;
    providerMandateId: string;
  }): Promise<void> {
    await this.client.post(
      CASHFREE_PATHS.manage(input.referenceId),
      { action: "CANCEL" },
      { operation: "manage_mandate", referenceId: input.referenceId }
    );
    // No return value on purpose: the authoritative post-cancel state comes from
    // the next status read.
  }

}

/** Map our frequency to Cashfree's plan interval type. */
function cashfreeInterval(frequency: string): string {
  const f = frequency.toUpperCase();
  if (f === "MONTHLY" || f === "MONTH") return "MONTH";
  if (f === "WEEKLY" || f === "WEEK") return "WEEK";
  if (f === "YEARLY" || f === "YEAR") return "YEAR";
  if (f === "DAILY" || f === "DAY") return "DAY";
  return "MONTH";
}

/**
 * Cashfree subscription status → our state. Unknown/absent → `pending`, NEVER
 * `active`: entitlement is granted off this, and guessing active on a status we
 * do not understand gives away paid content unrecoverably. `pending` costs a
 * poll.
 */
export function mapSubscriptionState(raw: string | null): MandateState {
  if (!raw) return "pending";
  const mapped = CASHFREE_STATE_BY_SUBSCRIPTION_STATUS[raw.trim().toLowerCase()];
  if (mapped) return mapped;
  log.warn(
    { event: "cashfree_unknown_subscription_status", subscription_status: raw },
    "unrecognised Cashfree subscription status — treating as pending, not active"
  );
  return "pending";
}

/**
 * Cashfree payment status → debit outcome. Defaults to `pending` (the normal
 * async case); only an explicit success/failure moves off it.
 */
export function mapPaymentOutcome(raw: string | null): PresentDebitResult["outcome"] {
  if (!raw) return "pending";
  const value = raw.trim().toLowerCase();
  if (CASHFREE_SUCCESS_STATUSES.includes(value)) return "succeeded";
  if (CASHFREE_FAILURE_STATUSES.includes(value)) return "failed";
  if (value !== "pending" && value !== "initialized" && value !== "in_progress") {
    log.warn(
      { event: "cashfree_unknown_payment_status", payment_status: raw },
      "unrecognised Cashfree payment status — treating as pending"
    );
  }
  return "pending";
}

/**
 * A flat view of a response: top-level fields with any nested `data` fields
 * merged over them. Cashfree PG returns most fields at top level, but some
 * responses also nest a `data` payload — merging reads correctly either way.
 * (`findIntentLink` searches the whole structure separately, so a link nested
 * under `data` is still found.)
 */
function mergedFields(
  response: Record<string, unknown>
): Record<string, unknown> {
  const inner = response.data;
  return isJsonObject(inner) ? { ...response, ...inner } : response;
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

/**
 * Extract the UPI authorization link from a `/subscriptions/pay` response.
 *
 * Cashfree returns per-app deep links under
 * `data.payload.upiIntentData.androidAuthAppLinks.DEFAULT` (sandbox: a hosted
 * simulator page; production: the UPI-app deep link). We prefer the Android
 * DEFAULT, fall back to iOS DEFAULT, then the generic checkout `url`.
 */
function extractAuthLink(resp: Record<string, unknown>): string | null {
  const asObj = (v: unknown): Record<string, unknown> | null =>
    isJsonObject(v) ? v : null;
  const strVal = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;

  const payload = asObj(resp.payload) ?? asObj(asObj(resp.data)?.payload);
  const upi = asObj(payload?.upiIntentData);
  const android = asObj(upi?.androidAuthAppLinks);
  const ios = asObj(upi?.iosAuthAppLinks);
  return (
    strVal(android?.DEFAULT) ??
    strVal(ios?.DEFAULT) ??
    strVal(resp.url) ??
    strVal(asObj(resp.data)?.url)
  );
}

/** Paise → rupee float, fixed at two decimals (Cashfree's amount unit). */
function toRupees(amountPaise: number): number {
  return Number((amountPaise / 100).toFixed(2));
}

/**
 * `Date` → Cashfree's date string.
 *
 * TODO(cashfree): confirm the accepted format for `subscription_first_charge_time`
 * / `payment_schedule_date` — PG Subscriptions has used both `YYYY-MM-DD` and
 * ISO-8601 datetimes across versions. These `Date`s are UTC-midnight IST
 * calendar days (`istDateOnly`), so the date slice is the intended Indian day.
 */
function toWireDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `Date` → Cashfree's ISO8601 datetime (e.g. `2026-07-27T00:00:00Z`).
 *
 * Cashfree's subscription time fields (`subscription_first_charge_time`,
 * `subscription_expiry_time`) and `payment_schedule_date` reject a bare
 * `YYYY-MM-DD` — they require a full ISO8601 instant. Milliseconds are stripped
 * to match the documented example format.
 */
function toWireDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Wire date → UTC-midnight `Date`, matching the module's date-only convention. */
function parseWireDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

/**
 * The subscription's BASE payment id — the one minted at mandate setup.
 *
 * Cashfree defines `payment_id` on the controlled endpoints as "the base Payment
 * ID established during initial mandate setup", i.e. the AUTH payment, constant
 * for the subscription's whole life. It is NOT the per-cycle key — that is
 * `notification_id` / `execution_id`.
 *
 * Derived rather than stored, because `createMandate` builds the same string
 * from the same input. One function so the two cannot drift; the day Cashfree
 * starts assigning it instead, this becomes a column and only this changes.
 */
function basePaymentId(referenceId: string): string {
  return `pj_auth_${referenceId}`;
}

/**
 * The execution id for a cycle, derived from that cycle's notification id.
 *
 * Deliberately a pure suffix of the notification key rather than an independent
 * value: a debit and the notice that preceded it must be greppable as one pair,
 * and any drift between them would leave an executed charge that no notification
 * can be matched to.
 */
function executionId(notificationId: string): string {
  return `${notificationId}_exec`;
}

/**
 * Execution status → our debit outcome. Unknown → `pending`.
 *
 * Failing to `pending` rather than `failed` is deliberate: it leaves the row
 * unsettled for the reconciliation sweep instead of inventing an outcome for
 * money we are not sure about. Writing `failed` on an unrecognised token would
 * dun a user whose payment may well have succeeded.
 */
function mapExecutionOutcome(raw: string | null): "pending" | "succeeded" | "failed" {
  if (!raw) return "pending";
  const token = raw.toLowerCase();
  if (CASHFREE_EXECUTION_SUCCESS_STATUSES.includes(token)) return "succeeded";
  if (CASHFREE_EXECUTION_FAILURE_STATUSES.includes(token)) return "failed";
  log.warn(
    { event: "cashfree_unknown_execution_status", execution_status: raw },
    "unrecognised execution status — treating as pending"
  );
  return "pending";
}
