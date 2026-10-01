import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { fakeSubscriptionApi } from "@api/shared/testing";
import { analyticsEventsClient } from "@api/shared/analytics";
import {
  BillingCycleService,
  FIRST_DEBIT_RETRY_DAYS,
  MAX_PRESENTATION_RETRIES,
  RENEWAL_RETRY_DAYS,
} from "../billing-cycle.service.js";
import { paymentAnalytics } from "../payment-analytics.service.js";
import { paymentLedgerAnalytics } from "../payment-ledger-analytics.service.js";
import { addDays } from "../npci-window.js";
import type { MandateService } from "../mandate.service.js";
import type { PdnService } from "../pdn.service.js";
import type {
  MandateRepository,
  MandateRow,
} from "../../repositories/mandate.repository.js";
import type {
  RecurringDebitRow,
  TransactionsRepository,
} from "../../repositories/transactions.repository.js";
import type { PdnRepository } from "../../repositories/pdn.repository.js";
import type { MandateProvider } from "../../mandate.provider.js";

/**
 * The settle guard in `onDebitFailed` (TAM-260).
 *
 * `onDebitSucceeded` has always returned early when `settle` reports it did not
 * move the row. `onDebitFailed` ignored that answer on both branches, and
 * `markForRetry` returned nothing to ignore — so when a webhook and the sweep
 * resolved the same `submitted` attempt concurrently, the LOSER re-armed the
 * mandate, started dunning again and re-sent every analytics event.
 *
 * Mocked deliberately: the question here is "given the ledger said no, did the
 * service touch anything else?", which is pure wiring. The race itself — that
 * Postgres really does hand exactly one caller `count > 0` — is proven against
 * real Postgres in `transactions.repository.integration.test.ts`, and the
 * end-to-end webhook-vs-sweep race in `callback-settlement.integration.test.ts`.
 *
 * Each branch is pinned both ways: the already-settled early return, and the
 * normal path, which must call exactly what it called before the guard.
 */

// The logger is faked at the module seam so the assertions read the exact
// objects `billing-cycle.service` passed it — the event names are a contract
// (alerts and dashboards filter on them).
const emitted = vi.hoisted((): Array<{ level: string; obj: Record<string, unknown> }> => []);
vi.mock("@api/shared/logs", () => {
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
  return { createModuleLogger: () => logger };
});

/** The `event` field of every line logged, in order. */
function loggedEvents(): string[] {
  return emitted.map((e) => String(e.obj.event));
}

/** A UTC-midnight `Date`, which is how IST calendar dates are stored. */
function istDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

/** An IST wall-clock reading as the absolute instant it names. */
function ist(y: number, m: number, d: number, hh: number, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60_000);
}

const DAY1 = istDay(2026, 7, 21);
const DAY3 = istDay(2026, 7, 23);
/** 14:00 IST on DAY3 — inside the 13:00–17:00 NPCI window. */
const NOW = ist(2026, 7, 23, 14);
/** Tomorrow, IST — where every re-arm lands. */
const TOMORROW = istDay(2026, 7, 24);

function mandateRow(overrides: Partial<MandateRow> = {}): MandateRow {
  return {
    id: "mnd-1",
    userId: "usr-1",
    type: "upi",
    provider: "stub",
    referenceId: "pj_mnd_abc",
    providerMandateId: "stub_mandate_1",
    providerTxnId: null,
    npciTransactionId: null,
    state: "active",
    stateReason: null,
    planId: "month",
    productId: "prabhuji_vip_month",
    amountPaise: 29_900,
    currency: "INR",
    frequency: "MONTHLY",
    amountRule: "MAX",
    ruleType: "BEFORE",
    ruleValue: 28,
    startDate: DAY1,
    endDate: addDays(DAY1, 365),
    nextDebitDate: DAY1,
    trialEndsAt: null,
    authUrl: null,
    providerCheckout: null,
    authExpiresAt: null,
    payerHandleMasked: null,
    payerNameMasked: null,
    lastPolledAt: null,
    createdAt: DAY1,
    updatedAt: DAY1,
    ...overrides,
  };
}

