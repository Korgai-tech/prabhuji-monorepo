import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@api/shared/database";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { clearGlobalServices, registerGlobalService } from "@api/shared/workspace";
import { SubscriptionRepository } from "@api/core/subscription/repositories";
import { SubscriptionService } from "@api/core/subscription/services";
import { SubscriptionApi } from "@api/core/subscription/api";
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
  ProviderResolver,
} from "../../mandate.provider.js";
import { UnknownProviderError } from "../../mandate.provider.js";
import { MandateRepository } from "../../repositories/mandate.repository.js";
import type { MandateRow } from "../../repositories/mandate.repository.js";
import { TransactionsRepository } from "../../repositories/transactions.repository.js";
import type { RecurringDebitRow } from "../../repositories/transactions.repository.js";
import { PdnRepository } from "../../repositories/pdn.repository.js";
import { StubMandateProvider } from "../../repositories/stub-mandate.repository.js";
import { BillingCycleService } from "../billing-cycle.service.js";
import { MandateService } from "../mandate.service.js";
import { PdnService } from "../pdn.service.js";
import { addDays } from "../npci-window.js";

/**
 * TWO GATEWAYS, ONE SWEEP — against real Postgres.
 *
 * The sibling suite (`billing-cycle.integration.test.ts`) proves the engine
 * bills correctly with ONE gateway injected everywhere. That is exactly the
 * shape that hid this class of bug: with a single provider, "resolve the
 * adapter for this row" and "use the adapter we were handed" are
 * indistinguishable, and every assertion passes either way.
 *
 * What is asserted here is the difference between the two — that each row is
 * acted on through the gateway ITS OWN COLUMN names. The failure mode is not
 * subtle: the first tick after a gateway switch would present every existing
 * mandate to a gateway that has never seen its ids, so every legacy subscriber
 * stops renewing at once, silently.
 *
 * Three deliberate choices:
 *
 *   REAL POSTGRES, not a mock. `transactions.provider` is written by
 *   `claimRecurringCycle` and read back by `presentDueDebits`; a mocked
 *   repository would happily agree with whatever the service passed it, which
 *   is precisely the value under test.
 *
 *   TWO RECORDING ADAPTERS, not one spy. "The right gateway was called" is only
 *   meaningful if a wrong one was reachable and stayed untouched, so each fake
 *   records what it was asked to do and the assertions name both sides.
 *
 *   AN ACTIVE GATEWAY THAT MUST NEVER APPEAR. `PAYMENT_PROVIDER` (here
 *   `cashfree`) is a THIRD name, resolvable and wired in as
 *   `MandateService`'s `activeProvider`. Any leak of "the gateway we register
 *   new mandates on" into a path that acts on an existing row therefore shows
 *   up as a name that belongs to neither subscriber, rather than accidentally
 *   matching one of them.
 */

const PLAN_ID = "month";
const PRODUCT_ID = "prabhuji_vip_month";
/** Approves and settles synchronously in the stub — see its magic amounts. */
const AMOUNT_PAISE = 29_900;

/** A UTC-midnight `Date`, which is how IST calendar dates are stored. */
function istDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

/** An IST wall-clock reading as the absolute instant it names. */
function ist(y: number, m: number, d: number, hh: number, mm = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60_000);
}

/** The tick every test runs at: 09:00 IST on the 21st. */
const NOW = ist(2026, 7, 21, 9);
/** 24h of lead from `NOW`. */
const CYCLE_24H = istDay(2026, 7, 22);
/** 48h of lead from `NOW`. */
const CYCLE_48H = istDay(2026, 7, 23);

/** One call the sweep made into a gateway. */
interface GatewayCall {
  method: string;
  /** The MANDATE's reference — what identifies the subscriber to a gateway. */
  referenceId: string;
}

/**
 * A gateway that remembers what the sweep asked it to do.
 *
 * Behaviour is delegated to `StubMandateProvider` rather than reimplemented, so
 * these tests exercise the same notify/present/settle path the sibling suite
 * does and differ only in the dimension under test: WHICH adapter got the call.
 *
 * `createMandate` is deliberately NOT recorded. It is used only by the seeding
 * helpers below (to register the reference with the inner stub, so a later
 * presentation can succeed), so leaving it out lets an assertion say "the sweep
 * never touched this gateway at all" without a reset dance.
 */
class FakeGateway implements MandateProvider {
  readonly calls: GatewayCall[] = [];
  private readonly stub = new StubMandateProvider();

