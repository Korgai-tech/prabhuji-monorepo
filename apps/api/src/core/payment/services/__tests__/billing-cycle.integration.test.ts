import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { MockInstance } from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@api/shared/database";
import {
  analyticsEventsClient,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import type { IPaywallApi } from "@api/core/paywall/api";
import { SubscriptionRepository } from "@api/core/subscription/repositories";
import { SubscriptionService } from "@api/core/subscription/services";
import { SubscriptionApi } from "@api/core/subscription/api";
import { MandateRepository } from "../../repositories/mandate.repository.js";
import { TransactionsRepository } from "../../repositories/transactions.repository.js";
import { PdnRepository } from "../../repositories/pdn.repository.js";
import type { RecurringDebitRow } from "../../repositories/transactions.repository.js";
import { STUB_AUTO_APPROVE_MS, StubMandateProvider } from "../../repositories/stub-mandate.repository.js";
import type { MandateRow } from "../../repositories/mandate.repository.js";
import {
  BillingCycleService,
  FIRST_DEBIT_RETRY_DAYS,
  MAX_PRESENTATION_RETRIES,
  RENEWAL_RETRY_DAYS,
} from "../billing-cycle.service.js";
import { MandateService } from "../mandate.service.js";
import { PdnService } from "../pdn.service.js";
import { addDays, addMonthClamped } from "../npci-window.js";
import type { ChargePhase } from "../../types.js";

/** The analytics collector spy, typed to what `send` actually takes. */
type SendSpy = MockInstance<(events: AnalyticsEventInput[]) => Promise<void>>;

/**
 * The recurring-debit engine, end to end, against real Postgres.
 *
 * These are integration tests and could not usefully be anything else. Every
 * guarantee this module makes lives in a database constraint or a guarded
 * `updateMany` predicate, not in TypeScript:
 *
 *   - "never charge twice for one cycle" is the `(mandate_id, cycle_date)`
 *     unique index, exercised by letting two concurrent runs race for it;
 *   - "a replayed settlement cannot flip a settled attempt" is the `status
 *     NOT IN (terminal)` clause in `settle`;
 *   - "a debit only ever moves time forward" is the `expiresAt < periodEnd`
 *     clause in the subscription repository.
 *
 * A mocked Prisma would happily agree with all three while the real predicates
 * were wrong, so it would prove nothing. The trade is a testcontainer per file,
 * which is worth it for the one module where a bug is measured in rupees.
 *
 * Two further deliberate choices:
 *
 *   REAL SUBSCRIPTION MODULE. `BillingCycleService` reaches entitlement only
 *   through `performServiceCall("subscription", ...)`, and these tests register
 *   the genuine `SubscriptionApi` rather than a fake — the thing worth proving
 *   is that the two modules compose, which a fake would assume away.
 *
 *   NO FAKE TIMERS. `startTestDb` and Prisma need a real clock, so time is
 *   controlled by passing explicit `now` instants into `run()`. Everything the
 *   NPCI rules care about is derived from that argument.
 */

const PLAN_ID = "month";
const PRODUCT_ID = "prabhuji_vip_month";
/**
 * An arbitrary positive amount that the stub provider approves — NOT the live
 * plan price, which is remote config (`paywall_plans.amountPaise`). Any value
 * works here as long as it stays clear of the stub's magic amounts (₹1 rejects,
 * ₹2 hangs, ₹3/₹4 force async debit outcomes).
 */
const AMOUNT_PAISE = 29_900;
const PAYWALL_ID = "vip-icon-grid-v1";

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

let provider: StubMandateProvider;
let mandates: MandateRepository;
let transactions: TransactionsRepository;
let svc: BillingCycleService;
let mandateService: MandateService;
let pdns: PdnRepository;
let pdnService: PdnService;

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  // Transactions BEFORE notifications BEFORE mandates: both FKs are
  // `onDelete: Restrict` (a ledger that vanishes with its instrument is not a
  // ledger), so any other order fails with an FK error in whichever test happens
  // to run first.
  await getPrisma().transaction.deleteMany({});
  await getPrisma().paymentPdnNotification.deleteMany({});
  await getPrisma().mandate.deleteMany({});
  await getPrisma().subscription.deleteMany({});

  // A fresh stub each test: it remembers registered mandates in a Map, and
  // leaking that across tests would make the first-debit-failure case pass for
  // the wrong reason.
  provider = new StubMandateProvider();
  mandates = new MandateRepository();
  transactions = new TransactionsRepository();
  pdns = new PdnRepository();

  // Without this every `performServiceCall("subscription", ...)` throws
  // SERVICE_UNAVAILABLE and the run dies before it touches a mandate.
  clearGlobalServices();
  registerGlobalService(
    "subscription",
    new SubscriptionApi(new SubscriptionService(new SubscriptionRepository()))
  );
  // The A/B arm stamped on `bk_subscription_started`. Registered as a stub
  // rather than left out: `paywallIdFor` fails soft, so an unregistered paywall
  // would let this suite pass on `paywall_id: null` and prove nothing about the
  // cross-module hop it is here to exercise on the money path.
  registerGlobalService("paywall", {
    resolvePaywallIdForUser: () => Promise.resolve(PAYWALL_ID),
  } as unknown as IPaywallApi);

  mandateService = new MandateService(mandates, transactions, provider, () => provider, {
    expiryMinutes: 15,
    mandateName: "Prabhuji",
  });
  pdnService = new PdnService(pdns, transactions, () => provider);
  svc = new BillingCycleService(mandates, transactions, () => provider, mandateService, pdnService, pdns, {
    // The branch under test. `true` delegates debits to the provider and makes
    // every assertion below vacuous.
    managedByProvider: false,
  });
});

afterEach(() => {
  clearGlobalServices();
  // A spy that outlives a failing test turns one failure into a cascade of
  // unrelated ones in the same file.
  vi.restoreAllMocks();
});

/**
 * Seed a subscription row directly. Bypasses the transitions deliberately —
 * this is the *precondition*, and building it through the API under test would
 * make a failure ambiguous.
 */
