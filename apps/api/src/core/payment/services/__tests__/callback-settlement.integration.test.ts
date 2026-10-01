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
import type * as LogsModule from "@api/shared/logs";
import { PROVIDER } from "@api/shared/config";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { SubscriptionRepository } from "@api/core/subscription/repositories";
import { SubscriptionService } from "@api/core/subscription/services";
import { SubscriptionApi } from "@api/core/subscription/api";
import { WebhookEventRepository } from "../../repositories/webhook-event.repository.js";
import { MandateRepository } from "../../repositories/mandate.repository.js";
import { TransactionsRepository } from "../../repositories/transactions.repository.js";
import { PdnRepository } from "../../repositories/pdn.repository.js";
import { StubMandateProvider } from "../../repositories/stub-mandate.repository.js";
import type { RecurringDebitRow } from "../../repositories/transactions.repository.js";
import { BillingCycleService } from "../billing-cycle.service.js";
import { CallbackService, extractRef } from "../callback.service.js";
import { MandateService } from "../mandate.service.js";
import { PdnService } from "../pdn.service.js";
import { addDays, addMonthClamped } from "../npci-window.js";

/**
 * Presentation callbacks, end to end against real Postgres.
 *
 * These exist to pin ONE property above all others: **a callback is a trigger,
 * not a fact.** Decentro's India v3 stack has no HMAC signature, so a
 * presentation callback body is forgeable by anyone who learns the URL and the
 * static token. The body therefore decides only WHICH debit to ask about; the
 * outcome comes from `getDebitStatus` against the provider's own API.
 *
 * The forged-callback test below is the one that would catch a regression here,
 * and it is written so that it FAILS if anyone ever "optimises" the status read
 * away by trusting `transaction_status` from the body — which is exactly the
 * shortcut that looks harmless in review.
 *
 * The second property: before `getDebitStatus` existed, these callbacks
 * resolved to a mandate-status read that never touched the ledger, so a
 * debit that settled asynchronously was never recorded and never extended the
 * subscription. Both halves are asserted.
 */

/**
 * Every `event` field logged by the payment module, in order.
 *
 * The real logger still runs — this only records on the way through — so the
 * other tests in this file see exactly the logging they always did. It exists
 * for the settle-race tests below, whose contract is "ONE `debit_failed` line":
 * the event names are what alerts and dashboards filter on.
 */
const loggedEvents = vi.hoisted((): Array<{ event: unknown; branch: unknown }> => []);
vi.mock("@api/shared/logs", async (importOriginal) => {
  const actual = await importOriginal<typeof LogsModule>();
  return {
    ...actual,
    createModuleLogger: (namespace: string) =>
      new Proxy(actual.createModuleLogger(namespace), {
        get(target, prop, receiver): unknown {
          const real: unknown = Reflect.get(target, prop, receiver);
          if (
            (prop === "info" || prop === "warn" || prop === "error") &&
            typeof real === "function"
          ) {
            return (...args: unknown[]): unknown => {
              const [obj] = args;
              if (typeof obj === "object" && obj !== null) {
                const fields = obj as Record<string, unknown>;
                loggedEvents.push({ event: fields.event, branch: fields.branch });
              }
              return Reflect.apply(real, target, args);
            };
          }
          return real;
        },
      }),
  };
});

const PLAN_ID = "month";
const PRODUCT_ID = "prabhuji_vip_month";
/** ₹3 — the stub presents `pending`, then reports success on a status read. */
const ASYNC_SUCCESS_PAISE = 3_00;
/** ₹4 — presents `pending`, then reports a bank decline. */
const ASYNC_FAILURE_PAISE = 4_00;

function istDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function ist(y: number, m: number, d: number, hh: number, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60_000);
}

const DAY3 = istDay(2026, 7, 23);

let provider: StubMandateProvider;
let mandates: MandateRepository;
let transactions: TransactionsRepository;
let billing: BillingCycleService;
let callbacks: CallbackService;

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await getPrisma().paymentCallbackEvent.deleteMany({});
  await getPrisma().paymentWebhookEvent.deleteMany({});
  // Before notifications, which are before mandates: both FKs are
  // `onDelete: Restrict`.
  await getPrisma().transaction.deleteMany({});
  await getPrisma().paymentPdnNotification.deleteMany({});
  await getPrisma().mandate.deleteMany({});
  await getPrisma().subscription.deleteMany({});

  provider = new StubMandateProvider();
  mandates = new MandateRepository();
  transactions = new TransactionsRepository();

  clearGlobalServices();
  registerGlobalService(
    "subscription",
    new SubscriptionApi(new SubscriptionService(new SubscriptionRepository()))
  );

  const mandateService = new MandateService(mandates, transactions, provider, () => provider, {
    expiryMinutes: 15,
    mandateName: "Prabhuji",
  });
  const pdns = new PdnRepository();
  const pdnService = new PdnService(pdns, transactions, () => provider);
  billing = new BillingCycleService(mandates, transactions, () => provider, mandateService, pdnService, pdns, {
    managedByProvider: false,
  });
  callbacks = new CallbackService(
    new WebhookEventRepository(),
    mandates,
    transactions,
    mandateService,
    billing,
    pdnService
  );
});

