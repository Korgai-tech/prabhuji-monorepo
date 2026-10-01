import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import type { GlobalServiceMap } from "@api/shared/workspace";
import { fakeSubscriptionApi, proStatus } from "@api/shared/testing";
import {
  analyticsEventsClient,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { MandateService } from "../mandate.service.js";
import { paymentLedgerAnalytics } from "../payment-ledger-analytics.service.js";
import { paymentAnalytics } from "../payment-analytics.service.js";
import type { MandateRepository, MandateRow } from "../../repositories/mandate.repository.js";
import type { TransactionsRepository } from "../../repositories/transactions.repository.js";
import type { MandateProvider } from "../../mandate.provider.js";
import type { MandateState } from "../../types.js";

/** The analytics collector spy, typed to what `send` actually takes. */
type SendSpy = MockInstance<(events: AnalyticsEventInput[]) => Promise<void>>;

/**
 * `MandateService.createMandate` — and specifically its REUSE decision.
 *
 * There was no test file for this service at all, which is why the
 * fail-closed-vs-fail-loud question could stay open as long as it did. The
 * decision it guards is destructive: an entitled caller gets their existing
 * mandate handed back, an unentitled one has it stamped `expired` and a fresh
 * one registered at the gateway.
 *
 * The dangerous case is a genuinely PAYING subscriber whose approval link
 * expired months ago. `toView` sets `authUrl: null` for them, so the only thing
 * standing between them and the retire-and-remint path is `entitled === true`.
 * If the entitlement read failed CLOSED, a transient database blip would stamp a
 * live NPCI mandate `expired` and mint a second against the same user — two live
 * mandates and a double charge waiting to happen.
 *
 * Hence `requireProEntitlement`, which throws. These tests exist to make that a
 * decision the codebase remembers rather than one a future refactor undoes
 * because "everything else fails closed".
 */

const NOW = new Date("2026-07-29T12:00:00.000Z");

/** An `active` mandate whose approval link died an hour ago. */
function staleActiveMandate(): MandateRow {
  return {
    id: "mnd-1",
    userId: "usr-1",
    type: "upi",
    provider: "stub",
    referenceId: "pj_mnd_abc",
    providerMandateId: "cf_sub_1",
    providerTxnId: null,
    npciTransactionId: null,
    state: "active",
    stateReason: null,
    planId: "month",
    productId: "prabhuji_vip_month",
    amountPaise: 29900,
    currency: "INR",
    frequency: "MONTHLY",
    amountRule: "MAX",
    ruleType: "BEFORE",
    ruleValue: 28,
    startDate: new Date("2026-07-01T00:00:00.000Z"),
    endDate: new Date("2056-07-01T00:00:00.000Z"),
    nextDebitDate: new Date("2026-08-01T00:00:00.000Z"),
    trialEndsAt: null,
    authUrl: "upi://mandate?stale=1",
    providerCheckout: null,
    authExpiresAt: new Date(NOW.getTime() - 60 * 60_000),
    payerHandleMasked: null,
    payerNameMasked: null,
    lastPolledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeService(overrides: {
  entitlementThrows?: boolean;
  entitled?: boolean;
  /** The reusable row, when a test needs one other than the stale default. */
  row?: MandateRow;
}) {
  const reusable = overrides.row ?? staleActiveMandate();
  // Held as locals, not read back off the typed interface — doing the latter is
  // an unbound-method reference as far as eslint is concerned.
  const setState = vi.fn().mockResolvedValue(undefined);
  const createMandateAtGateway = vi.fn();

  const repo = {
    findReusableForUser: vi.fn().mockResolvedValue(reusable),
    setState,
    // `refreshFromProvider` writes the polled state back and then reads the
    // returned row, so this must answer with a row rather than undefined.
    applyStatus: vi.fn().mockResolvedValue(reusable),
    setNextDebitDate: vi.fn(),
    createInitiated: vi.fn(),
    findById: vi.fn(),
  } as unknown as MandateRepository;

  const transactions = {
    recordInitialDeposit: vi.fn(),
    markSubmitted: vi.fn(),
    findInitialDepositIdForMandate: vi.fn(() => Promise.resolve(null)),
    markSubmitFailed: vi.fn(),
    settleDepositForMandate: vi.fn(),
  } as unknown as TransactionsRepository;

  const provider = {
    name: "stub",
    chargePhase: "submission",
    supportsInitialDeposit: true,
    pdnLeadHours: { min: 24, max: 48 },
    debitRequestId: () => "req",
    // A reused mandate is refreshed before it is trusted. Answering `active`
    // with no change keeps the reuse branch — the entitlement read is then the
    // only thing that decides.
    getMandateStatus: vi.fn().mockResolvedValue({
      state: "active",
      stateReason: null,
      providerMandateId: "cf_sub_1",
      providerTxnId: null,
      npciTransactionId: null,
      payerHandleMasked: null,
      payerNameMasked: null,
      nextDebitDate: null,
    }),
    createMandate: createMandateAtGateway,
  } as unknown as MandateProvider;

  clearGlobalServices();
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      getStatus: overrides.entitlementThrows
        ? () => Promise.reject(new Error("database is gone"))
        : () => Promise.resolve(proStatus(overrides.entitled ?? true)),
    })
  );

  const service = new MandateService(repo, transactions, provider, () => provider, {
    expiryMinutes: 15,
    mandateName: "Prabhuji",
  });
  return { service, setState, createMandateAtGateway };
}



type CreateInitiatedInput = Parameters<
  MandateRepository["createInitiated"]
>[0];
type RecordDepositInput = Parameters<
  TransactionsRepository["recordInitialDeposit"]
>[0];
type GatewayCreateInput = Parameters<MandateProvider["createMandate"]>[0];

const PLAN = {
  planId: "month",
  productId: "prabhuji_vip_month",
  amountPaise: 29900,
  initialDepositPaise: 200,
  currency: "INR",
  trialDays: 3,
};

beforeEach(() => clearGlobalServices());
afterEach(() => clearGlobalServices());

/**
 * A service with NO reusable mandate, so `createMandate` goes all the way
 * through registration and we can read what schedule it wrote.
 *
 * Separate from `makeService` on purpose: that one exists to prove the reuse
 * decision and deliberately stubs registration out.
 */
function makeRegisteringService(
  overrides: { trialConsumed?: boolean; pdnLeadHours?: { min: number; max: number } } = {}
) {
  const createInitiated = vi.fn<
    (input: CreateInitiatedInput) => Promise<MandateRow>
  >((input) =>
    Promise.resolve({ ...staleActiveMandate(), ...input, id: "mnd-new" })
  );

  const repo = {
    findReusableForUser: vi.fn().mockResolvedValue(null),
    createInitiated,
    setState: vi.fn(),
    applyRegistration: vi.fn().mockResolvedValue(staleActiveMandate()),
    setNextDebitDate: vi.fn(),
    findById: vi.fn(),
  } as unknown as MandateRepository;

  const recordInitialDeposit = vi.fn<
    (input: RecordDepositInput) => Promise<{ id: string }>
  >(() => Promise.resolve({ id: "txn-1" }));
  const transactions = {
    recordInitialDeposit,
    markSubmitted: vi.fn(),
    findInitialDepositIdForMandate: vi.fn(() => Promise.resolve(null)),
    markSubmitFailed: vi.fn(),
    settleDepositForMandate: vi.fn(),
  } as unknown as TransactionsRepository;

  const createAtGateway = vi.fn<
    (input: GatewayCreateInput) => Promise<Record<string, unknown>>
  >(() =>
    Promise.resolve({
      providerMandateId: "dm_1",
      providerTxnId: "dt_1",
      authUrl: "upi://mandate?x=1",
      authExpiresAt: new Date(NOW.getTime() + 60 * 60_000),
      state: "pending",
    })
  );
  const provider = {
    name: "decentro",
    chargePhase: "submission",
    supportsInitialDeposit: true,
    pdnLeadHours: overrides.pdnLeadHours ?? { min: 24, max: 48 },
    debitRequestId: () => "req",
    createMandate: createAtGateway,
  } as unknown as MandateProvider;

  clearGlobalServices();
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      hasConsumedTrial: () => Promise.resolve(overrides.trialConsumed ?? false),
    })
  );

  const service = new MandateService(repo, transactions, provider, () => provider, {
    expiryMinutes: 15,
    mandateName: "Prabhuji",
  });
  return { service, createInitiated, recordInitialDeposit, createAtGateway };
}