async function seedSubscription(input: {
  status: string;
  trialEndsAt?: Date | null;
  expiresAt?: Date | null;
}): Promise<string> {
  const userId = randomUUID();
  await getPrisma().subscription.create({
    data: {
      userId,
      status: input.status,
      activePlanId: PLAN_ID,
      activeProductId: PRODUCT_ID,
      provider: "stub",
      trialEndsAt: input.trialEndsAt ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  return userId;
}

/**
 * Seed an `active` mandate.
 *
 * `knownToProvider: false` writes the row WITHOUT registering the reference
 * with the stub, which is how a debit failure is provoked: the stub's
 * `presentDebit` reports `failed` for a reference it has no memory of.
 */
async function seedActiveMandate(input: {
  userId: string;
  nextDebitDate: Date;
  amountPaise?: number;
  knownToProvider?: boolean;
  /**
   * Marks this mandate as having been registered WITH a trial — the same fact
   * `createMandate` writes. Load-bearing for anything reading trial state off
   * the mandate (`activation_source`, and the ledger predicate that excludes a
   * trial's token deposit); the `subscriptions` row's own `trialEndsAt` is a
   * different column and does not stand in for it.
   */
  trialEndsAt?: Date | null;
}): Promise<MandateRow> {
  const referenceId = `pj_mnd_${randomUUID()}`;
  const amountPaise = input.amountPaise ?? AMOUNT_PAISE;
  const startDate = input.nextDebitDate;
  let providerMandateId = `stub_mandate_${randomUUID()}`;

  if (input.knownToProvider !== false) {
    const registered = await provider.createMandate({
      referenceId,
      type: "upi",
      mandateName: "Prabhuji",
      purposeMessage: "Prabhuji",
      amountPaise,
      initialDepositPaise: 0,
      currency: "INR",
      frequency: "MONTHLY",
      amountRule: "MAX",
      ruleType: "BEFORE",
      ruleValue: 28,
      startDate,
      endDate: addDays(startDate, 365),
      expiryMinutes: 15,
    });
    providerMandateId = registered.providerMandateId ?? providerMandateId;
  }

  return getPrisma().mandate.create({
    data: {
      userId: input.userId,
      type: "upi",
      provider: "stub",
      referenceId,
      providerMandateId,
      state: "active",
      planId: PLAN_ID,
      productId: PRODUCT_ID,
      amountPaise,
      currency: "INR",
      startDate,
      endDate: addDays(startDate, 365),
      nextDebitDate: input.nextDebitDate,
      trialEndsAt: input.trialEndsAt ?? null,
    },
  });
}

async function readSubscription(userId: string) {
  const row = await getPrisma().subscription.findUnique({ where: { userId } });
  if (!row) throw new Error("subscription row vanished");
  return row;
}

/**
 * The mandate's one recurring debit.
 *
 * Filtered by `kind`: every mandate registered through `MandateService` now also
 * carries an `initial_deposit` row, so an unfiltered read would find two and
 * these assertions would fail for a reason that has nothing to do with billing.
 */
async function readOnlyAttempt(mandateId: string): Promise<RecurringDebitRow> {
  const rows = await getPrisma().transaction.findMany({
    where: { mandateId, kind: "recurring_debit" },
  });
  expect(rows).toHaveLength(1);
  const row = rows[0];
  // The `transactions_recurring_shape` CHECK guarantees both on a recurring
  // row; asserting here keeps every caller free of null-handling for a state
  // the database forbids.
  expect(row.mandateId).not.toBeNull();
  expect(row.cycleDate).not.toBeNull();
  // The two expects above are the runtime proof; the cast is what carries it
  // into the type system, since Prisma types both columns as nullable for the
  // benefit of the non-recurring kinds that share this table.
  return row as RecurringDebitRow;
}

describe("trial → paid conversion", () => {
  /**
   * THE most important test in the module.
   *
   * This is the entire commercial path: a user who approved a mandate and got
   * three free days becomes a paying subscriber, without anyone touching a
   * console. It spans both halves of a debit — the pre-debit notification 48h
   * out, then the presentation on the day — and both modules, since the money
   * moving is only real once `core/subscription` says the user is `active`.
   *
   * If this breaks, no one converts and the failure is silent: the app keeps
   * serving content to a `trialing` row whose trial has quietly ended.
   */
  test("day 3: trial converts to a paid, extended subscription", async () => {
    const userId = await seedSubscription({
      status: "trialing",
      trialEndsAt: DAY3,
    });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      // The mandate has to carry the trial too. The `subscriptions` row's own
      // `trialEndsAt` is a different column, and anything reading trial state
      // off the MANDATE (`activation_source`, the ledger predicate) would
      // otherwise exercise the no-trial branch in a test named for conversion.
      trialEndsAt: DAY3,
    });

    // --- Day 1, 09:00 IST: 48h of lead time, inside the PDN window. --------
    // NPCI wants 24–48h of notice and refuses a debit that never had one, so
    // this tick is where a month of revenue is won or lost.
    const pdnReport = await svc.run(ist(2026, 7, 21, 9));
    expect(pdnReport.pdnSent).toBe(1);
    // Nothing may be presented two days early.
    expect(pdnReport.presentationsSent).toBe(0);

    const claimed = await readOnlyAttempt(mandate.id);
    expect(claimed.cycleDate.toISOString()).toBe(DAY3.toISOString());
    expect(claimed.status).toBe("notified");
    expect(claimed.isFirstDebit).toBe(true);
    // The presentation call cannot be made without this, and the provider's
    // docs say it only ever arrives here — so it must be persisted, not held
    // in process memory across the two days.
    expect(claimed.presentationSequenceId).not.toBeNull();

    // --- Day 3, 09:00 IST: inside the 00:00–10:00 NPCI window. -------------
    const debitReport = await svc.run(ist(2026, 7, 23, 9));
    expect(debitReport.presentationsSent).toBe(1);

    const settled = await readOnlyAttempt(mandate.id);
    expect(settled.status).toBe("succeeded");
    expect(settled.settledAt).not.toBeNull();

    const sub = await readSubscription(userId);
    expect(sub.status).toBe("active");
    // Derived from the CYCLE date, never from "now + 1 month" — that is what
    // makes a replayed settlement a no-op rather than a free extra month.
    expect(sub.expiresAt?.toISOString()).toBe(
      addMonthClamped(DAY3).toISOString()
    );
    // The trial is over the moment money moves; leaving it set would let
    // `computeIsEntitled` grant access from the wrong deadline.
    expect(sub.trialEndsAt).toBeNull();

    // The next cycle is scheduled off the same anchor, so the billing day does
    // not drift a little further every month.
    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate?.toISOString()).toBe(
      addMonthClamped(DAY3).toISOString()
    );
  });
});

/**
 * `bk_subscription_started` on the DEBIT path — the case no approval-time hook
 * can see.
 *
 * A converting trial's mandate went live weeks earlier at ₹2, so the moment the
 * user becomes a paying customer is a settled recurring debit. Reported only as
 * `bk_subscription_renewed`, a conversion was indistinguishable from a
 * fourth-month charge, and the "first paying customers" cohort was empty for
 * every trial user who ever converted.
 *
 * That same predicate now decides BOTH events (TAM-163): the first full-price
 * payment is a start, everything after it is a renewal, and exactly one of the
 * two fires on any settled debit. So these tests pin the split, not just the
 * start — a regression that re-fires the renewal on a conversion fails here.
 *
 * Against real Postgres deliberately: the gate is a ledger COUNT, so a mocked
 * repository would assert the wiring and prove nothing about the predicate —
 * whether the ₹2 deposit really falls below the floor, whether a prior payment
 * really suppresses it.
 */
describe("first-full-price-payment on the debit path", () => {
  /** Everything published, flattened across batches. */
  function published(send: SendSpy, eventType: string): AnalyticsEventInput[] {
    return send.mock.calls
      .flatMap((call) => call[0] ?? [])
      .filter((e) => e.event_type === eventType);
  }

  /** Drive a trial mandate through PDN + presentation to a settled debit. */
  async function convert(userId: string, mandate: MandateRow) {
    await svc.run(ist(2026, 7, 21, 9));
    await svc.run(ist(2026, 7, 23, 9));
    const settled = await readOnlyAttempt(mandate.id);
    expect(settled.status).toBe("succeeded");
    return readSubscription(userId);
  }

  test("a converting trial publishes the user's first full-price payment", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      trialEndsAt: DAY3,
    });

    await convert(userId, mandate);

    const starts = published(send, "bk_subscription_started");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      user_id: userId,
      insert_id: `bk_subscription_started:${userId}`,
      event_properties: {
        activation_source: "trial_conversion",
        // Full price, not the ₹2 the trial registered with.
        amount_paise: AMOUNT_PAISE,
        // The cycle AFTER this one. `mandate.nextDebitDate` on that stack is
        // the cycle just charged — `setNextDebitDate` advances the database,
        // not the in-memory row — so reading it would report the conversion's
        // next billing date as the day it converted.
        next_billing_date: addMonthClamped(DAY3).toISOString(),
        // The conversion is the ONE purchase moment no client event can cover —
        // it fires weeks later from the sweep, with no app in the loop — so the
        // arm has to survive the whole way through this path or the trial half
        // of the experiment cannot be read out.
        paywall_id: PAYWALL_ID,
      },
    });
    // INSTEAD of the renewal, not beside it (TAM-163). The day-3 conversion is
    // a lifecycle start; the first cycle that recurs is thirty days out. While
    // both fired, every renewal prod had ever recorded was a first payment.
    expect(published(send, "bk_subscription_renewed")).toHaveLength(0);
    send.mockRestore();
  });

  test("a user who already paid full price does NOT get a second start", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });

    // Their earlier life: a separate, no-trial mandate that took the full price
    // and settled. A re-registering subscriber's history lives on a DIFFERENT
    // mandate — NPCI revoked the old one — which is exactly why the gate has to
    // count the user's ledger and not this mandate's. Dated far out so the
    // billing run never finds it due.
    const previous = await seedActiveMandate({
      userId,
      nextDebitDate: istDay(2027, 1, 1),
    });
    await transactions.recordInitialDeposit({
      userId,
      mandateId: previous.id,
      provider: "stub",
      chargePhase: "deposit",
      amountPaise: AMOUNT_PAISE,
      currency: "INR",
      gatewayRequestId: `pj_dep_${randomUUID()}`,
      planId: PLAN_ID,
      productId: PRODUCT_ID,
    });
    await transactions.settleDepositForMandate(previous.id, {
      status: "succeeded",
      // The `transactions_settled_has_gateway_id` CHECK refuses a settled row
      // without one.
      gatewayPaymentId: `stub_pay_${randomUUID()}`,
      at: ist(2026, 7, 20, 9),
    });

    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      trialEndsAt: DAY3,
    });

    await convert(userId, mandate);

    expect(published(send, "bk_subscription_started")).toHaveLength(0);
    // The renewal DOES fire — and this is the other half of the TAM-163 split,
    // asserted on the same predicate a month-2 cycle takes: the user has a
    // settled full-price payment behind them, so this charge recurs and reports
    // as a renewal. Exactly one of the two events fires on any settled debit.
    const renewals = published(send, "bk_subscription_renewed");
    expect(renewals).toHaveLength(1);
    // The event must report the id the LEDGER recorded, not the one the row
    // carried on the way in. `settle` returns a boolean rather than the updated
    // row, so reporting off the caller's `attempt` reports a pre-settlement
    // snapshot — against Razorpay, which only mints `pay_…` at settlement, that
    // was null on every renewal prod ever recorded (0 of 78).
    //
    // Asserted against the ledger rather than a shape (`/^stub_txn_/`), because
    // the stub DOES hold an id before settlement and a shape check passes on
    // the stale value. The settlement mints a fresh one, so only equality
    // separates "reported what was recorded" from "reported what it had".
    const ledger = await readOnlyAttempt(mandate.id);
    expect(ledger.gatewayPaymentId).toBeTruthy();
    expect(renewals[0].event_properties?.gateway_payment_id).toBe(
      ledger.gatewayPaymentId
    );
    send.mockRestore();
  });

  test("the trial's token deposit does not count as a full-price payment", async () => {
    // The reason the gate identifies rows rather than thresholding an amount:
    // the ₹2 trial deposit shares `initial_deposit` with a no-trial
    // registration's ₹299, so `kind` alone cannot separate them. What does is
    // that this one sits on a mandate carrying a trial.
    //
    // Its AMOUNT is deliberately set to the full price here. Under the earlier
    // amount-threshold predicate that alone would have suppressed the event —
    // and `initial_deposit_paise` is CMS-editable, so an admin could have
    // caused exactly this silently.
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      trialEndsAt: DAY3,
    });

    await transactions.recordInitialDeposit({
      userId,
      mandateId: mandate.id,
      provider: "stub",
      chargePhase: "deposit",
      amountPaise: AMOUNT_PAISE,
      currency: "INR",
      gatewayRequestId: `pj_dep_${randomUUID()}`,
      planId: PLAN_ID,
      productId: PRODUCT_ID,
    });
    await transactions.settleDepositForMandate(mandate.id, {
      status: "succeeded",
      // The `transactions_settled_has_gateway_id` CHECK refuses a settled row
      // without one.
      gatewayPaymentId: `stub_pay_${randomUUID()}`,
      at: ist(2026, 7, 20, 9),
    });

    await convert(userId, mandate);

    expect(published(send, "bk_subscription_started")).toHaveLength(1);
    send.mockRestore();
  });
});

