import { beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import type * as LogsModule from "@api/shared/logs";
import { CALLBACK_KIND, type CallbackKind } from "@api/core/payment/constants.js";
import type { CallbackRef } from "@api/core/payment/types";
import type {
  IngestOutcome,
  WebhookEventRepository,
  WebhookEventRow,
} from "../../repositories/webhook-event.repository.js";
import type { MandateRepository, MandateRow } from "../../repositories/mandate.repository.js";
import type { TransactionsRepository } from "../../repositories/transactions.repository.js";
import type { PdnRow } from "../../repositories/pdn.repository.js";
import type { BillingCycleService } from "../billing-cycle.service.js";
import type { MandateService } from "../mandate.service.js";
import type { PdnService } from "../pdn.service.js";
import { razorpayGateway } from "../../providers/razorpay.gateway.js";
import { cashfreeGateway } from "../../providers/cashfree.gateway.js";
import { paymentLedgerAnalytics } from "../payment-ledger-analytics.service.js";
import {
  CallbackService,
  buildDedupeKey,
  callbackTxnIdFromDedupeKey,
  extractRef,
  storedCallbackFromRow,
  type CallbackInput,
  type StoredCallback,
} from "../callback.service.js";

/**
 * TAM-260 Task 4: `ingest` split into `record` (INSERT + dedupe) and `process`
 * (the post-dedupe body, moved verbatim).
 *
 * The behaviour-preservation proof for the inline path is the EXISTING suites
 * (`callback-settlement.integration.test.ts`, the controller test), which run
 * unchanged. This file pins the two halves on their own — above all that
 * `process` runs from a stored `webhook_events` row with no body, headers or
 * request in hand, which is what the deferred worker will do.
 */

const emitted = vi.hoisted((): Array<{ level: string; obj: Record<string, unknown> }> => []);
vi.mock("@api/shared/logs", async (importOriginal) => {
  const actual = await importOriginal<typeof LogsModule>();
  const record =
    (level: string) =>
    (obj: unknown): void => {
      emitted.push({
        level,
        obj: typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>) : {},
      });
    };
  const logger = {
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    debug: record("debug"),
    child: () => logger,
  };
  return { ...actual, createModuleLogger: () => logger };
});

function loggedEvents(): string[] {
  return emitted.map((e) => String(e.obj.event));
}

function logged(event: string): Record<string, unknown> | undefined {
  return emitted.find((e) => e.obj.event === event)?.obj;
}

const NOW = new Date("2026-09-24T09:30:00.000Z");
const WEBHOOK_ID = "whe-1";

function mandateRow(overrides: Partial<MandateRow> = {}): MandateRow {
  return {
    id: "mnd-1",
    userId: "usr-1",
    provider: "razorpay",
    referenceId: "pj_mnd_1",
    ...overrides,
  } as MandateRow;
}

function pdnRow(overrides: Partial<PdnRow> = {}): PdnRow {
  return {
    id: "pdn-1",
    mandateId: "mnd-1",
    userId: "usr-1",
    referenceId: "pj_pdn_1",
    presentationSequenceId: "order_1",
    ...overrides,
  } as PdnRow;
}

/** The `webhook_events` row as the repository INSERT returns it. */
function insertedRow(input: Parameters<WebhookEventRepository["ingest"]>[0]): WebhookEventRow {
  return {
    id: WEBHOOK_ID,
    provider: input.provider,
    kind: input.kind,
    eventType: input.eventType,
    dedupeKey: input.dedupeKey,
    referenceId: input.referenceId,
    providerMandateId: input.providerMandateId,
    presentationSequenceId: input.presentationSequenceId,
    callbackAttempt: input.callbackAttempt,
    status: "received",
    relatedMandateId: null,
    relatedPdnId: null,
    relatedTransactionId: null,
    receivedAt: NOW,
    processedAt: null,
    errorMessage: null,
  };
}

