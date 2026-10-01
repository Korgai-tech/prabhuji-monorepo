import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import { analyticsEventsClient, type AnalyticsEventInput } from "@api/shared/analytics";
import { PAYMENT_ANALYTICS_EVENT as ANALYTICS_EVENT } from "@api/shared/analytics";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import type { IPaywallApi } from "@api/core/paywall/api";
import { PaymentAnalyticsService } from "../payment-analytics.service.js";
import { PaymentLedgerAnalyticsService } from "../payment-ledger-analytics.service.js";
import type { PdnRow } from "@api/core/payment/repositories/pdn.repository.js";

const send = vi.spyOn(analyticsEventsClient, "send");

const NOW = new Date("2026-08-01T10:00:00.000Z");
const TRIAL_END = new Date("2026-08-05T18:29:59.999Z");

const mandate = (over: Partial<MandateRow> = {}): MandateRow => ({
  id: "mnd-1",
  userId: "usr-1",
  type: "upi",
  provider: "decentro",
  referenceId: "pj_mnd_1",
  providerMandateId: "dec-1",
  providerTxnId: null,
  npciTransactionId: null,
  state: "active",
  stateReason: null,
  planId: "vip_monthly",
  productId: "vip",
  amountPaise: 29_900,
  currency: "INR",
  frequency: "MONTHLY",
  amountRule: "MAX",
  ruleType: "BEFORE",
  ruleValue: 28,
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2056-07-01T00:00:00.000Z"),
  nextDebitDate: new Date("2026-08-05T00:00:00.000Z"),
  trialEndsAt: null,
  authUrl: null,
  providerCheckout: null,
  authExpiresAt: null,
  payerHandleMasked: null,
  payerNameMasked: null,
  lastPolledAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: NOW,
  ...over,
});

const txn = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  id: "txn-1",
  userId: "usr-1",
  kind: "recurring_debit",
  provider: "decentro",
  mandateId: "mnd-1",
  amountPaise: 29_900,
  currency: "INR",
  status: "succeeded",
  chargePhase: "submission",
  cycleDate: new Date("2026-08-05T00:00:00.000Z"),
  isFirstDebit: false,
  attemptNo: 1,
  retryCount: 0,
  presentationSequenceId: null,
  pdnId: null,
  gatewayPresentationRef: null,
  gatewayPaymentId: "gw-1",
  gatewayRequestId: "req-1",
  bankReferenceNumber: "rrn-1",
  npciTransactionId: "npci-1",
  notifiedAt: null,
  submittedAt: null,
  settledAt: NOW,
  failurePhase: null,
  failureCode: null,
  failureMessage: null,
  failureSubCode: null,
  parentTransactionId: null,
  supersededAt: null,
  supersededByTransactionId: null,
  planId: "vip_monthly",
  productId: "vip",
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

/** The ₹2 registration charge, as `recordInitialDeposit` writes it. */
const deposit = (over: Partial<TransactionRow> = {}): TransactionRow =>
  txn({
    id: "dep-1",
    kind: "initial_deposit",
    amountPaise: 200,
    chargePhase: "deposit",
    cycleDate: null,
    status: "pending",
    gatewayPaymentId: null,
    bankReferenceNumber: null,
    npciTransactionId: null,
    ...over,
  });

/** Everything the last `send()` was handed. */
const sentBatch = (): AnalyticsEventInput[] => send.mock.calls.at(-1)?.[0] ?? [];

/**
 * The PRIMARY event of the last `send()` — the lifecycle event a tracker exists
 * to publish. A terminal payment batches `bk_payment` behind it; assertions
 * about that one go through `sentBatch()`.
 */
const sent = (): AnalyticsEventInput => {
  const batch = sentBatch();
  expect(batch.length).toBeGreaterThan(0);
  return batch[0];
};

const service = new PaymentAnalyticsService();

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
});