afterEach(() => {
  clearGlobalServices();
});

/**
 * Drive a mandate all the way to a presented-but-unsettled debit, which is the
 * state a presentation callback actually arrives in.
 */
async function presentedDebit(amountPaise: number) {
  const userId = randomUUID();
  await getPrisma().subscription.create({
    data: {
      userId,
      status: "trialing",
      activePlanId: PLAN_ID,
      activeProductId: PRODUCT_ID,
      provider: "stub",
      trialEndsAt: DAY3,
    },
  });

  const referenceId = `pj_mnd_${randomUUID()}`;
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
    startDate: DAY3,
    endDate: addDays(DAY3, 365),
    expiryMinutes: 15,
  });

  const mandate = await getPrisma().mandate.create({
    data: {
      userId,
      type: "upi",
      provider: "stub",
      referenceId,
      providerMandateId: registered.providerMandateId,
      state: "active",
      planId: PLAN_ID,
      productId: PRODUCT_ID,
      amountPaise,
      currency: "INR",
      startDate: DAY3,
      endDate: addDays(DAY3, 365),
      nextDebitDate: DAY3,
    },
  });

  await billing.run(ist(2026, 7, 21, 9)); // PDN
  await billing.run(ist(2026, 7, 23, 9)); // presentation → `pending`

  const attempt = await getPrisma().transaction.findFirstOrThrow({
    where: { mandateId: mandate.id },
  });
  expect(attempt.status).toBe("submitted");

  return { userId, mandate, attempt };
}

async function readSubscription(userId: string) {
  return getPrisma().subscription.findUniqueOrThrow({ where: { userId } });
}

/**
 * Ingest a Decentro-shaped presentation callback through the (now provider-
 * agnostic) service: the controller normally supplies `provider` + a gateway-
 * extracted `ref`; here we do the same with the Decentro extractor.
 */
function ingestPresentation(
  body: Record<string, unknown>,
  sourceIp: string | null,
  now: Date
) {
  return callbacks.ingest({
    // MUST match the provider the mandate rows are seeded with (`"stub"`), and
    // it does now because `CallbackService` refuses a callback whose resolved
    // mandate belongs to a different gateway. This said `decentro` while the
    // fixtures said `stub` — harmless when one gateway was hardcoded
    // everywhere, and a legitimate rejection now that two can be live at once.
    // The adapter under test really is the stub, so `stub` is also the honest
    // value.
    provider: PROVIDER.STUB,
    kind: "presentation",
    ref: extractRef("presentation", body),
    body,
    sourceIp,
    now,
  });
}