function harness() {
  const events = {
    ingest: vi.fn(
      (input: Parameters<WebhookEventRepository["ingest"]>[0]): Promise<IngestOutcome> =>
        Promise.resolve({ kind: "accepted", row: insertedRow(input) })
    ),
    // `true` = the (fenced) write landed; an unfenced mark always resolves true.
    markProcessed: vi.fn<(...args: unknown[]) => Promise<boolean>>(() => Promise.resolve(true)),
    markIgnoredUnknown: vi.fn<(...args: unknown[]) => Promise<boolean>>(() => Promise.resolve(true)),
    markFailed: vi.fn<(...args: unknown[]) => Promise<boolean>>(() => Promise.resolve(true)),
  };
  const mandates = {
    findById: vi.fn((): Promise<MandateRow | null> => Promise.resolve(mandateRow())),
    findByReferenceId: vi.fn((): Promise<MandateRow | null> => Promise.resolve(mandateRow())),
    findByProviderMandateId: vi.fn((): Promise<MandateRow | null> => Promise.resolve(null)),
  };
  const transactions = {
    findLatestSubmittedForMandate: vi.fn(() => Promise.resolve(null)),
    findLatestRecurringDebitForMandate: vi.fn(() => Promise.resolve(null)),
  };
  const mandateService = { refreshFromProvider: vi.fn(() => Promise.resolve()) };
  const billing = { resolvePayment: vi.fn(() => Promise.resolve(true)) };
  const pdnService = {
    findForCallback: vi.fn((): Promise<PdnRow | null> => Promise.resolve(pdnRow())),
    recordNotificationDelivered: vi.fn(() => Promise.resolve()),
    refreshFromProvider: vi.fn(() => Promise.resolve()),
  };
  const service = new CallbackService(
    events as unknown as WebhookEventRepository,
    mandates as unknown as MandateRepository,
    transactions as unknown as TransactionsRepository,
    mandateService as unknown as MandateService,
    billing as unknown as BillingCycleService,
    pdnService as unknown as PdnService
  );
  return { service, events, mandates, transactions, mandateService, billing, pdnService };
}

/** Everything that talks to a mandate, a notification or a provider. */
function resolutionCalls(h: ReturnType<typeof harness>): number {
  return (
    h.mandates.findById.mock.calls.length +
    h.mandates.findByReferenceId.mock.calls.length +
    h.mandates.findByProviderMandateId.mock.calls.length +
    h.pdnService.findForCallback.mock.calls.length +
    h.pdnService.refreshFromProvider.mock.calls.length +
    h.mandateService.refreshFromProvider.mock.calls.length +
    h.billing.resolvePayment.mock.calls.length
  );
}

function stored(overrides: Partial<StoredCallback> = {}): StoredCallback {
  return {
    id: WEBHOOK_ID,
    provider: "razorpay",
    kind: CALLBACK_KIND.PRESENTATION,
    dedupeKey: "presentation:payment.failed:pay_1",
    referenceId: "pj_mnd_1",
    providerMandateId: "cust_1:token_1",
    presentationSequenceId: "order_1",
    callbackTxnId: "payment.failed:pay_1",
    callbackAttempt: null,
    notificationDeliveredAt: null,
    // Inline (what `record` hands `process`): no claim, no fence.
    claimAttempt: null,
    ...overrides,
  };
}

// ---- fixtures: one real body per gateway, extracted by the real gateway ------

const RP_REF = "pj_mnd_60d484c7-1111-2222-3333-444455556666";

function razorpayPaymentFailed(): Record<string, unknown> {
  return {
    event: "payment.failed",
    created_at: 1790000000,
    payload: {
      payment: {
        entity: {
          id: "pay_EAm09NKReXi2e0",
          customer_id: "cust_4xbQrmEoA5WJ01",
          token_id: "token_M7K2eFBU7vToaQ",
          order_id: "order_1Aa00000000002",
          status: "failed",
          email: "payer@example.com",
          contact: "+919999999999",
          vpa: "payer@upi",
          notes: { prabhuji_reference_id: RP_REF },
        },
      },
    },
  };
}