function submittedAttempt(overrides: Partial<RecurringDebitRow> = {}): RecurringDebitRow {
  return {
    id: "txn-1",
    userId: "usr-1",
    kind: "recurring_debit",
    provider: "stub",
    mandateId: "mnd-1",
    amountPaise: 29_900,
    currency: "INR",
    status: "submitted",
    chargePhase: "submission",
    cycleDate: DAY1,
    isFirstDebit: false,
    attemptNo: 1,
    retryCount: 1,
    presentationSequenceId: "stub_seq_1",
    pdnId: null,
    gatewayPaymentId: null,
    gatewayRequestId: null,
    gatewayPresentationRef: "pj_prs_1",
    bankReferenceNumber: null,
    npciTransactionId: null,
    notifiedAt: ist(2026, 7, 20, 9),
    submittedAt: ist(2026, 7, 21, 14),
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
    createdAt: DAY1,
    updatedAt: DAY1,
    ...overrides,
  };
}

interface Harness {
  svc: BillingCycleService;
  settle: ReturnType<typeof vi.fn>;
  markForRetry: ReturnType<typeof vi.fn>;
  findRenewalDunningAnchor: ReturnType<typeof vi.fn>;
  countSettledRecurringDebits: ReturnType<typeof vi.fn>;
  setNextDebitDate: ReturnType<typeof vi.fn>;
  refreshFromProvider: ReturnType<typeof vi.fn>;
  applyDebitFailed: ReturnType<typeof vi.fn>;
  applyMandateEnded: ReturnType<typeof vi.fn>;
}

function makeHarness(input: {
  mandate: MandateRow;
  settleMoves?: boolean;
  retryMoves?: boolean;
  /** What `refreshFromProvider` reports for the mandate (first debits only). */
  providerState?: MandateRow["state"];
}): Harness {
  // Held as locals, not read back off the typed interface — doing the latter
  // is an unbound-method reference as far as eslint is concerned.
  const settle = vi.fn().mockResolvedValue(input.settleMoves ?? true);
  const markForRetry = vi.fn().mockResolvedValue(input.retryMoves ?? true);
  const findRenewalDunningAnchor = vi.fn().mockResolvedValue(DAY1);
  const countSettledRecurringDebits = vi.fn().mockResolvedValue(2);
  const setNextDebitDate = vi.fn().mockResolvedValue(undefined);
  const refreshFromProvider = vi
    .fn()
    .mockResolvedValue({ ...input.mandate, state: input.providerState ?? "active" });
  const applyDebitFailed = vi.fn().mockResolvedValue(1);
  const applyMandateEnded = vi.fn().mockResolvedValue(undefined);

  const mandates = {
    findById: vi.fn().mockResolvedValue(input.mandate),
    setNextDebitDate,
  } as unknown as MandateRepository;
  const transactions = {
    settle,
    markForRetry,
    findRenewalDunningAnchor,
    countSettledRecurringDebits,
  } as unknown as TransactionsRepository;
  const provider = {
    name: "stub",
    getDebitStatus: vi.fn().mockResolvedValue({
      outcome: "failed",
      failureCode: "INSUFFICIENT_FUNDS",
      failureMessage: "insufficient balance",
      failureSubCode: "INSUFFICIENT_FUNDS",
      providerTxnId: "stub_pay_1",
      bankReferenceNumber: null,
      npciTransactionId: null,
    }),
  } as unknown as MandateProvider;
  const mandateService = { refreshFromProvider } as unknown as MandateService;

  clearGlobalServices();
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({ applyDebitFailed, applyMandateEnded })
  );

  const svc = new BillingCycleService(
    mandates,
    transactions,
    () => provider,
    mandateService,
    {} as unknown as PdnService,
    {} as unknown as PdnRepository,
    { managedByProvider: false }
  );
  return {
    svc,
    settle,
    markForRetry,
    findRenewalDunningAnchor,
    countSettledRecurringDebits,
    setNextDebitDate,
    refreshFromProvider,
    applyDebitFailed,
    applyMandateEnded,
  };
}