describe("presentation callback settles the debit", () => {
  test("an attempt left pending is settled and the subscription extends", async () => {
    const { userId, mandate } = await presentedDebit(ASYNC_SUCCESS_PAISE);

    const result = await ingestPresentation(
      {
        reference_id: mandate.referenceId,
        decentro_mandate_id: mandate.providerMandateId,
        callback_txn_id: "cb_1",
        transaction_status: "SUCCESS",
      },
      "1.2.3.4",
      ist(2026, 7, 23, 10)
    );

    expect(result).toBe("processed");

    const settled = await getPrisma().transaction.findFirstOrThrow({
      where: { mandateId: mandate.id },
    });
    expect(settled.status).toBe("succeeded");
    expect(settled.bankReferenceNumber).not.toBeNull();

    const sub = await readSubscription(userId);
    expect(sub.status).toBe("active");
    // Derived from the cycle date, not from when the callback happened to
    // arrive — a slow provider must not shorten or lengthen the period.
    expect(sub.expiresAt?.toISOString()).toBe(
      addMonthClamped(DAY3).toISOString()
    );
  });

  /**
   * THE security test for this path.
   *
   * The body claims the debit succeeded. The provider says it failed. The
   * provider wins — the user ends up dunned, not entitled. If this ever
   * inverts, anyone who can reach the callback URL can mint subscriptions.
   */
  test("a forged success grants nothing — the provider decides", async () => {
    const { userId, mandate } = await presentedDebit(ASYNC_FAILURE_PAISE);

    const result = await ingestPresentation(
      {
        reference_id: mandate.referenceId,
        callback_txn_id: "cb_forged",
        // A lie. Nothing reads it.
        transaction_status: "SUCCESS",
        amount: "999999",
      },
      "203.0.113.9",
      ist(2026, 7, 23, 10)
    );

    expect(result).toBe("processed");

    const sub = await readSubscription(userId);
    expect(sub.status).not.toBe("active");
    expect(sub.expiresAt).toBeNull();

    const attempt = await getPrisma().transaction.findFirstOrThrow({
      where: { mandateId: mandate.id },
    });
    expect(attempt.failureCode).toBe("INSUFFICIENT_FUNDS");
  });

  test("a re-delivered callback is deduped and extends nothing twice", async () => {
    const { userId, mandate } = await presentedDebit(ASYNC_SUCCESS_PAISE);
    const body = {
      reference_id: mandate.referenceId,
      callback_txn_id: "cb_2",
      transaction_status: "SUCCESS",
    };

    expect(await ingestPresentation(body, null, ist(2026, 7, 23, 10))).toBe(
      "processed"
    );
    const first = await readSubscription(userId);

    // Decentro retries until it sees a 200 and increments `callback_attempt`
    // each time — which is precisely why that field is excluded from the
    // dedupe key. Same logical event, so: duplicate.
    expect(
      await ingestPresentation(
        { ...body, callback_attempt: 2 },
        null,
        ist(2026, 7, 23, 11)
      )
    ).toBe("duplicate");

    const second = await readSubscription(userId);
    expect(second.expiresAt?.toISOString()).toBe(first.expiresAt?.toISOString());
  });

  test("a callback for an unknown reference is recorded, not acted on", async () => {
    const result = await ingestPresentation(
      { reference_id: "pj_mnd_does_not_exist", callback_txn_id: "cb_3" },
      "203.0.113.9",
      ist(2026, 7, 23, 10)
    );

    expect(result).toBe("unknown_reference");
    // Kept rather than dropped: a burst of these is the signature of a
    // mis-whitelisted callback URL, only diagnosable after the fact.
    // `webhook_events`, not `payment_callback_events`: the inbox moved in TAM-141
    // and there is deliberately only ONE, because two inboxes would mean two dedupe
    // ledgers and an event deduped in one could still be reprocessed via the other.
    const row = await getPrisma().paymentWebhookEvent.findFirstOrThrow({});
    expect(row.status).toBe("ignored_unknown");
  });
});

/**
 * Webhook vs sweep on the same `submitted` attempt (TAM-260, Task 1).
 *
 * A presentation callback and the sweep's `reconcileUnsettled` can each read
 * the attempt while it is still `submitted`, both ask the provider, and both
 * reach `onDebitFailed`. The ledger write (`settle` / `markForRetry`, guarded
 * `updateMany`s) is the only arbiter, and exactly one of them moves the row.
 * Before the guard, the LOSER still re-armed the mandate, started dunning again
 * and re-sent every analytics event — one decline, reported and dunned twice.
 *
 * Both resolvers are handed the SAME stale snapshot and run concurrently, which
 * is precisely the state the race produces. Driving the real callback and the
 * real sweep instead would only race when the sweep's `findUnsettled` read
 * happens to land before the callback's write, so it would pass whether or not
 * the guard exists.
 */