function razorpayNotificationDelivered(): Record<string, unknown> {
  return {
    event: "order.notification.delivered",
    created_at: 1790000123,
    payload: {
      notification: {
        entity: {
          id: "notif_1",
          order_id: "order_1Aa00000000002",
          token_id: "token_M7K2eFBU7vToaQ",
        },
      },
    },
  };
}

function decentroPresentation(opts: { withTxnId: boolean }): Record<string, unknown> {
  return {
    reference_id: "pj_mnd_decentro_1",
    decentro_mandate_id: "DCMND1",
    presentation_sequence_id: "SEQ1",
    transaction_status: "SUCCESS",
    callback_attempt: 2,
    payer_vpa: "payer@upi",
    ...(opts.withTxnId ? { callback_txn_id: "DCTXN1" } : {}),
  };
}

function cashfreePayment(): Record<string, unknown> {
  return {
    type: "SUBSCRIPTION_PAYMENT_SUCCESS",
    data: {
      payment: { cf_payment_id: "cfpay_1", payment_status: "SUCCESS" },
      subscription_details: {
        subscription_id: "pj_mnd_cf_1",
        cf_subscription_id: "cfsub_1",
      },
      customer_details: { customer_email: "payer@example.com", customer_phone: "9999999999" },
    },
  };
}

interface Case {
  name: string;
  provider: CallbackInput["provider"];
  kind: CallbackKind;
  body: Record<string, unknown>;
  ref: CallbackRef;
}

const CASES: Case[] = [
  {
    name: "razorpay payment.failed",
    provider: "razorpay",
    kind: CALLBACK_KIND.PRESENTATION,
    body: razorpayPaymentFailed(),
    ref: razorpayGateway.extractRef(CALLBACK_KIND.PRESENTATION, razorpayPaymentFailed()),
  },
  {
    name: "razorpay order.notification.delivered",
    provider: "razorpay",
    kind: CALLBACK_KIND.PDN,
    body: razorpayNotificationDelivered(),
    ref: razorpayGateway.extractRef(CALLBACK_KIND.PDN, razorpayNotificationDelivered()),
  },
  {
    name: "decentro presentation with callback_txn_id",
    provider: "decentro",
    kind: CALLBACK_KIND.PRESENTATION,
    body: decentroPresentation({ withTxnId: true }),
    ref: extractRef(CALLBACK_KIND.PRESENTATION, decentroPresentation({ withTxnId: true })),
  },
  {
    name: "decentro presentation WITHOUT callback_txn_id (hashed dedupe key)",
    provider: "decentro",
    kind: CALLBACK_KIND.PRESENTATION,
    body: decentroPresentation({ withTxnId: false }),
    ref: extractRef(CALLBACK_KIND.PRESENTATION, decentroPresentation({ withTxnId: false })),
  },
  {
    name: "cashfree payment",
    provider: "cashfree",
    kind: CALLBACK_KIND.PRESENTATION,
    body: cashfreePayment(),
    ref: cashfreeGateway.extractRef(CALLBACK_KIND.PRESENTATION, cashfreePayment()),
  },
];

function inputOf(c: Case): CallbackInput {
  return { provider: c.provider, kind: c.kind, ref: c.ref, body: c.body, sourceIp: "10.0.0.1" };
}

let trackWebhookReceived: MockInstance<typeof paymentLedgerAnalytics.trackWebhookReceived>;

beforeEach(() => {
  emitted.length = 0;
  vi.restoreAllMocks();
  trackWebhookReceived = vi
    .spyOn(paymentLedgerAnalytics, "trackWebhookReceived")
    .mockResolvedValue(undefined);
});

// ---- record -----------------------------------------------------------------