/**
 * The ledger predicate itself, against real Postgres.
 *
 * Every clause here removes something that reads as settled money but is not a
 * full-price payment, and each one exists because of a specific way the event
 * fired wrongly. Tested at the repository rather than through a service because
 * the clauses ARE the behaviour — a stubbed count asserts the wiring and would
 * stay green with the predicate deleted.
 */
describe("countSettledFullPriceForUser", () => {
  async function settledDeposit(input: {
    userId: string;
    mandateId: string;
    chargePhase: ChargePhase;
    amountPaise?: number;
  }) {
    await transactions.recordInitialDeposit({
      userId: input.userId,
      mandateId: input.mandateId,
      provider: "stub",
      chargePhase: input.chargePhase,
      amountPaise: input.amountPaise ?? AMOUNT_PAISE,
      currency: "INR",
      gatewayRequestId: `pj_dep_${randomUUID()}`,
      planId: PLAN_ID,
      productId: PRODUCT_ID,
    });
    await transactions.settleDepositForMandate(input.mandateId, {
      status: "succeeded",
      gatewayPaymentId: `stub_pay_${randomUUID()}`,
      at: ist(2026, 7, 20, 9),
    });
  }

  test("counts a real full-price registration", async () => {
    const userId = await seedSubscription({ status: "active" });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY3 });

    await settledDeposit({ userId, mandateId: mandate.id, chargePhase: "deposit" });

    expect(await transactions.countSettledFullPriceForUser(userId)).toBe(1);
  });

  test("does NOT count a deposit that was never charged", async () => {
    // The F7 case. A gateway without `supportsInitialDeposit` books the row at
    // the full price anyway and settles it on approval, so without this clause
    // the count reads 1 and the event claims revenue that never moved.
    const userId = await seedSubscription({ status: "active" });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY3 });

    await settledDeposit({ userId, mandateId: mandate.id, chargePhase: "none" });

    expect(await transactions.countSettledFullPriceForUser(userId)).toBe(0);
  });

  test("does NOT count a trial's token deposit, whatever it is worth", async () => {
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      trialEndsAt: DAY3,
    });

    // At the FULL price — an amount threshold would have counted this.
    await settledDeposit({ userId, mandateId: mandate.id, chargePhase: "deposit" });

    expect(await transactions.countSettledFullPriceForUser(userId)).toBe(0);
  });

  test("counts a recurring cycle even when its charge phase is 'none'", async () => {
    // `chargePhase` means something different on a recurring row — which of OUR
    // calls is irreversible, not whether money moved. A gateway that charges
    // autonomously would declare `none` honestly, and scoping the exclusion to
    // `initial_deposit` is what keeps its cycles counting as revenue.
    const userId = await seedSubscription({ status: "active" });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY3 });

    const attempt = await transactions.claimRecurringCycle({
      mandateId: mandate.id,
      userId,
      provider: "stub",
      chargePhase: "none",
      cycleDate: DAY3,
      amountPaise: AMOUNT_PAISE,
      currency: "INR",
      isFirstDebit: true,
      gatewayRequestId: `pj_req_${randomUUID()}`,
      planId: PLAN_ID,
      productId: PRODUCT_ID,
    });
    // `claimRecurringCycle` returns null when another run already claimed the
    // cycle; nothing else is running here, so a null is a bug in the test.
    if (!attempt) throw new Error("cycle claim was refused");
    await transactions.settle(attempt.id, {
      status: "succeeded",
      gatewayPaymentId: `stub_pay_${randomUUID()}`,
      at: ist(2026, 7, 23, 9),
    });

    expect(await transactions.countSettledFullPriceForUser(userId)).toBe(1);
  });

  test("does not count another user's money", async () => {
    const mine = await seedSubscription({ status: "active" });
    const theirs = await seedSubscription({ status: "active" });
    const mandate = await seedActiveMandate({ userId: theirs, nextDebitDate: DAY3 });

    await settledDeposit({ userId: theirs, mandateId: mandate.id, chargePhase: "deposit" });

    expect(await transactions.countSettledFullPriceForUser(mine)).toBe(0);
  });
});

describe("idempotency", () => {
  test("two concurrent runs claim the cycle once — no double charge", async () => {
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY3 });

    // The scheduler is a one-off ECS task, so overlap "should not" happen —
    // but the cost of being wrong once is charging a real user twice, and
    // "should not" is not a guarantee worth betting that on. What makes this
    // structural rather than lucky is the `(mandate_id, cycle_date)` unique
    // constraint: `claimCycle` inserts first and treats the unique violation
    // as "someone else owns this cycle". A read-then-write would leave a
    // window these two runs would eventually find.
    const at = ist(2026, 7, 21, 9);
    const [a, b] = await Promise.all([svc.run(at), svc.run(at)]);

    const rows = await getPrisma().transaction.findMany({
      where: { mandateId: mandate.id },
    });
    expect(rows).toHaveLength(1);
    // Exactly one run got the claim; the other found the cycle taken.
    expect(a.pdnSent + b.pdnSent).toBe(1);
  });
});

/**
 * The backstop that makes deferring safe.
 *
 * Every "ask again later" path costs no retry budget, which is right on any one
 * tick and unbounded across all of them. `findDueForPdn` reaches three days
 * ahead, so a cycle that deferred through its whole window stopped being
 * selected and left NOTHING behind — no failed row, no error, `pdnFailed: 0`,
 * and a run logged at `info`. That is how five days of total billing failure
 * looked healthy in prod.
 */