/** Every analytics seam `onDebitFailed` can reach, stubbed. */
function installSpies() {
  return {
    // The last seam: nothing may reach the collector on the loser's path.
    send: vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined),
    trackPaymentResult: vi
      .spyOn(paymentLedgerAnalytics, "trackPaymentResult")
      .mockResolvedValue(undefined),
    trackPaymentRetryScheduled: vi
      .spyOn(paymentLedgerAnalytics, "trackPaymentRetryScheduled")
      .mockResolvedValue(undefined),
    trackPaymentRecoveryDue: vi
      .spyOn(paymentAnalytics, "trackPaymentRecoveryDue")
      .mockResolvedValue(undefined),
    trackPaymentFailed: vi
      .spyOn(paymentAnalytics, "trackPaymentFailed")
      .mockResolvedValue(undefined),
    trackSubscriptionEnded: vi
      .spyOn(paymentAnalytics, "trackSubscriptionEnded")
      .mockResolvedValue(undefined),
    trackSubscriptionPastDue: vi
      .spyOn(paymentAnalytics, "trackSubscriptionPastDue")
      .mockResolvedValue(undefined),
  };
}

let spies: ReturnType<typeof installSpies>;

beforeEach(() => {
  emitted.length = 0;
  spies = installSpies();
});

afterEach(() => {
  clearGlobalServices();
  vi.restoreAllMocks();
});

/** Nothing downstream of the ledger write ran. */
function expectNoSideEffects(h: Harness): void {
  expect(h.setNextDebitDate).not.toHaveBeenCalled();
  expect(h.applyDebitFailed).not.toHaveBeenCalled();
  expect(h.applyMandateEnded).not.toHaveBeenCalled();
  expect(h.findRenewalDunningAnchor).not.toHaveBeenCalled();
  expect(h.countSettledRecurringDebits).not.toHaveBeenCalled();
  expect(spies.trackPaymentResult).not.toHaveBeenCalled();
  expect(spies.trackPaymentRetryScheduled).not.toHaveBeenCalled();
  expect(spies.trackPaymentRecoveryDue).not.toHaveBeenCalled();
  expect(spies.trackPaymentFailed).not.toHaveBeenCalled();
  expect(spies.trackSubscriptionEnded).not.toHaveBeenCalled();
  expect(spies.trackSubscriptionPastDue).not.toHaveBeenCalled();
  expect(spies.send).not.toHaveBeenCalled();
}

/** Exactly one `debit_failed_already_settled` info line, for `branch`. */
function expectAlreadySettledLine(branch: string): void {
  const lines = emitted.filter((e) => e.obj.event === "debit_failed_already_settled");
  expect(lines).toHaveLength(1);
  expect(lines[0].level).toBe("info");
  expect(lines[0].obj).toMatchObject({
    branch,
    source: "webhook",
    failure_code: "INSUFFICIENT_FUNDS",
    mandate_id: "mnd-1",
    transaction_id: "txn-1",
  });
}