  constructor(
    readonly name: string,
    /**
     * The per-gateway PDN lead band. A CONSTRUCTOR argument because the whole
     * point is that two gateways in one sweep can disagree about it.
     */
    readonly pdnLeadHours: { min: number; max: number } = { min: 24, max: 48 },
    /**
     * The synthesised turnaround, same reasoning as the band above: two
     * gateways in one sweep disagree about it, and `null` (the default) is the
     * Decentro-shaped gateway that reports its own instant.
     */
    readonly presentationTatHours: number | null = null
  ) {}

  readonly chargePhase = "submission" as const;
  readonly supportsInitialDeposit = true;

  /** Mandate references this gateway was asked to notify, in order. */
  get notified(): string[] {
    return this.refsFor("notifyPreDebit");
  }

  /** Mandate references this gateway was asked to DEBIT, in order. */
  get presented(): string[] {
    return this.refsFor("presentDebit");
  }

  debitRequestId(referenceId: string, cycleDate: Date): string {
    return `${this.name}_pay_${referenceId}_${cycleDate.toISOString().slice(0, 10)}`;
  }

  createMandate(input: CreateMandateInput): Promise<CreateMandateResult> {
    return this.stub.createMandate(input);
  }

  getMandateStatus(input: {
    referenceId: string;
    providerMandateId: string | null;
  }): Promise<MandateStatusResult> {
    this.record("getMandateStatus", input.referenceId);
    return this.stub.getMandateStatus(input);
  }

  notifyPreDebit(input: PreDebitInput): Promise<PreDebitResult> {
    this.record("notifyPreDebit", input.referenceId);
    return this.stub.notifyPreDebit(input);
  }

  getPreDebitStatus(input: PreDebitStatusInput): Promise<PreDebitStatusResult> {
    this.record("getPreDebitStatus", input.referenceId);
    return this.stub.getPreDebitStatus(input);
  }

  presentDebit(input: PresentDebitInput): Promise<PresentDebitResult> {
    this.record("presentDebit", input.referenceId);
    return this.stub.presentDebit(input);
  }

  getDebitStatus(input: DebitStatusInput): Promise<PresentDebitResult> {
    this.record("getDebitStatus", input.referenceId);
    return this.stub.getDebitStatus(input);
  }

  revokeMandate(input: {
    referenceId: string;
    providerMandateId: string;
  }): Promise<void> {
    this.record("revokeMandate", input.referenceId);
    return this.stub.revokeMandate(input);
  }

  private record(method: string, referenceId: string): void {
    this.calls.push({ method, referenceId });
  }

  private refsFor(method: string): string[] {
    return this.calls.filter((c) => c.method === method).map((c) => c.referenceId);
  }
}

/**
 * The composition root's resolver, over the fake gateways a test provides.
 *
 * Copied in shape from `initPaymentModule` on purpose, including the throw. In
 * production the map is the whole `PAYMENT_PROVIDERS` registry, filled lazily,
 * and the throw fires for a row naming a gateway that is not in it — or one
 * whose client cannot be constructed for want of credentials. Here the fakes
 * stand in for the registry, so a name a test did not provide must raise
 * `UnknownProviderError` too, or the unbuildable-gateway test would prove
 * nothing about production.
 *
 * The property that matters either way: NEVER fall back to the active gateway.
 * That would present an existing subscriber's debit somewhere their consent
 * does not exist.
 */
function resolverOver(gateways: readonly MandateProvider[]): ProviderResolver {
  const byName = new Map(gateways.map((g) => [g.name, g]));
  return (name) => {
    const found = byName.get(name);
    if (!found) throw new UnknownProviderError(name);
    return found;
  };
}

/**
 * The gateway `PAYMENT_PROVIDER` names — where NEW mandates would register.
 *
 * It must never appear on a row belonging to a subscriber who registered
 * elsewhere, which is what makes it a useful third name.
 */
let active: FakeGateway;
let mandates: MandateRepository;
let transactions: TransactionsRepository;
let pdns: PdnRepository;

beforeAll(async () => {
  await startTestDb();
}, 120_000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  // Transactions BEFORE notifications BEFORE mandates: both FKs are
  // `onDelete: Restrict`, so any other order fails with an FK error.
  await getPrisma().transaction.deleteMany({});
  await getPrisma().paymentPdnNotification.deleteMany({});
  await getPrisma().mandate.deleteMany({});
  await getPrisma().subscription.deleteMany({});

  mandates = new MandateRepository();
  transactions = new TransactionsRepository();
  pdns = new PdnRepository();
  active = new FakeGateway("cashfree");

  // Without this every `performServiceCall("subscription", ...)` throws
  // SERVICE_UNAVAILABLE and the run dies before it reaches a mandate.
  clearGlobalServices();
  registerGlobalService(
    "subscription",
    new SubscriptionApi(new SubscriptionService(new SubscriptionRepository()))
  );
});