/**
 * What registration writes, and specifically that `start_date` and the first
 * debit date are no longer the same value.
 *
 * They used to be one column. Decentro refuses `is_first_txn_amount` — the ₹2
 * taken with the UPI PIN — on a mandate whose `start_date` is in the future, so
 * a trial expressed by pushing that date out made the deposit unchargeable.
 */
/**
 * The identity handed to the gateway.
 *
 * Every mandate once carried the same hardcoded number and a shared address, so
 * at the provider all our payers looked like one person — which breaks
 * reconciliation and any dispute that starts from a phone number. These pin the
 * two properties that stops: the address is DERIVED per payer, and it is keyed
 * on the phone rather than on an opaque id.
 */
describe("payer identity sent to the gateway", () => {
  /** Minimal users facade — only what `resolvePayer` actually reads. */
  function registerUsers(phoneNumber: string | null) {
    registerGlobalService("users", {
      getUserPublic: () => Promise.resolve({ id: "usr-1", phoneNumber }),
      getRazorpayCustomerId: () => Promise.resolve(null),
      rememberRazorpayCustomerId: () => Promise.resolve(),
    } as unknown as GlobalServiceMap["users"]);
  }

  test("the no-reply address is keyed on the PHONE NUMBER", async () => {
    // It used to be the user id, which made the address — and, on Razorpay, the
    // customer NAME derived from its local part — a bare UUID: unreadable on a
    // dashboard, a receipt, or a support ticket. No new disclosure either way,
    // since the same number already goes over as `contact`.
    const { service, createAtGateway } = makeRegisteringService();
    registerUsers("9999893268");

    await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(createAtGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: {
          phone: "9999893268",
          email: "9999893268@no-reply.prabhuji.app",
        },
      })
    );
  });

  test("falls back to the user id when the number is unknown", async () => {
    // The requirement is only that it be UNIQUE per payer — never the shared
    // placeholder this replaced.
    const { service, createAtGateway } = makeRegisteringService();
    registerUsers(null);

    await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(createAtGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: { phone: null, email: "usr-1@no-reply.prabhuji.app" },
      })
    );
  });

  test("an unreachable users facade still registers, with the id-keyed address", async () => {
    // A lookup blip must not block a payment the user is actively making.
    const { service, createAtGateway } = makeRegisteringService();
    // No `users` service registered at all — `performServiceCall` throws.

    await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(createAtGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: { phone: null, email: "usr-1@no-reply.prabhuji.app" },
      })
    );
  });
});

