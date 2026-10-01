/**
 * TAM-260 Task 7, end to end on real Postgres: a signed Razorpay
 * `payment.failed` through the REAL composition root.
 *
 * Deferral ships OFF (`PAYMENT_CALLBACK_DEFERRED_PROVIDERS` unset → `[]`), so
 * with the DEFAULT env Razorpay is processed inline, before the reply, to
 * exactly the inline baseline's outcome. The deferred path is exercised with
 * the list set explicitly to `razorpay`.
 *
 * Pinned:
 *   0. DEFAULT env: `processed` in the reply, same final state as the explicit
 *      empty-list baseline, and the row never touched by a worker claim;
 *   1. deferred: the delivery is acked 200 `accepted` BEFORE anything is settled — the
 *      row is still `received`/`processing` and the attempt still `submitted`;
 *   2. the worker then processes it to the SAME final ledger / subscription /
 *      mandate / inbox state the inline path produces for the same delivery
 *      (the inline baseline runs first, with the list explicitly empty);
 *   3. the shutdown drains the worker BEFORE the database is disconnected: the
 *      row is already terminal at the moment `disconnectPrisma` is called.
 *
 * The only double is the gateway's ADAPTER (no network): `razorpay` resolves to
 * the in-memory stub, renamed `razorpay`. Signature verification, Razorpay's
 * classification and ref extraction, the controller, `CallbackService`, the
 * worker and every repository are the real ones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type * as DatabaseModule from "@api/shared/database";
import type * as GatewaysModule from "../gateways.js";
import { StubMandateProvider } from "../repositories/stub-mandate.repository.js";

const WEBHOOK_SECRET = "whsec_tam260_integration_not_secret";

/** One adapter instance shared by the app's resolver and this file's sweep. */
const shared = vi.hoisted(() => ({
  stub: null as StubMandateProvider | null,
  /** Webhook-row statuses read at the instant `disconnectPrisma` was called. */
  statusesAtDisconnect: null as string[] | null,
}));

function razorpayStub(): StubMandateProvider {
  if (!shared.stub) {
    const stub = new StubMandateProvider();
    // `transactions.provider` is written from the adapter's name, and the
    // callback refuses a mandate whose provider differs from the route's.
    Object.defineProperty(stub, "name", { value: "razorpay" });
    shared.stub = stub;
  }
  return shared.stub;
}

vi.mock("../gateways.js", async (importOriginal) => {
  const actual = await importOriginal<typeof GatewaysModule>();
  const razorpay = { ...actual.GATEWAYS.razorpay, createProvider: () => razorpayStub() };
  const GATEWAYS = { ...actual.GATEWAYS, razorpay };
  return {
    ...actual,
    GATEWAYS,
    gatewayFor: (name: keyof typeof GATEWAYS) => GATEWAYS[name],
  };
});

vi.mock("@api/shared/database", async (importOriginal) => {
  const actual = await importOriginal<typeof DatabaseModule>();
  return {
    ...actual,
    disconnectPrisma: async (): Promise<void> => {
      const rows = await actual.getPrisma().paymentWebhookEvent.findMany({
        where: { provider: "razorpay" },
        select: { status: true },
      });
      shared.statusesAtDisconnect = rows.map((r) => r.status);
      await actual.disconnectPrisma();
    },
  };
});

const { getPrisma } = await import("@api/shared/database");
const { resetEnvCache } = await import("@api/shared/config");
const { startTestDb, stopTestDb } = await import("@api/shared/testing");
const { clearGlobalServices } = await import("@api/shared/workspace");
const { buildApp } = await import("@api/app");
const { initAllModules } = await import("@api/modules");
const { bootstrap } = await import("@api/bootstrap");
const { MandateRepository } = await import("../repositories/mandate.repository.js");
const { TransactionsRepository } = await import("../repositories/transactions.repository.js");
const { PdnRepository } = await import("../repositories/pdn.repository.js");
const { MandateService } = await import("../services/mandate.service.js");
const { PdnService } = await import("../services/pdn.service.js");
const { BillingCycleService } = await import("../services/billing-cycle.service.js");
const { addDays } = await import("../services/npci-window.js");
const { RAZORPAY_NOTE_KEY } = await import("../repositories/razorpay.constants.js");