describe("abandoned cycles", () => {
  test("a notification whose debit date passed is written off, loudly", async () => {
    const cycleDate = DAY1;
    const userId = await seedSubscription({ status: "active", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: cycleDate });
    const debit = await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate,
        status: "pending",
        isFirstDebit: false,
        amountPaise: AMOUNT_PAISE,
        currency: "INR",
      },
    });
    // Deferred its whole window: never got a sequence id, so never addressable.
    const pdn = await getPrisma().paymentPdnNotification.create({
      data: {
        mandateId: mandate.id,
        userId,
        cycleDate,
        referenceId: `pj_pdn_${randomUUID()}`,
        amountPaise: AMOUNT_PAISE,
        scheduledDebitAt: cycleDate,
        status: "sent",
      },
    });
    await getPrisma().transaction.update({
      where: { id: debit.id },
      data: { pdnId: pdn.id },
    });

    // Two days after the debit date — the cycle is gone and cannot be billed.
    const report = await svc.run(ist(2026, 7, 23, 9));

    expect(report.pdnAbandoned).toBe(1);

    // BOTH rows move. A notification written off while its money row still reads
    // `pending` would keep the cycle claimed and block the next one from ever
    // being created.
    const sweptPdn = await getPrisma().paymentPdnNotification.findUniqueOrThrow({
      where: { id: pdn.id },
    });
    expect(sweptPdn.status).toBe("failed");
    const sweptDebit = await getPrisma().transaction.findUniqueOrThrow({
      where: { id: debit.id },
    });
    expect(sweptDebit.failureCode).toBe("PDN_ABANDONED");
  });

  test("a notification still inside its window is left alone", async () => {
    // The sweep must not eat a cycle that has not had its chance yet, or it
    // becomes the bug it exists to catch.
    const cycleDate = DAY3;
    const userId = await seedSubscription({ status: "active", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: cycleDate });
    const pdn = await getPrisma().paymentPdnNotification.create({
      data: {
        mandateId: mandate.id,
        userId,
        cycleDate,
        referenceId: `pj_pdn_${randomUUID()}`,
        amountPaise: AMOUNT_PAISE,
        scheduledDebitAt: cycleDate,
        status: "sent",
      },
    });

    const report = await svc.run(ist(2026, 7, 21, 9));

    expect(report.pdnAbandoned).toBe(0);
    const held = await getPrisma().paymentPdnNotification.findUniqueOrThrow({
      where: { id: pdn.id },
    });
    expect(held.status).not.toBe("failed");
  });
});

describe("NPCI execution windows", () => {
  /** An attempt already holding a valid PDN, waiting only for a window. */
  async function seedAwaitingPresentation(cycleDate: Date) {
    const userId = await seedSubscription({ status: "active", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: cycleDate });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate,
        status: "notified",
        // A renewal, not a first debit: a failure here should retry rather
        // than end the subscription, so the window is the only variable.
        isFirstDebit: false,
        presentationSequenceId: `stub_seq_${mandate.referenceId}`,
        amountPaise: AMOUNT_PAISE,
        currency: "INR",
        notifiedAt: ist(2026, 7, 20, 9),
      },
    });
    return mandate;
  }

  test("peak hours: nothing is presented, and the attempt survives intact", async () => {
    const mandate = await seedAwaitingPresentation(DAY1);

    // 11:00 IST is inside NPCI's peak block (the windows are 00:00–10:00,
    // 13:00–17:00, 21:30–24:00). Presenting here is refused upstream, so the
    // engine must not spend the attempt on a call that cannot succeed.
    const report = await svc.run(ist(2026, 7, 21, 11));
    expect(report.presentationsSent).toBe(0);
    expect(report.skippedOutsideWindow).toBeGreaterThanOrEqual(1);

    // Critically: skipped, not failed and not abandoned. A closed window is a
    // "come back later", and burning a retry on it would lapse a paying user
    // for a scheduling accident.
    const held = await readOnlyAttempt(mandate.id);
    expect(held.status).toBe("notified");
    expect(held.submittedAt).toBeNull();
    expect(held.retryCount).toBe(0);
  });

  test("a first cycle whose lead has lapsed is MOVED, not stranded", async () => {
    // The failure this guards is silent and permanent, which is why it needs a
    // test rather than a log line.
    //
    // `canSendPreDebitNotification` measures the lead as
    // `cycleDate - istDateOnly(now)`, so it only ever shrinks as the clock
    // advances. Once a cycle is under the floor, every later tick asks the same
    // question and gets the same no — forever. The mandate stays `active`, no
    // cycle is ever claimed, and there is no failed row for anyone to find.
    //
    // A three-day trial could not reach this state: the sweep had three days to
    // hit a one-day band. A ONE-day trial has no slack at all — the notification
    // must go out on the registration day — so a mandate activated inside the
    // 23:50 IST PDN blackout loses its only chance, and by 00:05 the lead is 0.
    const userId = await seedSubscription({ status: "trialing", expiresAt: DAY1 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY1,
      trialEndsAt: DAY1,
    });

    // 00:05 IST on the cycle date itself: lead is 0, well under the 24h floor,
    // and no tick will ever improve it.
    const report = await svc.run(ist(2026, 7, 21, 0, 5));

    expect(report.pdnSent).toBe(0);
    expect(report.skippedOutsideWindow).toBeGreaterThanOrEqual(1);

    // Moved forward a day, so the NEXT tick sees a healthy 24h lead.
    const moved = await getPrisma().mandate.findUniqueOrThrow({
      where: { id: mandate.id },
    });
    expect(moved.nextDebitDate).toEqual(istDay(2026, 7, 22));

    // `trial_ends_at` is deliberately untouched: entitlement keeps exactly what
    // registration granted, so the stored date can never disagree with the one
    // the payer was shown. The user gets the extra day free.
    expect(moved.trialEndsAt).toEqual(DAY1);

    // And it recovers for real — the very next day's sweep notifies it.
    const next = await svc.run(ist(2026, 7, 21, 9));
    expect(next.pdnSent).toBe(1);
  });

  test("a STRANDED first cycle is moved even though it was already claimed", async () => {
    // THE 162-notification failure, in one test.
    //
    // The cycle was claimed and a notification was raised, but the gateway
    // rejected the order — so the ledger row carries NO presentation sequence
    // id and the debit can never be addressed. The row exists, which is
    // precisely why the original repair skipped it: it counted ATTEMPTS, saw
    // one, and concluded this was not a first cycle. The mandate then sat
    // active, unbillable, until its cycle date passed and it was written off.
    //
    // The repair now asks the two questions that actually matter — has this
    // subscriber ever been CHARGED, and is the blocking cycle presentable at
    // all — so a stranded claim is moved instead of stranding the mandate.
    const userId = await seedSubscription({ status: "trialing", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY1 });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        // Claimed and notified, but the order create was rejected — so there is
        // no sequence id and `findAwaitingSubmission` will never see it.
        status: "notified",
        isFirstDebit: true,
        presentationSequenceId: null,
        amountPaise: AMOUNT_PAISE,
        currency: "INR",
      },
    });

    // 11:00 IST is peak, so the presentation stage is shut and cannot muddy the
    // result — the only thing that can move the date is the repair.
    await svc.run(ist(2026, 7, 21, 11));

    const repaired = await getPrisma().mandate.findUniqueOrThrow({
      where: { id: mandate.id },
    });
    // Moved forward a day, so a fresh notification can clear the lead band.
    expect(repaired.nextDebitDate).not.toEqual(DAY1);
    expect(repaired.nextDebitDate).toEqual(addDays(DAY1, 1));
    // Entitlement is untouched: the user keeps exactly what registration granted.
    expect(repaired.trialEndsAt).toEqual(mandate.trialEndsAt);
  });

  test("a stranded first cycle whose date has ALREADY PASSED is still repaired", async () => {
    // The deploy-after-midnight case. A window starting at today would never
    // see a mandate whose cycle date was yesterday, so a fix landing at 00:30
    // would leave the previous day's stranded cohort permanently unbillable —
    // which is how "we shipped the fix" and "the money was still lost" can
    // both be true. The one-day look-back is what closes that.
    const userId = await seedSubscription({ status: "trialing", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY1 });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        status: "notified",
        isFirstDebit: true,
        presentationSequenceId: null,
        amountPaise: AMOUNT_PAISE,
        currency: "INR",
      },
    });

    // Run on the day AFTER the cycle date, inside peak so presentation is shut.
    await svc.run(ist(2026, 7, 22, 11));

    const repaired = await getPrisma().mandate.findUniqueOrThrow({
      where: { id: mandate.id },
    });
    // Moved to tomorrow relative to the run, not relative to the stale date.
    expect(repaired.nextDebitDate).toEqual(addDays(DAY1, 2));
  });

  test("a lapsed RENEWAL is left alone — only first cycles are moved", async () => {
    // Moving a renewal's date would quietly hand a paying subscriber free time
    // every month, and a stale renewal is a different fault with a different
    // fix. `seedAwaitingPresentation` writes a `recurring_debit` row, so this
    // mandate is no longer on its first cycle.
    const mandate = await seedAwaitingPresentation(DAY1);

    // 11:00 IST is peak, so the presentation stage is closed. That isolates the
    // repair: at 00:05 this row would legitimately present and settle, pushing
    // `nextDebitDate` a month out, and a date that moved for the RIGHT reason
    // would be indistinguishable from one the repair moved for the wrong one.
    await svc.run(ist(2026, 7, 21, 11));

    const untouched = await getPrisma().mandate.findUniqueOrThrow({
      where: { id: mandate.id },
    });
    expect(untouched.nextDebitDate).toEqual(DAY1);
  });

  test("13:00–17:00 window: the same attempt presents", async () => {
    const mandate = await seedAwaitingPresentation(DAY1);

    const report = await svc.run(ist(2026, 7, 21, 14));
    expect(report.presentationsSent).toBe(1);

    const presented = await readOnlyAttempt(mandate.id);
    expect(presented.status).toBe("succeeded");
  });

  test("PDN lead: 5 days out is too early, 1 day out is due", async () => {
    // NPCI wants 24–48h of notice. Earlier risks the provider rejecting the
    // notification as premature — and a rejected PDN cannot be retried into
    // the same cycle, so firing early silently loses the month.
    const earlyUser = await seedSubscription({ status: "active" });
    const early = await seedActiveMandate({
      userId: earlyUser,
      nextDebitDate: addDays(DAY1, 5),
    });
    const dueUser = await seedSubscription({ status: "active" });
    const due = await seedActiveMandate({
      userId: dueUser,
      nextDebitDate: addDays(DAY1, 1),
    });

    const report = await svc.run(ist(2026, 7, 21, 9));
    expect(report.pdnSent).toBe(1);

    expect(
      await getPrisma().transaction.count({ where: { mandateId: early.id } })
    ).toBe(0);
    const claimed = await readOnlyAttempt(due.id);
    expect(claimed.status).toBe("notified");
    expect(claimed.cycleDate.toISOString()).toBe(addDays(DAY1, 1).toISOString());
  });
});

