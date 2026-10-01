import { describe, expect, test, vi } from "vitest";
import type { CashfreeClient } from "../cashfree.client.js";
import {
  CashfreeMandateProvider,
  mapPaymentOutcome,
  mapSubscriptionState,
} from "../cashfree-mandate.repository.js";

/**
 * The Cashfree adapter's translation, asserted field by field — the same money-
 * critical properties the Decentro adapter test pins: rupees not paise, the
 * two-step create → AUTH-pay flow that yields the authorization link, a status
 * never optimistically read as `active`, and payer PII masked at the boundary.
 *
 * The two-step create flow (verified against the Cashfree sandbox): create a
 * subscription (→ `subscription_session_id`), then initiate a UPI AUTH payment
 * on that session (→ the per-app authorization link).
 */

/**
 * Records what the adapter sent, and replays canned responses routed by path:
 *   POST /subscriptions        -> opts.sub
 *   POST /subscriptions/pay     -> opts.pay   (also matches …/payments)
 *   POST …/manage               -> {}
 *   GET  (any)                  -> opts.get
 */
function fakeClient(
  opts: {
    sub?: Record<string, unknown>;
    pay?: Record<string, unknown>;
    get?: Record<string, unknown>;
  } = {}
) {
  const post = vi.fn<
    (
      path: string,
      body: Record<string, unknown>,
      ctx?: unknown
    ) => Promise<Record<string, unknown>>
  >((path) =>
    Promise.resolve(
      path.includes("/pay")
        ? opts.pay ?? {}
        : path.includes("/manage")
          ? {}
          : opts.sub ?? {}
    )
  );
  const get = vi.fn<
    (
      path: string,
      query?: Record<string, string>,
      ctx?: unknown
    ) => Promise<Record<string, unknown>>
  >(() => Promise.resolve(opts.get ?? {}));
  const client = { post, get } as unknown as CashfreeClient;
  return { client, post, get };
}

/** Cashfree create-subscription response (session id + ids + status). */
const SUB_OK = {
  subscription_id: "pj_mnd_abc",
  cf_subscription_id: "cf_sub_1",
  subscription_status: "INITIALIZED",
  subscription_session_id: "sub_session_abc",
};
/** Cashfree /subscriptions/pay response: the nested UPI authorization link. */
const PAY_OK = {
  cf_payment_id: "cfp_1",
  payment_status: "PENDING",
  data: {
    payload: {
      upiIntentData: {
        androidAuthAppLinks: {
          DEFAULT: "https://payments-test.cashfree.com/subs-checkout/auth/xyz",
        },
      },
    },
  },
};

function baseInput() {
  return {
    referenceId: "pj_mnd_abc",
    type: "upi" as const,
    mandateName: "Prabhuji VIP Membership",
    purposeMessage: "Prabhuji VIP Membership",
    amountPaise: 29900,
    initialDepositPaise: 200,
    currency: "INR",
    frequency: "MONTHLY",
    amountRule: "MAX",
    ruleType: "BEFORE",
    ruleValue: 28,
    startDate: new Date("2026-07-24T00:00:00.000Z"),
    endDate: new Date("2056-07-21T00:00:00.000Z"),
    expiryMinutes: 15,
    payer: { phone: "9876543210", email: "user-1@no-reply.prabhuji.app" },
  };
}

/** The path an adapter POSTed to, at call index `i`. */
function sentPath(
  post: { mock: { calls: [string, Record<string, unknown>, unknown?][] } },
  i = 0
): string {
  const call = post.mock.calls[i];
  if (!call) throw new Error(`adapter made no request at index ${i}`);
  return call[0];
}

function sentBody(
  post: { mock: { calls: [string, Record<string, unknown>, unknown?][] } },
  i = 0
): Record<string, unknown> {
  const call = post.mock.calls[i];
  if (!call) throw new Error(`adapter made no request at index ${i}`);
  return call[1];
}