describe("event naming", () => {
  it("prefixes every event with bk_<module>_", async () => {
    // `bk_` marks the PRODUCER: these come from the api, not a phone. Without it
    // a server event and the client event for the same moment are
    // indistinguishable in the warehouse.
    const trialing = mandate({ trialEndsAt: TRIAL_END });
    await service.trackPaymentInitiated({ mandate: mandate(), txn: deposit() });
    const names = [sent().event_type];
    await service.trackPaymentSuccess({ mandate: mandate(), txn: txn() });
    names.push(sent().event_type);
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn(),
      outcome: "cancelled",
    });
    names.push(sent().event_type);
    await service.trackSubscriptionInitiated({
      mandate: mandate(),
      txn: deposit(),
      trialDays: 3,
    });
    names.push(sent().event_type);
    await service.trackTrialPaymentInitiated({
      mandate: trialing,
      txn: deposit(),
      trialDays: 3,
    });
    names.push(sent().event_type);
    await service.trackMandateApproved({ mandate: trialing, now: NOW, isFirstFullPricePayment: false });
    names.push(sent().event_type);
    await service.trackTrialSuccess({ mandate: trialing, txn: deposit(), now: NOW });
    names.push(sent().event_type);
    await service.trackMandateApproved({ mandate: mandate(), now: NOW, isFirstFullPricePayment: true });
    names.push(sent().event_type);
    await service.trackSubscriptionAbandoned({ mandate: mandate(), reason: "x" });
    names.push(sent().event_type);
    await service.trackSubscriptionRenewed({
      mandate: mandate(),
      txn: txn(),
      periodEnd: NOW,
    });
    names.push(sent().event_type);
    await service.trackSubscriptionEnded({ mandate: trialing, now: NOW, reason: "x" });
    names.push(sent().event_type);
    await service.trackSubscriptionEnded({ mandate: mandate(), now: NOW, reason: "x" });
    names.push(sent().event_type);
    await service.trackTrialCancelled({
      mandate: trialing,
      now: NOW,
      reason: "user_cancelled",
    });
    names.push(sent().event_type);

    expect(names).toEqual([
      "bk_payment_initiated",
      // The settlement, NOT the revenue row: `bk_payment_success` rides in the
      // same batch behind it and is asserted through `sentBatch()`.
      "bk_payment_settled",
      // A recurring debit on a non-trial mandate, so the subscription half of
      // the split that replaced `bk_payment_failed`.
      "bk_subscription_failed",
      "bk_subscription_initiated",
      "bk_trial_payment_initiated",
      "bk_subscription_trial_started",
      "bk_trial_success",
      "bk_subscription_started",
      "bk_subscription_abandoned",
      "bk_subscription_renewed",
      "bk_subscription_trial_cancelled",
      "bk_subscription_cancelled",
      "bk_trial_cancelled",
    ]);
    expect(names.every((n) => /^bk_(payment|subscription|trial)_/.test(n))).toBe(true);
  });

  it("has no bare names left — every event is <module>_<event>", () => {
    // `bk_payment` used to be the one exemption. The TAM-145 cutover renamed it
    // to `bk_payment_success`, so the exemption list is now empty and this test
    // exists to keep it that way: a new bare name needs a decision, not a merge.
    const bare = Object.values(ANALYTICS_EVENT).filter(
      (n) => !/^bk_[a-z]+_/.test(n)
    );

    expect(bare).toEqual([]);
  });

  it("splits a failed payment on trial-vs-subscription", async () => {
    // The whole point of retiring `bk_payment_failed`: a declined ₹2 deposit and
    // a declined ₹299 renewal are different leaks with different fixes.
    await service.trackPaymentFailed({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit({ status: "failed" }),
      outcome: "abandoned",
    });
    expect(sent().event_type).toBe("bk_trial_failed");

    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ status: "failed" }),
      outcome: "cancelled",
    });
    expect(sent().event_type).toBe("bk_subscription_failed");
  });

  it("keeps the per-attempt insert_id the rename inherited", async () => {
    // Carried over from `bk_payment_failed` verbatim. Three retries of one cycle
    // ARE three failures; collapsing them flattens the dunning curve.
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ status: "failed", retryCount: 2 }),
      outcome: "retry_scheduled",
    });

    expect(sent().insert_id).toBe("bk_subscription_failed:txn-1:2");
  });

  it("emits exactly what the constants file declares — no more, no less", async () => {
    // `PAYMENT_ANALYTICS_EVENT` (shared/analytics/events.ts) is meant to be THE list: one
    // file to read to know what a dashboard can query. That only holds if it
    // cannot drift from what the service actually emits, in either direction —
    // a declared-but-dead name is as misleading as an undeclared one.
    const trialing = mandate({ trialEndsAt: TRIAL_END });
    const emitted = new Set<string>();
    const capture = async (run: Promise<void>): Promise<void> => {
      await run;
      // Every event in the batch, not just the primary — `bk_payment` rides
      // along behind a terminal payment and is declared like any other.
      for (const event of sentBatch()) emitted.add(event.event_type);
    };

    await capture(service.trackPaymentInitiated({ mandate: mandate(), txn: deposit() }));
    // Emits the settlement AND the consolidated revenue row in one batch.
    await capture(service.trackPaymentSuccess({ mandate: mandate(), txn: txn() }));
    await capture(
      service.trackPaymentFailed({ mandate: mandate(), txn: txn(), outcome: "cancelled" })
    );
    // The trial half of the failure split — a non-trial mandate can never emit it.
    await capture(
      service.trackPaymentFailed({
        mandate: trialing,
        txn: deposit({ status: "failed" }),
        outcome: "abandoned",
      })
    );
    await capture(
      service.trackSubscriptionPastDue({
        mandate: mandate(),
        txn: txn({ status: "failed" }),
        graceUntil: NOW,
      })
    );
    await capture(
      service.trackSubscriptionInitiated({
        mandate: mandate(),
        txn: deposit(),
        trialDays: 3,
      })
    );
    await capture(
      service.trackTrialPaymentInitiated({
        mandate: trialing,
        txn: deposit(),
        trialDays: 3,
      })
    );
    await capture(service.trackMandateApproved({ mandate: trialing, now: NOW, isFirstFullPricePayment: false }));
    await capture(
      service.trackTrialSuccess({ mandate: trialing, txn: deposit(), now: NOW })
    );
    await capture(service.trackMandateApproved({ mandate: mandate(), now: NOW, isFirstFullPricePayment: true }));
    await capture(service.trackSubscriptionAbandoned({ mandate: mandate(), reason: "x" }));
    await capture(
      service.trackSubscriptionRenewed({ mandate: mandate(), txn: txn(), periodEnd: NOW })
    );
    await capture(
      service.trackSubscriptionEnded({ mandate: trialing, now: NOW, reason: "x" })
    );
    await capture(
      service.trackSubscriptionEnded({ mandate: mandate(), now: NOW, reason: "x" })
    );
    await capture(
      service.trackTrialCancelled({ mandate: trialing, now: NOW, reason: "x" })
    );
    // Lever A's trigger (TAM-186). Driven with an INSUFFICIENT_FUNDS sub-code
    // because that is the only input that emits — every other sub-code is a
    // deliberate no-op, which is what `payment-recovery-due.test.ts` pins.
    await capture(
      service.trackPaymentRecoveryDue({
        mandate: mandate(),
        txn: txn({ status: "failed" }),
        population: "renewal",
        accessEndsAt: NOW,
        failureSubCode: "INSUFFICIENT_FUNDS",
      })
    );

    // The debit-attempt ledger (TAM-187) is declared in the same constants
    // object, so its tracker is part of "what the service emits".
    const ledger = new PaymentLedgerAnalyticsService();
    const pdn: PdnRow = {
      id: "pdn-1",
      mandateId: "mnd-1",
      userId: "usr-1",
      cycleDate: new Date("2026-08-05T00:00:00.000Z"),
      referenceId: "pj_pdn_1",
      presentationSequenceId: null,
      amountPaise: 29_900,
      scheduledDebitAt: null,
      status: "sent",
      attempts: 0,
      failureReason: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await capture(ledger.trackMandateCreated({ mandate: mandate() }));
    await capture(
      ledger.trackMandateStatusChanged({
        mandate: mandate(),
        previousStatus: "pending",
        source: "poll",
        changedAt: NOW,
      })
    );
    await capture(
      ledger.trackPaymentScheduled({
        mandate: mandate(),
        txn: txn(),
        reason: "new_cycle",
        scheduledFor: NOW,
        source: "scheduler",
      })
    );
    await capture(
      ledger.trackPdnSent({
        mandate: mandate(),
        txn: txn(),
        pdn,
        notificationRef: "pj_pdn_1",
        providerStatus: "sent",
        hasSequenceId: false,
        occurredAt: NOW,
      })
    );
    await capture(ledger.trackPdnStatus({ pdn, status: "accepted", source: "poll" }));
    await capture(
      ledger.trackPaymentAttempted({
        mandate: mandate(),
        txn: txn(),
        presentationRef: "pj_prs_1",
        immediateResponse: "pending",
        occurredAt: NOW,
      })
    );
    await capture(
      ledger.trackPaymentResult({ mandate: mandate(), txn: txn(), status: "success", source: "poll" })
    );
    await capture(
      ledger.trackPaymentDeferred({ mandate: mandate(), txn: txn(), reason: "PRESENTATION_WINDOW_CLOSED" })
    );
    await capture(
      ledger.trackPaymentRetryScheduled({ mandate: mandate(), txn: txn(), retryKind: "next_window" })
    );
    await capture(
      ledger.trackWebhookReceived({
        mandate: mandate(),
        webhookEventId: "wh-1",
        callbackKind: "mandate",
        outcome: "processed",
        processingMs: 12,
      })
    );

    expect([...emitted].sort()).toEqual(Object.values(ANALYTICS_EVENT).sort());
  });
});

