import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { fakeSubscriptionApi, proStatus } from "@api/shared/testing";
import { PaymentController } from "../payment.controller.js";
import type { MandateService } from "../../services/mandate.service.js";
import type { MandateView } from "@api/core/payment/types";

/**
 * `PaymentController.withSubscription`, and the plan guard.
 *
 * `MandateData.subscription.isEntitled` is what the Flutter payment bloc treats
 * as the success signal for a purchase. So a failure to read the subscription
 * must NOT degrade to "not entitled": that would render
 * `PaymentErrorCode.mandateExpired` — "This payment link has expired" — to
 * someone who has just paid. A 500 they retry is the honest answer, which is why
 * this path uses `readSubscriptionStatus` (throws) rather than
 * `resolveProEntitlement` (false).
 */

const VIEW = {
  mandateId: "mnd-1",
  state: "active",
  authUrl: null,
  authExpiresAt: null,
  planId: "month",
  amountPaise: 29900,
  currency: "INR",
  requiresReRegistration: false,
  paymentReferenceId: null,
  subscription: {
    status: "free",
    isEntitled: false,
    entitledUntil: null,
    activePlanId: null,
    activeProductId: null,
    provider: null,
    expiresAt: null,
    trialEndsAt: null,
  },
  nextDebitDate: null,
} as unknown as MandateView;

const PLANS = [
  {
    planId: "month",
    productId: "prabhuji_vip_month",
    period: "month",
    trialDays: 3,
    amountPaise: 29900,
    initialDepositPaise: 200,
    currency: "INR",
  },
];

function makeController(opts: {
  statusThrows?: boolean;
  plans?: typeof PLANS;
  supportsInitialDeposit?: boolean;
}) {
  clearGlobalServices();
  registerGlobalService(
    "subscription",
    fakeSubscriptionApi({
      getStatus: opts.statusThrows
        ? () => Promise.reject(new Error("facade down"))
        : () => Promise.resolve(proStatus()),
    })
  );
  registerGlobalService("paywall", {
    getPurchasablePlans: () => Promise.resolve(opts.plans ?? PLANS),
  } as never);

  const service = {
    createMandate: vi.fn().mockResolvedValue(VIEW),
    getMandateForUser: vi.fn().mockResolvedValue(VIEW),
    cancelForUser: vi.fn().mockResolvedValue(VIEW),
  } as unknown as MandateService;

  return new PaymentController(service, {
    paywallId: "vip-membership-v1",
    supportsInitialDeposit: opts.supportsInitialDeposit ?? true,
  });
}

function fakeReq() {
  return { user: { id: "usr-1" }, body: { planId: "month" } } as never;
}

function fakeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return reply as never;
}

beforeEach(() => clearGlobalServices());
afterEach(() => clearGlobalServices());

describe("withSubscription", () => {
  test("merges live subscription state into the mandate view", async () => {
    const controller = makeController({});
    const reply = fakeReply();

    await controller.createMandate(fakeReq(), reply);

    const sent = (reply as unknown as { send: { mock: { calls: unknown[][] } } })
      .send.mock.calls[0][0] as { data: { subscription: { isEntitled: boolean } } };
    expect(sent.data.subscription.isEntitled).toBe(true);
  });

  /**
   * The regression test for the fail-loud choice on this path. If this ever
   * starts resolving with `isEntitled: false`, a paying user sees "this payment
   * link has expired" the moment the subscription read hiccups.
   */
  test("a failed subscription read REJECTS rather than reporting 'not entitled'", async () => {
    const controller = makeController({ statusThrows: true });

    await expect(
      controller.createMandate(fakeReq(), fakeReply())
    ).rejects.toThrow();
  });
});

describe("resolvePlan guards", () => {
  test("an unknown plan is a 400, not a silent free mandate", async () => {
    const controller = makeController({ plans: [] });

    await expect(
      controller.createMandate(fakeReq(), fakeReply())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("a zero price is refused — a ₹0 mandate never charges", async () => {
    const controller = makeController({
      plans: [{ ...PLANS[0], amountPaise: 0 }],
    });

    await expect(
      controller.createMandate(fakeReq(), fakeReply())
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  /**
   * `initial_deposit_paise` defaults to 0, so a plan that grew a trial without
   * being given a deposit amount would authorize ₹0 on a gateway that expects to
   * take one — leaving an unverified mandate and a trial nobody paid to start.
   * This is what turns forgetting the seed step into a loud 409.
   */
  test("a trial plan with no deposit is refused on a gateway that takes one", async () => {
    const controller = makeController({
      plans: [{ ...PLANS[0], initialDepositPaise: 0 }],
      supportsInitialDeposit: true,
    });

    await expect(
      controller.createMandate(fakeReq(), fakeReply())
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test("…but is fine on a gateway that takes nothing at registration", async () => {
    // NO live gateway is in this state any more — Decentro used to be, and now
    // takes the deposit via `is_first_txn_amount` like Cashfree does. Kept
    // because the branch is still reachable the day one is added, and the
    // failure mode if it silently stopped working is a 409 on a plan that is
    // in fact fine.
    const controller = makeController({
      plans: [{ ...PLANS[0], initialDepositPaise: 0 }],
      supportsInitialDeposit: false,
    });

    await expect(
      controller.createMandate(fakeReq(), fakeReply())
    ).resolves.toBeDefined();
  });
});