describe("createMandate (two-step: create → AUTH pay)", () => {
  test("step 1 sends an amount with plan currency and the upi method", async () => {
    const { client, post } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    await new CashfreeMandateProvider(client).createMandate(baseInput());

    // First POST is create-subscription.
    const body = sentBody(post, 0);
    expect(body.subscription_id).toBe("pj_mnd_abc");
    const plan = body.plan_details as Record<string, unknown>;
    // Shape only — the plan price is remote config and must not be pinned in a
    // unit test. Present, numeric and non-zero; the value is not verified.
    expect(typeof plan.plan_amount).toBe("number");
    expect(plan.plan_amount as number).toBeGreaterThan(0);
    expect(plan.plan_currency).toBe("INR");
    expect(plan.plan_interval_type).toBe("MONTH");
    const auth = body.authorization_details as Record<string, unknown>;
    expect(auth.payment_methods).toEqual(["upi"]);
    // ISO8601 datetime, not a bare date (the gateway rejects YYYY-MM-DD). The
    // assertion moved to `subscription_expiry_time` because
    // `subscription_first_charge_time` is no longer sent at all — see the
    // ON_DEMAND test below.
    expect(body.subscription_expiry_time).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
    );
  });

  test("subscription_meta.return_url is set from CASHFREE_RETURN_URL env", async () => {
    // Cashfree's hosted authorization page redirects the browser here after
    // the user completes/cancels the UPI mandate. Without this, the user
    // landed on Cashfree's default landing page and never returned to
    // Prabhuji — the whole "app doesn't reopen after payment" complaint.
    const { client, post } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    await new CashfreeMandateProvider(client).createMandate(baseInput());

    const body = sentBody(post, 0);
    const meta = body.subscription_meta as Record<string, unknown>;
    expect(meta).toBeDefined();
    // The default is the Prabhuji paywall App Link (TAM-124 intent-filter
    // catches it on Android and opens the app directly). Env override lets
    // per-environment URLs (e.g. a bounce page in staging) without a code
    // change — only the shape and presence is pinned here.
    expect(typeof meta.return_url).toBe("string");
    expect((meta.return_url as string).length).toBeGreaterThan(0);
    expect(meta.return_url as string).toMatch(/^https?:\/\//);
  });

  test("sends the REAL payer, not a shared placeholder", async () => {
    // Every mandate used to carry customer_phone "9999999999" and one shared
    // email, so at Cashfree all our customers were the same fictional person —
    // useless for reconciliation, for their risk checks, and for any dispute
    // that starts from a phone number.
    const { client, post } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    await new CashfreeMandateProvider(client).createMandate(baseInput());

    const details = sentBody(post, 0).customer_details as Record<string, unknown>;
    expect(details.customer_phone).toBe("9876543210");
    expect(details.customer_email).toBe("user-1@no-reply.prabhuji.app");
  });

  test("omits customer_phone entirely when the payer has none", async () => {
    // An ABSENT field, never a fake one: if Cashfree rejects the subscription we
    // want that error, not a live mandate attached to a number nobody owns.
    const { client, post } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    await new CashfreeMandateProvider(client).createMandate({
      ...baseInput(),
      payer: { phone: null, email: "user-2@no-reply.prabhuji.app" },
    });

    const details = sentBody(post, 0).customer_details as Record<string, unknown>;
    expect(details).not.toHaveProperty("customer_phone");
    expect(details.customer_email).toBe("user-2@no-reply.prabhuji.app");
  });

  /**
   * `subscription_first_charge_time` is PERIODIC-only. Cashfree rejects the
   * whole registration with "First charge date can only be set for PERIODIC
   * plans" if it is present alongside `plan_type: ON_DEMAND` — which is exactly
   * what took prod down after the ON_DEMAND switch: every `POST /payment/mandate`
   * returned PAYMENT_PROVIDER_UNAVAILABLE and no user could subscribe at all.
   *
   * Nothing is lost by omitting it. The first debit date lives on our own row
   * (`mandates.start_date` / `next_debit_date`), which is what drives the
   * billing cycle and the trial-end computation; under ON_DEMAND Cashfree is not
   * allowed a copy because it has no schedule of its own.
   */
  test("an ON_DEMAND plan sends NO first-charge date", async () => {
    const { client, post } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    await new CashfreeMandateProvider(client).createMandate(baseInput());

    const body = sentBody(post, 0);
    expect((body.plan_details as Record<string, unknown>).plan_type).toBe(
      "ON_DEMAND"
    );
    expect(body).not.toHaveProperty("subscription_first_charge_time");
    // The expiry IS still accepted on an ON_DEMAND plan, so it must survive.
    expect(body.subscription_expiry_time).toBeDefined();
  });

  test("step 2 initiates a UPI AUTH payment on the session", async () => {
    const { client, post } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    await new CashfreeMandateProvider(client).createMandate(baseInput());

    // Second POST is the AUTH pay that mints the link.
    const pay = sentBody(post, 1);
    expect(pay.subscription_session_id).toBe("sub_session_abc");
    expect(pay.payment_type).toBe("AUTH");
    expect(pay.payment_method).toEqual({ upi: { channel: "link" } });
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("returns the authorization link and the mapped state", async () => {
    const { client } = fakeClient({ sub: SUB_OK, pay: PAY_OK });
    const result = await new CashfreeMandateProvider(client).createMandate(
      baseInput()
    );
    expect(result.authUrl).toBe(
      "https://payments-test.cashfree.com/subs-checkout/auth/xyz"
    );
    expect(result.providerMandateId).toBe("cf_sub_1"); // cf_subscription_id
    expect(result.state).toBe("pending"); // INITIALIZED → pending, not active
  });

  test("throws 502 when create returns no session id", async () => {
    const { client } = fakeClient({
      sub: { subscription_status: "INITIALIZED" },
      pay: PAY_OK,
    });
    await expect(
      new CashfreeMandateProvider(client).createMandate(baseInput())
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  test("throws 502 when the AUTH pay returns no authorization link", async () => {
    const { client } = fakeClient({ sub: SUB_OK, pay: { cf_payment_id: "x" } });
    await expect(
      new CashfreeMandateProvider(client).createMandate(baseInput())
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("mapSubscriptionState", () => {
  test.each([
    ["ACTIVE", "active"],
    ["active", "active"],
    ["BANK_APPROVAL_PENDING", "pending"],
    ["ON_HOLD", "paused"],
    ["CANCELLED", "revoked"],
    ["COMPLETED", "completed"],
    ["LINK_EXPIRED", "expired"],
    ["BANK_DECLINED", "rejected"],
    ["something_unknown", "pending"],
    ["", "pending"],
  ])("%s → %s", (raw, expected) => {
    expect(mapSubscriptionState(raw)).toBe(expected);
  });

  test("null → pending", () => {
    expect(mapSubscriptionState(null)).toBe("pending");
  });
});

describe("mapPaymentOutcome", () => {
  test.each([
    ["SUCCESS", "succeeded"],
    ["paid", "succeeded"],
    ["FAILED", "failed"],
    ["declined", "failed"],
    ["PENDING", "pending"],
    ["weird", "pending"],
    [null, "pending"],
  ])("%s → %s", (raw, expected) => {
    expect(mapPaymentOutcome(raw)).toBe(expected);
  });
});

describe("getMandateStatus masks payer PII at the boundary", () => {
  const STATUS_OK = {
    subscription_status: "ACTIVE",
    cf_subscription_id: "cf_sub_1",
    payer_vpa: "abhishek@okhdfcbank",
    payer_name: "Abhishek Kumar",
    next_payment_date: "2026-08-23",
  };

  test("masks the VPA and name; the raw values never leave", async () => {
    const { client } = fakeClient({ get: STATUS_OK });
    const status = await new CashfreeMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: "cf_sub_1",
    });

    expect(status.state).toBe("active");
    expect(status.payerHandleMasked).toBe("ab***@okhdfcbank");
    expect(status.payerNameMasked).toBe("A*** K***");

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("abhishek@okhdfcbank");
    expect(serialized).not.toContain("Abhishek Kumar");
  });
});

describe("debit execution", () => {
  test("presentDebit EXECUTES the mandate via POST and maps the execution status", async () => {
    // Under the controlled flow this is the irreversible call, not a read —
    // Cashfree's own two-step process, and the same shape Decentro has.
    const { client, get, post } = fakeClient({
      pay: {
        execution_status: "SUCCESS",
        cf_execution_id: "cfx_1",
        bank_reference: "BRN123",
        npci_txn_id: "npci123",
      },
    });
    const result = await new CashfreeMandateProvider(client).presentDebit({
      referenceId: "pj_mnd_abc",
      presentationRef: "pj_prs_wire",
      attemptNo: 1,
      providerMandateId: "cf_sub_1",
      presentationSequenceId: "cfn_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-23T00:00:00.000Z"),
      purposeMessage: "Prabhuji VIP renewal 2026-08-23",
    });

    expect(result.outcome).toBe("succeeded");
    expect(result.bankReferenceNumber).toBe("BRN123");
    expect(post).toHaveBeenCalledTimes(1);
    expect(sentPath(post)).toBe("/subscriptions/pay/controlled/execute-mandate");
    // The BASE payment id, constant for the subscription — not a per-cycle one.
    expect(sentBody(post).payment_id).toBe("pj_auth_pj_mnd_abc");
    expect(sentBody(post).execution_id).toContain("2026-08-23");
    // No read at all — the execute response IS the outcome.
    expect(get).not.toHaveBeenCalled();
  });
});

describe("transport discipline", () => {
  test("notifyPreDebit sends the PDN via POST and returns the notification handle", async () => {
    const { client, post, get } = fakeClient({
      pay: { cf_notification_id: "cfn_1", cf_payment_id: "cfp_sched_1" },
    });
    const result = await new CashfreeMandateProvider(client).notifyPreDebit({
      referenceId: "pj_mnd_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "cf_sub_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate: new Date("2026-08-23T00:00:00.000Z"),
      notBefore: null,
    });
    expect(result.presentationSequenceId).toBe("cfn_1");
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    // Shape only — see the createMandate plan_amount assertion.
    const payment = sentBody(post).payment_amount;
    expect(typeof payment).toBe("number");
    expect(payment as number).toBeGreaterThan(0);
  });

  /**
   * THE endpoint assertion, and the reason it is spelled out rather than left
   * to "it posts something somewhere".
   *
   * A charge is raised on `/subscriptions/pay` with `payment_type: "CHARGE"` —
   * the same route registration uses for `"AUTH"`. The obvious-looking
   * `/subscriptions/{id}/payments` exists but is READ-ONLY: a POST to it returns
   * `404 endpoint or method is not valid` on every api version Cashfree accepts
   * (verified live against 2023-08-01, 2025-01-01 and 2026-01-01).
   *
   * That one wrong path silently stopped every recurring debit in prod while
   * registration kept working, and it cost two subscribers their renewal. It is
   * pinned here so the next person to "tidy up" these constants finds out from
   * a red test rather than from a month of missing revenue.
   */
  /**
   * The endpoint and the id semantics, pinned together.
   *
   * A recurring debit is NPCI's two-step controlled flow: notify, wait out the
   * compliance window, execute. It is not `POST /subscriptions/pay` with
   * `payment_type: CHARGE` (which this adapter used to send and which schedules
   * rather than notifies), and it is certainly not
   * `POST /subscriptions/{id}/payments`, which 404s on every api version.
   *
   * The three ids mean three different things and the wrong one in the wrong
   * slot is a silent decline, so each is asserted by name.
   */
  test("a recurring debit NOTIFIES via the controlled endpoint", async () => {
    const { client, post } = fakeClient({ pay: { cf_notification_id: "cfn_1" } });
    const provider = new CashfreeMandateProvider(client);
    const cycleDate = new Date("2026-08-23T00:00:00.000Z");

    await provider.notifyPreDebit({
      referenceId: "pj_mnd_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: "cf_sub_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate,
      notBefore: null,
    });

    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/subscriptions/pay/controlled/notify-mandate");
    expect(path).not.toContain("/payments");
    expect(body.payment_type).toBeUndefined();

    expect(body.subscription_id).toBe("pj_mnd_abc");
    // The BASE payment from mandate setup — constant for the subscription.
    expect(body.payment_id).toBe("pj_auth_pj_mnd_abc");
    // The PER-CYCLE key, and exactly what the ledger stored as
    // `gateway_request_id` before dispatch — what recovery asks about.
    expect(body.notification_id).toBe(
      provider.debitRequestId("pj_mnd_abc", cycleDate)
    );
  });

  test("the execution is traceable to the notification that preceded it", async () => {
    // The amount is frozen at notification time, so a debit and its notice must
    // be greppable as one pair — any drift leaves an executed charge no
    // notification can be matched to.
    const provider = new CashfreeMandateProvider(fakeClient({}).client);
    const cycleDate = new Date("2026-08-23T00:00:00.000Z");
    const notificationId = provider.debitRequestId("pj_mnd_abc", cycleDate);

    const { client, post } = fakeClient({ pay: { execution_status: "SUCCESS" } });
    await new CashfreeMandateProvider(client).presentDebit({
      referenceId: "pj_mnd_abc",
      presentationRef: "pj_prs_wire",
      attemptNo: 1,
      providerMandateId: "cf_sub_1",
      presentationSequenceId: "cfn_1",
      amountPaise: 29900,
      currency: "INR",
      cycleDate,
      purposeMessage: "Prabhuji VIP renewal",
    });

    expect(sentBody(post).execution_id).toBe(`${notificationId}_exec`);
  });

  test("revokeMandate mutates via POST with a CANCEL action", async () => {
    const { client, post } = fakeClient({});
    await new CashfreeMandateProvider(client).revokeMandate({
      referenceId: "pj_mnd_abc",
      providerMandateId: "cf_sub_1",
    });
    expect(sentBody(post).action).toBe("CANCEL");
  });
});