describe("dryRun", () => {
  test("reports what it would do and writes nothing", async () => {
    // The scheduler exposes a dry run so an operator can inspect a cycle
    // before letting it move money. If it wrote even the claim row it would be
    // worse than useless: the real run would then find the cycle taken and
    // skip the debit entirely.
    const userId = await seedSubscription({
      status: "trialing",
      trialEndsAt: addDays(DAY1, 1),
    });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: addDays(DAY1, 1),
    });

    const report = await svc.run(ist(2026, 7, 21, 9), true);

    expect(report.dryRun).toBe(true);
    expect(report.pdnSent).toBe(1);

    expect(
      await getPrisma().transaction.count({ where: { mandateId: mandate.id } })
    ).toBe(0);
    const sub = await readSubscription(userId);
    expect(sub.status).toBe("trialing");
    expect(sub.trialEndsAt?.toISOString()).toBe(addDays(DAY1, 1).toISOString());
    // The mandate keeps its schedule too — a dry run must leave the next real
    // run with exactly the work it would have had.
    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate?.toISOString()).toBe(
      addDays(DAY1, 1).toISOString()
    );
  });
});

describe("expire sweep", () => {
  test("lapsed subscriptions are swept to expired", async () => {
    // Cosmetic for access control — `computeIsEntitled` has been denying this
    // row since the instant it lapsed — but load-bearing for admin views and
    // revenue analytics, which read `status` and would otherwise count a dead
    // subscriber as active indefinitely.
    const userId = await seedSubscription({
      status: "active",
      expiresAt: istDay(2026, 6, 1),
    });

    const report = await svc.run(ist(2026, 7, 21, 9));

    expect(report.expiredSwept).toBeGreaterThanOrEqual(1);
    expect((await readSubscription(userId)).status).toBe("expired");
  });
});