afterEach(() => {
  clearGlobalServices();
});

/**
 * The sweep, wired exactly as `initPaymentModule` wires it: one resolver shared
 * by all three services, and the active gateway injected ONLY as
 * `MandateService.activeProvider`.
 */
function buildSweep(gateways: readonly MandateProvider[]): BillingCycleService {
  const resolve = resolverOver([active, ...gateways]);
  const mandateService = new MandateService(
    mandates,
    transactions,
    // `createMandate`'s gateway, and nothing else's.
    active,
    resolve,
    { expiryMinutes: 15, mandateName: "Prabhuji" }
  );
  const pdnService = new PdnService(pdns, transactions, resolve);
  return new BillingCycleService(
    mandates,
    transactions,
    resolve,
    mandateService,
    pdnService,
    pdns,
    // `true` delegates debits to the provider and makes every assertion below
    // vacuous.
    { managedByProvider: false }
  );
}

async function seedSubscription(provider: string): Promise<string> {
  const userId = randomUUID();
  await getPrisma().subscription.create({
    data: {
      userId,
      status: "active",
      activePlanId: PLAN_ID,
      activeProductId: PRODUCT_ID,
      provider,
      expiresAt: CYCLE_48H,
    },
  });
  return userId;
}

/**
 * An `active` mandate whose `provider` column says `input.provider`.
 *
 * `registerWith` is the gateway that should REMEMBER this reference, so a
 * presentation through it can succeed. Passing `null` writes a row naming a
 * gateway nothing can build — the configuration mistake the last test is about.
 */
async function seedActiveMandate(input: {
  userId: string;
  provider: string;
  nextDebitDate: Date;
  registerWith: FakeGateway | null;
}): Promise<MandateRow> {
  const referenceId = `pj_mnd_${randomUUID()}`;
  const startDate = input.nextDebitDate;
  let providerMandateId = `${input.provider}_mandate_${randomUUID()}`;

  if (input.registerWith) {
    const registered = await input.registerWith.createMandate({
      referenceId,
      type: "upi",
      mandateName: "Prabhuji",
      purposeMessage: "Prabhuji",
      amountPaise: AMOUNT_PAISE,
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
      provider: input.provider,
      referenceId,
      providerMandateId,
      state: "active",
      planId: PLAN_ID,
      productId: PRODUCT_ID,
      amountPaise: AMOUNT_PAISE,
      currency: "INR",
      startDate,
      endDate: addDays(startDate, 365),
      nextDebitDate: input.nextDebitDate,
    },
  });
}

/** A subscriber whose mandate lives on `gateway`, due on `cycleDate`. */
async function seedSubscriberOn(
  gateway: FakeGateway,
  cycleDate: Date
): Promise<MandateRow> {
  const userId = await seedSubscription(gateway.name);
  return seedActiveMandate({
    userId,
    provider: gateway.name,
    nextDebitDate: cycleDate,
    registerWith: gateway,
  });
}

/** The mandate's one recurring debit. `kind`-filtered, like the sibling suite. */
async function readOnlyAttempt(mandateId: string): Promise<RecurringDebitRow> {
  const rows = await getPrisma().transaction.findMany({
    where: { mandateId, kind: "recurring_debit" },
  });
  expect(rows).toHaveLength(1);
  const row = rows[0];
  // The `transactions_recurring_shape` CHECK guarantees both on a recurring
  // row; asserting here is what makes the narrowing below sound.
  expect(row.mandateId).not.toBeNull();
  expect(row.cycleDate).not.toBeNull();
  return row as RecurringDebitRow;
}

async function countAttempts(mandateId: string): Promise<number> {
  return getPrisma().transaction.count({
    where: { mandateId, kind: "recurring_debit" },
  });
}