describe("createMandate — the registration schedule", () => {
  test("start_date is TODAY even when a trial is running", async () => {
    const { service, createInitiated, createAtGateway } =
      makeRegisteringService();

    await service.createMandate({ userId: "usr-2", plan: PLAN, now: NOW });

    // NOW is 2026-07-29T12:00Z = 17:30 IST on the 29th.
    const today = new Date("2026-07-29T00:00:00.000Z");
    expect(createInitiated.mock.calls[0]?.[0].startDate).toEqual(today);
    // ...and the gateway is told the same. If this ever drifts back to
    // today+trialDays, the deposit stops being chargeable at all.
    expect(createAtGateway.mock.calls[0]?.[0].startDate).toEqual(today);
  });

  test("endDate stays under Razorpay's 30-year ceiling in the IST/UTC gap", async () => {
    // THE nightly-signup regression. `endDate` is built from istDateOnly(now) —
    // the IST calendar date stamped as UTC midnight — but Razorpay checks
    // expire_at against a real-time `now + 30 years`. Between 00:00 and 05:30
    // IST the IST date has already rolled over while UTC has not, so a 30-year
    // tenure overshot by up to 5.5h and EVERY registration in that window died
    // with "expire_at cannot be more than 30 years for upi".
    const midnightIst = new Date("2026-07-29T19:00:00.000Z"); // 00:30 IST, 30th
    const { service, createInitiated } = makeRegisteringService();

    await service.createMandate({
      userId: "usr-2",
      plan: PLAN,
      now: midnightIst,
    });

    // istDateOnly has rolled to the 30th; the ceiling is still the 29th + 30y.
    const endDate = createInitiated.mock.calls[0]?.[0].endDate;
    const ceiling = new Date(midnightIst);
    ceiling.setUTCFullYear(ceiling.getUTCFullYear() + 30);
    expect(endDate.getTime()).toBeLessThan(ceiling.getTime());
  });

  test("the trial lives on nextDebitDate instead", async () => {
    const { service, createInitiated } = makeRegisteringService();

    await service.createMandate({ userId: "usr-2", plan: PLAN, now: NOW });

    // PLAN.trialDays is 3, so the first full-price debit is the 1st.
    expect(createInitiated.mock.calls[0]?.[0].nextDebitDate).toEqual(
      new Date("2026-08-01T00:00:00.000Z")
    );
  });

  test("trialEndsAt spans the WHOLE IST day the first debit is attempted", async () => {
    // THE trial-expiry regression. Storing the raw cycle date ended the trial at
    // its UTC midnight — 05:30 IST — so a trial granted at 17:30 IST lapsed the
    // next morning having run a fraction of its term.
    const { service, createInitiated } = makeRegisteringService();

    await service.createMandate({ userId: "usr-2", plan: PLAN, now: NOW });

    const trialEndsAt = createInitiated.mock.calls[0]?.[0].trialEndsAt as Date;
    // 2026-08-01T18:30Z is midnight IST at the end of 1 Aug.
    expect(trialEndsAt.toISOString()).toBe("2026-08-01T18:30:00.000Z");
    expect(trialEndsAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  test("a trial-consumed user is charged the full price and billed a MONTH out", async () => {
    // Not today. `canSendPreDebitNotification` requires 24h of lead, so a
    // same-day cycle date is refused on every tick — the mandate would sit
    // active and never bill again. The registration charge covers this period.
    const { service, createInitiated, recordInitialDeposit } =
      makeRegisteringService({ trialConsumed: true });

    await service.createMandate({ userId: "usr-2", plan: PLAN, now: NOW });

    expect(createInitiated.mock.calls[0]?.[0].nextDebitDate).toEqual(
      new Date("2026-08-29T00:00:00.000Z")
    );
    // No trial to grant, and the deposit is the full price rather than ₹2.
    expect(createInitiated.mock.calls[0]?.[0].trialEndsAt).toBeNull();
    expect(recordInitialDeposit.mock.calls[0]?.[0].amountPaise).toBe(
      PLAN.amountPaise
    );
  });

  test("a trialing user is charged the DEPOSIT, not the plan price", async () => {
    const { service, recordInitialDeposit } = makeRegisteringService();

    await service.createMandate({ userId: "usr-2", plan: PLAN, now: NOW });

    expect(recordInitialDeposit.mock.calls[0]?.[0].amountPaise).toBe(
      PLAN.initialDepositPaise
    );
    // Recorded as real money, not the `none` phase the gateway used to force.
    expect(recordInitialDeposit.mock.calls[0]?.[0].chargePhase).toBe("deposit");
  });
});

describe("createMandate — the reuse decision", () => {
  test("an entitled user gets their existing mandate back, untouched", async () => {
    const { service, setState, createMandateAtGateway } = makeService({ entitled: true });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(view.mandateId).toBe("mnd-1");
    // The two things that must NOT happen to a paying subscriber.
    expect(setState).not.toHaveBeenCalled();
    expect(createMandateAtGateway).not.toHaveBeenCalled();
  });

  /**
   * THE regression test for the fail-loud decision.
   *
   * Same paying subscriber, same dead approval link — but the subscription
   * facade is unreachable. If this ever starts resolving instead of rejecting,
   * someone has made the entitlement read fail closed, and the assertions below
   * are what tell them what that costs.
   */
  test("an unreachable facade REJECTS and destroys nothing", async () => {
    const { service, setState, createMandateAtGateway } = makeService({
      entitlementThrows: true,
    });

    await expect(
      service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW })
    ).rejects.toThrow();

    // A 500 the client retries is strictly better than either of these.
    expect(setState).not.toHaveBeenCalled();
    expect(createMandateAtGateway).not.toHaveBeenCalled();
  });

  test("a genuinely unentitled user with a dead link IS retired and re-registered", async () => {
    // The branch that must keep working — otherwise a user whose mandate died
    // can never escape it, because it stays `active` and is reused every retry.
    const { service, setState } = makeService({ entitled: false });

    await service
      .createMandate({ userId: "usr-1", plan: PLAN, now: NOW })
      .catch(() => undefined); // registration itself is stubbed out

    expect(setState).toHaveBeenCalledWith(
      "mnd-1",
      "expired",
      "stale_no_auth_link"
    );
  });
});

/**
 * The paid period a no-trial registration buys (TAM-148).
 *
 * Without a trial, `createMandate` charges `plan.amountPaise` as the
 * registration deposit — the full price, taken with the UPI PIN that authorizes
 * the mandate. Nothing granted the period that money bought:
 * `applyMandateAuthorized` writes `pending` for a null `trialEndsAt`, and
 * `applyDebitSucceeded` — the only writer of `active` — did not run until the
 * first CYCLE debit a month later.
 *
 * That shipped: a production user paid ₹299 and stayed unentitled behind the
 * paywall they had just bought their way past. These tests pin the grant, and
 * just as importantly pin the four cases that must NOT grant, because each one
 * would hand out a month nobody paid for.
 */

/** A mandate mid-approval — `pending` at the gateway, about to go `active`. */
function pendingMandate(overrides: Partial<MandateRow> = {}): MandateRow {
  return {
    ...staleActiveMandate(),
    state: "pending",
    trialEndsAt: null,
    nextDebitDate: new Date("2026-08-29T00:00:00.000Z"),
    ...overrides,
  };
}

function makeActivatingService(
  opts: {
    row?: Partial<MandateRow>;
    supportsInitialDeposit?: boolean;
    /**
     * Settled full-price payments this user's ledger holds AFTER this
     * registration's deposit was written `succeeded` — so 1 is "their first",
     * 2 is "they have paid before", 0 is "nothing was actually charged".
     */
    settledFullPrice?: number;
    /** What the gateway says the mandate is now. Default: it just went live. */
    providerState?: string;
    /**
     * What the subscription facade reports the authorization write did.
     * `false` is a RE-ENTRY: the grant applied, but this user's trial was
     * already stamped by an earlier call, so the trial-start events must not
     * fire again (TAM-181). Default `true` — a genuine first grant.
     */
    trialFirstConsumed?: boolean;
    /** Entitlement the self-heal branch reads. Default: entitled. */
    entitled?: boolean;
  } = {}
) {
  const row = pendingMandate(opts.row);
  const providerState = opts.providerState ?? "active";

  const repo = {
    // `refreshFromProvider` reads this row back and hands it to
    // `onStateChanged`, so it must carry the post-transition state.
    applyStatus: vi.fn().mockResolvedValue({ ...row, state: providerState }),
    setNextDebitDate: vi.fn(),
    findById: vi.fn(),
  } as unknown as MandateRepository;

  // Held as a local rather than reached for off the cast object: referencing a
  // method through `transactions.x` trips `@typescript-eslint/unbound-method`,
  // which is an ERROR here and so a `pnpm verify` failure.
  const countSettledFullPriceForUser = vi
    .fn()
    .mockResolvedValue(opts.settledFullPrice ?? 1);

  const transactions = {
    settleDepositForMandate: vi.fn().mockResolvedValue(true),
    findByGatewayRequestId: vi.fn().mockResolvedValue(null),
    countSettledFullPriceForUser,
  } as unknown as TransactionsRepository;

  const provider = {
    name: "decentro",
    supportsInitialDeposit: opts.supportsInitialDeposit ?? true,
    debitRequestId: () => "req",
    getMandateStatus: vi.fn().mockResolvedValue({
      state: providerState,
      stateReason: null,
      providerMandateId: "dm_1",
      providerTxnId: "dt_1",
      npciTransactionId: null,
      payerHandleMasked: null,
      payerNameMasked: null,
      nextDebitDate: null,
    }),
  } as unknown as MandateProvider;

  const applyDebitSucceeded = vi.fn(() => Promise.resolve());
  const applyMandateAuthorized = vi.fn(() =>
    Promise.resolve({
      changed: 1,
      trialFirstConsumed: opts.trialFirstConsumed ?? true,
    })
  );
  clearGlobalServices();
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      applyDebitSucceeded,
      applyMandateAuthorized,
      ...(opts.entitled === undefined
        ? {}
        : { getStatus: () => Promise.resolve(proStatus(opts.entitled)) }),
    })
  );

  // The billing engine's one-method seam. Spied rather than stubbed away,
  // because WHETHER it is called — and with which row — is the contract.
  // Typed via the generic, not left to inference: `vi.fn()` over a zero-arg
  // thunk infers `calls: []`, so reading `mock.calls[0][0]` is a type error even
  // though the call really does carry arguments. Same reason as the fakes in
  // `pdn.service.test.ts`.
  const notifyFirstCycleNow = vi.fn<(mandate: MandateRow, now: Date) => Promise<void>>(
    () => Promise.resolve()
  );

  const service = new MandateService(
    repo,
    transactions,
    provider,
    () => provider,
    {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    },
    () => ({ notifyFirstCycleNow })
  );
  return {
    service,
    row,
    applyDebitSucceeded,
    applyMandateAuthorized,
    countSettledFullPriceForUser,
    notifyFirstCycleNow,
  };
}

/**
 * `bk_subscription_started` means the user's FIRST full-price payment, ever —
 * so the approval path has to ask the ledger, not the mandate.
 *
 * The question cannot be answered from the mandate: a mandate is per-consent,
 * and an NPCI auto-revoke plus re-registration mints a fresh one. Every
 * mandate-scoped signal (`isFirstDebit`, the `is_first_payment` property) calls
 * a months-old subscriber's next payment a first payment, which is exactly the
 * over-count this gate exists to prevent.
 */
/**
 * A mandate going ACTIVE raises its first notification then and there, instead
 * of waiting for the next sweep tick (TAM-164).
 *
 * WHY IT CANNOT WAIT. The lead band is sampled at DAY granularity, so a trial as
 * short as the gateway's floor is notifiable only on the activation day itself —
 * at the next IST midnight the lead drops to zero and
 * `canSendPreDebitNotification` refuses that cycle forever. The sweep runs every
 * thirty minutes and stops at the 23:50 blackout, so a mandate approved after
 * the day's last usable tick had no tick left: it took the ₹2 deposit, stayed
 * active, and was never billed. Nothing noticed, because no cycle was ever
 * claimed and there is therefore no failed row to find.
 *
 * What is asserted here is only WHEN the billing engine is asked. Whether a
 * notification is actually due — the band, the blackout, an already-claimed
 * cycle — is `BillingCycleService.notifyFirstCycleNow`'s decision, tested
 * against a real database in the billing-cycle integration suite.
 */