type App = Awaited<ReturnType<typeof buildApp>>;

const PLAN_ID = "month";
const PRODUCT_ID = "prabhuji_vip_month";
/** ₹4: the stub presents `pending`, then reports a bank decline on the status read. */
const ASYNC_FAILURE_PAISE = 4_00;
const DAY3 = new Date(Date.UTC(2026, 6, 23));

function ist(y: number, m: number, d: number, hh: number): Date {
  return new Date(Date.UTC(y, m - 1, d, hh) - (5 * 60 + 30) * 60_000);
}

const ORIGINAL = { ...process.env };

beforeAll(async () => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.ENABLE_REDIS = "false";
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
  process.env = { ...ORIGINAL };
  resetEnvCache();
});

beforeEach(async () => {
  const db = getPrisma();
  await db.paymentWebhookEvent.deleteMany({});
  await db.transaction.deleteMany({});
  await db.paymentPdnNotification.deleteMany({});
  await db.mandate.deleteMany({});
  await db.subscription.deleteMany({});
});

/**
 * A RENEWAL whose debit was presented and is still `submitted` — the state a
 * `payment.failed` arrives in on a renewal day. Driven through the real sweep
 * against the shared adapter, so the adapter knows the debit it will be asked
 * about. Needs the app's `subscription` facade registered (build the app first).
 */
async function presentedRenewal() {
  const stub = razorpayStub();
  const mandates = new MandateRepository();
  const transactions = new TransactionsRepository();
  const pdns = new PdnRepository();
  const mandateService = new MandateService(mandates, transactions, stub, () => stub, {
    expiryMinutes: 15,
    mandateName: "Prabhuji",
  });
  const pdnService = new PdnService(pdns, transactions, () => stub);
  const billing = new BillingCycleService(
    mandates,
    transactions,
    () => stub,
    mandateService,
    pdnService,
    pdns,
    { managedByProvider: false }
  );

  const userId = randomUUID();
  await getPrisma().subscription.create({
    data: {
      userId,
      status: "trialing",
      activePlanId: PLAN_ID,
      activeProductId: PRODUCT_ID,
      provider: "razorpay",
      trialEndsAt: DAY3,
    },
  });
  const referenceId = `pj_mnd_${randomUUID()}`;
  const registered = await stub.createMandate({
    referenceId,
    type: "upi",
    mandateName: "Prabhuji",
    purposeMessage: "Prabhuji",
    amountPaise: ASYNC_FAILURE_PAISE,
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
      provider: "razorpay",
      referenceId,
      providerMandateId: registered.providerMandateId,
      state: "active",
      planId: PLAN_ID,
      productId: PRODUCT_ID,
      amountPaise: ASYNC_FAILURE_PAISE,
      currency: "INR",
      startDate: DAY3,
      endDate: addDays(DAY3, 365),
      nextDebitDate: DAY3,
    },
  });
  await billing.run(ist(2026, 7, 21, 9)); // PDN
  await billing.run(ist(2026, 7, 23, 9)); // presentation → `pending`

  // Make it a RENEWAL of a paying subscriber: the branch that re-arms and duns.
  await getPrisma().transaction.updateMany({
    where: { mandateId: mandate.id, kind: "recurring_debit" },
    data: { isFirstDebit: false },
  });
  await getPrisma().subscription.update({
    where: { userId },
    data: { status: "active", trialEndsAt: null, expiresAt: DAY3 },
  });
  const attempt = await getPrisma().transaction.findFirstOrThrow({
    where: { mandateId: mandate.id, kind: "recurring_debit" },
  });
  expect(attempt.status).toBe("submitted");
  expect(attempt.provider).toBe("razorpay");
  return { userId, mandate, attempt };
}

