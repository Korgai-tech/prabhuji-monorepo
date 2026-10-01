import { describe, expect, test } from "vitest";
import {
  isoDay,
  moneyLog,
  paymentTrace,
  PAYMENT_STAGE,
  safeFailureMessage,
} from "../payment-log.js";
import type { TransactionRow } from "../../repositories/transactions.repository.js";
import type { MandateRow } from "../../repositories/mandate.repository.js";

/**
 * The money-log context.
 *
 * These assertions look small, and the reason they exist is not small: when
 * Cashfree began answering 404 to every debit in prod, the log line said
 * "pre-debit notification failed" and nothing else. The gateway's actual error,
 * the amount, the cycle and the reconciliation key were all reachable only by
 * opening psql against the production database.
 *
 * So what is pinned here is the CONTRACT of a money log line — the fields an
 * on-call engineer needs before they can start — plus the two rules that keep
 * it safe to ship: no payer PII, and no unbounded gateway text.
 */

const MANDATE = {
  id: "mnd-1",
  userId: "usr-1",
  provider: "cashfree",
  referenceId: "pj_mnd_ref",
} as unknown as MandateRow;

function txn(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "txn-1",
    userId: "usr-1",
    kind: "recurring_debit",
    provider: "cashfree",
    mandateId: "mnd-1",
    amountPaise: 29900,
    currency: "INR",
    status: "pending",
    chargePhase: "notification",
    cycleDate: new Date(Date.UTC(2026, 6, 30)),
    isFirstDebit: true,
    attemptNo: 1,
    retryCount: 0,
    presentationSequenceId: null,
    pdnId: null,
    gatewayPresentationRef: null,
    gatewayPaymentId: null,
    gatewayRequestId: "pj_pay_ref_2026-07-30",
    bankReferenceNumber: null,
    npciTransactionId: null,
    notifiedAt: null,
    submittedAt: null,
    settledAt: null,
    failurePhase: null,
    failureCode: null,
    failureMessage: null,
    failureSubCode: null,
    parentTransactionId: null,
    supersededAt: null,
    supersededByTransactionId: null,
    planId: "month",
    productId: "prabhuji_vip_month",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("moneyLog", () => {
  test("carries everything needed to diagnose without a database", () => {
    const ctx = moneyLog(MANDATE, txn(), PAYMENT_STAGE.settlement);

    // WHO, WHICH movement, WHICH billing day, HOW MUCH — the four questions
    // every payment incident opens with.
    expect(ctx.user_id).toBe("usr-1");
    expect(ctx.mandate_id).toBe("mnd-1");
    expect(ctx.transaction_id).toBe("txn-1");
    expect(ctx.cycle_date).toBe("2026-07-30");
    expect(ctx.amount_paise).toBe(29900);
    expect(ctx.currency).toBe("INR");

    // The two ids that mean different things: ours (ask the gateway with it)
    // and theirs (match a settlement report or a dispute with it).
    expect(ctx.gateway_request_id).toBe("pj_pay_ref_2026-07-30");
    expect(ctx.gateway_payment_id).toBeNull();

    // Decides retry-vs-re-register, so it must be visible at the moment of
    // failure rather than inferred afterwards.
    expect(ctx.is_first_debit).toBe(true);
    expect(ctx.attempt_no).toBe(1);
    expect(ctx.retry_count).toBe(0);

    // WHERE it happened. The one field that answers "where did it break"
    // without knowing every event name.
    expect(ctx.stage).toBe("settlement");
    // The join key to the gateway's world: HTTP clients and webhooks only ever
    // see this, the ledger only ever stores `mandate_id`. Both on every line is
    // what lets one grep follow a payment across the boundary.
    expect(ctx.reference_id).toBe("pj_mnd_ref");
  });

  test("never leaks payer identity", () => {
    // The mandate carries a masked VPA and name; neither may reach a log line,
    // masked or not. Asserted structurally so a future field addition to
    // `MoneyLogContext` cannot quietly bring one along.
    const ctx = moneyLog(MANDATE, txn(), PAYMENT_STAGE.settlement);
    const serialized = JSON.stringify(ctx);

    for (const forbidden of ["payer", "vpa", "phone", "handle", "email"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  test("a movement with no billing cycle reports null, not a fake date", () => {
    // The registration deposit has no cycle. A synthesized date here would make
    // it look like a debit for that day in every query.
    const ctx = moneyLog(MANDATE, txn({ kind: "initial_deposit", cycleDate: null }), PAYMENT_STAGE.registration);
    expect(ctx.cycle_date).toBeNull();
    expect(ctx.kind).toBe("initial_deposit");
  });
});

describe("paymentTrace", () => {
  test("fills every key from the mandate when one is in hand", () => {
    const ctx = paymentTrace({ stage: PAYMENT_STAGE.callback, mandate: MANDATE });
    expect(ctx).toEqual({
      stage: "callback",
      user_id: "usr-1",
      mandate_id: "mnd-1",
      reference_id: "pj_mnd_ref",
      transaction_id: null,
      pdn_id: null,
      provider: "cashfree",
    });
  });

  test("emits every key as null rather than omitting it when nothing is known", () => {
    // A callback that could not be routed knows only what the wire carried.
    // The keys must still be PRESENT so a dashboard filter on `mandate_id`
    // does not silently drop the exact lines an incident is looking for.
    const ctx = paymentTrace({ stage: PAYMENT_STAGE.callback, referenceId: "ref-x" });
    expect(Object.keys(ctx).sort()).toEqual(
      ["mandate_id", "pdn_id", "provider", "reference_id", "stage", "transaction_id", "user_id"]
    );
    expect(ctx.reference_id).toBe("ref-x");
    expect(ctx.user_id).toBeNull();
    expect(ctx.mandate_id).toBeNull();
  });

  test("explicit ids win over the mandate row", () => {
    // A recovery line talks about a REPLACEMENT transaction on the same mandate.
    const ctx = paymentTrace({
      stage: PAYMENT_STAGE.recovery,
      mandate: MANDATE,
      transactionId: "txn-9",
      pdnId: "pdn-4",
    });
    expect(ctx.transaction_id).toBe("txn-9");
    expect(ctx.pdn_id).toBe("pdn-4");
    expect(ctx.mandate_id).toBe("mnd-1");
  });
});

describe("safeFailureMessage", () => {
  test("keeps the gateway's message — the thing that was missing", () => {
    const msg = safeFailureMessage(
      new Error(
        "Cashfree POST /subscriptions/x/payments failed: 404 endpoint or method is not valid"
      )
    );
    // This exact string was the entire diagnosis of the prod outage.
    expect(msg).toContain("404");
    expect(msg).toContain("endpoint or method is not valid");
  });

  test("collapses newlines so one failure stays one log line", () => {
    expect(safeFailureMessage(new Error("line one\n  line two\n\tline three")))
      .toBe("line one line two line three");
  });

  test("truncates a wall of text", () => {
    // Some gateways answer errors with an HTML page. One of those per failed
    // cycle drowns every surrounding line in the viewer.
    const msg = safeFailureMessage(new Error("x".repeat(5000)));
    expect(msg.length).toBeLessThanOrEqual(301);
    expect(msg.endsWith("…")).toBe(true);
  });

  test("handles a non-Error without throwing", () => {
    expect(safeFailureMessage("plain string")).toBe("plain string");
    expect(safeFailureMessage(undefined)).toBe("unknown");
    expect(safeFailureMessage({ weird: true })).toBe("unknown");
  });
});

describe("isoDay", () => {
  test("formats as the day, matching how cycle_date is queried", () => {
    expect(isoDay(new Date(Date.UTC(2026, 6, 30)))).toBe("2026-07-30");
    expect(isoDay(null)).toBeNull();
  });
});

describe("PAYMENT_STAGE", () => {
  test("names every leg a payment can die in — the dashboard's stage filter", () => {
    // A dashboard's `stage` dropdown is built from this list. A leg that emits
    // lines under a value not here is invisible to "where did it break", so
    // adding one is a deliberate act that updates this list and the table in
    // docs/PAYMENT-FLOW.md together.
    expect(Object.values(PAYMENT_STAGE).sort()).toEqual(
      [
        "callback",
        "dunning",
        "gateway",
        "mandate",
        "pdn",
        "presentation",
        "recovery",
        "registration",
        "settlement",
      ].sort()
    );
  });
});