describe("one sweep, two gateways", () => {
  /**
   * THE regression this whole change exists for.
   *
   * `findDueForPdn` is provider-BLIND — a mandate is due when it is due,
   * whoever registered it — so a single sweep legitimately holds rows from
   * every gateway at once. Before the resolver, all of them went to the one
   * injected adapter: the decentro subscriber's ids would have been sent to
   * razorpay, which has never heard of them, and vice versa.
   *
   * Both halves of a debit are checked, because they resolve from DIFFERENT
   * columns and could regress independently: the notification from
   * `mandates.provider`, the presentation from `transactions.provider`.
   */
  test("each mandate is notified and debited through its OWN gateway", async () => {
    const decentro = new FakeGateway("decentro");
    const razorpay = new FakeGateway("razorpay");
    const svc = buildSweep([decentro, razorpay]);

    const onDecentro = await seedSubscriberOn(decentro, CYCLE_48H);
    const onRazorpay = await seedSubscriberOn(razorpay, CYCLE_48H);

    // --- 48h out: the pre-debit notification. ------------------------------
    const pdnReport = await svc.run(NOW);
    expect(pdnReport.pdnSent).toBe(2);

    // Exactly its own, and nothing else's. `toEqual` on the full list rather
    // than `toContain`: the bug being excluded is an EXTRA call — one gateway
    // receiving both subscribers — which a containment check would pass.
    expect(decentro.notified).toEqual([onDecentro.referenceId]);
    expect(razorpay.notified).toEqual([onRazorpay.referenceId]);
    // The gateway new registrations would use has no business being called for
    // either of these subscribers.
    expect(active.calls).toEqual([]);

    // --- On the day: the money-moving call. --------------------------------
    const debitReport = await svc.run(ist(2026, 7, 23, 9));
    expect(debitReport.presentationsSent).toBe(2);

    expect(decentro.presented).toEqual([onDecentro.referenceId]);
    expect(razorpay.presented).toEqual([onRazorpay.referenceId]);
    expect(active.calls).toEqual([]);

    // Both actually settled — proof the dispatch reached a gateway that knew
    // the reference, not merely that some call was made.
    expect((await readOnlyAttempt(onDecentro.id)).status).toBe("succeeded");
    expect((await readOnlyAttempt(onRazorpay.id)).status).toBe("succeeded");
  });

  /**
   * The ledger row must record the gateway the money was claimed UNDER.
   *
   * `transactions.provider` is not decoration: `presentDueDebits`,
   * `reconcileUnsettled` and `recoverFailedNotifications` all resolve their
   * adapter from it. A row stamped with the ACTIVE gateway instead of the
   * mandate's would send every later step — including the "does the gateway
   * have this notification?" question whose negative answer authorises a
   * SECOND charge for the cycle — to a gateway that never saw it.
   */
  test("the claimed ledger row records the mandate's gateway, not the active one", async () => {
    const decentro = new FakeGateway("decentro");
    const razorpay = new FakeGateway("razorpay");
    const svc = buildSweep([decentro, razorpay]);

    const onDecentro = await seedSubscriberOn(decentro, CYCLE_48H);
    const onRazorpay = await seedSubscriberOn(razorpay, CYCLE_48H);

    await svc.run(NOW);

    const decentroRow = await readOnlyAttempt(onDecentro.id);
    const razorpayRow = await readOnlyAttempt(onRazorpay.id);
    expect(decentroRow.provider).toBe("decentro");
    expect(razorpayRow.provider).toBe("razorpay");
    // Stated explicitly as well as implied: `cashfree` is the active gateway,
    // so it is the value a leak would produce.
    expect(decentroRow.provider).not.toBe(active.name);
    expect(razorpayRow.provider).not.toBe(active.name);

    // The idempotency key follows the same rule — it is what the recovery
    // sweep asks the gateway about, so a key minted by the wrong adapter is
    // unrecoverable by construction.
    expect(decentroRow.gatewayRequestId).toBe(
      decentro.debitRequestId(onDecentro.referenceId, CYCLE_48H)
    );
    expect(razorpayRow.gatewayRequestId).toBe(
      razorpay.debitRequestId(onRazorpay.referenceId, CYCLE_48H)
    );
  });

  /**
   * The 24h floor is RBI's and is shared; the CEILING is a vendor contract and
   * the vendors disagree. So the band has to come from the row's own gateway.
   *
   * Asserted in BOTH directions on the narrow gateway — skipped at 48h, sent at
   * 24h — because a one-sided assertion is equally satisfied by an adapter that
   * is simply never notified at all, which is a different and much worse bug.
   */
  test("the PDN lead band comes from the row's own gateway", async () => {
    const wide = new FakeGateway("decentro", { min: 24, max: 48 });
    const narrow = new FakeGateway("razorpay", { min: 24, max: 30 });
    const svc = buildSweep([wide, narrow]);

    const wideAt48h = await seedSubscriberOn(wide, CYCLE_48H);
    const narrowAt48h = await seedSubscriberOn(narrow, CYCLE_48H);
    const narrowAt24h = await seedSubscriberOn(narrow, CYCLE_24H);

    const report = await svc.run(NOW);

    // 48h is inside the wide band and outside the narrow one, from the same
    // tick, over the same query result.
    expect(wide.notified).toEqual([wideAt48h.referenceId]);
    expect(narrow.notified).toEqual([narrowAt24h.referenceId]);
    expect(report.pdnSent).toBe(2);

    // Skipped, not failed: no cycle was claimed for the out-of-band mandate, so
    // a later tick inside its band can still notify it.
    expect(await countAttempts(narrowAt48h.id)).toBe(0);
    expect(report.skippedOutsideWindow).toBeGreaterThanOrEqual(1);
    expect(await countAttempts(wideAt48h.id)).toBe(1);
    expect(await countAttempts(narrowAt24h.id)).toBe(1);
  });
});