describe("concurrent resolution of one failed debit (settle guard)", () => {
  let send: MockInstance<(events: AnalyticsEventInput[]) => Promise<void>>;
  let applyDebitFailed: MockInstance<SubscriptionApi["applyDebitFailed"]>;

  beforeEach(() => {
    loggedEvents.length = 0;
    send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    applyDebitFailed = vi.spyOn(SubscriptionApi.prototype, "applyDebitFailed");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function events(name: string): Array<{ event: unknown; branch: unknown }> {
    return loggedEvents.filter((e) => e.event === name);
  }

  function published(eventType: string): number {
    return send.mock.calls
      .flatMap((call) => call[0] ?? [])
      .filter((e) => e.event_type === eventType).length;
  }

  /** The presented row, as the `RecurringDebitRow` both resolvers hold. */
  async function snapshot(mandateId: string): Promise<RecurringDebitRow> {
    const row = await getPrisma().transaction.findFirstOrThrow({
      where: { mandateId, kind: "recurring_debit" },
    });
    expect(row.status).toBe("submitted");
    expect(row.mandateId).not.toBeNull();
    expect(row.cycleDate).not.toBeNull();
    return row as RecurringDebitRow;
  }

  test("a renewal decline is settled, re-armed and dunned ONCE", async () => {
    const { userId, mandate } = await presentedDebit(ASYNC_FAILURE_PAISE);
    // Make it a RENEWAL: a paying subscriber whose next cycle was declined.
    // Only this branch re-arms and duns.
    await getPrisma().transaction.updateMany({
      where: { mandateId: mandate.id, kind: "recurring_debit" },
      data: { isFirstDebit: false },
    });
    await getPrisma().subscription.update({
      where: { userId },
      data: { status: "active", trialEndsAt: null, expiresAt: DAY3 },
    });
    const attempt = await snapshot(mandate.id);
    const now = ist(2026, 7, 23, 14);
    loggedEvents.length = 0;
    send.mockClear();

    const results = await Promise.all([
      billing.resolvePayment(attempt, now, "webhook"),
      billing.resolvePayment(attempt, now, "poll"),
    ]);
    // Both still report "terminal" — the caller contract is unchanged.
    expect(results).toEqual([true, true]);

    const row = await getPrisma().transaction.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(row.status).toBe("failed");
    expect(row.failureCode).toBe("INSUFFICIENT_FUNDS");

    expect(events("debit_failed")).toHaveLength(1);
    expect(events("debit_failed_already_settled")).toEqual([
      { event: "debit_failed_already_settled", branch: "renewal" },
    ]);
    expect(applyDebitFailed).toHaveBeenCalledTimes(1);
    expect(published("bk_payment_result")).toBe(1);
    // The money view of the same decline (`trackPaymentFailed`), whichever of
    // the two names this mandate's payment type maps to.
    expect(published("bk_subscription_failed") + published("bk_trial_failed")).toBe(1);

    // Derived exactly as the single-resolver path derives them: re-armed to
    // IST tomorrow, grace anchored on the first failure.
    expect((await mandates.findById(mandate.id))?.nextDebitDate).toEqual(
      istDay(2026, 7, 24)
    );
    const sub = await readSubscription(userId);
    expect(sub.status).toBe("past_due");
    expect(sub.graceUntil).not.toBeNull();
  });

  test("a first-debit decline on a live mandate is retried ONCE", async () => {
    const { userId, mandate } = await presentedDebit(ASYNC_FAILURE_PAISE);
    // The provider must report the mandate LIVE for the retry branch to exist.
    provider.approveNow(mandate.referenceId);
    const attempt = await snapshot(mandate.id);
    const now = ist(2026, 7, 23, 14);
    loggedEvents.length = 0;
    send.mockClear();

    await Promise.all([
      billing.resolvePayment(attempt, now, "webhook"),
      billing.resolvePayment(attempt, now, "poll"),
    ]);

    const row = await getPrisma().transaction.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    // Back to `notified` exactly once, sequence id kept.
    expect(row.status).toBe("notified");
    expect(row.presentationSequenceId).not.toBeNull();

    expect(events("first_debit_retry_scheduled")).toHaveLength(1);
    expect(events("debit_failed_already_settled")).toEqual([
      { event: "debit_failed_already_settled", branch: "first_debit_retry" },
    ]);
    expect(published("bk_payment_result")).toBe(1);
    expect(published("bk_payment_retry_scheduled")).toBe(1);

    // The retry branch touches no entitlement — no dunning, no grace, no
    // re-arm — on either resolver. (The subscription's own status is not
    // asserted: this fixture's mandate carries no trial, so the mandate
    // refresh that precedes the retry re-applies authorization as `active`,
    // on both paths alike and independent of the guard.)
    expect(applyDebitFailed).not.toHaveBeenCalled();
    expect((await readSubscription(userId)).graceUntil).toBeNull();
    expect((await mandates.findById(mandate.id))?.nextDebitDate).toEqual(DAY3);
  });

  test("a single resolver is unaffected: no already-settled line", async () => {
    const { mandate } = await presentedDebit(ASYNC_FAILURE_PAISE);
    await getPrisma().transaction.updateMany({
      where: { mandateId: mandate.id, kind: "recurring_debit" },
      data: { isFirstDebit: false },
    });
    const attempt = await snapshot(mandate.id);
    loggedEvents.length = 0;

    expect(await billing.resolvePayment(attempt, ist(2026, 7, 23, 14), "webhook")).toBe(true);

    expect(events("debit_failed")).toHaveLength(1);
    expect(events("debit_failed_already_settled")).toHaveLength(0);
    expect(applyDebitFailed).toHaveBeenCalledTimes(1);
    expect(published("bk_payment_result")).toBe(1);
  });
});