describe("the standard property bag", () => {
  it("is present in full, with the same keys, on a payment event", async () => {
    await service.trackPaymentFailed({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: txn({ retryCount: 2, status: "failed" }),
      failureCode: "INSUFFICIENT_FUNDS",
      failureReason: "insufficient balance",
      outcome: "retry_scheduled",
    });

    expect(sent().event_properties).toMatchObject({
      plan_id: "vip_monthly",
      product_id: "vip",
      mandate_id: "mnd-1",
      provider: "decentro",
      payment_method: "upi",
      payment_id: "txn-1",
      gateway_payment_id: "gw-1",
      amount: 299,
      amount_paise: 29_900,
      currency: "INR",
      // Every event carries the trial-vs-paid discriminator now, not just the
      // revenue row — a funnel that splits on it needs it at each step.
      type: "subscription",
      billing_cycle: "MONTHLY",
      // Both full ISO-8601. These used to disagree in the SAME event
      // (`2026-07-01` against a full timestamp), so any query touching both had
      // to parse two formats.
      trial_start_date: "2026-07-01T00:00:00.000Z",
      trial_end_date: "2026-08-05T18:29:59.999Z",
      failure_code: "INSUFFICIENT_FUNDS",
      failure_reason: "insufficient balance",
      // 1-based: retryCount 2 means this is the third go at the money.
      attempt_number: 3,
    });
  });

  it("keeps every key present — null, never absent — when it does not apply", async () => {
    // The EMITTER keeps the base keys on every event so they cannot drift apart.
    //
    // Note this does not survive to the warehouse: ClickHouse's JSON type drops
    // null-valued keys at ingest, so `x: null` here stores a row with no `x`.
    // That is why the rule for NEW properties is "do not send one you cannot
    // populate" rather than "send it as null" — see standardProps' docblock.
    // These keys stay because they are genuinely populated on other events.
    await service.trackSubscriptionEnded({
      mandate: mandate({ trialEndsAt: null }),
      now: NOW,
      reason: "user_cancelled",
    });

    const props = sent().event_properties ?? {};
    for (const key of [
      "plan_id",
      "product_id",
      "mandate_id",
      "provider",
      "payment_method",
      "payment_id",
      "gateway_payment_id",
      "amount",
      "amount_paise",
      "currency",
      "trial_start_date",
      "trial_end_date",
      "failure_code",
      "failure_reason",
      "attempt_number",
    ]) {
      expect(props).toHaveProperty(key);
    }
    // No transaction and no trial on this one.
    expect(props.payment_id).toBeNull();
    expect(props.attempt_number).toBeNull();
    expect(props.trial_start_date).toBeNull();
    expect(props.trial_end_date).toBeNull();
  });

  it("carries type and index on lifecycle events, not just the revenue row", async () => {
    // The contract asks for both on every event. A funnel that can read `index`
    // at one step and not the next cannot follow a cohort through.
    const trialing = mandate({ trialEndsAt: TRIAL_END });
    await service.trackTrialSuccess({ mandate: trialing, txn: deposit(), now: NOW });
    expect(sent().event_properties).toMatchObject({ type: "trial", index: 0 });

    await service.trackSubscriptionRenewed({
      mandate: mandate(),
      txn: txn(),
      periodEnd: NOW,
      cyclesCompleted: 3,
    });
    expect(sent().event_properties).toMatchObject({
      type: "subscription",
      index: 3,
      cycles_completed: 3,
    });
  });

  it("omits index on a subscription event nobody counted, rather than guessing 0", async () => {
    // 0 means "the trial charge". Defaulting an uncounted renewal to it would
    // file paying cycles as trials.
    await service.trackSubscriptionEnded({
      mandate: mandate(),
      now: NOW,
      reason: "user_cancelled",
    });

    expect(sent().event_properties).not.toHaveProperty("index");
  });

  it("carries money in rupees AND paise", async () => {
    // Rupees is what a chart reads; paise is what a reconciliation must sum,
    // because 299.00 has no exact binary floating-point representation.
    await service.trackPaymentSuccess({
      mandate: mandate(),
      txn: deposit({ status: "succeeded", amountPaise: 200 }),
    });

    expect(sent().event_properties).toMatchObject({ amount: 2, amount_paise: 200 });
  });
});