describe("first-debit failure", () => {
  /** ₹4 — the stub presents `pending`, then reports a bank decline on the status read. */
  const DECLINED_PAISE = 4_00;

  test("ends the subscription when the provider reports the mandate DEAD", async () => {
    // A mandate the provider no longer knows is gone for real: there is
    // nothing left to debit against, and a retry would be calls into a void
    // while the user sits in a state they cannot escape. The only recovery is
    // full re-consent, so the subscription ends and the app shows the
    // re-register CTA. This is the ONLY first-debit failure that ends things
    // on the first decline — see the live-mandate cases below.
    const userId = await seedSubscription({
      status: "trialing",
      trialEndsAt: DAY3,
    });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      // The stub has no memory of this reference, so `presentDebit` reports
      // `failed` — exactly the shape of a bank declining the first debit.
      knownToProvider: false,
    });

    await svc.run(ist(2026, 7, 21, 9));
    await svc.run(ist(2026, 7, 23, 9));

    const attempt = await readOnlyAttempt(mandate.id);
    expect(attempt.status).toBe("failed");
    // One presentation, then stop. Anything higher means the renewal retry
    // path ran on a mandate NPCI has already killed.
    expect(attempt.retryCount).toBe(1);

    const sub = await readSubscription(userId);
    // `expired`, not `past_due`: nothing was ever paid, so there is no period
    // to stay entitled through and no grace window to open.
    expect(sub.status).toBe("expired");
    expect(sub.trialEndsAt).toBeNull();

    // Confirmed with the provider rather than assumed — marking a still-live
    // mandate revoked would strand it.
    const after = await mandates.findById(mandate.id);
    expect(after?.state).toBe("failed");
  });

  test("a declined first debit on a LIVE mandate is retried, not written off", async () => {
    // The regression this exists for. NPCI revokes a mandate only when the
    // execution that CREATED it fails; on Razorpay that is the ₹2
    // authorization, so a declined first ₹299 leaves the token live — 41 of
    // 43 did, on the day this was measured — and every one had been ended as
    // "revoked by NPCI". A live mandate gets the same window-by-window retry a
    // renewal gets, and nothing else.
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      amountPaise: DECLINED_PAISE,
      trialEndsAt: DAY3,
    });
    // The provider must report the mandate LIVE for this path to exist.
    provider.approveNow(mandate.referenceId);

    await svc.run(ist(2026, 7, 21, 9)); // PDN, 48h out
    await svc.run(ist(2026, 7, 23, 9)); // present → submitted
    await svc.run(ist(2026, 7, 23, 14)); // reconcile → the bank declined

    const attempt = await readOnlyAttempt(mandate.id);
    // Back to `notified`, sequence id KEPT: the next open window re-presents.
    expect(attempt.status).toBe("notified");
    expect(attempt.presentationSequenceId).not.toBeNull();
    expect(attempt.retryCount).toBe(1);

    // Nothing granted and nothing ended: no grace (nothing was ever paid), no
    // `expired` (the mandate is live), the trial lapses on its own date.
    const sub = await readSubscription(userId);
    expect(sub.status).toBe("trialing");
    expect(sub.graceUntil).toBeNull();
    expect(sub.trialEndsAt).toEqual(DAY3);
    expect((await mandates.findById(mandate.id))?.state).toBe("active");
  });

  test("once today's retries are spent, the first cycle is re-armed for TOMORROW", async () => {
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      amountPaise: DECLINED_PAISE,
      trialEndsAt: DAY3,
    });
    // The provider must report the mandate LIVE for this path to exist.
    provider.approveNow(mandate.referenceId);
    await svc.run(ist(2026, 7, 21, 9));
    await svc.run(ist(2026, 7, 23, 9));
    // Spend the budget: this row has already been presented the maximum
    // number of times today.
    await getPrisma().transaction.updateMany({
      where: { mandateId: mandate.id, kind: "recurring_debit" },
      data: { retryCount: MAX_PRESENTATION_RETRIES },
    });

    await svc.run(ist(2026, 7, 23, 14)); // reconcile → declined, budget spent

    const rows = await getPrisma().transaction.findMany({
      where: { mandateId: mandate.id, kind: "recurring_debit" },
    });
    expect(rows).toHaveLength(1);
    // Today's decline stands as the record; the mandate is NOT ended.
    expect(rows[0].status).toBe("failed");
    const after = await mandates.findById(mandate.id);
    expect(after?.state).toBe("active");
    expect(after?.nextDebitDate).toEqual(addDays(DAY3, 1));
    expect((await readSubscription(userId)).status).toBe("trialing");

    // The next tick claims tomorrow's cycle as a FIRST debit again — nothing
    // has ever settled — and raises a fresh notification for it.
    await svc.run(ist(2026, 7, 23, 14, 30));
    const fresh = await getPrisma().transaction.findFirst({
      where: { mandateId: mandate.id, kind: "recurring_debit", cycleDate: addDays(DAY3, 1) },
    });
    expect(fresh?.isFirstDebit).toBe(true);
    expect(fresh?.status).toBe("notified");
    expect(fresh?.presentationSequenceId).not.toBeNull();
  });

  test("past the retry window, a declined first debit on a live mandate ends the subscription", async () => {
    // Trial ended long ago: the window (`FIRST_DEBIT_RETRY_DAYS` after it) is
    // over, so this decline is final even though the mandate is live.
    const trialEnd = addDays(DAY3, -(FIRST_DEBIT_RETRY_DAYS + 1));
    const userId = await seedSubscription({ status: "trialing", trialEndsAt: trialEnd });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      amountPaise: DECLINED_PAISE,
      trialEndsAt: trialEnd,
    });
    provider.approveNow(mandate.referenceId);
    await svc.run(ist(2026, 7, 21, 9));
    await svc.run(ist(2026, 7, 23, 9));
    await getPrisma().transaction.updateMany({
      where: { mandateId: mandate.id, kind: "recurring_debit" },
      data: { retryCount: MAX_PRESENTATION_RETRIES },
    });
    await svc.run(ist(2026, 7, 23, 14));

    expect((await readOnlyAttempt(mandate.id)).status).toBe("failed");
    expect((await readSubscription(userId)).status).toBe("expired");
    // The date is NOT moved: nothing will claim this mandate again.
    expect((await mandates.findById(mandate.id))?.nextDebitDate).toEqual(DAY3);
  });

  test("a declined first cycle written off before the fix is re-armed by the sweep", async () => {
    // The state production was in: the row settled `failed` with a real
    // sequence id (it WAS presented and the bank said no), the subscription
    // `expired`, the mandate still `active` at the provider, and nothing left
    // that would ever claim it again. The sweep's look-back sees the cycle
    // and re-arms it — the same move as the lead repair, for a different
    // fault.
    const userId = await seedSubscription({ status: "expired" });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY1, trialEndsAt: DAY1 });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        status: "failed",
        failurePhase: "settle",
        failureCode: "INSUFFICIENT_FUNDS",
        isFirstDebit: true,
        presentationSequenceId: "stub_seq_declined",
        amountPaise: AMOUNT_PAISE,
        currency: "INR",
      },
    });

    // Two days later, inside peak so nothing but the sweep gate can move it.
    await svc.run(ist(2026, 7, 23, 11));

    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate).toEqual(addDays(DAY3, 1));
    // The write-off itself is untouched: a later success revives the
    // subscription through `applyDebitSucceeded`, which has no status guard.
    expect((await readSubscription(userId)).status).toBe("expired");
  });

  test("the sweep leaves a declined first cycle alone once its window is over", async () => {
    const trialEnd = addDays(DAY1, -(FIRST_DEBIT_RETRY_DAYS + 1));
    const userId = await seedSubscription({ status: "expired" });
    const mandate = await seedActiveMandate({ userId, nextDebitDate: DAY1, trialEndsAt: trialEnd });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        status: "failed",
        failurePhase: "settle",
        failureCode: "INSUFFICIENT_FUNDS",
        isFirstDebit: true,
        presentationSequenceId: "stub_seq_declined",
        amountPaise: AMOUNT_PAISE,
        currency: "INR",
      },
    });

    await svc.run(ist(2026, 7, 21, 11));

    expect((await mandates.findById(mandate.id))?.nextDebitDate).toEqual(DAY1);
    expect((await readSubscription(userId)).status).toBe("expired");
  });
});

/**
 * Asynchronous settlement — the NORMAL path against the real provider.
 *
 * `presentDebit` answering `pending` is what Decentro does in the ordinary
 * case: the debit is submitted and settles at the bank minutes or hours later.
 * Before `getDebitStatus` existed there was no way to learn the outcome —
 * `settle('succeeded')` was reachable only from a synchronous provider
 * response, so a `pending` presentation left the attempt in
 * `presentation_sent` forever, the user charged and the subscription never
 * extended.
 *
 * The stub reaches this branch on a ₹3 amount (₹4 for the failing twin), which
 * is the only way to exercise it without a network.
 */