describe("activation raises the first notification immediately", () => {
  // The delay itself lives in `BillingCycleService.notifyFirstCycleNow`; what
  // this service owns is only WHETHER and WITH WHAT it asks. Kept that way on
  // purpose — the mandate service must not learn the billing engine's timing.
  test("an activating mandate asks the billing engine, with its own row", async () => {
    const { service, row, notifyFirstCycleNow } = makeActivatingService();

    await service.refreshFromProvider(row, NOW);

    expect(notifyFirstCycleNow).toHaveBeenCalledTimes(1);
    const [notified, at] = notifyFirstCycleNow.mock.calls[0];
    // THE ROW AS IT NOW STANDS — `active`, and carrying the `nextDebitDate`
    // registration wrote. Handing over the pre-transition row would ask the
    // engine to notify a cycle for a mandate the database says is still pending.
    expect(notified).toMatchObject({ id: row.id, state: "active" });
    expect(at).toEqual(NOW);
  });

  test("it is asked LAST — after entitlement is granted", async () => {
    const { service, row, applyDebitSucceeded, notifyFirstCycleNow } =
      makeActivatingService();

    await service.refreshFromProvider(row, NOW);

    // The user is waiting on entitlement; a notification for a cycle a day away
    // is not allowed to delay it. Ordering asserted rather than assumed, since
    // both are awaited and a reorder would look harmless in review.
    const grantedAt = applyDebitSucceeded.mock.invocationCallOrder[0];
    const notifiedAt = notifyFirstCycleNow.mock.invocationCallOrder[0];
    expect(grantedAt).toBeLessThan(notifiedAt);
  });

  test("a notification failure NEVER fails the approval", async () => {
    // Best effort by design: this runs inside a user's mandate approval. The
    // sweep is still the fallback for anything missed here, so the correct
    // response to a broken gateway is to grant what the user paid for and let
    // the next tick retry the notification.
    const { service, row, applyDebitSucceeded, notifyFirstCycleNow } =
      makeActivatingService();
    notifyFirstCycleNow.mockRejectedValueOnce(new Error("gateway is down"));

    await expect(service.refreshFromProvider(row, NOW)).resolves.toBeDefined();
    expect(applyDebitSucceeded).toHaveBeenCalled();
  });

  test("nothing is asked when a mandate does not reach active", async () => {
    // A mandate the gateway still calls pending has no cycle to notify: its
    // deposit has not settled and it may never be approved at all.
    const { service, row, notifyFirstCycleNow } = makeActivatingService({
      providerState: "pending",
    });

    await service.refreshFromProvider(row, NOW);

    expect(notifyFirstCycleNow).not.toHaveBeenCalled();
  });
});

describe("the first-full-price-payment gate", () => {
  /** Every `bk_subscription_started` the approval published. */
  const startsSent = (send: SendSpy): AnalyticsEventInput[] =>
    send.mock.calls
      .flatMap((call) => call[0] ?? [])
      .filter((e) => e.event_type === "bk_subscription_started");

  test("asks the USER's ledger, not this mandate's", async () => {
    const { service, row, countSettledFullPriceForUser } = makeActivatingService();

    await service.refreshFromProvider(row, NOW);

    // The user id and nothing else. No amount threshold: the predicate
    // identifies rows by what they are, so a plan price change cannot move it.
    expect(countSettledFullPriceForUser).toHaveBeenCalledWith("usr-1");
  });

  test("publishes the start when this is the user's only settlement", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const { service, row } = makeActivatingService({ settledFullPrice: 1 });

    await service.refreshFromProvider(row, NOW);

    expect(startsSent(send)).toHaveLength(1);
    expect(startsSent(send)[0]).toMatchObject({
      insert_id: "bk_subscription_started:usr-1",
      event_properties: { activation_source: "direct_payment" },
    });
    send.mockRestore();
  });

  test("publishes NOTHING when the user has paid full price before", async () => {
    // The re-registration case: revoked at NPCI, re-consented, paying again.
    // A second "first payment" would inflate every new-subscriber cohort.
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const { service, row } = makeActivatingService({ settledFullPrice: 2 });

    await service.refreshFromProvider(row, NOW);

    expect(startsSent(send)).toHaveLength(0);
    send.mockRestore();
  });

  test("publishes nothing when nothing was actually charged", async () => {
    // A gateway without `supportsInitialDeposit` approves having charged
    // nothing. Its deposit row still exists at full price and still settles, so
    // only the `chargePhase: "none"` filter in the repository keeps the count
    // at zero — and zero is no payment, not a first one.
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const { service, row } = makeActivatingService({ settledFullPrice: 0 });

    await service.refreshFromProvider(row, NOW);

    expect(startsSent(send)).toHaveLength(0);
    send.mockRestore();
  });

  test("fails CLOSED when the ledger read throws", async () => {
    // Losing one event beats reporting a second "first" payment for someone
    // who has been paying for months — these counts are read as cohort sizes.
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const { service, row, countSettledFullPriceForUser } = makeActivatingService();
    countSettledFullPriceForUser.mockRejectedValue(new Error("db down"));

    await service.refreshFromProvider(row, NOW);

    expect(startsSent(send)).toHaveLength(0);
    send.mockRestore();
  });

  test("an approval never throws because the ledger read did", async () => {
    // The gate sits on the client's approval-poll path. Analytics must not be
    // able to fail an approval.
    const { service, row, applyDebitSucceeded, countSettledFullPriceForUser } =
      makeActivatingService();
    countSettledFullPriceForUser.mockRejectedValue(new Error("db down"));

    await expect(service.refreshFromProvider(row, NOW)).resolves.toBeDefined();
    expect(applyDebitSucceeded).toHaveBeenCalled();
  });

  test("a live trial never spends the query — that branch is not revenue", async () => {
    const { service, row, countSettledFullPriceForUser } = makeActivatingService({
      row: { trialEndsAt: new Date("2026-09-01T00:00:00.000Z") },
    });

    await service.refreshFromProvider(row, NOW);

    expect(countSettledFullPriceForUser).not.toHaveBeenCalled();
  });
});

/**
 * `authUrl` vs `checkout` — and above all, that adding the second did not move
 * the first.
 *
 * Razorpay's authorization payment is raised by its SDK on the device, so that
 * gateway has no link to return and answers with `checkout` instead. Decentro
 * and Cashfree are unchanged and must STAY unchanged: prod runs Decentro, so a
 * regression here is a production outage on a path this change never intended
 * to touch.
 */