/**
 * `--provider` restricts a run to one gateway.
 *
 * The operational reason it exists: when one gateway is degraded, the other's
 * subscribers must still be billed, and a gateway mid-migration should be
 * exercisable on its own. So the guarantee is two-sided — the named gateway
 * does its work, and the unnamed one is not touched AT ALL.
 */
describe("the --provider filter", () => {
  test("restricting to razorpay leaves decentro completely untouched", async () => {
    const decentro = new FakeGateway("decentro");
    const razorpay = new FakeGateway("razorpay");
    const svc = buildSweep([decentro, razorpay]);

    const onDecentro = await seedSubscriberOn(decentro, CYCLE_48H);
    const onRazorpay = await seedSubscriberOn(razorpay, CYCLE_48H);

    const report = await svc.run(NOW, false, "razorpay");

    expect(razorpay.notified).toEqual([onRazorpay.referenceId]);
    expect(report.pdnSent).toBe(1);
    // Not "notified nothing" — called nothing. A restricted run must not even
    // poll the excluded gateway's status endpoints.
    expect(decentro.calls).toEqual([]);
    // And nothing was claimed for it, so the unrestricted run that follows has
    // exactly the work it would have had.
    expect(await countAttempts(onDecentro.id)).toBe(0);
    expect(await countAttempts(onRazorpay.id)).toBe(1);
  });

  test("restricting to decentro leaves razorpay completely untouched", async () => {
    const decentro = new FakeGateway("decentro");
    const razorpay = new FakeGateway("razorpay");
    const svc = buildSweep([decentro, razorpay]);

    const onDecentro = await seedSubscriberOn(decentro, CYCLE_48H);
    const onRazorpay = await seedSubscriberOn(razorpay, CYCLE_48H);

    const report = await svc.run(NOW, false, "decentro");

    expect(decentro.notified).toEqual([onDecentro.referenceId]);
    expect(report.pdnSent).toBe(1);
    expect(razorpay.calls).toEqual([]);
    expect(await countAttempts(onRazorpay.id)).toBe(0);
    expect(await countAttempts(onDecentro.id)).toBe(1);
  });
});

describe("a gateway that cannot be built", () => {
  /**
   * One misconfigured gateway must not stop every other gateway's billing.
   *
   * A row naming a gateway this build cannot produce — a `provider` value that
   * is in no registry, or a registered gateway whose credentials are absent —
   * is exactly the case the resolver must make LOUD. It throws rather than
   * falling back to the active gateway, which would present those subscribers'
   * debits somewhere their consent does not exist.
   *
   * But loud must not mean fatal. An exception escaping the loop would abort
   * the tick, and because ONE sweep serves every gateway, a single unreadable
   * row would stop billing EVERYONE.
   *
   * The unbuildable mandate is seeded with the EARLIER cycle date, so
   * `findDueForPdn` (ordered by `nextDebitDate` ascending) hands it over first
   * and the good mandate is only reached if the throw was really contained.
   */
  test("an unknown provider is skipped, and the rest of the sweep still bills", async () => {
    const decentro = new FakeGateway("decentro");
    const svc = buildSweep([decentro]);

    const goneUser = await seedSubscription("gonegateway");
    const gone = await seedActiveMandate({
      userId: goneUser,
      provider: "gonegateway",
      nextDebitDate: CYCLE_24H,
      // Nothing can construct this gateway — that is the whole point.
      registerWith: null,
    });
    const healthy = await seedSubscriberOn(decentro, CYCLE_48H);

    // Completes. Before the per-row try/catch this threw out of `run()`.
    const report = await svc.run(NOW);

    expect(report.pdnSent).toBe(1);
    expect(decentro.notified).toEqual([healthy.referenceId]);
    expect(await countAttempts(healthy.id)).toBe(1);

    // Nothing was claimed for the orphaned mandate: no cycle is burned, so it
    // resumes billing the moment the gateway is added back to the enabled set.
    expect(await countAttempts(gone.id)).toBe(0);
    // It certainly was not quietly charged through the active gateway.
    expect(active.calls).toEqual([]);
  });
});