describe("record", () => {
  test("INSERTs the callback and returns the stored callback, resolving nothing", async () => {
    const h = harness();
    const c = CASES[0];

    const outcome = await h.service.record(inputOf(c));

    expect(h.events.ingest).toHaveBeenCalledTimes(1);
    expect(h.events.ingest.mock.calls[0]?.[0]).toMatchObject({
      provider: "razorpay",
      kind: CALLBACK_KIND.PRESENTATION,
      eventType: null,
      dedupeKey: buildDedupeKey(c.kind, c.ref, c.body),
      referenceId: RP_REF,
      providerMandateId: c.ref.providerMandateId,
      presentationSequenceId: "order_1Aa00000000002",
      callbackAttempt: null,
      sourceIp: "10.0.0.1",
    });
    expect(outcome).toEqual({
      kind: "accepted",
      event: {
        id: WEBHOOK_ID,
        provider: "razorpay",
        kind: CALLBACK_KIND.PRESENTATION,
        dedupeKey: "presentation:payment.failed:pay_EAm09NKReXi2e0",
        referenceId: RP_REF,
        providerMandateId: c.ref.providerMandateId,
        presentationSequenceId: "order_1Aa00000000002",
        callbackTxnId: "payment.failed:pay_EAm09NKReXi2e0",
        callbackAttempt: null,
        notificationDeliveredAt: null,
        claimAttempt: null,
      },
    });
    // The durable half ONLY: no lookup, no provider read, no terminal stamp.
    expect(resolutionCalls(h)).toBe(0);
    expect(h.events.markProcessed).not.toHaveBeenCalled();
    expect(h.events.markIgnoredUnknown).not.toHaveBeenCalled();
    expect(h.events.markFailed).not.toHaveBeenCalled();
    expect(loggedEvents()).toEqual([]);
  });

  test("carries the delivery instant of order.notification.delivered", async () => {
    const h = harness();
    const outcome = await h.service.record(inputOf(CASES[1]));
    expect(outcome.kind).toBe("accepted");
    expect(outcome.kind === "accepted" && outcome.event.notificationDeliveredAt).toEqual(
      new Date(1790000123 * 1000)
    );
    expect(h.events.ingest.mock.calls[0]?.[0]?.notificationDeliveredAt).toEqual(
      new Date(1790000123 * 1000)
    );
  });

  test("an Invalid Date delivery instant is persisted as NULL but still handed to processing", async () => {
    const h = harness();
    const base = inputOf(CASES[1]);
    const input = { ...base, ref: { ...base.ref, notificationDeliveredAt: new Date(Number.NaN) } };
    const outcome = await h.service.record(input);
    expect(h.events.ingest.mock.calls[0]?.[0]?.notificationDeliveredAt).toBeNull();
    expect(outcome.kind === "accepted" && outcome.event.notificationDeliveredAt?.getTime()).toBeNaN();
  });

  test("a delivery instant Postgres cannot store (before year 1) is persisted as NULL", async () => {
    const h = harness();
    const base = inputOf(CASES[1]);
    const ancient = new Date("-000100-01-01T00:00:00Z"); // 101 BC: a valid JS Date
    const input = { ...base, ref: { ...base.ref, notificationDeliveredAt: ancient } };
    const outcome = await h.service.record(input);
    expect(h.events.ingest.mock.calls[0]?.[0]?.notificationDeliveredAt).toBeNull();
    expect(outcome.kind === "accepted" && outcome.event.notificationDeliveredAt).toBe(ancient);
  });

  test("a redelivery is reported duplicate, logged callback_duplicate, and nothing else runs", async () => {
    const h = harness();
    h.events.ingest.mockResolvedValueOnce({ kind: "duplicate" });
    const c = CASES[2];

    const outcome = await h.service.record(inputOf(c));

    expect(outcome).toEqual({ kind: "duplicate" });
    expect(loggedEvents()).toEqual(["callback_duplicate"]);
    expect(logged("callback_duplicate")).toMatchObject({
      provider: "decentro",
      reference_id: "pj_mnd_decentro_1",
      kind: CALLBACK_KIND.PRESENTATION,
      dedupe_key: "presentation:DCTXN1",
      presentation_sequence_id: "SEQ1",
      callback_attempt: 2,
    });
    expect(resolutionCalls(h)).toBe(0);
  });

  test("an INSERT failure propagates — nothing was recorded, so nothing may be acked", async () => {
    const h = harness();
    h.events.ingest.mockRejectedValueOnce(new Error("db down"));
    await expect(h.service.record(inputOf(CASES[0]))).rejects.toThrow("db down");
    expect(resolutionCalls(h)).toBe(0);
  });

  test("the stored payload is redacted exactly as before", async () => {
    const h = harness();
    await h.service.record(inputOf(CASES[2]));
    const payload = h.events.ingest.mock.calls[0]?.[0].payload as Record<string, unknown>;
    expect(payload.payer_vpa).toBe("[redacted]");
    expect(payload.reference_id).toBe("pj_mnd_decentro_1");
  });
});