/** A Razorpay `payment.failed` for the presented attempt, signed like Razorpay signs it. */
function signedPaymentFailed(referenceId: string, orderId: string | null) {
  const body = JSON.stringify({
    entity: "event",
    event: "payment.failed",
    created_at: 1_790_000_000,
    payload: {
      payment: {
        entity: {
          id: `pay_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
          entity: "payment",
          status: "failed",
          order_id: orderId,
          error_code: "BAD_REQUEST_ERROR",
          error_reason: "insufficient_funds",
          notes: { [RAZORPAY_NOTE_KEY.referenceId]: referenceId },
        },
      },
    },
  });
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(body, "utf8").digest("hex"),
    },
  };
}

interface FinalState {
  webhookStatus: string;
  attemptStatus: string;
  failureCode: string | null;
  subscriptionStatus: string;
  hasGrace: boolean;
  graceUntil: string | null;
  nextDebitDate: string | null;
  recurringRows: number;
}

async function finalState(userId: string, mandateId: string, attemptId: string): Promise<FinalState> {
  const db = getPrisma();
  const webhook = await db.paymentWebhookEvent.findFirstOrThrow({ where: { provider: "razorpay" } });
  const attempt = await db.transaction.findUniqueOrThrow({ where: { id: attemptId } });
  const sub = await db.subscription.findUniqueOrThrow({ where: { userId } });
  const mandate = await db.mandate.findUniqueOrThrow({ where: { id: mandateId } });
  return {
    webhookStatus: webhook.status,
    attemptStatus: attempt.status,
    failureCode: attempt.failureCode,
    subscriptionStatus: sub.status,
    hasGrace: sub.graceUntil !== null,
    graceUntil: sub.graceUntil?.toISOString() ?? null,
    nextDebitDate: mandate.nextDebitDate?.toISOString() ?? null,
    recurringRows: await db.transaction.count({ where: { mandateId, kind: "recurring_debit" } }),
  };
}

async function waitFor<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 15_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (done(v) || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("Razorpay payment.failed through the real composition root", () => {
  let inlineBaseline: FinalState | null = null;

  test("inline baseline (deferred list explicitly EMPTY): processed before the reply", async () => {
    process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "";
    resetEnvCache();
    clearGlobalServices();
    const app: App = await buildApp();
    initAllModules(app);
    await app.ready();
    try {
      const { userId, mandate, attempt } = await presentedRenewal();
      const { body, headers } = signedPaymentFailed(mandate.referenceId, attempt.presentationSequenceId);

      const res = await app.inject({ method: "POST", url: "/payment/callbacks/razorpay", headers, payload: body });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ message: string }>().message).toBe("processed");

      inlineBaseline = await finalState(userId, mandate.id, attempt.id);
      expect(inlineBaseline).toMatchObject({
        webhookStatus: "processed",
        attemptStatus: "failed",
        failureCode: "INSUFFICIENT_FUNDS",
        subscriptionStatus: "past_due",
        hasGrace: true,
        recurringRows: 1,
      });
    } finally {
      await app.close();
      clearGlobalServices();
    }
  });

  test("DEFAULT env (list unset → none deferred): Razorpay is processed INLINE before the reply, with today's outcome", async () => {
    expect(inlineBaseline).not.toBeNull();
    delete process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS;
    resetEnvCache();
    clearGlobalServices();

    // The real entry (`index.ts` / `billing.ts` use it), with nothing set.
    const ctx = await bootstrap();
    try {
      const { userId, mandate, attempt } = await presentedRenewal();
      const { body, headers } = signedPaymentFailed(mandate.referenceId, attempt.presentationSequenceId);

      const res = await ctx.app.inject({ method: "POST", url: "/payment/callbacks/razorpay", headers, payload: body });
      expect(res.statusCode).toBe(200);
      // Processed in the request, not `accepted`: the inline path.
      expect(res.json<{ message: string }>().message).toBe("processed");

      // Settled BEFORE the reply was read, identical to the baseline.
      expect(await finalState(userId, mandate.id, attempt.id)).toEqual(inlineBaseline);

      // Never claimed by a worker: the inline row keeps its pre-TAM-260 shape.
      const row = await getPrisma().paymentWebhookEvent.findFirstOrThrow({ where: { provider: "razorpay" } });
      expect(row).toMatchObject({ status: "processed", attempts: 0, claimedAt: null });
    } finally {
      await ctx.shutdown();
      clearGlobalServices();
    }
  });

  test("razorpay deferred (set explicitly): acked `accepted` first, then processed by the worker to the same state, drained before the DB closes", async () => {
    expect(inlineBaseline).not.toBeNull();
    process.env.PAYMENT_CALLBACK_DEFERRED_PROVIDERS = "razorpay";
    resetEnvCache();
    clearGlobalServices();
    shared.statusesAtDisconnect = null;

    // `bootstrap()` — the same entry `index.ts` and `billing.ts` use — so the
    // shutdown under test is the real one. It never listens here, so the
    // re-driver is not started: this is the kick path.
    const ctx = await bootstrap();
    let shutDown = false;
    try {
      const { userId, mandate, attempt } = await presentedRenewal();

      // Slow the provider read so the row is provably still in flight when the
      // reply lands AND when the shutdown starts.
      const stub = razorpayStub();
      const realRead = stub.getDebitStatus.bind(stub);
      const read = vi.spyOn(stub, "getDebitStatus").mockImplementation(async (input) => {
        await new Promise((r) => setTimeout(r, 400));
        return realRead(input);
      });

      const { body, headers } = signedPaymentFailed(mandate.referenceId, attempt.presentationSequenceId);
      const res = await ctx.app.inject({ method: "POST", url: "/payment/callbacks/razorpay", headers, payload: body });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ message: string; data: unknown }>()).toMatchObject({
        message: "accepted",
        data: { received: true },
      });

      // Nothing settled before the ack.
      const atAck = await getPrisma().paymentWebhookEvent.findFirstOrThrow({ where: { provider: "razorpay" } });
      expect(["received", "processing"]).toContain(atAck.status);
      expect(
        (await getPrisma().transaction.findUniqueOrThrow({ where: { id: attempt.id } })).status
      ).toBe("submitted");

      // A redelivery while it is in flight is a duplicate, and triggers nothing.
      const again = await ctx.app.inject({ method: "POST", url: "/payment/callbacks/razorpay", headers, payload: body });
      expect(again.statusCode).toBe(200);
      expect(again.json<{ message: string }>().message).toBe("duplicate");

      // Wait until the worker has claimed it, then shut down mid-processing.
      await waitFor(
        () => getPrisma().paymentWebhookEvent.findFirstOrThrow({ where: { provider: "razorpay" } }),
        (row) => row.status !== "received"
      );
      await ctx.shutdown();
      shutDown = true;

      // Drained BEFORE the pool closed: terminal at the moment of disconnect.
      expect(shared.statusesAtDisconnect).toEqual(["processed"]);
      expect(read).toHaveBeenCalledTimes(1);

      const deferred = await finalState(userId, mandate.id, attempt.id);
      expect(deferred).toEqual(inlineBaseline);

      const row = await getPrisma().paymentWebhookEvent.findFirstOrThrow({ where: { provider: "razorpay" } });
      expect(row.attempts).toBe(1);
      expect(row.claimedAt).not.toBeNull();
    } finally {
      vi.restoreAllMocks();
      if (!shutDown) await ctx.shutdown();
      clearGlobalServices();
    }
  });
});