describe("payment events", () => {
  it("labels the ₹2 registration charge as an initial deposit", async () => {
    await service.trackPaymentInitiated({ mandate: mandate(), txn: deposit() });

    expect(sent()).toMatchObject({
      event_type: "bk_payment_initiated",
      user_id: "usr-1",
      insert_id: "bk_payment_initiated:dep-1",
      event_properties: {
        payment_type: "initial_deposit",
        amount: 2,
        amount_paise: 200,
        cycle_date: null,
      },
    });
  });

  it("labels a monthly charge as a recurring debit and carries its cycle", async () => {
    await service.trackPaymentInitiated({ mandate: mandate(), txn: txn() });

    expect(sent().event_properties).toMatchObject({
      payment_type: "recurring_debit",
      cycle_date: "2026-08-05",
      is_first_debit: false,
      amount: 299,
    });
  });

  it("carries the bank and NPCI references on a success", async () => {
    // The only record of this money outside the gateway's systems.
    await service.trackPaymentSuccess({ mandate: mandate(), txn: txn() });

    expect(sent()).toMatchObject({
      // The SETTLEMENT, renamed from `bk_payment_success` at the TAM-145
      // cutover — that name now belongs to the consolidated revenue row, which
      // rides in the same batch.
      event_type: "bk_payment_settled",
      // A ledger row settles ONCE — the synchronous settlement and the callback
      // that repeats it must not count as two payments.
      insert_id: "bk_payment_settled:txn-1",
      event_properties: {
        bank_reference_number: "rrn-1",
        npci_transaction_id: "npci-1",
      },
    });
  });

  it("marks a scheduled retry recoverable and carries the grace window", async () => {
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ status: "failed" }),
      failureCode: "INSUFFICIENT_FUNDS",
      failureReason: "insufficient balance",
      outcome: "retry_scheduled",
      graceUntil: new Date("2026-08-08T00:00:00.000Z"),
    });

    expect(sent().event_properties).toMatchObject({
      outcome: "retry_scheduled",
      recoverable: true,
      grace_until: "2026-08-08T00:00:00.000Z",
    });
  });

  it("marks an exhausted, revoked or abandoned outcome unrecoverable", async () => {
    for (const outcome of ["cancelled", "expired", "abandoned"] as const) {
      await service.trackPaymentFailed({ mandate: mandate(), txn: txn(), outcome });
      expect(sent().event_properties).toMatchObject({ outcome, recoverable: false });
    }
  });

  it("falls back to the ledger row's own failure detail", async () => {
    // The abandoned-deposit path has no failure to pass in — the row already
    // carries what `settleDepositForMandate` wrote.
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: deposit({
        status: "abandoned",
        failureCode: "MANDATE_NOT_AUTHORIZED",
        failureMessage: "mandate reached expired without approval",
      }),
      outcome: "abandoned",
    });

    expect(sent().event_properties).toMatchObject({
      failure_code: "MANDATE_NOT_AUTHORIZED",
      failure_reason: "mandate reached expired without approval",
    });
  });

  it("keys the dedup id on the ATTEMPT, so a dunning curve is not flattened", async () => {
    // Three retries of one cycle are three real events. Keying on the cycle
    // here — correct for a settlement — would hide what this event is for.
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ retryCount: 1 }),
      outcome: "retry_scheduled",
    });
    const first = sent().insert_id;
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ retryCount: 2 }),
      outcome: "retry_scheduled",
    });

    expect(first).toBe("bk_subscription_failed:txn-1:1");
    expect(sent().insert_id).toBe("bk_subscription_failed:txn-1:2");
  });

  it("batches the consolidated revenue record behind a settlement", async () => {
    // "Fires alongside" is one POST, not two: the settlement path awaits the
    // collector, and a second round trip to describe the same money is latency
    // the billing tick pays for nothing.
    await service.trackPaymentSuccess({ mandate: mandate(), txn: txn() });

    expect(sentBatch().map((e) => e.event_type)).toEqual([
      "bk_payment_settled",
      "bk_payment_success",
    ]);
    expect(sentBatch()[1]).toMatchObject({
      user_id: "usr-1",
      // The LEDGER ROW: one row reaches one terminal state, so a settlement
      // reported twice is still one revenue record.
      insert_id: "bk_payment_success:txn-1",
      event_properties: {
        type: "subscription",
        payment_status: "success",
        amount: 299,
        currency: "INR",
        plan_id: "vip_monthly",
        payment_date: NOW.toISOString(),
      },
    });
  });

  it("types the registration deposit on a trial mandate as trial money", async () => {
    // ₹2 against a trial mandate IS the trial charge. Read off the ledger row's
    // kind, so a settlement reported days later classifies the same way.
    await service.trackPaymentSuccess({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit({ status: "succeeded" }),
    });

    expect(sentBatch()[1].event_properties).toMatchObject({
      type: "trial",
      index: 0,
      amount: 2,
      payment_status: "success",
    });
  });

  it("numbers the first full-price debit 1 and leaves later cycles unnumbered", async () => {
    // The fallback, for a caller that did not count. A precise position needs a
    // per-mandate cycle count, which this service will not query for itself.
    await service.trackPaymentSuccess({
      mandate: mandate(),
      txn: txn({ isFirstDebit: true }),
    });
    expect(sentBatch()[1].event_properties).toMatchObject({ index: 1 });

    await service.trackPaymentSuccess({ mandate: mandate(), txn: txn() });
    expect(sentBatch()[1].event_properties).toMatchObject({ index: null });
  });

  it("numbers a real cycle from the count the caller passes in", async () => {
    // A settled row COUNTS ITSELF — the billing cycle settles before reporting,
    // so the live count already is this row's position. Off by one here would
    // silently shift every renewal cohort.
    //
    // `status: "submitted"` is NOT an oversight, it is the point. `settle()`
    // returns a boolean rather than the updated row, so `onDebitSucceeded` still
    // holds the PRE-settlement row when it reports. A fixture pinned to
    // "succeeded" would pass while production reported every cycle one too high.
    await service.trackPaymentSuccess({
      mandate: mandate(),
      txn: txn({ status: "submitted" }),
      cyclesCompleted: 4,
    });
    expect(sentBatch()[1].event_properties).toMatchObject({ index: 4 });

    // A FAILED row never settled, so it is the next position after everything
    // that did — and here the stale row reads "submitted" too, which is why the
    // discriminator has to be the reported outcome and not the row's status.
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ status: "submitted" }),
      outcome: "cancelled",
      cyclesCompleted: 4,
    });
    expect(sentBatch()[1].event_properties).toMatchObject({ index: 5 });
  });

  it("populates is_first_payment instead of sending a null the warehouse drops", async () => {
    // It was hardcoded `null` and appeared in 0 of 55 prod rows — ClickHouse
    // drops null JSON keys, so the key existed only in our source.
    await service.trackPaymentSuccess({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit({ status: "succeeded" }),
    });
    expect(sentBatch()[1].event_properties).toMatchObject({
      is_first_payment: true,
    });

    await service.trackPaymentSuccess({
      mandate: mandate(),
      txn: txn({ isFirstDebit: false }),
    });
    expect(sentBatch()[1].event_properties).toMatchObject({
      is_first_payment: false,
    });
  });

  it("omits trigger_module entirely rather than shipping an unfillable key", async () => {
    // The paywall's trigger never leaves the phone. A key that is always null is
    // a key a dashboard can filter on and never match.
    await service.trackPaymentSuccess({ mandate: mandate(), txn: txn() });

    expect(sentBatch()[1].event_properties).not.toHaveProperty("trigger_module");
    expect(sentBatch()[1].event_properties).not.toHaveProperty("upi_type");
  });

  it("reports dunning entry once per attempt, with the sliding grace window", async () => {
    await service.trackSubscriptionPastDue({
      mandate: mandate(),
      txn: txn({ status: "failed", retryCount: 2 }),
      failureCode: "INSUFFICIENT_FUNDS",
      graceUntil: new Date("2026-08-08T00:00:00.000Z"),
    });

    expect(sent()).toMatchObject({
      event_type: "bk_subscription_past_due",
      insert_id: "bk_subscription_past_due:txn-1:2",
      event_properties: {
        retry_count: 2,
        // 1-based, like `attempt_number` — retryCount 2 means this is the third
        // presentation and so the third dunning reminder.
        dunning_stage: "reminder_3",
        due_date: "2026-08-05",
        grace_until: "2026-08-08T00:00:00.000Z",
        failure_code: "INSUFFICIENT_FUNDS",
      },
    });
  });

  it("records a terminal failure as revenue lost, with the failure detail", async () => {
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ status: "failed" }),
      failureCode: "MANDATE_REVOKED",
      failureReason: "autopay mandate no longer active",
      outcome: "cancelled",
    });

    expect(sentBatch().map((e) => e.event_type)).toEqual([
      "bk_subscription_failed",
      "bk_payment_success",
    ]);
    expect(sentBatch()[1].event_properties).toMatchObject({
      payment_status: "failed",
      failure_code: "MANDATE_REVOKED",
      failure_reason: "autopay mandate no longer active",
    });
  });

  it("withholds the revenue record while a retry is still scheduled", async () => {
    // THE guard. A cycle with a retry pending has not reached a terminal state;
    // emitting here would book the loss, then book the settlement too when the
    // retry collects, and the same cycle would appear twice.
    await service.trackPaymentFailed({
      mandate: mandate(),
      txn: txn({ status: "failed" }),
      outcome: "retry_scheduled",
      graceUntil: new Date("2026-08-08T00:00:00.000Z"),
    });

    expect(sentBatch().map((e) => e.event_type)).toEqual(["bk_subscription_failed"]);
  });

  it("collapses a re-notified cycle to one initiation", async () => {
    // `pdn_dispatched` fires on every tick that re-arms the SAME cycle; that is
    // one payment attempt, not one per thirty minutes.
    await service.trackPaymentInitiated({ mandate: mandate(), txn: txn() });
    const first = sent().insert_id;
    await service.trackPaymentInitiated({
      mandate: mandate(),
      txn: txn({ retryCount: 1 }),
    });

    expect(sent().insert_id).toBe(first);
  });
});

