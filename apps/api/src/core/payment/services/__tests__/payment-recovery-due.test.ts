import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  analyticsEventsClient,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { FAILURE_SUB_CODE } from "@api/core/payment/failure-sub-code.js";
import { PaymentAnalyticsService } from "../payment-analytics.service.js";
import type { MandateRow } from "../../repositories/mandate.repository.js";
import type { TransactionRow } from "../../repositories/transactions.repository.js";

/**
 * WHO WE ARE ALLOWED TO TELL TO TOP UP (TAM-186, Lever A).
 *
 * The gate on an unsolicited push notification to a real person who has no
 * per-notification way to opt out. The zero-send cases are the point of this
 * file: sending is easy to get right and easy to test, NOT sending is what
 * protects the ~8.5% whose failure had nothing to do with their balance.
 *
 * Every "sends nothing" assertion below is demonstrated non-vacuous by the
 * first test, which drives the identical harness and asserts exactly one send.
 */
const send = vi.spyOn(analyticsEventsClient, "send");
const service = new PaymentAnalyticsService();

const sentRecoveries = (): AnalyticsEventInput[] =>
  send.mock.calls
    .flatMap((call) => call[0] ?? [])
    .filter((e) => e.event_type === "bk_payment_recovery_due");

const GRACE_END = new Date("2026-09-29T18:29:59.999Z");

const mandate = (over: Partial<MandateRow> = {}): MandateRow =>
  ({
    id: "mnd-1",
    userId: "usr-1",
    amountPaise: 29900,
    currency: "INR",
    frequency: "MONTHLY",
    provider: "razorpay",
    planId: "month",
    productId: "prabhuji_vip_month",
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    nextDebitDate: new Date("2026-10-01T00:00:00.000Z"),
    trialEndsAt: null,
    ...over,
  }) as MandateRow;

const txn = (over: Partial<TransactionRow> = {}): TransactionRow =>
  ({
    id: "txn-1",
    kind: "recurring_debit",
    status: "failed",
    amountPaise: 29900,
    currency: "INR",
    retryCount: 0,
    cycleDate: new Date("2026-09-22T00:00:00.000Z"),
    gatewayPaymentId: null,
    failureCode: "GATEWAY_ERROR",
    failureMessage: "Insufficient balance in your account.",
    failureSubCode: FAILURE_SUB_CODE.INSUFFICIENT_FUNDS,
    ...over,
  }) as TransactionRow;

const call = (over: {
  subCode?: string | null;
  population?: "renewal" | "first_debit";
  accessEndsAt?: Date | null;
  txn?: TransactionRow;
}) =>
  service.trackPaymentRecoveryDue({
    mandate: mandate(),
    txn: over.txn ?? txn(),
    population: over.population ?? "renewal",
    accessEndsAt: over.accessEndsAt === undefined ? GRACE_END : over.accessEndsAt,
    failureSubCode:
      over.subCode === undefined ? FAILURE_SUB_CODE.INSUFFICIENT_FUNDS : over.subCode,
  });

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
});

describe("AC43 — only insufficient balance is messaged", () => {
  test("insufficient balance sends exactly one", async () => {
    await call({});
    expect(sentRecoveries()).toHaveLength(1);
  });

  test.each([
    FAILURE_SUB_CODE.USER_DID_NOT_APPROVE,
    FAILURE_SUB_CODE.ACCOUNT_NOT_PERMITTED,
    FAILURE_SUB_CODE.BANK_OR_GATEWAY_ERROR,
    FAILURE_SUB_CODE.PDN_ABANDONED,
    FAILURE_SUB_CODE.UNCLASSIFIED,
  ])("%s sends NOTHING", async (subCode) => {
    await call({ subCode });
    expect(sentRecoveries()).toHaveLength(0);
  });

  test("a row predating the sub-code column sends NOTHING", async () => {
    // Rows written before the column shipped are NULL for good — history is not
    // backfilled. "We do not know why this failed" must never authorise advice
    // about a bank balance.
    await call({ subCode: null });
    expect(sentRecoveries()).toHaveLength(0);
  });
});

describe("AC44 — one message per cycle, not per presentation", () => {
  test("three presentations of the SAME cycle collapse to one key", async () => {
    // `bk_subscription_past_due` keys on (attempt, retryCount) and so fires
    // once per presentation — right for a dunning metric, wrong for a message.
    for (const retryCount of [0, 1, 2]) {
      await call({ txn: txn({ id: `txn-${retryCount}`, retryCount }) });
    }
    const ids = new Set(sentRecoveries().map((e) => e.insert_id));
    expect(sentRecoveries()).toHaveLength(3);
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe("bk_payment_recovery_due:mnd-1:2026-09-22");
  });

  test("a re-armed cycle is deliberately a NEW ask", async () => {
    // Tomorrow's cycle carries a new `cycleDate`. A day has passed and the
    // balance may genuinely have changed, so asking again is the point.
    await call({ txn: txn({ cycleDate: new Date("2026-09-22T00:00:00.000Z") }) });
    await call({ txn: txn({ cycleDate: new Date("2026-09-23T00:00:00.000Z") }) });
    const ids = new Set(sentRecoveries().map((e) => e.insert_id));
    expect(ids.size).toBe(2);
  });
});

describe("AC42 — the two populations carry different promises", () => {
  test("a renewal promises the grace window it actually has", async () => {
    await call({ population: "renewal", accessEndsAt: GRACE_END });
    const [event] = sentRecoveries();
    expect(event.event_properties).toMatchObject({
      population: "renewal",
      access_ends_at: GRACE_END.toISOString(),
    });
  });

  test("a first debit reports the trial end, because it gets NO grace", async () => {
    const trialEnd = new Date("2026-09-23T18:29:59.999Z");
    await call({ population: "first_debit", accessEndsAt: trialEnd });
    const [event] = sentRecoveries();
    expect(event.event_properties).toMatchObject({
      population: "first_debit",
      access_ends_at: trialEnd.toISOString(),
    });
  });

  test("no deadline is invented when there is none to report", async () => {
    // The copy must then not mention one at all.
    await call({ population: "first_debit", accessEndsAt: null });
    expect(sentRecoveries()[0].event_properties).toMatchObject({
      access_ends_at: null,
    });
  });
});