describe("asynchronous settlement", () => {
  /** ₹3 — the stub presents `pending`, then reports success on a status read. */
  const ASYNC_SUCCESS_PAISE = 3_00;
  /** ₹4 — presents `pending`, then reports a bank decline. */
  const ASYNC_FAILURE_PAISE = 4_00;

  test("a pending presentation is resolved by the straggler sweep", async () => {
    const userId = await seedSubscription({
      status: "trialing",
      trialEndsAt: DAY3,
    });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      amountPaise: ASYNC_SUCCESS_PAISE,
    });

    await svc.run(ist(2026, 7, 21, 9)); // PDN, 48h out
    const debitReport = await svc.run(ist(2026, 7, 23, 9)); // present
    expect(debitReport.presentationsSent).toBe(1);

    // Submitted, not settled. Nothing may be granted off a `pending`: the bank
    // has not moved money yet, and treating it as success would hand out a
    // month for a debit that can still be declined.
    const pending = await readOnlyAttempt(mandate.id);
    expect(pending.status).toBe("submitted");
    expect(pending.settledAt).toBeNull();
    expect((await readSubscription(userId)).status).toBe("trialing");

    // Two hours later the sweep asks the provider what happened. This is the
    // step that did not exist: without it the assertions below never become
    // true, no matter how many ticks run.
    const sweep = await svc.run(ist(2026, 7, 23, 14));
    expect(sweep.reconciled).toBe(1);

    const settled = await readOnlyAttempt(mandate.id);
    expect(settled.status).toBe("succeeded");
    expect(settled.settledAt).not.toBeNull();
    // Lifted from the status read, not invented — this is the reconciliation
    // trail a disputed charge is answered from.
    expect(settled.bankReferenceNumber).not.toBeNull();

    const sub = await readSubscription(userId);
    expect(sub.status).toBe("active");
    // Still derived from the CYCLE date. Resolving late must not grant a period
    // measured from whenever the sweep happened to run.
    expect(sub.expiresAt?.toISOString()).toBe(
      addMonthClamped(DAY3).toISOString()
    );
    expect(sub.trialEndsAt).toBeNull();

    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate?.toISOString()).toBe(
      addMonthClamped(DAY3).toISOString()
    );
  });

  test("a pending presentation that settles as failed duns without ending", async () => {
    const userId = await seedSubscription({ status: "active", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY1,
      amountPaise: ASYNC_FAILURE_PAISE,
    });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        status: "notified",
        // A RENEWAL. The first-debit path is unconditional (NPCI auto-revokes),
        // so only this branch exercises retry + grace.
        isFirstDebit: false,
        presentationSequenceId: `stub_seq_${mandate.referenceId}`,
        amountPaise: ASYNC_FAILURE_PAISE,
        currency: "INR",
        notifiedAt: ist(2026, 7, 20, 9),
      },
    });

    await svc.run(ist(2026, 7, 21, 14)); // presents, gets `pending`
    await svc.run(ist(2026, 7, 22, 9)); // sweep resolves it as failed

    const attempt = await readOnlyAttempt(mandate.id);
    // Settled `failed`, NOT parked back in `notified`. This cycle is over; the
    // next attempt is a fresh cycle tomorrow with its own notification, because
    // re-presenting a spent PDN has no NPCI lead left to offer.
    expect(attempt.status).toBe("failed");
    expect(attempt.failureCode).toBe("INSUFFICIENT_FUNDS");

    // Re-armed for tomorrow — ONE attempt per day, not three in one evening.
    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate?.toISOString()).toBe(
      istDay(2026, 7, 23).toISOString()
    );

    const sub = await readSubscription(userId);
    // Dunning, not lapsed. A 3am insufficient-balance failure must not lock out
    // someone who has been paying for months.
    expect(sub.status).toBe("past_due");
    // Anchored on the FIRST failure (this cycle, DAY1) + RENEWAL_RETRY_DAYS —
    // not on `now`, which would slide the deadline a day on every retry and
    // never close the window.
    expect(sub.graceUntil?.toISOString()).toBe(
      addDays(DAY1, RENEWAL_RETRY_DAYS).toISOString()
    );
  });

  test("the seventh straight failure stops re-arming and lets grace lapse it", async () => {
    // The window is anchored on the FIRST failure, so it closes on a fixed date
    // no matter how many times we have retried since. Without that anchor each
    // failure would push the deadline another day out and a subscriber who
    // never pays again would be retried, and entitled, forever.
    const userId = await seedSubscription({ status: "active", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: istDay(2026, 7, 27),
      amountPaise: ASYNC_FAILURE_PAISE,
    });

    // Dunning began on DAY1, so the window closes DAY1 + RENEWAL_RETRY_DAYS.
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        status: "failed",
        isFirstDebit: false,
        amountPaise: ASYNC_FAILURE_PAISE,
        currency: "INR",
        failureCode: "INSUFFICIENT_FUNDS",
      },
    });

    // The last re-armed cycle, landing ON the deadline.
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: istDay(2026, 7, 27),
        status: "notified",
        isFirstDebit: false,
        presentationSequenceId: `stub_seq_${mandate.referenceId}`,
        amountPaise: ASYNC_FAILURE_PAISE,
        currency: "INR",
        notifiedAt: ist(2026, 7, 26, 9),
      },
    });

    await svc.run(ist(2026, 7, 27, 14)); // presents, gets `pending`
    await svc.run(ist(2026, 7, 28, 9)); // sweep resolves it as failed

    // Tomorrow (29th) is past the deadline (28th), so NO re-arm: the mandate's
    // next debit is left where it was rather than pushed another day.
    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate?.toISOString()).toBe(
      istDay(2026, 7, 27).toISOString()
    );

    const sub = await readSubscription(userId);
    // THE AUTOMATIC CANCELLATION. No bespoke "cancel on the 7th failure" branch
    // exists and none is wanted: grace was pinned to the first failure, so the
    // seventh failure lands on the day it ends and the expiry sweep — which
    // already owns this transition — lapses the subscription on its own.
    // `expired`, not `cancelled`: this codebase reserves `cancelled` for a
    // subscriber who chose to leave, and a declined debit is involuntary churn.
    expect(sub.status).toBe("expired");
  });

  test("a renewal re-armed on the last tick before midnight is moved, not stranded", async () => {
    // The timeline this guards: a presentation inside the 21:30-24:00 window
    // comes back `pending`, the 23:30 tick reconciles it as failed and re-arms
    // for "tomorrow" — but the new cycle's notification goes out on the NEXT
    // tick, which is past midnight. By then "tomorrow" is today, the lead is
    // 0h, and `canSendPreDebitNotification` refuses forever. The lead repair
    // that catches exactly this for a first cycle used to skip renewals on
    // purpose ("moving a renewal's date hands a paying subscriber free time"),
    // which is true of a stale renewal and false of one in dunning: that
    // subscriber is `past_due`, grace is pinned to the first failure, and
    // moving the cycle a day extends nothing. Without this the subscriber got
    // ONE retry of the promised seven, silently.
    const userId = await seedSubscription({ status: "active", expiresAt: DAY3 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY1,
      amountPaise: ASYNC_FAILURE_PAISE,
    });
    // A settled renewal in the past, so this mandate is NOT `neverCharged` and
    // the old first-cycle-only repair would refuse to touch it.
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: istDay(2026, 6, 21),
        status: "succeeded",
        isFirstDebit: false,
        gatewayPaymentId: "stub_pay_prev",
        amountPaise: ASYNC_FAILURE_PAISE,
        currency: "INR",
        settledAt: ist(2026, 6, 21, 9),
      },
    });
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: DAY1,
        status: "notified",
        isFirstDebit: false,
        presentationSequenceId: `stub_seq_${mandate.referenceId}`,
        amountPaise: ASYNC_FAILURE_PAISE,
        currency: "INR",
        notifiedAt: ist(2026, 7, 20, 9),
      },
    });

    // Presented at the opening of the 21:30 window; a pending row is only
    // reconciled once it is strictly older than UNSETTLED_AFTER_MS (2h), so
    // the last tick of the IST day is the first that can resolve it. The
    // scheduler is `rate(30 minutes)` with an arbitrary phase, so 23:45 is as
    // real a tick as 23:30.
    await svc.run(ist(2026, 7, 21, 21, 30)); // presents, `pending`
    await svc.run(ist(2026, 7, 21, 23, 45)); // last tick of the day: failed -> re-armed for the 22nd

    const rearmed = await getPrisma().mandate.findUniqueOrThrow({ where: { id: mandate.id } });
    expect(rearmed.nextDebitDate).toEqual(istDay(2026, 7, 22));

    // 00:05 on the 22nd: the cycle is now TODAY, lead 0h. This is the tick that
    // used to strand it.
    const report = await svc.run(ist(2026, 7, 22, 0, 5));
    expect(report.pdnSent).toBe(0);

    const moved = await getPrisma().mandate.findUniqueOrThrow({ where: { id: mandate.id } });
    expect(moved.nextDebitDate).toEqual(istDay(2026, 7, 23));

    // And it recovers for real: the next tick notifies the moved cycle, so the
    // retry actually happens instead of being silently lost.
    const next = await svc.run(ist(2026, 7, 22, 9));
    expect(next.pdnSent).toBe(1);

    // Grace did not move — it is still pinned to the first failure.
    const sub = await readSubscription(userId);
    expect(sub.status).toBe("past_due");
    expect(sub.graceUntil?.toISOString()).toBe(addDays(DAY1, RENEWAL_RETRY_DAYS).toISOString());
  });

  test("a renewal recovered mid-dunning keeps its ORIGINAL billing anniversary", async () => {
    // Each daily retry is a fresh cycle with a later date. If the paid period
    // were measured from the row that finally settled, a Tuesday decline
    // collected on Friday would hand over three free days and move every
    // later debit — a contract change nobody asked for. The old same-
    // notification retry never moved the date; neither may this.
    const userId = await seedSubscription({ status: "past_due", expiresAt: DAY1 });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: istDay(2026, 7, 24),
      amountPaise: ASYNC_SUCCESS_PAISE,
    });
    // Dunning began on DAY1 (the original cycle) and failed again on the 22nd
    // and 23rd; the 24th is the re-armed cycle that will succeed.
    for (const day of [21, 22, 23]) {
      await getPrisma().transaction.create({
        data: {
          mandateId: mandate.id,
          userId,
          kind: "recurring_debit",
          provider: "stub",
          chargePhase: "submission",
          cycleDate: istDay(2026, 7, day),
          status: "failed",
          isFirstDebit: false,
          amountPaise: ASYNC_SUCCESS_PAISE,
          currency: "INR",
          failureCode: "INSUFFICIENT_FUNDS",
        },
      });
    }
    await getPrisma().transaction.create({
      data: {
        mandateId: mandate.id,
        userId,
        kind: "recurring_debit",
        provider: "stub",
        chargePhase: "submission",
        cycleDate: istDay(2026, 7, 24),
        status: "notified",
        isFirstDebit: false,
        presentationSequenceId: `stub_seq_${mandate.referenceId}`,
        amountPaise: ASYNC_SUCCESS_PAISE,
        currency: "INR",
        notifiedAt: ist(2026, 7, 23, 9),
      },
    });

    await svc.run(ist(2026, 7, 24, 14)); // presents, `pending`
    await svc.run(ist(2026, 7, 25, 9)); // sweep settles it

    // Four rows exist on this mandate (three failed, one settled), so read
    // the one that settled by its cycle rather than through `readOnlyAttempt`.
    const settled = await getPrisma().transaction.findFirstOrThrow({
      where: { mandateId: mandate.id, kind: "recurring_debit", cycleDate: istDay(2026, 7, 24) },
    });
    expect(settled.status).toBe("succeeded");

    // The period runs from DAY1 — the day the money was first due — not from
    // the 24th, the day the bank finally said yes.
    const sub = await readSubscription(userId);
    expect(sub.status).toBe("active");
    expect(sub.expiresAt?.toISOString()).toBe(addMonthClamped(DAY1).toISOString());

    // And the next debit lands on the same anniversary, so it does not drift.
    const after = await mandates.findById(mandate.id);
    expect(after?.nextDebitDate?.toISOString()).toBe(addMonthClamped(DAY1).toISOString());
  });

  test("resolving the same attempt twice grants nothing extra", async () => {
    // The provider re-delivers callbacks, and the sweep runs every tick, so
    // the same settled debit WILL be resolved more than once. The guard is the
    // `status NOT IN (terminal)` clause in `settle`; if it ever regressed, a
    // chatty provider would extend a subscription once per delivery.
    const userId = await seedSubscription({
      status: "trialing",
      trialEndsAt: DAY3,
    });
    const mandate = await seedActiveMandate({
      userId,
      nextDebitDate: DAY3,
      amountPaise: ASYNC_SUCCESS_PAISE,
    });

    await svc.run(ist(2026, 7, 21, 9));
    await svc.run(ist(2026, 7, 23, 9));

    const presented = await readOnlyAttempt(mandate.id);
    const at = ist(2026, 7, 23, 14);

    expect(await svc.resolvePayment(presented, at)).toBe(true);
    const first = await readSubscription(userId);

    // Re-resolve the SAME row — the shape of a re-delivered callback arriving
    // after the sweep already settled the debit.
    expect(await svc.resolvePayment(presented, at)).toBe(true);
    const second = await readSubscription(userId);

    expect(second.expiresAt?.toISOString()).toBe(first.expiresAt?.toISOString());
    expect((await readOnlyAttempt(mandate.id)).status).toBe("succeeded");
  });
});