describe("renewal failure", () => {
  test("settle did not move the row: returns early, no dunning, no analytics", async () => {
    const h = makeHarness({ mandate: mandateRow(), settleMoves: false });

    // Still `true`: the attempt IS terminal, just not by this call — the
    // caller's contract is unchanged.
    expect(await h.svc.resolvePayment(submittedAttempt(), NOW, "webhook")).toBe(true);

    expect(h.settle).toHaveBeenCalledTimes(1);
    expectNoSideEffects(h);
    expectAlreadySettledLine("renewal");
    // The winner owns `debit_failed`; the loser must not add a second line.
    expect(loggedEvents()).not.toContain("debit_failed");
  });

  test("settle moved the row: every side effect runs exactly as before", async () => {
    const h = makeHarness({ mandate: mandateRow(), settleMoves: true });

    expect(await h.svc.resolvePayment(submittedAttempt(), NOW, "webhook")).toBe(true);

    const graceUntil = addDays(DAY1, RENEWAL_RETRY_DAYS);
    expect(h.settle).toHaveBeenCalledWith("txn-1", {
      status: "failed",
      failureCode: "INSUFFICIENT_FUNDS",
      failureMessage: "insufficient balance",
      failureSubCode: "INSUFFICIENT_FUNDS",
      at: NOW,
    });
    expect(h.findRenewalDunningAnchor).toHaveBeenCalledWith("mnd-1");
    // Re-armed to IST tomorrow, grace anchored on the FIRST failure.
    expect(h.setNextDebitDate).toHaveBeenCalledTimes(1);
    expect(h.setNextDebitDate).toHaveBeenCalledWith("mnd-1", TOMORROW);
    expect(h.applyDebitFailed).toHaveBeenCalledTimes(1);
    expect(h.applyDebitFailed).toHaveBeenCalledWith({ userId: "usr-1", graceUntil });
    expect(spies.trackPaymentRecoveryDue).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentResult).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentFailed).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "retry_scheduled", graceUntil, cyclesCompleted: 2 })
    );
    expect(spies.trackPaymentRetryScheduled).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentRetryScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ retryKind: "next_day", nextRetryAt: TOMORROW })
    );
    expect(spies.trackSubscriptionPastDue).toHaveBeenCalledTimes(1);
    expect(spies.trackSubscriptionEnded).not.toHaveBeenCalled();

    const failed = emitted.filter((e) => e.obj.event === "debit_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].level).toBe("warn");
    expect(failed[0].obj).toMatchObject({ outcome: "rearmed" });
    expect(loggedEvents()).not.toContain("debit_failed_already_settled");
  });
});

describe("first-debit failure, retry branch (markForRetry)", () => {
  const firstDebit = (): RecurringDebitRow =>
    submittedAttempt({ isFirstDebit: true, cycleDate: DAY3, retryCount: 1 });

  test("markForRetry did not move the row: returns early, no analytics", async () => {
    const h = makeHarness({
      mandate: mandateRow({ trialEndsAt: DAY3 }),
      retryMoves: false,
    });

    expect(await h.svc.resolvePayment(firstDebit(), NOW, "webhook")).toBe(true);

    expect(h.markForRetry).toHaveBeenCalledTimes(1);
    expect(h.settle).not.toHaveBeenCalled();
    expectNoSideEffects(h);
    expectAlreadySettledLine("first_debit_retry");
    expect(loggedEvents()).not.toContain("first_debit_retry_scheduled");
  });

  test("markForRetry moved the row: every side effect runs exactly as before", async () => {
    const h = makeHarness({
      mandate: mandateRow({ trialEndsAt: DAY3 }),
      retryMoves: true,
    });

    expect(await h.svc.resolvePayment(firstDebit(), NOW, "webhook")).toBe(true);

    expect(h.markForRetry).toHaveBeenCalledWith("txn-1", {
      failureCode: "INSUFFICIENT_FUNDS",
      failureMessage: "insufficient balance",
      failureSubCode: "INSUFFICIENT_FUNDS",
    });
    expect(h.settle).not.toHaveBeenCalled();
    expect(h.setNextDebitDate).not.toHaveBeenCalled();
    expect(h.applyDebitFailed).not.toHaveBeenCalled();
    expect(h.applyMandateEnded).not.toHaveBeenCalled();
    expect(spies.trackPaymentRecoveryDue).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentRecoveryDue).toHaveBeenCalledWith(
      expect.objectContaining({ population: "first_debit", accessEndsAt: DAY3 })
    );
    expect(spies.trackPaymentRetryScheduled).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentRetryScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ retryKind: "next_window" })
    );
    expect(spies.trackPaymentResult).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentFailed).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "retry_scheduled", cyclesCompleted: 0 })
    );
    expect(loggedEvents().filter((e) => e === "first_debit_retry_scheduled")).toHaveLength(1);
    expect(loggedEvents()).not.toContain("debit_failed_already_settled");
  });
});