describe("approval affordance — link gateways and SDK gateways", () => {
  /** A row inside its approval window, filled by whichever gateway shape. */
  function liveRow(over: Partial<MandateRow>): MandateRow {
    return {
      ...staleActiveMandate(),
      state: "pending",
      authExpiresAt: new Date(NOW.getTime() + 60 * 60_000),
      ...over,
    };
  }

  const CHECKOUT = {
    keyId: "rzp_test_PUBLISHABLE1",
    orderId: "order_XYZ789",
    customerId: "cust_ABC123",
    recurring: "1",
  };

  test("BACKWARD COMPAT: a link gateway still returns its link and no razorpay block", async () => {
    const { service } = makeService({
      entitled: true,
      row: liveRow({ provider: "decentro", authUrl: "upi://live", providerCheckout: null }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(view.authUrl).toBe("upi://live");
    expect(view.razorpay).toBeNull();
    // The window is reported exactly as before, too.
    expect(view.authExpiresAt).not.toBeNull();
  });

  /**
   * The Decentro SDK block, and above all that adding it did not move the
   * intent-link flow.
   *
   * `intentUrl` is DERIVED from `authUrl` rather than stored beside it, so the
   * two cannot drift and the adapter needed no change at all. A client still
   * launching `authUrl` is unaffected.
   */
  test("a decentro mandate carries its SDK block AND the unchanged link", async () => {
    const { service } = makeService({
      entitled: true,
      row: liveRow({
        provider: "decentro",
        authUrl: "upi://live",
        providerMandateId: "dec_mnd_1",
        providerTxnId: "dec_txn_1",
        referenceId: "pj_mnd_abc",
      }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    // The existing flow, byte for byte.
    expect(view.authUrl).toBe("upi://live");
    expect(view.decentro).toEqual({
      intentUrl: "upi://live",
      decentroMandateId: "dec_mnd_1",
      decentroTxnId: "dec_txn_1",
      referenceId: "pj_mnd_abc",
    });
    expect(view.razorpay).toBeNull();
  });

  test("the decentro block and authUrl expire together", async () => {
    // They are the same link. A client reading one must never see it live while
    // the other reports none.
    const { service } = makeService({
      entitled: true,
      row: liveRow({
        provider: "decentro",
        authUrl: "upi://live",
        authExpiresAt: new Date(NOW.getTime() - 60 * 60_000),
      }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });
    expect(view.authUrl).toBeNull();
    expect(view.decentro).toBeNull();
  });

  test("a razorpay mandate carries no decentro block", async () => {
    const { service } = makeService({
      entitled: true,
      row: liveRow({ provider: "razorpay", authUrl: null, providerCheckout: CHECKOUT }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });
    expect(view.decentro).toBeNull();
    expect(view.razorpay).toEqual(CHECKOUT);
  });

  test("an SDK gateway returns checkout and a null link", async () => {
    const { service } = makeService({
      entitled: true,
      row: liveRow({ provider: "razorpay", authUrl: null, providerCheckout: CHECKOUT }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(view.authUrl).toBeNull();
    expect(view.razorpay).toEqual(CHECKOUT);
    // An SDK row still has a window to count down against, even with no link.
    expect(view.authExpiresAt).not.toBeNull();
  });

  /**
   * The reuse gate, which used to read `authUrl !== null` alone.
   *
   * Without `checkout` counting as somewhere-to-go, every Razorpay retry would
   * fall through to retire-and-re-register: a fresh customer and order per tap,
   * a live order abandoned each time, and the one-mandate-in-flight invariant
   * gone.
   */
  test("an unentitled user with a live checkout is REUSED, not retired", async () => {
    const { service, setState, createMandateAtGateway } = makeService({
      entitled: false,
      row: liveRow({ provider: "razorpay", authUrl: null, providerCheckout: CHECKOUT }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });

    expect(view.razorpay).toEqual(CHECKOUT);
    expect(setState).not.toHaveBeenCalled();
    expect(createMandateAtGateway).not.toHaveBeenCalled();
  });

  test("an expired window hides the checkout, exactly as it hides a link", async () => {
    // Opening a checkout sheet against a dead order can only fail, and the user
    // cannot tell why — same reasoning that nulls an expired `authUrl`.
    const { service } = makeService({
      entitled: true,
      row: liveRow({
        provider: "razorpay",
        authUrl: null,
        providerCheckout: CHECKOUT,
        authExpiresAt: new Date(NOW.getTime() - 60 * 60_000),
      }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });
    expect(view.razorpay).toBeNull();
    expect(view.authExpiresAt).toBeNull();
  });

  test("a malformed checkout column degrades to null instead of reaching the wire", async () => {
    // `provider_checkout` is a Json column, so a row written by an older build or
    // edited by hand can hold anything. A half-populated object would open an SDK
    // sheet with no order in it — a failure with no explanation. Null instead,
    // which the app renders as "set up autopay again".
    const { service } = makeService({
      entitled: true,
      row: liveRow({
        provider: "razorpay",
        authUrl: null,
        providerCheckout: { keyId: "rzp_test_1" },
      }),
    });

    const view = await service.createMandate({ userId: "usr-1", plan: PLAN, now: NOW });
    expect(view.razorpay).toBeNull();
  });
});

describe("a no-trial approval grants the period registration paid for", () => {
  test("grants through the mandate's own nextDebitDate", async () => {
    const { service, row, applyDebitSucceeded } = makeActivatingService();

    await service.refreshFromProvider(row, NOW);

    expect(applyDebitSucceeded).toHaveBeenCalledWith({
      userId: "usr-1",
      // Read back, never recomputed — registration wrote `addMonthClamped`
      // here, and reusing it verbatim is what makes a replay a no-op against
      // the repository's `expiresAt < periodEnd` guard.
      periodEnd: new Date("2026-08-29T00:00:00.000Z"),
      planId: "month",
      productId: "prabhuji_vip_month",
    });
  });

  test("a live trial does NOT grant — that signup only paid the ₹2 deposit", async () => {
    const { service, row, applyDebitSucceeded } = makeActivatingService({
      row: { trialEndsAt: new Date("2026-08-01T00:00:00.000Z") },
    });

    await service.refreshFromProvider(row, NOW);

    expect(applyDebitSucceeded).not.toHaveBeenCalled();
  });

  test("an ALREADY-EXPIRED trial does NOT grant", async () => {
    // The subtle one. `onStateChanged` computes a local `trialEndsAt` that is
    // null once the window has closed — so gating on that local would treat
    // this ₹2 signup as a full-price one and hand it a free month. The gate
    // reads `row.trialEndsAt`, which says whether the mandate EVER carried a
    // trial, and this row did.
    const { service, row, applyDebitSucceeded } = makeActivatingService({
      row: { trialEndsAt: new Date("2026-07-28T00:00:00.000Z") },
    });

    await service.refreshFromProvider(row, NOW);

    expect(applyDebitSucceeded).not.toHaveBeenCalled();
  });

  test("a gateway that takes no registration deposit does NOT grant", async () => {
    // No charge was ever dispatched, so there is no period to grant. Dead today
    // (every provider we ship sets this true) and pinned so it stays that way.
    const { service, row, applyDebitSucceeded } = makeActivatingService({
      supportsInitialDeposit: false,
    });

    await service.refreshFromProvider(row, NOW);

    expect(applyDebitSucceeded).not.toHaveBeenCalled();
  });

  test("a pre-split row with no nextDebitDate does NOT grant", async () => {
    // Those rows predate full-price registration entirely, so there is no
    // period end to trust and nothing was charged at registration.
    const { service, row, applyDebitSucceeded } = makeActivatingService({
      row: { nextDebitDate: null },
    });

    await service.refreshFromProvider(row, NOW);

    expect(applyDebitSucceeded).not.toHaveBeenCalled();
  });

  test("a repeated activation asks for the SAME period end", async () => {
    // The value must not drift with wall-clock time — a `now`-derived period
    // end would grant a fresh month on every replay.
    const { service, row, applyDebitSucceeded } = makeActivatingService();

    await service.refreshFromProvider(row, NOW);
    await service.refreshFromProvider(row, new Date(NOW.getTime() + 86_400_000));

    const [first, second] = applyDebitSucceeded.mock.calls;
    expect(first).toEqual(second);
  });
});

/**
 * A plan whose first debit lands inside the gateway's notification lead time
 * can never be billed, so it is refused at registration.
 *
 * The lead is measured in whole days (`cycleDate - istDateOnly(now)`), so on a
 * gateway with a 48h floor — Razorpay — a one-day trial puts the first cycle
 * 24h out and the sweep reports `skippedOutsideWindow` on every tick, forever.
 * There is no failed row to find afterwards, because no cycle is ever claimed:
 * the mandate simply sits active, having already taken the registration
 * deposit, and is never charged again.
 */
describe("first debit must clear the gateway's notification lead time", () => {
  test("a trial shorter than the gateway's lead is refused, not silently unbillable", async () => {
    const { service, createAtGateway } = makeRegisteringService({
      pdnLeadHours: { min: 48, max: 48 },
    });

    await expect(
      service.createMandate({
        userId: "u1",
        plan: { ...PLAN, trialDays: 1 },
        now: NOW,
      })
    ).rejects.toMatchObject({ errorCode: "PLAN_NOT_PURCHASABLE", statusCode: 409 });

    // Refused BEFORE the gateway is called: no mandate is registered at the
    // provider and no deposit is taken for a subscription we could not bill.
    expect(createAtGateway).not.toHaveBeenCalled();
  });

  test("a trial that clears the lead registers normally", async () => {
    const { service, createAtGateway } = makeRegisteringService({
      pdnLeadHours: { min: 48, max: 48 },
    });

    await service.createMandate({
      userId: "u1",
      plan: { ...PLAN, trialDays: 2 },
      now: NOW,
    });

    expect(createAtGateway).toHaveBeenCalledTimes(1);
  });

  test("the 24h-floor gateways still accept a one-day trial", async () => {
    // The guard must be the GATEWAY's floor, not a new global minimum — this
    // plan is perfectly billable on Cashfree and Decentro.
    const { service, createAtGateway } = makeRegisteringService({
      pdnLeadHours: { min: 24, max: 48 },
    });

    await service.createMandate({
      userId: "u1",
      plan: { ...PLAN, trialDays: 1 },
      now: NOW,
    });

    expect(createAtGateway).toHaveBeenCalledTimes(1);
  });
});

/**
 * CANCELLING MUST MEAN THE SAME THING WHEREVER IT HAPPENS.
 *
 * A user can end a mandate two ways: in our app (`cancelForUser`) or in their
 * UPI app, which reaches us as a `token.cancelled` webhook and lands in
 * `onStateChanged`. Both are the same intent and must leave the same
 * entitlement — the user keeps the trial or the period they already hold.
 *
 * The webhook path used to send `reason: "expired"` for EVERY terminal state,
 * on the reasoning that "nothing was ever paid on these paths". That is only
 * true of a mandate that died before approval; the same branch also catches a
 * live mandate being revoked. So cancelling in the UPI app revoked access on
 * the spot while cancelling in the app kept it — observed in production, on a
 * subscriber whose ₹2 had settled 41 seconds earlier.
 */
describe("a mandate that ends after going live is a cancellation, not an expiry", () => {
  function makeEndingService(previousState: MandateState, endState: MandateState) {
    const row: MandateRow = {
      ...staleActiveMandate(),
      state: previousState,
      providerMandateId: "cust_A:token_B",
    };

    const repo = {
      applyStatus: vi.fn().mockResolvedValue({ ...row, state: endState }),
      setNextDebitDate: vi.fn(),
      findById: vi.fn(),
    } as unknown as MandateRepository;

    const transactions = {
      settleDepositForMandate: vi.fn().mockResolvedValue(false),
      findByGatewayRequestId: vi.fn().mockResolvedValue(null),
    } as unknown as TransactionsRepository;

    const provider = {
      name: "razorpay",
      supportsInitialDeposit: true,
      debitRequestId: () => "req",
      getMandateStatus: vi.fn().mockResolvedValue({
        state: endState,
        stateReason: "cancelled_at_gateway",
        providerMandateId: "cust_A:token_B",
        providerTxnId: "pay_1",
        npciTransactionId: null,
        payerHandleMasked: null,
        payerNameMasked: null,
        nextDebitDate: null,
      }),
    } as unknown as MandateProvider;

    const applyMandateEnded = vi.fn(() => Promise.resolve());
    clearGlobalServices();
    registerGlobalService("subscription", fakeSubscriptionApi({ applyMandateEnded }));

    const service = new MandateService(repo, transactions, provider, () => provider, {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    });
    return { service, row, applyMandateEnded };
  }

  test("revoked from ACTIVE ends the subscription as `cancelled` — access is kept", async () => {
    const { service, row, applyMandateEnded } = makeEndingService("active", "revoked");

    await service.refreshFromProvider(row, NOW);

    expect(applyMandateEnded).toHaveBeenCalledWith({
      userId: "usr-1",
      reason: "cancelled",
      now: NOW,
    });
  });

  test("revoked from PENDING still ends it as `expired` — nothing was ever paid", async () => {
    // The abandoned-registration path. This user never approved, so there is no
    // period or trial to honour and access must end immediately.
    const { service, row, applyMandateEnded } = makeEndingService("pending", "revoked");

    await service.refreshFromProvider(row, NOW);

    expect(applyMandateEnded).toHaveBeenCalledWith({
      userId: "usr-1",
      reason: "expired",
      now: NOW,
    });
  });

  test("a mandate that FAILED from active is still a cancellation", async () => {
    // Same reasoning as `revoked`: it was live, so whatever the user already
    // holds is theirs. `computeIsEntitled` denies it anyway if no deadline is
    // live, which is what keeps a never-paid mandate from gaining anything.
    const { service, row, applyMandateEnded } = makeEndingService("active", "failed");

    await service.refreshFromProvider(row, NOW);

    expect(applyMandateEnded).toHaveBeenCalledWith({
      userId: "usr-1",
      reason: "cancelled",
      now: NOW,
    });
  });
});

/**
 * A revoked mandate must survive the poll that follows its own cancellation.
 *
 * PRODUCTION INCIDENT, 2026-08-10. A user cancelled; the `PUT …/cancel` was
 * accepted; one second later Razorpay's own `token.cancellation_initiated`
 * webhook arrived, the handler polled the token (correctly — the body is never
 * trusted), read `recurring_details.status: "cancellation_initiated"` which the
 * adapter maps to `active` BY DESIGN, and overwrote the `revoked` we had just
 * written. `onStateChanged` then re-ran `mandate_authorized` and the
 * subscription landed on `pending` — so the user lost access they had paid for
 * while the scheduler still held a live mandate to bill on the next cycle.
 */
describe("refreshFromProvider — a revoked mandate is never resurrected", () => {
  function makeRevokedService(reportedState: string) {
    const row = pendingMandate({ state: "revoked", stateReason: "user_cancelled" });

    // Resolves a real row: on the agreeing-poll path the service reads
    // `updated.state` back, so a bare `vi.fn()` returning undefined would fail
    // for a reason that has nothing to do with the guard.
    const applyStatus = vi.fn().mockResolvedValue({ ...row, state: reportedState });
    const repo = { applyStatus, setNextDebitDate: vi.fn(), findById: vi.fn() } as unknown as MandateRepository;
    const transactions = {
      settleDepositForMandate: vi.fn(),
      findByGatewayRequestId: vi.fn().mockResolvedValue(null),
    } as unknown as TransactionsRepository;

    const provider = {
      name: "razorpay",
      supportsInitialDeposit: true,
      debitRequestId: () => "req",
      // What Razorpay actually answers while NPCI has yet to confirm.
      getMandateStatus: vi.fn().mockResolvedValue({
        state: reportedState,
        stateReason: null,
        providerMandateId: "cust_1:token_1",
        providerTxnId: null,
        npciTransactionId: null,
        payerHandleMasked: null,
        payerNameMasked: null,
        nextDebitDate: null,
      }),
    } as unknown as MandateProvider;

    const applyMandateAuthorized = vi.fn(() =>
      Promise.resolve({ changed: 1, trialFirstConsumed: true })
    );
    clearGlobalServices();
    registerGlobalService("subscription", fakeSubscriptionApi({ applyMandateAuthorized }));

    const service = new MandateService(repo, transactions, provider, () => provider, {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    });
    return { service, row, applyStatus, applyMandateAuthorized };
  }

  test("a poll reporting `active` does not write, and does not re-authorize", async () => {
    const { service, row, applyStatus, applyMandateAuthorized } = makeRevokedService("active");

    const result = await service.refreshFromProvider(row, NOW);

    expect(result.state).toBe("revoked");
    // Not merely "the state was preserved" — the write never happened at all,
    // so nothing downstream can observe a transition that did not occur.
    expect(applyStatus).not.toHaveBeenCalled();
    // The half that actually cost the user their access.
    expect(applyMandateAuthorized).not.toHaveBeenCalled();
  });

  test("a poll still reporting `revoked` is left alone", async () => {
    // The guard must not swallow the ordinary agreeing poll.
    const { service, applyStatus } = makeRevokedService("revoked");
    const row = pendingMandate({ state: "revoked", stateReason: "user_cancelled" });

    await service.refreshFromProvider(row, NOW);

    expect(applyStatus).toHaveBeenCalled();
  });

  test("a non-revoked row still follows the provider", async () => {
    // Scope check: the guard is `revoked`-only. An `expired` row whose approval
    // landed late is a REAL recovery and must still be believed, or a user who
    // actually paid is stranded.
    const row = pendingMandate({ state: "expired", stateReason: "stale_no_auth_link" });
    const applyStatus = vi.fn().mockResolvedValue({ ...row, state: "active" });
    const repo = { applyStatus, setNextDebitDate: vi.fn(), findById: vi.fn() } as unknown as MandateRepository;
    const transactions = {
      settleDepositForMandate: vi.fn().mockResolvedValue(true),
      findByGatewayRequestId: vi.fn().mockResolvedValue(null),
    } as unknown as TransactionsRepository;
    const provider = {
      name: "razorpay",
      supportsInitialDeposit: true,
      debitRequestId: () => "req",
      getMandateStatus: vi.fn().mockResolvedValue({
        state: "active",
        stateReason: null,
        providerMandateId: "cust_1:token_1",
        providerTxnId: null,
        npciTransactionId: null,
        payerHandleMasked: null,
        payerNameMasked: null,
        nextDebitDate: null,
      }),
    } as unknown as MandateProvider;
    clearGlobalServices();
    registerGlobalService("subscription", fakeSubscriptionApi({}));

    const service = new MandateService(repo, transactions, provider, () => provider, {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    });

    await service.refreshFromProvider(row, NOW);
    expect(applyStatus).toHaveBeenCalled();
  });
});

describe("paymentReferenceId — the deposit transaction's id, on every mandate response", () => {
  /** Only what a READ of an existing mandate touches. */
  function makeReadingService(depositId: string | null) {
    const findInitialDepositIdForMandate = vi.fn<
      (mandateId: string) => Promise<string | null>
    >(() => Promise.resolve(depositId));
    const repo = {
      // `active`, so `shouldPoll` is false and no gateway read happens.
      findLatestForUser: vi.fn().mockResolvedValue(staleActiveMandate()),
    } as unknown as MandateRepository;
    const transactions = {
      findInitialDepositIdForMandate,
    } as unknown as TransactionsRepository;
    const provider = { name: "stub" } as unknown as MandateProvider;
    const service = new MandateService(repo, transactions, provider, () => provider, {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    });
    return { service, findInitialDepositIdForMandate };
  }

  test("POST returns the deposit row it just recorded", async () => {
    const { service } = makeRegisteringService();
    const view = await service.createMandate({ userId: "usr-2", plan: PLAN, now: NOW });
    expect(view.paymentReferenceId).toBe("txn-1");
  });

  test("GET returns the same mandate's deposit id", async () => {
    const { service, findInitialDepositIdForMandate } = makeReadingService("txn-1");
    const view = await service.getMandateForUser("usr-1", NOW);
    expect(view?.paymentReferenceId).toBe("txn-1");
    expect(findInitialDepositIdForMandate).toHaveBeenCalledWith("mnd-1");
  });

  test("a mandate with no deposit row answers null — the key is still present", async () => {
    const { service } = makeReadingService(null);
    const view = await service.getMandateForUser("usr-1", NOW);
    expect(view).toHaveProperty("paymentReferenceId", null);
  });
});

/**
 * THE TRIAL-START EVENTS FIRE ONCE PER USER, EVER (TAM-181).
 *
 * Production was landing `bk_trial_success` and `bk_subscription_trial_started`
 * two and three times for the same `user_id`. Both are emitted from the
 * `state === "active"` branch of `onStateChanged`, and that branch is
 * re-entrant by design — there is no single "the mandate went live" moment:
 *
 *   * the provider's callback and the client's poll both funnel into
 *     `refreshFromProvider`, both read `previous = "pending"`, and
 *     `applyStatus` is an unconditional update with no compare-and-set, so both
 *     see a transition;
 *   * the self-heal branch deliberately RE-RUNS the whole branch whenever the
 *     mandate is active but entitlement does not read back;
 *   * a user with a second trial-bearing mandate reaches it again months later.
 *
 * Neither event had a gate of its own; `insert_id` was expected to absorb the
 * duplicates, which it cannot — the warehouse table is a plain MergeTree and
 * stores every row.
 *
 * The gate is the subscription facade's `trialFirstConsumed`, which comes from
 * a guarded `UPDATE … WHERE trial_consumed_at IS NULL`. Exactly one caller ever
 * sees it true, so these tests assert CALL COUNTS — "at least one" is precisely
 * the assertion that let this defect ship.
 */
describe("trial-start events fire once per user, not once per re-entry", () => {
  const trialStartsSent = (send: SendSpy): AnalyticsEventInput[] =>
    send.mock.calls
      .flatMap((call) => call[0] ?? [])
      .filter(
        (e) =>
          e.event_type === "bk_trial_success" ||
          e.event_type === "bk_subscription_trial_started"
      );

  /** A mandate mid-trial: the window is live at `NOW`. */
  const TRIAL_END = new Date("2026-08-05T18:29:59.999Z");
  const trialRow = () => ({ trialEndsAt: TRIAL_END });

  test("the first approval emits each trial-start event exactly once", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const { service, row } = makeActivatingService({
      row: trialRow(),
      trialFirstConsumed: true,
    });

    await service.refreshFromProvider(row, NOW);

    const sent = trialStartsSent(send);
    expect(sent.filter((e) => e.event_type === "bk_trial_success")).toHaveLength(1);
    expect(
      sent.filter((e) => e.event_type === "bk_subscription_trial_started")
    ).toHaveLength(1);
    send.mockRestore();
  });

  test("AC2 — a second onStateChanged on the same mandate emits ZERO more", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    // The callback/poll race, replayed: the grant still applies (it is
    // idempotent and monotonic), but the trial was stamped by the first caller,
    // so the facade reports `false` to this one.
    const { service, row } = makeActivatingService({
      row: trialRow(),
      trialFirstConsumed: false,
    });

    await service.refreshFromProvider(row, NOW);

    expect(trialStartsSent(send)).toHaveLength(0);
    send.mockRestore();
  });

  test("AC3 — the self-heal re-entry re-applies the grant but emits ZERO", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    // `previous === state === "active"` with entitlement reading false is the
    // self-heal branch. It MUST still re-apply the authorization — that is the
    // stuck-subscription fix it exists for — and must NOT re-announce the trial.
    const { service, row, applyMandateAuthorized } = makeActivatingService({
      row: { ...trialRow(), state: "active" },
      providerState: "active",
      entitled: false,
      trialFirstConsumed: false,
    });

    await service.refreshFromProvider(row, NOW);

    expect(applyMandateAuthorized).toHaveBeenCalledTimes(1);
    expect(trialStartsSent(send)).toHaveLength(0);
    send.mockRestore();
  });

  test("AC4 — a SECOND trial-bearing mandate for the same user emits ZERO", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    // Mechanism 3, and the one the old mandate-keyed `insert_id` could not even
    // collapse: a different mandate id, same person, trial already consumed.
    const { service, row } = makeActivatingService({
      row: { ...trialRow(), id: "mnd-2", referenceId: "pj_mnd_second" },
      trialFirstConsumed: false,
    });

    await service.refreshFromProvider(row, NOW);

    expect(trialStartsSent(send)).toHaveLength(0);
    send.mockRestore();
  });

  test("AC5 — both trial-start events key on the USER, not the mandate", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    const { service, row } = makeActivatingService({
      row: { ...trialRow(), id: "mnd-2" },
      trialFirstConsumed: true,
    });

    await service.refreshFromProvider(row, NOW);

    const byType = (t: string) => trialStartsSent(send).find((e) => e.event_type === t);
    expect(byType("bk_trial_success")?.insert_id).toBe("bk_trial_success:usr-1");
    expect(byType("bk_subscription_trial_started")?.insert_id).toBe(
      "bk_subscription_trial_started:usr-1"
    );
    send.mockRestore();
  });

  test("a full-price approval is untouched by the trial gate", async () => {
    const send = vi.spyOn(analyticsEventsClient, "send").mockResolvedValue(undefined);
    // The gate rides INSIDE `trackMandateApproved`'s trial branch. Applied to
    // the whole call it would suppress `bk_subscription_started` for a
    // direct-paid registration, which consumes no trial and so reports
    // `trialFirstConsumed: false` perfectly legitimately.
    const { service, row } = makeActivatingService({
      row: { trialEndsAt: null },
      trialFirstConsumed: false,
      settledFullPrice: 1,
    });

    await service.refreshFromProvider(row, NOW);

    const starts = send.mock.calls
      .flatMap((call) => call[0] ?? [])
      .filter((e) => e.event_type === "bk_subscription_started");
    expect(starts).toHaveLength(1);
    expect(trialStartsSent(send)).toHaveLength(0);
    send.mockRestore();
  });
});

describe("bk_mandate_status fires only on a state that actually changed (TAM-187)", () => {
  function serviceReporting(reportedState: string, current: MandateRow) {
    const applyStatus = vi.fn().mockResolvedValue({ ...current, state: reportedState });
    const repo = { applyStatus, setNextDebitDate: vi.fn(), findById: vi.fn() } as unknown as MandateRepository;
    const transactions = {
      settleDepositForMandate: vi.fn().mockResolvedValue(false),
      findByGatewayRequestId: vi.fn().mockResolvedValue(null),
    } as unknown as TransactionsRepository;
    const provider = {
      name: "razorpay",
      supportsInitialDeposit: true,
      debitRequestId: () => "req",
      getMandateStatus: vi.fn().mockResolvedValue({
        state: reportedState,
        stateReason: null,
        providerMandateId: "cust_1:token_1",
        providerTxnId: null,
        npciTransactionId: null,
        payerHandleMasked: null,
        payerNameMasked: null,
        nextDebitDate: null,
      }),
    } as unknown as MandateProvider;
    clearGlobalServices();
    registerGlobalService("subscription", fakeSubscriptionApi({}));
    return new MandateService(repo, transactions, provider, () => provider, {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    });
  }

  const statusChanged = vi.spyOn(paymentLedgerAnalytics, "trackMandateStatusChanged");
  beforeEach(() => statusChanged.mockReset().mockResolvedValue(undefined));

  test("a poll that moves the state reports the transition with the caller's source", async () => {
    const row = pendingMandate({ state: "pending" });

    await serviceReporting("expired", row).refreshFromProvider(row, NOW, "webhook");

    expect(statusChanged).toHaveBeenCalledTimes(1);
    const reported = statusChanged.mock.calls[0]?.[0];
    expect(reported).toMatchObject({ previousStatus: "pending", source: "webhook" });
    expect(reported?.mandate.state).toBe("expired");
  });

  test("a poll that reads the same state back reports nothing", async () => {
    const row = pendingMandate({ state: "pending" });

    await serviceReporting("pending", row).refreshFromProvider(row, NOW);

    expect(statusChanged).not.toHaveBeenCalled();
  });
});

describe("a declined trial deposit reports bk_trial_failed without moving state (TAM-188)", () => {
  const TRIAL_END = new Date("2026-09-27T18:29:59.999Z");
  const declined = {
    gatewayPaymentId: "pay_failed_1",
    failureCode: "BAD_REQUEST_ERROR",
    failureReason: "payment_failed",
  };

  function serviceWithDeclinedDeposit(
    opts: { depositStatus?: string; failedRegistrationPayment?: typeof declined | null } = {}
  ) {
    const applyStatus = vi.fn((_id: string, s: { state: MandateState }) =>
      Promise.resolve({ ...pendingMandate({ trialEndsAt: TRIAL_END }), state: s.state })
    );
    const repo = { applyStatus, setNextDebitDate: vi.fn(), findById: vi.fn() } as unknown as MandateRepository;
    const deposit = {
      id: "dep-1",
      kind: "initial_deposit",
      status: opts.depositStatus ?? "submitted",
    };
    const settleDepositForMandate = vi.fn().mockResolvedValue(false);
    const transactions = {
      settleDepositForMandate,
      findByGatewayRequestId: vi.fn().mockResolvedValue(deposit),
    } as unknown as TransactionsRepository;
    const provider = {
      name: "razorpay",
      supportsInitialDeposit: true,
      debitRequestId: () => "req",
      getMandateStatus: vi.fn().mockResolvedValue({
        state: "pending",
        stateReason: null,
        providerMandateId: null,
        providerTxnId: null,
        npciTransactionId: null,
        payerHandleMasked: null,
        payerNameMasked: null,
        nextDebitDate: null,
        ...(opts.failedRegistrationPayment === null
          ? {}
          : { failedRegistrationPayment: opts.failedRegistrationPayment ?? declined }),
      }),
    } as unknown as MandateProvider;
    clearGlobalServices();
    registerGlobalService("subscription", fakeSubscriptionApi({}));
    const service = new MandateService(repo, transactions, provider, () => provider, {
      expiryMinutes: 15,
      mandateName: "Prabhuji",
    });
    return { service, applyStatus, settleDepositForMandate };
  }

  const declinedSpy = vi.spyOn(paymentAnalytics, "trackTrialDepositDeclined");
  const failedSpy = vi.spyOn(paymentAnalytics, "trackPaymentFailed");
  beforeEach(() => {
    declinedSpy.mockReset().mockResolvedValue(undefined);
    failedSpy.mockReset().mockResolvedValue(undefined);
  });
  // `publishDepositDeclined` is fire-and-forget; let it settle before asserting.
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  test("a webhook read of a declined attempt reports it once, with the attempt's ids", async () => {
    const { service } = serviceWithDeclinedDeposit();
    const row = pendingMandate({ trialEndsAt: TRIAL_END });

    await service.refreshFromProvider(row, NOW, "webhook");
    await settle();

    expect(declinedSpy).toHaveBeenCalledTimes(1);
    expect(declinedSpy.mock.calls[0]?.[0]).toMatchObject({
      gatewayPaymentId: "pay_failed_1",
      failureCode: "BAD_REQUEST_ERROR",
      failureReason: "payment_failed",
      txn: { id: "dep-1" },
    });
    // The terminal path is untouched — nothing died.
    expect(failedSpy).not.toHaveBeenCalled();
  });

  test("the mandate stays pending and the deposit is not written", async () => {
    const { service, applyStatus, settleDepositForMandate } = serviceWithDeclinedDeposit();
    const row = pendingMandate({ trialEndsAt: TRIAL_END });

    const after = await service.refreshFromProvider(row, NOW, "webhook");
    await settle();

    expect(after.state).toBe("pending");
    for (const call of applyStatus.mock.calls) expect(call[1].state).toBe("pending");
    expect(settleDepositForMandate).not.toHaveBeenCalled();
  });

  test.each(["poll", "scheduler", "inline"] as const)(
    "a %s read of the same failed attempt reports nothing — it would repeat every tick",
    async (source) => {
      const { service } = serviceWithDeclinedDeposit();
      const row = pendingMandate({ trialEndsAt: TRIAL_END });

      await service.refreshFromProvider(row, NOW, source);
      await settle();

      expect(declinedSpy).not.toHaveBeenCalled();
    }
  );

  test("a registration without a trial reports nothing", async () => {
    const { service } = serviceWithDeclinedDeposit();
    const row = pendingMandate({ trialEndsAt: null });

    await service.refreshFromProvider(row, NOW, "webhook");
    await settle();

    expect(declinedSpy).not.toHaveBeenCalled();
  });

  test("a deposit that has since succeeded reports nothing — a late redelivery", async () => {
    const { service } = serviceWithDeclinedDeposit({ depositStatus: "succeeded" });
    const row = pendingMandate({ trialEndsAt: TRIAL_END });

    await service.refreshFromProvider(row, NOW, "webhook");
    await settle();

    expect(declinedSpy).not.toHaveBeenCalled();
  });

  test("no failed attempt reported by the gateway, no event", async () => {
    const { service } = serviceWithDeclinedDeposit({ failedRegistrationPayment: null });
    const row = pendingMandate({ trialEndsAt: TRIAL_END });

    await service.refreshFromProvider(row, NOW, "webhook");
    await settle();

    expect(declinedSpy).not.toHaveBeenCalled();
  });

  test("a throwing tracker cannot fail the read or change its result", async () => {
    declinedSpy.mockRejectedValue(new Error("boom"));
    const { service } = serviceWithDeclinedDeposit();
    const row = pendingMandate({ trialEndsAt: TRIAL_END });

    const after = await service.refreshFromProvider(row, NOW, "webhook");
    await settle();

    expect(declinedSpy).toHaveBeenCalledTimes(1);
    expect(after.state).toBe("pending");
  });
});