// ---- process, driven from a stored row --------------------------------------

describe("process from a stored row (no body, no headers, no request)", () => {
  test("a presentation settles through resolvePayment and marks the row processed", async () => {
    const h = harness();
    h.transactions.findLatestSubmittedForMandate.mockResolvedValueOnce({ id: "txn-1" } as never);

    const result = await h.service.process(stored(), NOW);

    expect(result).toBe("processed");
    expect(h.mandates.findByReferenceId).toHaveBeenCalledWith("pj_mnd_1");
    expect(h.billing.resolvePayment).toHaveBeenCalledWith({ id: "txn-1" }, NOW, "webhook");
    expect(h.events.markProcessed).toHaveBeenCalledWith(WEBHOOK_ID, NOW, {
      mandateId: "mnd-1",
      pdnId: null,
    });
    expect(loggedEvents()).toEqual(["callback_processed"]);
    expect(logged("callback_processed")).toMatchObject({
      provider: "razorpay",
      kind: CALLBACK_KIND.PRESENTATION,
      webhook_event_id: WEBHOOK_ID,
      callback_attempt: null,
    });
    await vi.waitFor(() =>
      expect(trackWebhookReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookEventId: WEBHOOK_ID,
          callbackKind: CALLBACK_KIND.PRESENTATION,
          outcome: "processed",
          pdnId: null,
        })
      )
    );
  });

  test("a PDN confirmation applies the STORED delivery instant, then re-reads the provider", async () => {
    const h = harness();
    const deliveredAt = new Date("2026-09-24T08:00:00.000Z");
    const row = storedCallbackFromRow({
      id: WEBHOOK_ID,
      provider: "razorpay",
      kind: CALLBACK_KIND.PDN,
      dedupeKey: "pdn:order.notification.delivered:notif_1",
      referenceId: null,
      providerMandateId: "cust_1:token_1",
      presentationSequenceId: "order_1",
      callbackAttempt: null,
      notificationDeliveredAt: deliveredAt,
      attempts: 1,
    });
    expect(row).not.toBeNull();

    const result = await h.service.process(row!, NOW);

    expect(result).toBe("processed");
    expect(h.pdnService.findForCallback).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: null, presentationSequenceId: "order_1" })
    );
    expect(h.mandates.findById).toHaveBeenCalledWith("mnd-1");
    expect(h.pdnService.recordNotificationDelivered).toHaveBeenCalledWith(
      pdnRow(),
      "razorpay",
      deliveredAt
    );
    expect(h.pdnService.refreshFromProvider).toHaveBeenCalledWith(pdnRow(), NOW, "webhook");
    expect(
      h.pdnService.recordNotificationDelivered.mock.invocationCallOrder[0]
    ).toBeLessThan(h.pdnService.refreshFromProvider.mock.invocationCallOrder[0]);
    // Rebuilt from a claimed row: the terminal mark is fenced to that claim.
    expect(h.events.markProcessed).toHaveBeenCalledWith(
      WEBHOOK_ID,
      NOW,
      { mandateId: "mnd-1", pdnId: "pdn-1" },
      { attempt: 1 }
    );
  });

  test("a mandate callback refreshes the mandate from the provider", async () => {
    const h = harness();
    const result = await h.service.process(stored({ kind: CALLBACK_KIND.MANDATE }), NOW);
    expect(result).toBe("processed");
    expect(h.mandateService.refreshFromProvider).toHaveBeenCalledWith(mandateRow(), NOW, "webhook");
    expect(h.billing.resolvePayment).not.toHaveBeenCalled();
  });

  test("an unknown reference (the sibling-app Decentro traffic) is marked ignored and nothing else runs", async () => {
    const h = harness();
    h.mandates.findByReferenceId.mockResolvedValueOnce(null);
    h.mandates.findByProviderMandateId.mockResolvedValueOnce(null);
    const row = storedCallbackFromRow({
      id: WEBHOOK_ID,
      provider: "decentro",
      kind: CALLBACK_KIND.PRESENTATION,
      dedupeKey: "presentation:DCTXN_SIBLING",
      referenceId: "sibling_ref",
      providerMandateId: "DCMND_SIBLING",
      presentationSequenceId: "SEQ_SIBLING",
      callbackAttempt: 1,
      notificationDeliveredAt: null,
      attempts: 1,
    })!;

    const result = await h.service.process(row, NOW);

    expect(result).toBe("unknown_reference");
    expect(h.events.markIgnoredUnknown).toHaveBeenCalledWith(WEBHOOK_ID, NOW, { attempt: 1 });
    expect(h.events.markProcessed).not.toHaveBeenCalled();
    expect(h.mandateService.refreshFromProvider).not.toHaveBeenCalled();
    expect(h.billing.resolvePayment).not.toHaveBeenCalled();
    expect(trackWebhookReceived).not.toHaveBeenCalled();
    expect(loggedEvents()).toEqual(["callback_unknown_reference"]);
    // `callback_txn_id` survives the round trip through `dedupe_key`.
    expect(logged("callback_unknown_reference")).toMatchObject({
      provider: "decentro",
      reference_id: "sibling_ref",
      kind: CALLBACK_KIND.PRESENTATION,
      provider_mandate_id: "DCMND_SIBLING",
      presentation_sequence_id: "SEQ_SIBLING",
      callback_txn_id: "DCTXN_SIBLING",
    });
  });

  test("a mandate belonging to another gateway is ignored", async () => {
    const h = harness();
    h.mandates.findByReferenceId.mockResolvedValueOnce(mandateRow({ provider: "decentro" }));
    const result = await h.service.process(stored(), NOW);
    expect(result).toBe("unknown_reference");
    expect(h.events.markIgnoredUnknown).toHaveBeenCalledWith(WEBHOOK_ID, NOW);
    expect(h.billing.resolvePayment).not.toHaveBeenCalled();
    expect(loggedEvents()).toEqual(["callback_provider_mismatch"]);
  });

  test("a processing failure is recorded failed, swallowed, and reported", async () => {
    const h = harness();
    h.mandateService.refreshFromProvider.mockRejectedValueOnce(new Error("razorpay 503"));
    const result = await h.service.process(stored({ kind: CALLBACK_KIND.MANDATE }), NOW);
    expect(result).toBe("failed");
    expect(h.events.markFailed).toHaveBeenCalledWith(WEBHOOK_ID, "razorpay 503", NOW);
    expect(h.events.markProcessed).not.toHaveBeenCalled();
    expect(loggedEvents()).toEqual(["callback_processing_failed"]);
    expect(logged("callback_processing_failed")).toMatchObject({ webhook_event_id: WEBHOOK_ID });
    await vi.waitFor(() =>
      expect(trackWebhookReceived).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "failed" })
      )
    );
  });

  test("never re-INSERTs: process does not touch the dedupe ledger", async () => {
    const h = harness();
    await h.service.process(stored(), NOW);
    expect(h.events.ingest).not.toHaveBeenCalled();
  });
});

