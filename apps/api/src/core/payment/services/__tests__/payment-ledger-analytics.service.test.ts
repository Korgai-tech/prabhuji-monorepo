import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MandateRow } from "@api/core/payment/repositories/mandate.repository.js";
import type { PdnRow } from "@api/core/payment/repositories/pdn.repository.js";
import type { TransactionRow } from "@api/core/payment/repositories/transactions.repository.js";
import { analyticsEventsClient, type AnalyticsEventInput } from "@api/shared/analytics";
import { PaymentLedgerAnalyticsService } from "../payment-ledger-analytics.service.js";

const send = vi.spyOn(analyticsEventsClient, "send");

const NOW = new Date("2026-08-01T10:00:00.000Z");

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
  status: "notified",
  chargePhase: "submission",
  cycleDate: new Date("2026-08-05T00:00:00.000Z"),
  isFirstDebit: false,
  attemptNo: 1,
  retryCount: 0,
  presentationSequenceId: "seq-1",
  pdnId: "pdn-1",
  gatewayPresentationRef: null,
  gatewayPaymentId: null,
  gatewayRequestId: "req-1",
  bankReferenceNumber: null,
  npciTransactionId: null,
  notifiedAt: NOW,
  submittedAt: null,
  settledAt: null,
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

const pdn = (over: Partial<PdnRow> = {}): PdnRow => ({
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
  ...over,
});

/** The single event the last `send()` carried — every ledger tracker sends exactly one. */
const sent = (): AnalyticsEventInput => {
  const batch = send.mock.calls.at(-1)?.[0] ?? [];
  expect(batch).toHaveLength(1);
  return batch[0];
};

const ledger = new PaymentLedgerAnalyticsService();

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
});