describe("subscription events", () => {
  it("reports the plan price beside the deposit at signup", async () => {
    await service.trackSubscriptionInitiated({
      mandate: mandate(),
      txn: deposit(),
      trialDays: 3,
    });

    expect(sent()).toMatchObject({
      insert_id: "bk_subscription_initiated:mnd-1",
      event_properties: {
        // What moved now...
        amount_paise: 200,
        // ...and what the subscription is worth, so a conversion rate can be
        // weighted without joining anything.
        plan_amount_paise: 29_900,
        trial_days: 3,
        is_trial: true,
      },
    });
  });

  it("is a subscription start once the trial window has closed", async () => {
    // A trial that ENDED is not a trial. Testing `!== null` alone would label
    // every post-trial renewal a trial start forever.
    await service.trackMandateApproved({
      mandate: mandate({ trialEndsAt: new Date("2026-07-15T00:00:00.000Z") }),
      now: NOW,
      isFirstFullPricePayment: true,
    });

    expect(sent().event_type).toBe("bk_subscription_started");
  });

  it("stays silent when the user has paid full price before", async () => {
    // The event claims a FIRST payment. A user who re-registers after an NPCI
    // revoke has been paying for months, and reporting them as a fresh start
    // inflates every new-paying-customer number they appear in.
    await service.trackMandateApproved({
      mandate: mandate(),
      now: NOW,
      isFirstFullPricePayment: false,
    });

    expect(send).not.toHaveBeenCalled();
  });

  it("keys the start on the USER, so a second mandate cannot mint a second first", async () => {
    // The whole point of the re-key. A revoke plus re-consent mints a new
    // mandate id, so a mandate-scoped key would let the same person be counted
    // as a new paying customer twice.
    await service.trackSubscriptionStarted({
      mandate: mandate(),
      isFirstFullPricePayment: true,
    });
    const first = sent().insert_id;
    await service.trackSubscriptionStarted({
      mandate: mandate({ id: "mnd-2" }),
      isFirstFullPricePayment: true,
    });

    expect(first).toBe("bk_subscription_started:usr-1");
    expect(sent().insert_id).toBe(first);
  });

  it("reports a converting trial as a start, even mid-window", async () => {
    // THE case the old approval-only hook could never see: the trial mandate
    // went live weeks ago at ₹2, so the moment it becomes revenue is the debit,
    // not an approval. And the clock must not be consulted — a cycle scheduled
    // on a `@db.Date` can settle while `trialEndsAt` is still in the future,
    // which would misfile real revenue as a trial start.
    await service.trackSubscriptionStarted({
      mandate: mandate({ trialEndsAt: new Date("2026-09-01T00:00:00.000Z") }),
      txn: txn(),
      now: NOW,
      isFirstFullPricePayment: true,
    });

    expect(sent()).toMatchObject({
      event_type: "bk_subscription_started",
      event_properties: {
        activation_source: "trial_conversion",
        type: "subscription",
      },
    });
  });

  it("keys a renewal on the CYCLE, not the attempt", async () => {
    // The same settlement arrives twice — synchronously from `presentDebit` and
    // again from the provider callback. Both must collapse, or a month of
    // revenue is counted twice.
    const periodEnd = new Date("2026-09-05T00:00:00.000Z");
    await service.trackSubscriptionRenewed({ mandate: mandate(), txn: txn(), periodEnd });
    const first = sent().insert_id;
    await service.trackSubscriptionRenewed({
      mandate: mandate(),
      txn: txn({ id: "txn-2", attemptNo: 2 }),
      periodEnd,
    });

    expect(first).toBe("bk_subscription_renewed:mnd-1:2026-08-05");
    expect(sent().insert_id).toBe(first);
    expect(sent().event_properties).toMatchObject({
      cycle_date: "2026-08-05",
      validity_end: "2026-09-05T00:00:00.000Z",
    });
  });

  it("keys a cancellation on the MANDATE, so one churn is not counted twice", async () => {
    // A first-debit failure ends the subscription twice over: `onDebitFailed`
    // says so, and `refreshFromProvider` says so again when it confirms NPCI's
    // revoke. The transaction is carried as a property but must not reach the
    // key.
    await service.trackSubscriptionEnded({
      mandate: mandate(),
      txn: txn(),
      now: NOW,
      reason: "first_debit_failed",
    });
    const withTxn = sent().insert_id;
    await service.trackSubscriptionEnded({
      mandate: mandate(),
      now: NOW,
      reason: "mandate_revoked",
    });

    expect(withTxn).toBe("bk_subscription_cancelled:mnd-1");
    expect(sent().insert_id).toBe(withTxn);
  });

  it("reports how long a cancelled subscription lasted", async () => {
    await service.trackSubscriptionEnded({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      now: NOW,
      reason: "user_cancelled",
    });

    expect(sent()).toMatchObject({
      event_type: "bk_subscription_trial_cancelled",
      event_properties: {
        failure_reason: "user_cancelled",
        // Registered 2026-07-01T00:00Z, ended 2026-08-01T10:00Z → 31d 10h.
        lifetime_seconds: 31 * 24 * 60 * 60 + 10 * 60 * 60,
      },
    });
  });

  it("reports the settled deposit's money on a trial success, not the plan price", async () => {
    // The whole reason this event exists beside `bk_subscription_trial_started`:
    // ₹2 moved, ₹299 is what the subscription is worth, and a revenue query that
    // reads the second for a trial start invents money nobody was charged.
    await service.trackTrialSuccess({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit({ status: "succeeded", gatewayPaymentId: "gw-dep-1" }),
      now: NOW,
    });

    expect(sent()).toMatchObject({
      event_type: "bk_trial_success",
      // Keyed on the USER, not the mandate (TAM-181) — a trial start is a
      // claim about a person, and a user with two trial-bearing mandates used
      // to mint two uncollapsible ids.
      insert_id: "bk_trial_success:usr-1",
      event_properties: {
        payment_id: "dep-1",
        gateway_payment_id: "gw-dep-1",
        amount_paise: 200,
        plan_amount_paise: 29_900,
        // Renamed from `next_debit_date` to the contract's name.
        next_billing_date: "2026-08-05",
        trial_end_date: TRIAL_END.toISOString(),
      },
    });
  });

  it("stays silent on a full-price registration's approval", async () => {
    // No trial window — that approval is `bk_subscription_started`, and
    // counting it here would report a trial nobody was given.
    await service.trackTrialSuccess({ mandate: mandate(), txn: txn(), now: NOW });

    expect(send).not.toHaveBeenCalled();
  });

  it("reports a deliberate cancellation inside the trial window", async () => {
    await service.trackTrialCancelled({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      now: NOW,
      reason: "user_cancelled",
    });

    expect(sent()).toMatchObject({
      event_type: "bk_trial_cancelled",
      insert_id: "bk_trial_cancelled:mnd-1",
      event_properties: {
        failure_reason: "user_cancelled",
        lifetime_seconds: 31 * 24 * 60 * 60 + 10 * 60 * 60,
      },
    });
  });

  it("stays silent when the cancelling subscriber was never on a trial", async () => {
    // The guard that keeps `bk_trial_cancelled` a TRIAL number. A paid
    // subscriber's cancel is `bk_subscription_cancelled` and nothing else —
    // counting it here would inflate trial churn with people who paid.
    await service.trackTrialCancelled({
      mandate: mandate(),
      now: NOW,
      reason: "user_cancelled",
    });
    // Same for a trial that had already ended before they cancelled.
    await service.trackTrialCancelled({
      mandate: mandate({ trialEndsAt: new Date("2026-07-15T18:29:59.999Z") }),
      now: NOW,
      reason: "user_cancelled",
    });

    expect(send).not.toHaveBeenCalled();
  });

  it("reports the state an abandoned mandate died in", async () => {
    await service.trackSubscriptionAbandoned({
      mandate: mandate({ state: "expired", stateReason: "auth_link_expired" }),
      reason: "auth_link_expired",
    });

    expect(sent()).toMatchObject({
      event_type: "bk_subscription_abandoned",
      insert_id: "bk_subscription_abandoned:mnd-1",
      event_properties: {
        mandate_state: "expired",
        failure_reason: "auth_link_expired",
      },
    });
  });
});