// ---- the row round trip -----------------------------------------------------

describe("storedCallbackFromRow", () => {
  test.each(CASES)(
    "$name: the row rebuilt from columns equals what record handed inline processing",
    async (c) => {
      const h = harness();
      const outcome = await h.service.record(inputOf(c));
      if (outcome.kind !== "accepted") throw new Error("expected accepted");

      // What a worker reads back: the INSERTed columns + the D1 column.
      const inserted = insertedRow(h.events.ingest.mock.calls[0][0]);
      const rebuilt = storedCallbackFromRow({
        ...inserted,
        notificationDeliveredAt: c.ref.notificationDeliveredAt,
        attempts: 1,
      });

      // Identical except the claim fence: inline holds no claim, the worker's
      // row carries the `attempts` its claim returned.
      expect(outcome.event.claimAttempt).toBeNull();
      expect(rebuilt).toEqual({ ...outcome.event, claimAttempt: 1 });
    }
  );

  test("returns null for a row this build cannot process", () => {
    const base = {
      id: WEBHOOK_ID,
      dedupeKey: "unroutable:acme:abc",
      referenceId: null,
      providerMandateId: null,
      presentationSequenceId: null,
      callbackAttempt: null,
      notificationDeliveredAt: null,
      attempts: 1,
    };
    expect(storedCallbackFromRow({ ...base, provider: "razorpay", kind: "unroutable" })).toBeNull();
    expect(
      storedCallbackFromRow({ ...base, provider: "acme", kind: CALLBACK_KIND.PRESENTATION })
    ).toBeNull();
  });
});