describe("PaymentLedgerAnalyticsService", () => {
  it("reports a mandate registration once per mandate, as an inline act", async () => {
    await ledger.trackMandateCreated({ mandate: mandate({ state: "pending" }) });

    const event = sent();
    expect(event.event_type).toBe("bk_mandate_created");
    expect(event.user_id).toBe("usr-1");
    expect(event.insert_id).toBe("bk_mandate_created:mnd-1");
    expect(event.event_properties).toMatchObject({
      mandate_id: "mnd-1",
      plan_id: "vip_monthly",
      status: "pending",
      source: "inline",
    });
  });

  it("keys a status change on the transition and its instant, so a later return to the same state is its own row", async () => {
    await ledger.trackMandateStatusChanged({
      mandate: mandate({ state: "revoked", stateReason: "user_cancelled" }),
      previousStatus: "active",
      source: "webhook",
      changedAt: NOW,
    });

    const event = sent();
    expect(event.event_type).toBe("bk_mandate_status");
    expect(event.insert_id).toBe(`bk_mandate_status:mnd-1:active:revoked:${NOW.toISOString()}`);
    expect(event.event_properties).toMatchObject({
      previous_status: "active",
      status: "revoked",
      status_reason: "user_cancelled",
      source: "webhook",
    });
  });

  it("omits keys it cannot populate instead of sending nulls the warehouse would drop", async () => {
    await ledger.trackMandateCreated({ mandate: mandate() });

    const properties = sent().event_properties ?? {};
    expect(Object.values(properties)).not.toContain(null);
    expect(properties).not.toHaveProperty("payment_id");
    expect(properties).not.toHaveProperty("trial_end_date");
  });

  it("describes a PDN from the notification alone when no mandate or ledger row is in hand", async () => {
    await ledger.trackPdnStatus({
      pdn: pdn(),
      provider: "decentro",
      status: "delivered",
      source: "webhook",
    });

    const event = sent();
    expect(event.event_type).toBe("bk_pdn_status");
    expect(event.user_id).toBe("usr-1");
    expect(event.insert_id).toBe("bk_pdn_status:pdn-1:delivered:pj_pdn_1");
    expect(event.event_properties).toMatchObject({
      mandate_id: "mnd-1",
      provider: "decentro",
      amount_paise: 29_900,
      cycle_date: "2026-08-05",
      pdn_id: "pdn-1",
      status: "delivered",
      source: "webhook",
    });
  });

  it("keys a PDN send on the rotated notification reference, so each re-armed send is its own row", async () => {
    await ledger.trackPdnSent({
      mandate: mandate(),
      txn: txn(),
      pdn: pdn({ attempts: 1 }),
      notificationRef: "pj_pdn_2",
      providerStatus: "sent",
      hasSequenceId: false,
      occurredAt: NOW,
    });

    const event = sent();
    expect(event.insert_id).toBe("bk_pdn_sent:pj_pdn_2");
    expect(event.event_properties).toMatchObject({ pdn_attempt: 2, has_sequence_id: false, source: "scheduler" });
  });

  it("keys a presentation on the ledger row and its per-attempt reference", async () => {
    await ledger.trackPaymentAttempted({
      mandate: mandate(),
      txn: txn(),
      presentationRef: "pj_prs_1",
      immediateResponse: "pending",
      occurredAt: NOW,
    });

    const event = sent();
    expect(event.event_type).toBe("bk_payment_attempted");
    expect(event.insert_id).toBe("bk_payment_attempted:txn-1:pj_prs_1");
    // Reported after settlement, so it is backdated to the presentation itself.
    expect(event.time).toBe(NOW.getTime());
    expect(event.event_properties).toMatchObject({ immediate_response: "pending", payment_id: "txn-1" });
  });

  it("gives every presentation of a re-presented row its own result", async () => {
    await ledger.trackPaymentResult({
      mandate: mandate(),
      txn: txn({ retryCount: 2 }),
      status: "failed",
      source: "poll",
      failureCode: "DEBIT_FAILED",
      failureReason: "insufficient balance",
    });

    const event = sent();
    expect(event.event_type).toBe("bk_payment_result");
    expect(event.insert_id).toBe("bk_payment_result:txn-1:2");
    expect(event.event_properties).toMatchObject({
      payment_status: "failed",
      failure_code: "DEBIT_FAILED",
      failure_reason: "insufficient balance",
      attempt_number: 3,
      source: "poll",
    });
  });

  it("reports a debit date write with its reason and the date it replaced", async () => {
    const previous = new Date("2026-08-05T00:00:00.000Z");
    await ledger.trackPaymentScheduled({
      txn: txn(),
      pdn: pdn(),
      reason: "provider_reported",
      scheduledFor: NOW,
      previousScheduledFor: previous,
      source: "poll",
    });

    const event = sent();
    expect(event.event_type).toBe("bk_payment_scheduled");
    expect(event.insert_id).toBe(`bk_payment_scheduled:txn-1:provider_reported:${NOW.toISOString()}`);
    expect(event.event_properties).toMatchObject({
      reason: "provider_reported",
      scheduled_for: NOW.toISOString(),
      previous_scheduled_for: previous.toISOString(),
      type: "subscription",
    });
  });

  it("reports a same-day retry without a retry instant, and a next-day retry with one", async () => {
    await ledger.trackPaymentRetryScheduled({ mandate: mandate(), txn: txn(), retryKind: "next_window" });
    expect(sent().event_properties).not.toHaveProperty("next_retry_at");

    await ledger.trackPaymentRetryScheduled({
      mandate: mandate(),
      txn: txn(),
      retryKind: "next_day",
      nextRetryAt: NOW,
    });
    expect(sent().event_properties).toMatchObject({ retry_kind: "next_day", next_retry_at: NOW.toISOString() });
  });

  it("reports a gateway refusal as a deferral of this presentation", async () => {
    await ledger.trackPaymentDeferred({
      mandate: mandate(),
      txn: txn({ retryCount: 1 }),
      reason: "PRESENTATION_WINDOW_CLOSED",
    });

    const event = sent();
    expect(event.event_type).toBe("bk_payment_deferred");
    expect(event.insert_id).toBe("bk_payment_deferred:txn-1:1");
    expect(event.event_properties).toMatchObject({ deferral_reason: "PRESENTATION_WINDOW_CLOSED" });
  });

  it("keys a webhook on the stored delivery, so a re-read of one callback collapses", async () => {
    await ledger.trackWebhookReceived({
      mandate: mandate(),
      webhookEventId: "wh-1",
      callbackKind: "presentation",
      outcome: "failed",
      processingMs: 40,
    });

    const event = sent();
    expect(event.event_type).toBe("bk_webhook_received");
    expect(event.insert_id).toBe("bk_webhook_received:wh-1");
    expect(event.event_properties).toMatchObject({
      callback_kind: "presentation",
      outcome: "failed",
      processing_ms: 40,
      source: "webhook",
    });
  });

  describe("attempt_number is on every ledger event", () => {
    it("is 1 on a registration — a retried registration is a new mandate", async () => {
      await ledger.trackMandateCreated({ mandate: mandate() });
      expect(sent().event_properties).toMatchObject({ attempt_number: 1 });
    });

    it("carries the caller-resolved latest attempt on a mandate-level event", async () => {
      await ledger.trackMandateStatusChanged({
        mandate: mandate(),
        previousStatus: "active",
        source: "poll",
        changedAt: NOW,
        attemptNumber: 3,
      });
      expect(sent().event_properties).toMatchObject({ attempt_number: 3 });

      await ledger.trackWebhookReceived({
        mandate: mandate(),
        webhookEventId: "wh-2",
        callbackKind: "mandate",
        outcome: "processed",
        processingMs: 5,
        attemptNumber: 2,
      });
      expect(sent().event_properties).toMatchObject({ attempt_number: 2 });
    });

    it("prefers the ledger row's own count when a row is in hand", async () => {
      await ledger.trackPdnStatus({
        pdn: pdn(),
        txn: txn({ retryCount: 1 }),
        status: "delivered",
        source: "webhook",
        attemptNumber: 9,
      });
      expect(sent().event_properties).toMatchObject({ attempt_number: 2 });
    });

    it("is omitted, not guessed, when a mandate has never had a cycle", async () => {
      await ledger.trackMandateStatusChanged({
        mandate: mandate(),
        previousStatus: "initiated",
        source: "poll",
        changedAt: NOW,
        attemptNumber: null,
      });
      expect(sent().event_properties).not.toHaveProperty("attempt_number");
    });
  });

  it("never lets a malformed input reach the billing path — even one that throws while the event is built", async () => {
    // An invalid Date makes `toISOString` throw a RangeError. Awaited, that would
    // surface in the billing path; `void`ed, it would be an unhandled rejection,
    // which Node treats as fatal. Neither may happen: the event is skipped.
    const invalid = new Date(Number.NaN);

    await expect(
      ledger.trackMandateStatusChanged({
        mandate: mandate(),
        previousStatus: "pending",
        source: "poll",
        changedAt: invalid,
      })
    ).resolves.toBeUndefined();
    await expect(
      ledger.trackPaymentScheduled({
        mandate: mandate(),
        txn: txn(),
        reason: "next_cycle",
        scheduledFor: invalid,
        source: "scheduler",
      })
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("never lets a collector failure reach the billing path", async () => {
    send.mockRejectedValueOnce(new Error("collector down"));

    await expect(ledger.trackMandateCreated({ mandate: mandate() })).resolves.toBeUndefined();
  });
});