describe("failure isolation", () => {
  it("swallows a collector failure so a payment is never affected", async () => {
    // THE property that matters. The billing path awaits these on the money
    // path; one rejection would abort a settlement mid-flight.
    send.mockRejectedValue(new Error("collector down"));

    await expect(
      service.trackPaymentSuccess({ mandate: mandate(), txn: txn() })
    ).resolves.toBeUndefined();
    await expect(
      service.trackPaymentFailed({ mandate: mandate(), txn: txn(), outcome: "cancelled" })
    ).resolves.toBeUndefined();
    await expect(
      service.trackSubscriptionRenewed({
        mandate: mandate(),
        txn: txn(),
        periodEnd: NOW,
      })
    ).resolves.toBeUndefined();
    await expect(
      service.trackSubscriptionEnded({ mandate: mandate(), now: NOW, reason: "x" })
    ).resolves.toBeUndefined();
    // The dunning event is emitted from the same awaited billing path, so it
    // needs the same guarantee — a dead collector must not abort a debit.
    await expect(
      service.trackSubscriptionPastDue({
        mandate: mandate(),
        txn: txn({ status: "failed" }),
        graceUntil: NOW,
      })
    ).resolves.toBeUndefined();
  });
});

describe("the paywall variant dimension", () => {
  let service: PaymentAnalyticsService;

  const registerPaywall = (
    resolve: (userId: string | undefined) => Promise<string>
  ): void => {
    registerGlobalService("paywall", {
      resolvePaywallIdForUser: resolve,
    } as unknown as IPaywallApi);
  };

  beforeEach(() => {
    send.mockClear();
    send.mockResolvedValue(undefined);
    clearGlobalServices();
    service = new PaymentAnalyticsService();
  });

  afterEach(() => {
    clearGlobalServices();
  });

  it("stamps the assigned paywall on both purchase events", async () => {
    // The point of the whole change: a conversion has to be attributable to the
    // screen that produced it, and both ends of the trial funnel must carry the
    // SAME dimension or the arm cannot be followed through.
    registerPaywall(() => Promise.resolve("vip-icon-grid-v1"));

    await service.trackTrialSuccess({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit(),
      now: NOW,
    });
    const trial = sent().event_properties?.paywall_id;
    await service.trackSubscriptionStarted({
      mandate: mandate(),
      isFirstFullPricePayment: true,
    });

    expect(trial).toBe("vip-icon-grid-v1");
    expect(sent().event_properties?.paywall_id).toBe("vip-icon-grid-v1");
  });

  it("still reports the revenue when the paywall module is down", async () => {
    // Fails soft, deliberately: an unresolvable dimension costs us the dimension,
    // never the event. `null` is dropped at ingest, so the row simply has no
    // `paywall_id` rather than a wrong one.
    registerPaywall(() => Promise.reject(new Error("boom")));

    await service.trackSubscriptionStarted({
      mandate: mandate(),
      isFirstFullPricePayment: true,
    });

    expect(sent().event_type).toBe("bk_subscription_started");
    expect(sent().event_properties?.paywall_id).toBeNull();
  });
});