describe("first-debit failure, settle branch", () => {
  /** Today's in-day retries are spent, so this decline settles the row. */
  const spentFirstDebit = (): RecurringDebitRow =>
    submittedAttempt({
      isFirstDebit: true,
      cycleDate: DAY3,
      retryCount: MAX_PRESENTATION_RETRIES,
    });

  test("settle did not move the row: no re-arm, no subscription end, no analytics", async () => {
    const h = makeHarness({
      mandate: mandateRow({ trialEndsAt: DAY3 }),
      settleMoves: false,
    });

    expect(await h.svc.resolvePayment(spentFirstDebit(), NOW, "webhook")).toBe(true);

    expect(h.settle).toHaveBeenCalledTimes(1);
    expect(h.markForRetry).not.toHaveBeenCalled();
    expectNoSideEffects(h);
    expectAlreadySettledLine("first_debit_settle");
    expect(loggedEvents()).not.toContain("first_debit_rearmed");
    expect(loggedEvents()).not.toContain("first_debit_failed");
  });

  test("dead mandate, settle did not move the row: the subscription is NOT ended twice", async () => {
    const h = makeHarness({
      mandate: mandateRow({ trialEndsAt: DAY3 }),
      settleMoves: false,
      providerState: "failed",
    });

    // A dead mandate goes straight to the settle branch whatever the budget.
    await h.svc.resolvePayment(
      submittedAttempt({ isFirstDebit: true, cycleDate: DAY3, retryCount: 1 }),
      NOW,
      "webhook"
    );

    expectNoSideEffects(h);
    expectAlreadySettledLine("first_debit_settle");
  });

  test("settle moved the row, live mandate inside the window: re-armed for tomorrow as before", async () => {
    // Sanity on the fixture: tomorrow must be inside the first-debit window.
    expect(TOMORROW.getTime()).toBeLessThanOrEqual(
      addDays(DAY3, FIRST_DEBIT_RETRY_DAYS).getTime()
    );
    const h = makeHarness({
      mandate: mandateRow({ trialEndsAt: DAY3 }),
      settleMoves: true,
    });

    await h.svc.resolvePayment(spentFirstDebit(), NOW, "webhook");

    expect(h.setNextDebitDate).toHaveBeenCalledTimes(1);
    expect(h.setNextDebitDate).toHaveBeenCalledWith("mnd-1", TOMORROW);
    expect(h.applyMandateEnded).not.toHaveBeenCalled();
    expect(spies.trackPaymentRetryScheduled).toHaveBeenCalledWith(
      expect.objectContaining({ retryKind: "next_day", nextRetryAt: TOMORROW })
    );
    expect(spies.trackPaymentResult).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentFailed).toHaveBeenCalledTimes(1);
    expect(loggedEvents().filter((e) => e === "first_debit_rearmed")).toHaveLength(1);
    expect(loggedEvents()).not.toContain("debit_failed_already_settled");
  });

  test("settle moved the row, dead mandate: the subscription ends as before", async () => {
    const h = makeHarness({
      mandate: mandateRow({ trialEndsAt: DAY3 }),
      settleMoves: true,
      providerState: "failed",
    });

    await h.svc.resolvePayment(
      submittedAttempt({ isFirstDebit: true, cycleDate: DAY3, retryCount: 1 }),
      NOW,
      "webhook"
    );

    expect(h.setNextDebitDate).not.toHaveBeenCalled();
    expect(h.applyMandateEnded).toHaveBeenCalledTimes(1);
    expect(h.applyMandateEnded).toHaveBeenCalledWith({
      userId: "usr-1",
      reason: "expired",
      now: NOW,
    });
    expect(spies.trackPaymentResult).toHaveBeenCalledTimes(1);
    expect(spies.trackPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "expired" })
    );
    expect(spies.trackSubscriptionEnded).toHaveBeenCalledTimes(1);
    expect(loggedEvents().filter((e) => e === "first_debit_failed")).toHaveLength(1);
    expect(loggedEvents()).not.toContain("debit_failed_already_settled");
  });
});