/**
 * Regression: the "payment link expired" dead end, found on a real device.
 *
 * A mandate that reached `active` but whose subscription never received the
 * authorization write sat in a state it could never leave:
 *
 *   - `findReusableForUser` returns `active` mandates unconditionally, so
 *     every Pay Now tap got the same one back;
 *   - its 15-minute approval link had long expired, so `toView` nulled
 *     `authUrl` and the client rendered "This payment link has expired";
 *   - `refreshFromProvider` only applied transitions on a state CHANGE, and
 *     the mandate was already `active`, so it never self-corrected.
 *
 * The user could not escape by retrying, reinstalling, or waiting.
 */
describe("the registration deposit", () => {
  const PLAN = {
    planId: "month",
    productId: "prabhuji_vip_month",
    amountPaise: 29900,
    initialDepositPaise: 200,
    currency: "INR",
    trialDays: 3,
  };

  async function registerFor(userId: string) {
    await getPrisma().subscription.create({
      data: { userId, status: "free" },
    });
    return mandateService.createMandate({ userId, plan: PLAN, now: new Date() });
  }

  /**
   * The charge that used to be recorded NOWHERE.
   *
   * Before the ledger, registration debited the trial deposit and kept only
   * `mandates.provider_txn_id` — an id with no amount and no status, while the
   * amount itself lived in a TypeScript constant. This test is the proof that a
   * rupee taken at registration now leaves a row.
   */
  test("registration writes a deposit row for the plan's amount", async () => {
    const userId = randomUUID();
    await registerFor(userId);

    const deposits = await getPrisma().transaction.findMany({
      where: { userId, kind: "initial_deposit" },
    });
    expect(deposits).toHaveLength(1);
    expect(deposits[0].amountPaise).toBe(PLAN.initialDepositPaise);
    // NOT the recurring price — charging that on day 0 would defeat the trial.
    expect(deposits[0].amountPaise).not.toBe(PLAN.amountPaise);
    // Persisted before dispatch, so a lost response is still reconcilable.
    expect(deposits[0].gatewayRequestId).not.toBeNull();
    expect(deposits[0].status).toBe("submitted");
  });

  test("approving the mandate settles the deposit with the gateway's id", async () => {
    const userId = randomUUID();
    await registerFor(userId);

    await new Promise((r) => setTimeout(r, STUB_AUTO_APPROVE_MS + 300));
    await mandateService.getMandateForUser(userId, new Date());

    const deposit = await getPrisma().transaction.findFirstOrThrow({
      where: { userId, kind: "initial_deposit" },
    });
    expect(deposit.status).toBe("succeeded");
    // `transactions_settled_has_gateway_id` makes this unrepresentable
    // otherwise — money that moved is always traceable.
    expect(deposit.gatewayPaymentId).not.toBeNull();
    expect(deposit.settledAt).not.toBeNull();
  });

  /**
   * The regression `countRecurringDebitsForMandate`'s `kind` filter prevents.
   *
   * An unfiltered count sees the deposit row and reports `isFirstDebit: false`
   * on the genuine first cycle — which would send a failed first debit down the
   * RETRY path against a mandate NPCI has already auto-revoked, instead of
   * re-registering.
   */
  test("the deposit does not make the first cycle look like a renewal", async () => {
    const userId = randomUUID();
    await registerFor(userId);

    await new Promise((r) => setTimeout(r, STUB_AUTO_APPROVE_MS + 300));
    await mandateService.getMandateForUser(userId, new Date());

    const mandate = await getPrisma().mandate.findFirstOrThrow({ where: { userId } });
    await getPrisma().mandate.update({
      where: { id: mandate.id },
      data: { nextDebitDate: DAY3 },
    });

    await svc.run(ist(2026, 7, 21, 9));

    const debit = await readOnlyAttempt(mandate.id);
    expect(debit.isFirstDebit).toBe(true);
  });
});

describe("stale active mandate recovery", () => {
  test("an active mandate granting nothing with a dead link is retired, not reused", async () => {
    const userId = randomUUID();
    await getPrisma().subscription.create({
      data: { userId, status: "pending" },
    });
    const stale = await getPrisma().mandate.create({
      data: {
        userId,
        type: "upi",
        provider: "stub",
        referenceId: `pj_mnd_${randomUUID()}`,
        state: "active",
        planId: "month",
        productId: "prabhuji_vip_month",
        amountPaise: 29900,
        startDate: new Date("2026-07-24"),
        endDate: new Date("2056-07-21"),
        authUrl: "upi://mandate?stale=1",
        // Dead link: 15-minute TTL, expired an hour ago.
        authExpiresAt: new Date(Date.now() - 60 * 60_000),
      },
    });

    const view = await mandateService.createMandate({
      userId,
      plan: {
        planId: "month",
        productId: "prabhuji_vip_month",
        amountPaise: 29900,
        initialDepositPaise: 200,
        currency: "INR",
        trialDays: 3,
      },
      now: new Date(),
    });

    // A NEW mandate with a usable link — not the dead one back again.
    expect(view.mandateId).not.toBe(stale.id);
    expect(view.authUrl).not.toBeNull();

    const retired = await getPrisma().mandate.findUnique({
      where: { id: stale.id },
    });
    expect(retired?.state).toBe("expired");
    expect(retired?.stateReason).toBe("stale_no_auth_link");
  });

  test("an active mandate that IS granting entitlement is still reused", async () => {
    // The other direction — don't churn a mandate that is working. Driven
    // through the real flow so the stub provider actually knows this mandate;
    // inserting one directly would make the status refresh report it unknown,
    // which is a test artifact rather than a behaviour worth asserting.
    const userId = randomUUID();
    await getPrisma().subscription.create({ data: { userId, status: "free" } });
    const plan = {
      planId: "month",
      productId: "prabhuji_vip_month",
      amountPaise: 29900,
      initialDepositPaise: 200,
      currency: "INR",
      trialDays: 3,
    };

    const first = await mandateService.createMandate({
      userId,
      plan,
      now: new Date(),
    });

    // Let the stub auto-approve, then poll so the mandate goes active and the
    // trial is granted.
    await new Promise((r) => setTimeout(r, STUB_AUTO_APPROVE_MS + 300));
    await mandateService.getMandateForUser(userId, new Date());

    const again = await mandateService.createMandate({
      userId,
      plan,
      now: new Date(),
    });

    // Same mandate handed back — an entitled user must not mint a second one.
    expect(again.mandateId).toBe(first.mandateId);
    const row = await getPrisma().mandate.findUnique({
      where: { id: first.mandateId },
    });
    expect(row?.state).toBe("active");
    const sub = await getPrisma().subscription.findUnique({ where: { userId } });
    expect(sub?.status).toBe("trialing");
  });
});