describe("callbackTxnIdFromDedupeKey", () => {
  test("recovers the txn id from a `<kind>:<txn id>` key", () => {
    expect(callbackTxnIdFromDedupeKey("presentation", "presentation:DCTXN1")).toBe("DCTXN1");
    expect(callbackTxnIdFromDedupeKey("pdn", "pdn:order.notification.delivered:notif_1")).toBe(
      "order.notification.delivered:notif_1"
    );
  });

  test("a hashed key means there was no txn id", () => {
    expect(callbackTxnIdFromDedupeKey("mandate", `mandate:sha256:${"a".repeat(64)}`)).toBeNull();
  });

  test("a key for another kind yields null rather than a wrong id", () => {
    expect(callbackTxnIdFromDedupeKey("mandate", "presentation:DCTXN1")).toBeNull();
  });
});

// ---- inline mode is exactly record + process --------------------------------

describe("ingest (inline mode)", () => {
  test("a duplicate returns before any resolution", async () => {
    const h = harness();
    h.events.ingest.mockResolvedValueOnce({ kind: "duplicate" });
    const result = await h.service.ingest({ ...inputOf(CASES[0]), now: NOW });
    expect(result).toBe("duplicate");
    expect(resolutionCalls(h)).toBe(0);
    expect(loggedEvents()).toEqual(["callback_duplicate"]);
  });

  test("an accepted callback is recorded then processed with the request's `now`", async () => {
    const h = harness();
    const result = await h.service.ingest({
      ...inputOf(CASES[0]),
      kind: CALLBACK_KIND.MANDATE,
      now: NOW,
    });
    expect(result).toBe("processed");
    expect(h.events.ingest).toHaveBeenCalledTimes(1);
    expect(h.mandates.findByReferenceId).toHaveBeenCalledWith(RP_REF);
    expect(h.events.markProcessed).toHaveBeenCalledWith(WEBHOOK_ID, NOW, {
      mandateId: "mnd-1",
      pdnId: null,
    });
  });
});

// ---- terminal-mark fencing (TAM-260 B2) -------------------------------------