describe("trackTrialDepositDeclined (TAM-188)", () => {
  const declined = (over: { failureCode?: string | null } = {}) =>
    service.trackTrialDepositDeclined({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit({ status: "submitted" }),
      gatewayPaymentId: "pay_A",
      failureCode: over.failureCode ?? "BAD_REQUEST_ERROR",
      failureReason: "payment_failed",
    });

  it("reports bk_trial_failed as a non-terminal decline", async () => {
    await declined();

    const event = sent();
    expect(event.event_type).toBe("bk_trial_failed");
    expect(event.event_properties).toMatchObject({
      type: "trial",
      payment_type: "initial_deposit",
      outcome: "declined",
      recoverable: true,
      gateway_payment_id: "pay_A",
      failure_code: "BAD_REQUEST_ERROR",
      failure_reason: "payment_failed",
    });
  });

  it("keys insert_id on the gateway payment, so each declined try is its own row", async () => {
    await declined();
    const first = sent().insert_id;
    await service.trackTrialDepositDeclined({
      mandate: mandate({ trialEndsAt: TRIAL_END }),
      txn: deposit({ status: "submitted" }),
      gatewayPaymentId: "pay_B",
      failureCode: null,
      failureReason: null,
    });

    expect(first).toBe("bk_trial_failed:dep-1:pay_A");
    expect(sent().insert_id).toBe("bk_trial_failed:dep-1:pay_B");
  });

  it("sends no consolidated revenue row — nothing is terminal yet", async () => {
    await declined();

    expect(sentBatch().map((e) => e.event_type)).toEqual(["bk_trial_failed"]);
  });
});