describe("terminal marks: inline unfenced, worker fenced to its claim", () => {
  /** The three terminal outcomes, each driven the same way inline and fenced. */
  const OUTCOMES = [
    {
      name: "processed",
      arrange: (): void => undefined,
      mark: "markProcessed" as const,
      result: "processed",
      args: [WEBHOOK_ID, NOW, { mandateId: "mnd-1", pdnId: null }],
      logs: ["callback_processed"],
      tracked: true,
    },
    {
      name: "ignored_unknown",
      arrange: (h: ReturnType<typeof harness>): void => {
        h.mandates.findByReferenceId.mockResolvedValueOnce(null);
      },
      mark: "markIgnoredUnknown" as const,
      result: "unknown_reference",
      args: [WEBHOOK_ID, NOW],
      logs: ["callback_unknown_reference"],
      tracked: false,
    },
    {
      name: "ignored_unknown (provider mismatch)",
      arrange: (h: ReturnType<typeof harness>): void => {
        h.mandates.findByReferenceId.mockResolvedValueOnce(mandateRow({ provider: "decentro" }));
      },
      mark: "markIgnoredUnknown" as const,
      result: "unknown_reference",
      args: [WEBHOOK_ID, NOW],
      logs: ["callback_provider_mismatch"],
      tracked: false,
    },
    {
      name: "failed",
      arrange: (h: ReturnType<typeof harness>): void => {
        h.mandateService.refreshFromProvider.mockRejectedValueOnce(new Error("razorpay 503"));
      },
      mark: "markFailed" as const,
      result: "failed",
      args: [WEBHOOK_ID, "razorpay 503", NOW],
      logs: ["callback_processing_failed"],
      tracked: true,
    },
  ];
  const MARKS = ["markProcessed", "markIgnoredUnknown", "markFailed"] as const;

  test.each(OUTCOMES)(
    "$name, INLINE: the mark gets exactly its pre-TAM-260 arguments (no fence argument at all)",
    async (o) => {
      const h = harness();
      o.arrange(h);
      const result = await h.service.process(stored({ kind: CALLBACK_KIND.MANDATE }), NOW);

      expect(result).toBe(o.result);
      expect(h.events[o.mark]).toHaveBeenCalledTimes(1);
      // `toStrictEqual` on the raw argument list: an extra trailing
      // `undefined` would fail this, so the arity is pinned too.
      expect(h.events[o.mark].mock.calls[0]).toStrictEqual(o.args);
      for (const m of MARKS) if (m !== o.mark) expect(h.events[m]).not.toHaveBeenCalled();
      expect(loggedEvents()).toEqual(o.logs);
    }
  );

  test("INLINE via ingest: markProcessed gets exactly (id, now, related)", async () => {
    const h = harness();
    await h.service.ingest({ ...inputOf(CASES[0]), kind: CALLBACK_KIND.MANDATE, now: NOW });
    expect(h.events.markProcessed.mock.calls).toStrictEqual([
      [WEBHOOK_ID, NOW, { mandateId: "mnd-1", pdnId: null }],
    ]);
  });

  test.each(OUTCOMES)(
    "$name, WORKER: the mark is fenced to the claim's attempt; nothing else changes",
    async (o) => {
      const h = harness();
      o.arrange(h);
      const result = await h.service.process(
        stored({ kind: CALLBACK_KIND.MANDATE, claimAttempt: 3 }),
        NOW
      );

      expect(result).toBe(o.result);
      expect(h.events[o.mark].mock.calls[0]).toStrictEqual([...o.args, { attempt: 3 }]);
      expect(loggedEvents()).toEqual(o.logs);
    }
  );

  test.each(OUTCOMES)(
    "$name, STALE claim: callback_stale_claim is logged, the result, logs and analytics are unchanged",
    async (o) => {
      const h = harness();
      o.arrange(h);
      h.events[o.mark].mockResolvedValueOnce(false);
      const result = await h.service.process(
        stored({ kind: CALLBACK_KIND.MANDATE, claimAttempt: 2 }),
        NOW
      );

      expect(result).toBe(o.result);
      // Additive: the stale warn, then exactly the lines the path always logs.
      expect(loggedEvents()).toEqual(["callback_stale_claim", ...o.logs]);
      expect(emitted.find((e) => e.obj.event === "callback_stale_claim")).toMatchObject({
        level: "warn",
        obj: { webhook_event_id: WEBHOOK_ID, attempt: 2, provider: "razorpay" },
      });
      if (o.tracked) {
        await vi.waitFor(() => expect(trackWebhookReceived).toHaveBeenCalledTimes(1));
      } else {
        expect(trackWebhookReceived).not.toHaveBeenCalled();
      }
    }
  );

  test("an inline mark that resolves false is NOT treated as stale (no fence was asked for)", async () => {
    const h = harness();
    h.events.markProcessed.mockResolvedValueOnce(false);
    const result = await h.service.process(stored({ kind: CALLBACK_KIND.MANDATE }), NOW);
    expect(result).toBe("processed");
    expect(loggedEvents()).toEqual(["callback_processed"]);
  });
});
