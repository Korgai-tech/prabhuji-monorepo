import { describe, expect, test, vi } from "vitest";
import {
  DuplicateReferenceError,
  NoSuchDebitError,
} from "@api/core/payment/mandate.provider.js";
import { RazorpayApiError, type RazorpayClient } from "../razorpay.client.js";
import {
  composeMandateRef,
  mapDebitOutcome,
  mapPdnStatus,
  mapTokenState,
  parseMandateRef,
  RazorpayMandateProvider,
  readTokenVpa,
} from "../razorpay-mandate.repository.js";
import {
  RAZORPAY_APPLICATION_ID,
  RAZORPAY_MAX_RECEIPT_CHARS,
  RAZORPAY_NOTE_KEY,
} from "../razorpay.constants.js";

/**
 * The Razorpay adapter's translation, asserted field by field — the same
 * money-critical properties the Cashfree and Decentro adapter tests pin, plus
 * the four that are specific to this gateway and each of which has a concrete
 * failure mode behind it:
 *
 *   - PAISE, with no rupee conversion anywhere (the other two adapters divide by
 *     100; doing that here would charge a hundredth of every plan);
 *   - a `receipt` inside Razorpay's 40-character ASCII cap AND deterministic,
 *     because it is this gateway's only idempotency surface;
 *   - `PUT …/cancel`, never `DELETE …/tokens/:id`, which Razorpay's own docs say
 *     leaves the NPCI mandate live;
 *   - `created` → `pending`, because HDFC/Axis settle from a batch file and a
 *     healthy debit sits in `created` for hours.
 */

const CUSTOMER_OK = { id: "cust_ABC123", entity: "customer" };
const ORDER_OK = { id: "order_XYZ789", entity: "order", status: "created" };
/**
 * The PUBLISHABLE key. Deliberately distinct from the `rzp_live_supersecret…`
 * the PII suite plants in every response body, so "the checkout carries a key"
 * and "the checkout leaks the secret" cannot both be satisfied by one string.
 */
const KEY_ID = "rzp_test_PUBLISHABLE1";

/**
 * Records what the adapter sent, and replays canned responses routed by path.
 * `put` exists because Razorpay's cancel is a PUT and nothing else.
 */
function fakeClient(
  opts: {
    customer?: Record<string, unknown>;
    order?: Record<string, unknown>;
    recurringPayment?: Record<string, unknown>;
    token?: Record<string, unknown>;
    orderStatus?: Record<string, unknown>;
    orderPayments?: Record<string, unknown>;
    customerFetch?: Record<string, unknown>;
  } = {}
) {
  const post = vi.fn<
    (
      path: string,
      body: Record<string, unknown>,
      ctx?: unknown
    ) => Promise<Record<string, unknown>>
  >((path) => {
    // No `/payments/create/upi` branch, deliberately: registration must never
    // reach it (see "NEVER calls the S2S create-payment endpoint"), and a fake
    // that answers it would let a reintroduced call pass unnoticed here.
    if (path === "/payments/create/recurring") {
      return Promise.resolve(opts.recurringPayment ?? {});
    }
    if (path === "/customers") return Promise.resolve(opts.customer ?? CUSTOMER_OK);
    return Promise.resolve(opts.order ?? ORDER_OK);
  });

  const get = vi.fn<
    (
      path: string,
      query?: Record<string, string>,
      ctx?: unknown
    ) => Promise<Record<string, unknown>>
  >((path) => {
    if (path.includes("/tokens/")) return Promise.resolve(opts.token ?? {});
    if (path.endsWith("/payments")) {
      return Promise.resolve(opts.orderPayments ?? { items: [] });
    }
    if (path.startsWith("/orders/")) {
      return Promise.resolve(opts.orderStatus ?? ORDER_OK);
    }
    return Promise.resolve(opts.customerFetch ?? {});
  });

  const put = vi.fn<
    (
      path: string,
      body: Record<string, unknown>,
      ctx?: unknown
    ) => Promise<Record<string, unknown>>
  >(() => Promise.resolve({}));

  const client = { post, get, put, keyId: KEY_ID } as unknown as RazorpayClient;
  return { client, post, get, put };
}

function baseInput() {
  return {
    referenceId: "pj_mnd_abc",
    type: "upi" as const,
    mandateName: "Prabhuji VIP Membership",
    purposeMessage: "Prabhuji VIP Membership — renewal",
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

/** Loose enough to accept the get/post/put spies, whose arities differ. */
type CallSpy = { mock: { calls: readonly (readonly unknown[])[] } };

function sentPath(spy: CallSpy, i = 0): string {
  const call = spy.mock.calls[i];
  if (!call) throw new Error(`adapter made no request at index ${i}`);
  return call[0] as string;
}

function sentBody(spy: CallSpy, i = 0): Record<string, unknown> {
  const call = spy.mock.calls[i];
  if (!call) throw new Error(`adapter made no request at index ${i}`);
  return call[1] as Record<string, unknown>;
}

const MANDATE_REF = composeMandateRef("cust_ABC123", "token_TOK1");

/**
 * A result minus `raw` — the ONE documented passthrough (see
 * `PreDebitResult.raw`): the service persists it for forensics and redacts it on
 * the way. Everything else an adapter returns must already be clean.
 */
function withoutRaw(result: unknown): unknown {
  if (result === null || typeof result !== "object") return result;
  const copy: Record<string, unknown> = { ...(result as Record<string, unknown>) };
  delete copy.raw;
  return copy;
}

describe("createMandate (two calls: customer → order; the SDK raises the payment)", () => {
  test("issues exactly two POSTs, in order, to the documented paths", async () => {
    const { client, post, get } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());

    expect(post).toHaveBeenCalledTimes(2);
    expect(sentPath(post, 0)).toBe("/customers");
    expect(sentPath(post, 1)).toBe("/orders");
    // Registration is all mutation; nothing is read.
    expect(get).not.toHaveBeenCalled();
  });

  test("the registration order's notes carry our reference and the application tag", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());
    // No cycle yet, so no cycle date — exactly these two and nothing else.
    expect(sentBody(post, 1).notes).toEqual({
      [RAZORPAY_NOTE_KEY.referenceId]: "pj_mnd_abc",
      [RAZORPAY_NOTE_KEY.applicationId]: RAZORPAY_APPLICATION_ID,
    });
  });

  test("the customer carries the application tag, and NOT a reference", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());

    // Four applications share this Razorpay account, so an untagged entity is
    // unattributable in the dashboard — the whole reason for the tag.
    expect(sentBody(post, 0).notes).toEqual({
      [RAZORPAY_NOTE_KEY.applicationId]: RAZORPAY_APPLICATION_ID,
    });
    // Deliberately absent. `fail_existing: "0"` means the same payer's LATER
    // registrations reuse this customer, so a reference stamped here would name
    // one the customer outlives.
    expect(sentBody(post, 0).notes).not.toHaveProperty(RAZORPAY_NOTE_KEY.referenceId);
  });

  /**
   * THE regression this flow exists for.
   *
   * `POST /payments/create/upi` is S2S-gated per merchant account. On an account
   * without it enabled Razorpay answers 400 `"The requested URL was not found on
   * the server."` — AFTER the customer and the order have been created — so
   * every registration died at the last step and surfaced as
   * `PAYMENT_PROVIDER_UNAVAILABLE` with a live order abandoned behind it.
   *
   * Razorpay Checkout raises that payment on the device under the publishable
   * key, needing no S2S access. Re-adding a server-side create would both
   * reintroduce the outage and race the SDK for the same authorization, so the
   * absence of the call is pinned rather than merely documented.
   */
  test("NEVER calls the S2S create-payment endpoint", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());

    const paths = post.mock.calls.map((c) => c[0]);
    expect(paths).not.toContain("/payments/create/upi");
    expect(paths.some((p) => p.startsWith("/payments/"))).toBe(false);
  });

  /**
   * THE fix for "Customer already exists for the merchant".
   *
   * Razorpay dedupes customers on the contact and refuses a second for the same
   * person, so a returning payer could never register again: the attempt died at
   * the FIRST call, before an order existed. The handle is stored on the user,
   * and holding it means the call is simply not made.
   */
  test("skips the customer create entirely when the payer's handle is known", async () => {
    const { client, post } = fakeClient();
    const result = await new RazorpayMandateProvider(client).createMandate({
      ...baseInput(),
      providerCustomerId: "cust_KNOWN1",
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(sentPath(post, 0)).toBe("/orders");
    expect(sentBody(post, 0).customer_id).toBe("cust_KNOWN1");
    // And it is handed back so the service keeps storing the same one.
    expect(result.providerCustomerId).toBe("cust_KNOWN1");
    expect(result.razorpay?.customerId).toBe("cust_KNOWN1");
  });

  /**
   * The recovery path for everyone stranded by the registrations that died at
   * the old `/payments/create/upi` call: Razorpay HAS their customer, we never
   * recorded it, and there is no lookup-by-phone endpoint to find it with.
   * `fail_existing: "0"` makes the create return the existing one instead of a
   * 400.
   */
  test("asks Razorpay to return an existing customer rather than refusing", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());

    const body = sentBody(post, 0);
    expect(body.fail_existing).toBe("0");
    // A string, not a boolean — Razorpay takes "0"/"1" here.
    expect(typeof body.fail_existing).toBe("string");
  });

  test("a freshly created customer is returned for storing", async () => {
    const { client } = fakeClient();
    const result = await new RazorpayMandateProvider(client).createMandate(
      baseInput()
    );
    expect(result.providerCustomerId).toBe("cust_ABC123");
  });

  test("the customer carries a name and a BARE 10-digit contact", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());

    const body = sentBody(post, 0);
    // Name is mandatory at Razorpay and `PayerContact` has none, so it is
    // derived from the email rather than invented.
    expect(typeof body.name).toBe("string");
    expect((body.name as string).length).toBeGreaterThan(0);
    expect(body.email).toBe("user-1@no-reply.prabhuji.app");
    // No `+91` — Razorpay rejects a country-code prefix.
    expect(body.contact).toBe("9876543210");
  });

  test("omits contact entirely when the payer has no phone", async () => {
    // An ABSENT field, never a fake one: if Razorpay objects we want that error,
    // not a mandate attached to a number nobody owns.
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate({
      ...baseInput(),
      payer: { phone: null, email: "user-2@no-reply.prabhuji.app" },
    });
    expect(sentBody(post, 0)).not.toHaveProperty("contact");
  });

  /**
   * THE assertion this adapter exists to protect. Decentro and Cashfree take
   * rupee floats and both adapters divide by 100; Razorpay takes paise in every
   * field, in both directions. A `toRupees` smuggled in here would charge every
   * customer one hundredth of their plan and nothing would visibly break.
   */
  test("every amount is PAISE — no rupee conversion anywhere", async () => {
    const { client, post } = fakeClient();
    const input = baseInput();
    await new RazorpayMandateProvider(client).createMandate(input);

    const order = sentBody(post, 1);
    // The order amount is the AUTHORIZATION debit (the deposit), not the plan
    // price — charging `amountPaise` here would take the full price on day zero
    // and defeat the trial.
    expect(order.amount).toBe(input.initialDepositPaise);
    expect(order.currency).toBe("INR");
    const token = order.token as Record<string, unknown>;
    // …while max_amount is the CEILING the mandate may never exceed.
    expect(token.max_amount).toBe(input.amountPaise);
  });

  test("token.frequency is as_presented, with no recurring_value/type", async () => {
    // MERCHANT-DRIVEN billing. Any other frequency hands the schedule to
    // Razorpay while BillingCycleService is also billing — two schedulers
    // charging the same cycle, the same trap `plan_type: PERIODIC` is on
    // Cashfree.
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate(baseInput());

    const token = sentBody(post, 1).token as Record<string, unknown>;
    expect(token.frequency).toBe("as_presented");
    expect(token).not.toHaveProperty("recurring_value");
    expect(token).not.toHaveProperty("recurring_type");
    // expire_at is UNIX SECONDS, not an ISO string and not milliseconds.
    expect(token.expire_at).toBe(
      Math.floor(baseInput().endDate.getTime() / 1000)
    );
  });

  test("the razorpay block carries recurring as the STRING '1'", async () => {
    // `recurring` is a STRING in the checkout options and a real BOOLEAN on
    // /payments/create/recurring. That is Razorpay's inconsistency and it is
    // pinned in both places so neither gets "tidied" — and it is sent rather
    // than left for the app to hardcode, so the quirk stays server-side.
    const { client } = fakeClient();
    const result = await new RazorpayMandateProvider(client).createMandate(
      baseInput()
    );

    expect(result.razorpay?.recurring).toBe("1");
    expect(typeof result.razorpay?.recurring).toBe("string");
  });

  test("the registration receipt fits Razorpay's 40-char ASCII cap", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate({
      ...baseInput(),
      referenceId: `pj_mnd_${"x".repeat(200)}`,
    });

    const receipt = sentBody(post, 1).receipt as string;
    expect(receipt.length).toBeLessThanOrEqual(RAZORPAY_MAX_RECEIPT_CHARS);
    expect(receipt).toMatch(/^[\x20-\x7e]+$/);
  });

  test("description is sanitised and capped at 50 characters", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).createMandate({
      ...baseInput(),
      purposeMessage: "Prabhuji VIP — ₹299/mo (auto) *** renewal for a devotee",
    });

    const description = sentBody(post, 1).description as string;
    expect(description.length).toBeLessThanOrEqual(50);
    expect(description).toMatch(/^[A-Za-z0-9 ]+$/);
  });

  test("returns SDK checkout handles instead of a link, and PERSISTS the customer id", async () => {
    const { client } = fakeClient();
    const result = await new RazorpayMandateProvider(client).createMandate(
      baseInput()
    );

    // No link: the `upi://` intent is minted by Razorpay Checkout on the device,
    // so none exists server-side to return.
    expect(result.authUrl).toBeNull();
    expect(result.razorpay).toEqual({
      keyId: KEY_ID,
      orderId: "order_XYZ789",
      customerId: "cust_ABC123",
      recurring: "1",
    });
    // NULL — the token is what identifies a Razorpay mandate and it does not
    // exist until the payer approves. Claiming the `@unique` column with a
    // customer-derived value is what collided on the user's SECOND attempt; the
    // per-attempt handle is the order, carried in the checkout block above and
    // read back by `getMandateStatus`.
    expect(result.providerMandateId).toBeNull();
    // No payment exists yet — the SDK raises it, and its id arrives off the
    // token poll. An order id here would mislabel the ledger's
    // `gateway_payment_id`, which is what a refund is chased with.
    expect(result.providerTxnId).toBeNull();
    expect(result.state).toBe("pending");
  });

  test("refuses a deposit below Razorpay's ₹1 order minimum", async () => {
    const { client, post } = fakeClient();
    await expect(
      new RazorpayMandateProvider(client).createMandate({
        ...baseInput(),
        initialDepositPaise: 0,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
    // And it fails BEFORE creating anything at the gateway.
    expect(post).not.toHaveBeenCalled();
  });

  test("throws 502 when the order create returns no id", async () => {
    // Without an order id the checkout has nothing to authorize against, and a
    // checkout object missing it would open a sheet that can only fail with no
    // way for the user to tell why.
    const { client } = fakeClient({ order: { entity: "order" } });
    await expect(
      new RazorpayMandateProvider(client).createMandate(baseInput())
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  test("throws 502 when the customer create returns no id", async () => {
    const { client } = fakeClient({ customer: { entity: "customer" } });
    await expect(
      new RazorpayMandateProvider(client).createMandate(baseInput())
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("debitRequestId — the receipt, and this gateway's only idempotency key", () => {
  const provider = new RazorpayMandateProvider(fakeClient().client);
  const cycleDate = new Date("2026-08-23T00:00:00.000Z");

  test("is DETERMINISTIC — the same inputs always give the same key", () => {
    // This is what makes "did my call land?" answerable after a timeout. Any
    // non-determinism (a timestamp, a random suffix) makes every timed-out
    // notification permanently unrecoverable.
    expect(provider.debitRequestId("pj_mnd_abc", cycleDate)).toBe(
      provider.debitRequestId("pj_mnd_abc", cycleDate)
    );
    expect(
      new RazorpayMandateProvider(fakeClient().client).debitRequestId(
        "pj_mnd_abc",
        cycleDate
      )
    ).toBe(provider.debitRequestId("pj_mnd_abc", cycleDate));
  });

  test.each([
    ["pj_mnd_abc"],
    ["pj_mnd_" + "0".repeat(64)],
    // The template the other adapters use is ~45 chars and does NOT fit; a long
    // reference must not be able to push us over the cap.
    ["pj_pay_pj_mnd_0c9c1c72-4b1f-4f9a-9a5f-2f4b0a3c9d11"],
    ["x".repeat(500)],
  ])("stays within 40 ASCII characters for %s", (referenceId) => {
    const receipt = provider.debitRequestId(referenceId, cycleDate);
    expect(receipt.length).toBeLessThanOrEqual(RAZORPAY_MAX_RECEIPT_CHARS);
    expect(receipt).toMatch(/^[\x20-\x7e]+$/);
  });

  test("distinguishes references and cycles", () => {
    expect(provider.debitRequestId("pj_mnd_abc", cycleDate)).not.toBe(
      provider.debitRequestId("pj_mnd_def", cycleDate)
    );
    expect(provider.debitRequestId("pj_mnd_abc", cycleDate)).not.toBe(
      provider.debitRequestId("pj_mnd_abc", new Date("2026-09-23T00:00:00.000Z"))
    );
  });

  test("keeps the cycle date readable for a human on the dashboard", () => {
    expect(provider.debitRequestId("pj_mnd_abc", cycleDate)).toContain("20260823");
  });
});

describe("mapTokenState", () => {
  test.each([
    ["initiated", "pending"],
    ["confirmed", "active"],
    ["rejected", "rejected"],
    ["paused", "paused"],
    ["cancelled", "revoked"],
    ["expired", "expired"],
    ["CONFIRMED", "active"],
    ["something_new", "pending"],
    ["", "pending"],
  ])("%s → %s", (raw, expected) => {
    expect(mapTokenState(raw)).toBe(expected);
  });

  /**
   * NOT terminal, and Razorpay says so explicitly: a cancellation request is in
   * flight with NPCI and may still fail. Mapping it to `revoked` would strip a
   * paying user's entitlement — and stop us presenting a debit they still owe —
   * on the strength of a cancellation that never completed.
   */
  test("cancellation_initiated is still ACTIVE, not revoked", () => {
    expect(mapTokenState("cancellation_initiated")).toBe("active");
  });

  test("an unknown status is PENDING, never active", () => {
    // Entitlement is granted off this value. Guessing optimistically on a status
    // we do not understand gives away paid content unrecoverably; pending costs
    // one poll.
    for (const raw of ["confirmed_v2", "authorised", "ok", "live", "approved"]) {
      expect(mapTokenState(raw)).toBe("pending");
    }
    expect(mapTokenState(null)).toBe("pending");
  });
});

describe("mapDebitOutcome", () => {
  test.each([
    ["captured", "succeeded"],
    ["authorized", "succeeded"],
    ["failed", "failed"],
    ["CAPTURED", "succeeded"],
    ["weird", "pending"],
    [null, "pending"],
  ])("%s → %s", (raw, expected) => {
    expect(mapDebitOutcome(raw)).toBe(expected);
  });

  /**
   * THE one that costs money if it is wrong. HDFC and Axis settle UPI Autopay
   * from a batch file, so a perfectly healthy debit sits in `created` for hours.
   * Reading it as a failure duns a paying user AND frees the cycle to be charged
   * a second time.
   */
  test("created is PENDING, not failed", () => {
    expect(mapDebitOutcome("created")).toBe("pending");
  });

  test("an unknown status is PENDING — never succeeded, never failed", () => {
    // succeeded grants an unpaid month; failed duns a user who actually paid.
    expect(mapDebitOutcome("settled")).toBe("pending");
  });
});

describe("mapPdnStatus", () => {
  test.each([
    ["delivered", "accepted"],
    ["pending", "sent"],
    ["failed", "failed"],
    ["cancelled", "rejected"],
  ])("%s → %s", (raw, expected) => {
    expect(mapPdnStatus(raw, "order_1")).toBe(expected);
  });

  test("absent, but with an order in hand, is accepted — the order IS the notice", () => {
    expect(mapPdnStatus(null, "order_1")).toBe("accepted");
    expect(mapPdnStatus(null, null)).toBe("sent");
  });

  test("an unknown status is non-terminal", () => {
    // A re-arm on this gateway means minting a whole new order, so an
    // unrecognised token must not burn the cycle.
    expect(mapPdnStatus("in_transit", "order_1")).toBe("sent");
  });
});

describe("the composite provider mandate id", () => {
  /**
   * THE unique-index collision. `mandates.provider_mandate_id` is `@unique`, and
   * the customer id is deliberately STABLE per user (`User.razorpayCustomerId` +
   * `fail_existing: "0"`) — so a composite built from the customer alone is the
   * SAME string for every registration that user ever starts.
   *
   * Registration used to return exactly that. The first abandoned attempt took
   * the key and never released it (nothing nulls the column: `setState` writes
   * only state, `applyStatus` skips nulls), so the user's next attempt collided
   * and 500'd — permanently, with no self-heal. Two taps on Pay, the second
   * after the approval window lapsed, was all it took.
   */
  test("registration claims no unique id, so a user's attempts cannot collide", async () => {
    const { client } = fakeClient();
    const provider = new RazorpayMandateProvider(client);

    const first = await provider.createMandate(baseInput());
    const second = await provider.createMandate(baseInput());

    // Null, not `cust_ABC123:`. Postgres unique indexes do not constrain NULLs,
    // so N unapproved rows per user coexist.
    expect(first.providerMandateId).toBeNull();
    expect(second.providerMandateId).toBeNull();

    // The customer is still returned — it is stored on the USER, where a handle
    // that describes a person belongs, and it is what lets the next attempt skip
    // the create.
    expect(second.providerCustomerId).toBe("cust_ABC123");
    // And the per-ATTEMPT handle is the order, which the checkout block carries.
    expect(second.razorpay?.orderId).toBe("order_XYZ789");
  });

  test("round-trips", () => {
    expect(parseMandateRef(composeMandateRef("cust_1", "token_1"))).toEqual({
      customerId: "cust_1",
      tokenId: "token_1",
    });
  });

  test("accepts a bare token id (nothing written before the composite breaks)", () => {
    expect(parseMandateRef("token_1")).toEqual({
      customerId: null,
      tokenId: "token_1",
    });
    expect(parseMandateRef(null)).toEqual({ customerId: null, tokenId: null });
  });

  test("presentDebit refuses to guess a missing customer id", async () => {
    const { client, post } = fakeClient();
    await expect(
      new RazorpayMandateProvider(client).presentDebit({
        referenceId: "pj_mnd_abc",
        presentationRef: "pj_prs_wire",
        attemptNo: 1,
        providerMandateId: "token_TOK1",
        presentationSequenceId: "order_XYZ789",
        amountPaise: 29900,
        currency: "INR",
        cycleDate: new Date("2026-08-23T00:00:00.000Z"),
        purposeMessage: "Prabhuji VIP renewal",
      })
    ).rejects.toMatchObject({ statusCode: 502 });
    // And no money-moving call was attempted.
    expect(post).not.toHaveBeenCalled();
  });
});

describe("getMandateStatus", () => {
  /** On a TOKEN entity `vpa` is an OBJECT. On a PAYMENT entity it is a string. */
  const TOKEN_OK = {
    id: "token_TOK1",
    vpa: { username: "abhishek", handle: "okhdfcbank", name: "Abhishek Kumar" },
    recurring_details: { status: "confirmed" },
  };

  test("masks the VPA and the payer name; the raw values never leave", async () => {
    const { client, get } = fakeClient({ token: TOKEN_OK });
    const status = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
    });

    expect(status.state).toBe("active");
    expect(status.payerHandleMasked).toBe("ab***@okhdfcbank");
    expect(status.payerNameMasked).toBe("A*** K***");
    // And the composite round-trips, so the next call still has both halves.
    expect(status.providerMandateId).toBe(MANDATE_REF);

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("abhishek@okhdfcbank");
    expect(serialized).not.toContain("Abhishek Kumar");

    // A READ, on the retrying transport, addressed under the customer.
    expect(sentPath(get)).toBe("/customers/cust_ABC123/tokens/token_TOK1");
  });

  test("handles the FLAT string vpa a payment entity carries", () => {
    expect(readTokenVpa({ vpa: "abhishek@okhdfcbank" })).toEqual({
      vpa: "abhishek@okhdfcbank",
      name: null,
    });
    expect(readTokenVpa({})).toEqual({ vpa: null, name: null });
  });

  /**
   * THE REGRESSION. A Razorpay token entity carries no `payment_id`, so this
   * used to answer `providerTxnId: null` — and null is what the deposit settle
   * writes as `gateway_payment_id`, which the ledger's
   * `transactions_settled_has_gateway_id` CHECK rejects on a `succeeded` row.
   * The settle threw, the callback rolled back, and the subscription write
   * behind it never ran: a live mandate `active` against a `pending`
   * subscription, money taken and no Pro, on every single registration.
   */
  test("reads the authorization payment id off the registration order", async () => {
    const { client, get } = fakeClient({
      token: TOKEN_OK,
      orderPayments: {
        items: [
          // A failed attempt FIRST — the settled one is the answer regardless
          // of position, or an order with a retry reports the wrong payment.
          { id: "pay_DEAD", status: "failed" },
          { id: "pay_REAL", status: "captured" },
        ],
      },
    });

    const status = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
      registrationRef: "order_REG1",
    });

    expect(status.providerTxnId).toBe("pay_REAL");
    expect(get.mock.calls.map((c) => c[0])).toContain("/orders/order_REG1/payments");
  });

  test("stays null — and makes no second call — with no stored order", async () => {
    // A row registered before the checkout block was kept. Degrading to "no
    // payment id" is correct; inventing the order id is not.
    const { client, get } = fakeClient({ token: TOKEN_OK });
    const status = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
    });

    expect(status.providerTxnId).toBeNull();
    expect(get.mock.calls.map((c) => c[0])).not.toContain(
      "/orders/undefined/payments"
    );
  });

  test("a failing order read does not strand an activation the token proved", async () => {
    // Best-effort: the token already says `confirmed`. Losing the payment id is
    // a worse outcome than it sounds, but throwing the poll away is worse still.
    const { client } = fakeClient({ token: TOKEN_OK });
    (client.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (path: string) =>
        path.endsWith("/payments")
          ? Promise.reject(new Error("razorpay 500"))
          : Promise.resolve(TOKEN_OK)
    );

    const status = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
      registrationRef: "order_REG1",
    });

    expect(status.state).toBe("active");
    expect(status.providerTxnId).toBeNull();
  });

  test("reports pending WITHOUT a call when there is no token yet", async () => {
    // Before approval neither id exists, and a token is only addressable as
    // /customers/:cid/tokens/:tid. Pending is both the honest answer and the
    // fail-safe one.
    const { client, get } = fakeClient();
    const status = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
    });
    expect(status.state).toBe("pending");
    expect(get).not.toHaveBeenCalled();
  });
});

describe("notifyPreDebit — creating the order IS the notification", () => {
  const input = {
    referenceId: "pj_mnd_abc",
    notificationRef: "pj_pdn_wire",
    providerMandateId: MANDATE_REF,
    amountPaise: 29900,
    currency: "INR",
    cycleDate: new Date("2026-08-23T00:00:00.000Z"),
    notBefore: null,
  };

  test("posts an order carrying the notification block, keyed on the token", async () => {
    const { client, post, get } = fakeClient();
    const provider = new RazorpayMandateProvider(client);
    const result = await provider.notifyPreDebit(input);

    expect(sentPath(post)).toBe("/orders");
    const body = sentBody(post);
    expect(body.amount).toBe(29900); // PAISE
    expect(body.payment_capture).toBe(true);
    // THE field that makes this the decoupled flow: we choose the debit instant
    // and we own the retries. Omitting it lets Razorpay auto-debit ~25h later.
    expect(body.notification).toEqual({
      token_id: "token_TOK1",
      // IST MIDNIGHT of the cycle date, not the raw `@db.Date` value.
      //
      // `cycleDate` reads back as UTC midnight = 05:30 IST, which is 5h30m
      // AFTER our own first presentation window opens (00:00-10:00 IST). Sent
      // raw it would tell Razorpay "do not debit before 05:30" while we present
      // from 00:00, so the first eleven ticks of every cycle day would ask for a
      // debit before the floor we set ourselves.
      payment_after: Math.floor(
        (input.cycleDate.getTime() - (5 * 60 + 30) * 60_000) / 1000
      ),
    });
    // The receipt is keyed on the NOTIFICATION's reference, NOT on the cycle.
    //
    // It was the per-cycle key, and that was wrong in a way that cost a
    // subscriber: Razorpay treats `receipt` as an idempotency key, so after a
    // failed debit the re-armed notification re-posted the SAME receipt, was
    // refused as a duplicate, and repeated that every thirty minutes forever —
    // never retrying the debit and never failing loudly, until the grace period
    // lapsed the subscription.
    //
    // Keyed on `notificationRef` it is idempotent for a transport retry of THIS
    // attempt (the reference is stable within an attempt) and fresh for a
    // genuine re-arm (`rearm` re-mints it). One value
    // keyed on the cycle cannot be both.
    expect(body.receipt).not.toBe(
      provider.debitRequestId(input.referenceId, input.cycleDate)
    );
    const sameAttempt = await new RazorpayMandateProvider(
      fakeClient().client
    ).notifyPreDebit(input);
    expect(sameAttempt).toBeDefined();

    // Stable for the same notification reference…
    const { client: c2, post: p2 } = fakeClient();
    await new RazorpayMandateProvider(c2).notifyPreDebit(input);
    expect(sentBody(p2).receipt).toBe(body.receipt);

    // …and different once the notification is re-armed under a fresh reference.
    const { client: c3, post: p3 } = fakeClient();
    await new RazorpayMandateProvider(c3).notifyPreDebit({
      ...input,
      notificationRef: `${input.notificationRef}_rearmed`,
    });
    expect(sentBody(p3).receipt).not.toBe(body.receipt);

    // A mutation, and only a mutation.
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();

    // The ORDER id is what the presentation needs.
    expect(result.presentationSequenceId).toBe("order_XYZ789");
    expect(result.status).toBe("accepted");
  });

  test("the order's notes carry our reference, the application tag and the cycle date", async () => {
    const { client, post } = fakeClient();
    await new RazorpayMandateProvider(client).notifyPreDebit(input);
    expect(sentBody(post).notes).toEqual({
      [RAZORPAY_NOTE_KEY.referenceId]: "pj_mnd_abc",
      [RAZORPAY_NOTE_KEY.applicationId]: RAZORPAY_APPLICATION_ID,
      // The IST calendar day, not an instant — `@db.Date` reads back as UTC
      // midnight, and that midnight IS the day.
      [RAZORPAY_NOTE_KEY.cycleDate]: "2026-08-23",
    });
  });

  test("a duplicate receipt means the previous attempt LANDED — reconcile, do not re-arm", async () => {
    const { client, post } = fakeClient();
    post.mockRejectedValueOnce(
      new RazorpayApiError("dup", 400, {
        code: "BAD_REQUEST_ERROR",
        description: "Receipt should be unique.",
      })
    );
    await expect(
      new RazorpayMandateProvider(client).notifyPreDebit(input)
    ).rejects.toBeInstanceOf(DuplicateReferenceError);
  });

  test("an ordinary rejection stays an ordinary rejection", async () => {
    const { client, post } = fakeClient();
    post.mockRejectedValueOnce(
      new RazorpayApiError("nope", 400, { description: "amount is too small" })
    );
    await expect(
      new RazorpayMandateProvider(client).notifyPreDebit(input)
    ).rejects.toBeInstanceOf(RazorpayApiError);
  });
});

describe("getPreDebitStatus", () => {
  const input = { referenceId: "pj_pdn_wire", presentationSequenceId: "order_XYZ789" };

  test("reads the order and maps notification.status", async () => {
    const { client, get } = fakeClient({
      orderStatus: { id: "order_XYZ789", notification: { status: "delivered" } },
    });
    const result = await new RazorpayMandateProvider(client).getPreDebitStatus(
      input
    );
    expect(sentPath(get)).toBe("/orders/order_XYZ789");
    expect(result.status).toBe("accepted");
    expect(result.presentationSequenceId).toBe("order_XYZ789");
  });

  /**
   * The one signal that lets a claimed cycle be re-claimed, so the bar is
   * deliberately high: it must mean "I looked and it is not there".
   */
  test("throws NoSuchDebitError ONLY on a definitive not-found", async () => {
    const { client, get } = fakeClient();
    get.mockRejectedValueOnce(
      new RazorpayApiError("bad id", 400, {
        code: "BAD_REQUEST_ERROR",
        description: "The id provided does not exist",
      })
    );
    await expect(
      new RazorpayMandateProvider(client).getPreDebitStatus(input)
    ).rejects.toBeInstanceOf(NoSuchDebitError);
  });

  test("a TRANSPORT error is never a not-found (that would be a double charge)", async () => {
    const { client, get } = fakeClient();
    const boom = new Error("ECONNRESET");
    get.mockRejectedValueOnce(boom);
    await expect(
      new RazorpayMandateProvider(client).getPreDebitStatus(input)
    ).rejects.toBe(boom);
  });

  test("a 500 is never a not-found either", async () => {
    const { client, get } = fakeClient();
    get.mockRejectedValueOnce(
      new RazorpayApiError("server", 500, { description: "server error" })
    );
    await expect(
      new RazorpayMandateProvider(client).getPreDebitStatus(input)
    ).rejects.not.toBeInstanceOf(NoSuchDebitError);
  });

  test("a 400 that is not about a missing resource is not a not-found", async () => {
    const { client, get } = fakeClient();
    get.mockRejectedValueOnce(
      new RazorpayApiError("bad", 400, { description: "amount is invalid" })
    );
    await expect(
      new RazorpayMandateProvider(client).getPreDebitStatus(input)
    ).rejects.not.toBeInstanceOf(NoSuchDebitError);
  });

  /**
   * The "my notify call timed out — did it land?" path.
   *
   * This used to call nothing and report `sent`, because the receipt was keyed
   * on the cycle and could not be recomputed from a status input that carries
   * no cycle date. Now that the receipt is keyed on the notification's own
   * reference — which this input always has — the order is findable, so a
   * dispatch that failed in transport can discover the order it may already
   * have created instead of stalling.
   */
  test("with no order id it finds the order by the receipt it minted", async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ entity: "collection", count: 1, items: [{ id: "order_FOUND" }] });

    const result = await new RazorpayMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_wire",
      presentationSequenceId: null,
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(sentPath(get)).toBe("/orders");
    expect(result.status).toBe("accepted");
    expect(result.presentationSequenceId).toBe("order_FOUND");
  });

  /**
   * An empty list is NOT treated as definitive.
   *
   * `NoSuchDebitError` is what authorises re-claiming a cycle, and a
   * list-by-receipt answering empty is indistinguishable from index lag at
   * Razorpay. Re-claiming a cycle whose order does exist is a second charge, so
   * this adopts-or-defers only — the same posture the Cashfree adapter takes.
   */
  test("an empty result defers rather than authorising a re-claim", async () => {
    const { client, get } = fakeClient();
    get.mockResolvedValue({ entity: "collection", count: 0, items: [] });

    const result = await new RazorpayMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_wire",
      presentationSequenceId: null,
    });

    expect(result.status).toBe("sent");
    expect(result.presentationSequenceId).toBeNull();
  });

  test("a failed receipt lookup defers instead of throwing into the sweep", async () => {
    const { client, get } = fakeClient();
    get.mockRejectedValue(new Error("connreset"));

    const result = await new RazorpayMandateProvider(client).getPreDebitStatus({
      referenceId: "pj_pdn_wire",
      presentationSequenceId: null,
    });

    expect(result.status).toBe("sent");
  });
});

describe("presentDebit — the call that moves money", () => {
  const input = {
    referenceId: "pj_mnd_abc",
    presentationRef: "pj_prs_wire",
    attemptNo: 1,
    providerMandateId: MANDATE_REF,
    presentationSequenceId: "order_XYZ789",
    amountPaise: 29900,
    currency: "INR",
    cycleDate: new Date("2026-08-23T00:00:00.000Z"),
    notBefore: null,
    purposeMessage: "Prabhuji VIP renewal",
  };

  test("posts to /payments/create/recurring with recurring as a real BOOLEAN", async () => {
    const { client, post } = fakeClient({
      customerFetch: { id: "cust_ABC123", email: "a@b.com", contact: "9876543210" },
      recurringPayment: { razorpay_payment_id: "pay_222", status: "created" },
    });
    const result = await new RazorpayMandateProvider(client).presentDebit(input);

    expect(sentPath(post)).toBe("/payments/create/recurring");
    const body = sentBody(post);
    // A real boolean HERE, the string "1" on /payments/create/upi. Razorpay's
    // inconsistency, preserved deliberately.
    expect(body.recurring).toBe(true);
    expect(typeof body.recurring).toBe("boolean");
    // The token_xxx ID, not the token object.
    expect(body.token).toBe("token_TOK1");
    expect(body.customer_id).toBe("cust_ABC123");
    // Bound to the order the notification was raised on.
    expect(body.order_id).toBe("order_XYZ789");
    // Must equal the order amount, in paise.
    expect(body.amount).toBe(29900);
    expect(body.currency).toBe("INR");

    // Razorpay answers with ids, not an outcome — the bank settles later.
    expect(result.outcome).toBe("pending");
    expect(result.providerTxnId).toBe("pay_222");
  });

  test("sends the payment's OWN notes: reference, tag, cycle date, attempt number", async () => {
    const { client, post } = fakeClient({ recurringPayment: { id: "pay_222" } });
    await new RazorpayMandateProvider(client).presentDebit({ ...input, attemptNo: 2 });
    const notes = sentBody(post).notes as Record<string, string>;

    // LOAD-BEARING. Razorpay was observed to merge the order's notes into the
    // payment's, but that is Razorpay's behaviour, not ours to rely on: the
    // reference must reach the payment entity from THIS map, or a change on
    // their side turns every `payment.*` webhook for this debit into an
    // `unknown_reference` that settles only by the reconcile sweep. Pinned on
    // its own before the shape is.
    expect(notes[RAZORPAY_NOTE_KEY.referenceId]).toBe("pj_mnd_abc");

    expect(notes).toEqual({
      [RAZORPAY_NOTE_KEY.referenceId]: "pj_mnd_abc",
      [RAZORPAY_NOTE_KEY.applicationId]: RAZORPAY_APPLICATION_ID,
      [RAZORPAY_NOTE_KEY.cycleDate]: "2026-08-23",
      // A string: Razorpay stores notes as text, and the attempt is the one
      // thing the order cannot carry — it is per presentation, not per cycle.
      [RAZORPAY_NOTE_KEY.attemptNo]: "2",
    });
    // Nothing that identifies the payer travels in notes.
    expect(Object.values(notes)).not.toContain("9876543210");
    expect(Object.values(notes)).not.toContain("a@b.com");
  });

  test("presents exactly once — a single, never-retried mutation", async () => {
    const { client, post } = fakeClient({ recurringPayment: { id: "pay_222" } });
    await new RazorpayMandateProvider(client).presentDebit(input);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test("a failed customer read does not block a debit that is due", async () => {
    const { client, post, get } = fakeClient({ recurringPayment: { id: "pay_1" } });
    get.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      new RazorpayMandateProvider(client).presentDebit(input)
    ).resolves.toMatchObject({ outcome: "pending" });
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("getDebitStatus", () => {
  test("reads the ORDER's payments — the only address our inputs allow", async () => {
    // `DebitStatusInput` carries the order id and no payment id, so
    // `GET /payments/:id` is unreachable from this port.
    const { client, get } = fakeClient({
      orderPayments: {
        entity: "collection",
        items: [
          { id: "pay_bad", status: "failed" },
          { id: "pay_good", status: "captured", rrn: "BRN123" },
        ],
      },
    });
    const result = await new RazorpayMandateProvider(client).getDebitStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
      presentationSequenceId: "order_XYZ789",
      cycleDate: new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(sentPath(get)).toBe("/orders/order_XYZ789/payments");
    // A settled outcome outranks position: a failed attempt followed by a good
    // one must report the good one.
    expect(result.outcome).toBe("succeeded");
    expect(result.providerTxnId).toBe("pay_good");
    expect(result.bankReferenceNumber).toBe("BRN123");
  });

  test("a payment still in `created` reports pending, not failed", async () => {
    const { client } = fakeClient({
      orderPayments: { items: [{ id: "pay_1", status: "created" }] },
    });
    const result = await new RazorpayMandateProvider(client).getDebitStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
      presentationSequenceId: "order_XYZ789",
      cycleDate: new Date("2026-08-23T00:00:00.000Z"),
    });
    expect(result.outcome).toBe("pending");
  });
});

describe("revokeMandate", () => {
  /**
   * THE assertion. `DELETE /customers/:cid/tokens/:tid` looks like the cancel
   * and Razorpay's own docs say it is not one: it deletes THEIR record of the
   * token and leaves the NPCI mandate live and debitable — i.e. it removes our
   * ability to stop the debits without stopping the debits.
   */
  test("issues PUT …/cancel and never a DELETE", async () => {
    const { client, put, post, get } = fakeClient();
    await new RazorpayMandateProvider(client).revokeMandate({
      referenceId: "pj_mnd_abc",
      providerMandateId: MANDATE_REF,
    });

    expect(put).toHaveBeenCalledTimes(1);
    expect(sentPath(put)).toBe(
      "/customers/cust_ABC123/tokens/token_TOK1/cancel"
    );
    expect(sentPath(put)).toMatch(/\/cancel$/);
    // No other verb touched the token. In particular there is no `delete` on the
    // client at all, so a DELETE is not merely unused — it is unreachable.
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(client).not.toHaveProperty("delete");
  });

  test.each([
    ["concurrent_request_in_progress", "PROVIDER_BUSY"],
    ["invalid_mandate_state", "MANDATE_NOT_CANCELLABLE"],
    ["token_not_recurring", "MANDATE_NOT_RECURRING"],
  ])("translates %s into %s", async (reason, errorCode) => {
    const { client, put } = fakeClient();
    put.mockRejectedValueOnce(
      new RazorpayApiError("no", 400, { code: "BAD_REQUEST_ERROR", reason })
    );
    await expect(
      new RazorpayMandateProvider(client).revokeMandate({
        referenceId: "pj_mnd_abc",
        providerMandateId: MANDATE_REF,
      })
    ).rejects.toMatchObject({ errorCode });
  });

  test("an unrecognised rejection passes through untouched", async () => {
    const { client, put } = fakeClient();
    const boom = new RazorpayApiError("no", 500, { description: "server error" });
    put.mockRejectedValueOnce(boom);
    await expect(
      new RazorpayMandateProvider(client).revokeMandate({
        referenceId: "pj_mnd_abc",
        providerMandateId: MANDATE_REF,
      })
    ).rejects.toBe(boom);
  });
});

/**
 * The boundary sweep: nothing that identifies a payer, and no credential, may
 * leave ANY method of this adapter unmasked. Masking one method and forgetting
 * the next is exactly how a VPA ends up in a log that leaves the building.
 */
describe("PII never crosses the adapter boundary", () => {
  const VPA = "abhishek@okhdfcbank";
  const NAME = "Abhishek Kumar";
  const PHONE = "9876543210";
  const EMAIL = "abhishek.kumar@gmail.com";
  const SECRET = "rzp_live_supersecretvalue";

  /** Every response is stuffed with identity Razorpay really does send. */
  function pollutedClient() {
    const dirty = {
      id: "x_1",
      vpa: { username: "abhishek", handle: "okhdfcbank", name: NAME },
      customer_name: NAME,
      email: EMAIL,
      contact: PHONE,
      key_secret: SECRET,
      recurring_details: { status: "confirmed" },
      notification: { status: "delivered" },
      items: [{ id: "pay_1", status: "captured", vpa: VPA, email: EMAIL }],
    };
    return fakeClient({
      customer: { ...dirty, id: "cust_ABC123" },
      order: { ...dirty, id: "order_XYZ789" },
      recurringPayment: { ...dirty, razorpay_payment_id: "pay_2" },
      token: { ...dirty, id: "token_TOK1" },
      orderStatus: { ...dirty, id: "order_XYZ789" },
      orderPayments: dirty,
      customerFetch: { ...dirty, id: "cust_ABC123" },
    });
  }

  const cycleDate = new Date("2026-08-23T00:00:00.000Z");

  test("no method returns an unmasked handle, name, phone, email or secret", async () => {
    const { client } = pollutedClient();
    const provider = new RazorpayMandateProvider(client);

    const results: unknown[] = [
      await provider.createMandate(baseInput()),
      await provider.getMandateStatus({
        referenceId: "pj_mnd_abc",
        providerMandateId: MANDATE_REF,
      }),
      await provider.notifyPreDebit({
        referenceId: "pj_mnd_abc",
        notificationRef: "pj_pdn_wire",
        providerMandateId: MANDATE_REF,
        amountPaise: 29900,
        currency: "INR",
        cycleDate,
        notBefore: null,
      }),
      await provider.presentDebit({
        referenceId: "pj_mnd_abc",
        presentationRef: "pj_prs_wire",
        attemptNo: 1,
        providerMandateId: MANDATE_REF,
        presentationSequenceId: "order_XYZ789",
        amountPaise: 29900,
        currency: "INR",
        cycleDate,
        purposeMessage: "Prabhuji VIP renewal",
      }),
      await provider.getDebitStatus({
        referenceId: "pj_mnd_abc",
        providerMandateId: MANDATE_REF,
        presentationSequenceId: "order_XYZ789",
        cycleDate,
      }),
    ];

    for (const result of results) {
      const serialized = JSON.stringify(withoutRaw(result));
      expect(serialized).not.toContain(VPA);
      expect(serialized).not.toContain(NAME);
      expect(serialized).not.toContain(PHONE);
      expect(serialized).not.toContain(EMAIL);
      expect(serialized).not.toContain(SECRET);
    }
  });

  /**
   * The two PDN methods are the exception that proves the rule: they DO return
   * `raw`, because the service persists it to `pdn_notifications` for forensics
   * and REDACTS it on the way (see `PreDebitResult.raw`). Asserted here so the
   * exemption stays a documented one rather than a leak nobody noticed.
   */
  test("the PDN methods return raw ON PURPOSE, for the service to redact", async () => {
    const { client } = pollutedClient();
    const provider = new RazorpayMandateProvider(client);

    const status = await provider.getPreDebitStatus({
      referenceId: "pj_pdn_wire",
      presentationSequenceId: "order_XYZ789",
    });
    const notified = await provider.notifyPreDebit({
      referenceId: "pj_mnd_abc",
      notificationRef: "pj_pdn_wire",
      providerMandateId: MANDATE_REF,
      amountPaise: 29900,
      currency: "INR",
      cycleDate,
      notBefore: null,
    });

    expect(status.raw).toBeDefined();
    expect(notified.raw).toBeDefined();
    // Everything that is NOT the raw passthrough is still clean.
    for (const result of [status, notified]) {
      expect(JSON.stringify(withoutRaw(result))).not.toContain(NAME);
      expect(JSON.stringify(withoutRaw(result))).not.toContain(VPA);
    }
  });
});

describe("class-level declarations", () => {
  const provider = new RazorpayMandateProvider(fakeClient().client);

  test("declares the money-moving phase and the deposit capability", () => {
    expect(provider.name).toBe("razorpay");
    // Money moves at presentDebit, not at the notification.
    expect(provider.chargePhase).toBe("submission");
    // The authorization payment is a real debit (Razorpay's minimum is ₹1).
    expect(provider.supportsInitialDeposit).toBe(true);
  });

  test("the PDN window is a WHOLE-DAY lead, because that is all the sweep can express", () => {
    // This asserted `{min:25, max:30}`, which is an EMPTY band and would have
    // stopped Razorpay from ever billing anyone — silently, as
    // `skippedOutsideWindow` on every tick.
    //
    // `canSendPreDebitNotification` measures the lead as
    // `cycleDate - istDateOnly(now)`; both sides are calendar dates at UTC
    // midnight, so the lead is only ever exactly 24h or 48h no matter when the
    // scheduler ticks. Nothing can land in [25,30].
    //
    // The floor was 48 for a while, because the ~25h turnaround was enforced by
    // the LEAD: at a 24h lead the gap between notifying (any time on the day
    // before) and presenting (from 00:00 IST on the cycle date) could be a few
    // hours, well under the TAT. TAM-164 enforces the turnaround directly, on
    // the instant, via `presentationTatHours` — so the lead no longer has to
    // approximate it and the floor is free to be 24, which is what makes a
    // one-day trial billable here.
    expect(provider.pdnLeadHours).toEqual({ min: 24, max: 48 });

    // The ceiling stays 48 and is what RENEWALS use: a monthly cycle is
    // notified two days out and keeps real margin over the turnaround.
    // `{24,24}` would also satisfy the whole-day check below and would cut every
    // renewal to a bare 24h lead — asserted here so narrowing it fails loudly.
    expect(provider.pdnLeadHours.max).toBe(48);

    // The property that actually matters, restated so this test fails for the
    // right reason if someone narrows the band again. `gateways.test.ts`
    // asserts the same thing across every registered gateway.
    const { min, max } = provider.pdnLeadHours;
    const wholeDayLeads = [24, 48, 72].filter((h) => h >= min && h <= max);
    expect(wholeDayLeads.length).toBeGreaterThan(0);
  });

  test("a retry needs a FRESH notification", () => {
    // A debit is bound to one order_id, and Razorpay says not to create another
    // subsequent payment until the previous one's status is known.
  });
});

/**
 * THE registration→activation loop, and the identity that makes it correct.
 *
 * `createMandate` cannot return a token id — the token is minted when the payer
 * approves — and Razorpay's `token.confirmed` webhook carries only
 * `payload.token.entity`, which has neither `notes` nor `customer_id`. So no
 * inbound callback can be matched back to our mandate, and activation has to
 * ride OUR poll.
 *
 * The poll resolves the token from THIS registration's ORDER. That is the only
 * handle with the right cardinality: one order per attempt, where a customer is
 * one per person and outlives every attempt. The order's authorization payment
 * names its own `token_id`, `customer_id` and `pay_xxx` together.
 */
describe("activation: discovering the approved token from the registration order", () => {
  const CONFIRMED_TOKEN = {
    id: "token_TOK1",
    method: "upi",
    recurring_details: { status: "confirmed" },
    vpa: { username: "payer", handle: "okhdfcbank", name: "A Payer" },
  };

  /** The shape stage's live API actually returned — all three ids on one entity. */
  const AUTHORIZATION_PAYMENT = {
    id: "pay_REAL",
    status: "captured",
    method: "upi",
    order_id: "order_REG1",
    token_id: "token_TOK1",
    customer_id: "cust_ABC123",
  };

  function clientWithOrderPayments(items: unknown[]) {
    const { client, get } = fakeClient();
    get.mockImplementation((path: string) => {
      if (path.endsWith("/payments")) return Promise.resolve({ items });
      if (path.includes("/tokens/")) return Promise.resolve(CONFIRMED_TOKEN);
      return Promise.resolve({});
    });
    return { client, get };
  }

  test("an un-approved mandate resolves its token from its own order and reports active", async () => {
    const { client, get } = clientWithOrderPayments([AUTHORIZATION_PAYMENT]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    // The ORDER is asked first — it is what supplies both ids.
    expect(sentPath(get, 0)).toBe("/orders/order_REG1/payments");
    expect(sentPath(get, 1)).toBe("/customers/cust_ABC123/tokens/token_TOK1");
    expect(result.state).toBe("active");
    // AND hands back the completed composite — this is the write that finally
    // moves the mandate off `pending`, because `applyStatus` persists a
    // non-null `providerMandateId`.
    expect(result.providerMandateId).toBe(
      composeMandateRef("cust_ABC123", "token_TOK1")
    );
    // The authorization payment id rides along, off the SAME entity, so the
    // deposit settle cannot be handed a null `gateway_payment_id`.
    expect(result.providerTxnId).toBe("pay_REAL");
  });

  /**
   * THE entitlement guard, and why the order rather than the customer.
   *
   * One customer per human means that customer's token list accumulates across
   * every registration the person ever starts, with nothing in it saying which
   * attempt a token belongs to. The order carries exactly one attempt's
   * authorization, so a token minted for a DIFFERENT attempt is not reachable
   * from here at all — there is no floor to clear and no heuristic to fool.
   */
  test("a token from a different attempt is not reachable from this mandate's order", async () => {
    // This mandate's own order was never authorized. The user's earlier attempt
    // was, and its token is `confirmed` on the shared customer — under the old
    // customer-list lookup that token was adopted here and granted Pro for an
    // approval that never happened on THIS mandate.
    const { client } = clientWithOrderPayments([]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG2",
    });

    expect(result.state).toBe("pending");
    // And nothing foreign is persisted either.
    expect(result.providerMandateId).toBeNull();
  });

  test("no payment on the order yet reports pending — never active", async () => {
    // The payer has not approved. Guessing `active` here hands out paid content
    // for a mandate that may never be approved at all.
    const { client } = clientWithOrderPayments([]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
    expect(result.failedRegistrationPayment).toBeUndefined();
  });

  test("every attempt failed: still pending, but the declined attempt is reported (TAM-188)", async () => {
    // The ₹2 deposit was declined. State must NOT move — the payer may retry in
    // the same checkout — but `bk_trial_failed` needs the attempt's id and cause.
    const { client } = clientWithOrderPayments([
      {
        id: "pay_DECLINED",
        status: "failed",
        error_code: "BAD_REQUEST_ERROR",
        error_reason: "payment_failed",
        error_description: "Payment failed",
      },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
    expect(result.providerMandateId).toBeNull();
    expect(result.failedRegistrationPayment).toEqual({
      gatewayPaymentId: "pay_DECLINED",
      failureCode: "BAD_REQUEST_ERROR",
      failureReason: "payment_failed",
    });
  });

  test("a failed try followed by one still in flight reports no decline", async () => {
    // The payer retried inside the checkout; the live attempt is the answer.
    const { client } = clientWithOrderPayments([
      { id: "pay_LIVE", status: "created" },
      { id: "pay_DEAD", status: "failed", error_code: "BAD_REQUEST_ERROR" },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
    expect(result.failedRegistrationPayment).toBeUndefined();
  });

  /**
   * `save_vpa` off (rollout P1) — Razorpay authorizes the payment but mints no
   * token. Distinguishable from "payer has not approved" only because the
   * payment is there and the token is not, which is why both are logged.
   */
  test("an authorized payment carrying no token_id reports pending, not active", async () => {
    const { client } = clientWithOrderPayments([
      { id: "pay_REAL", status: "captured", customer_id: "cust_ABC123" },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
  });

  test("the settled payment supplies the token even behind a failed attempt", async () => {
    // An order can carry a failed try followed by the good one. Position must
    // not decide which token the mandate adopts.
    const { client } = clientWithOrderPayments([
      { id: "pay_DEAD", status: "failed", customer_id: "cust_ABC123" },
      AUTHORIZATION_PAYMENT,
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("active");
    expect(result.providerTxnId).toBe("pay_REAL");
  });

  /**
   * TAM-156, reproduced from prod. A payer's first UPI attempt failed and they
   * retried inside the SAME checkout, so the order carried two payments — and
   * Razorpay stamped both with the same `created_at`, which is what defeated the
   * newest-first tiebreak. A poll landed in the 23-second gap before the retry
   * settled and adopted the DEAD attempt's token; from then on `stored` won over
   * every re-read and the mandate polled a token that could never confirm. The
   * user approved, paid the deposit, and stayed `pending` forever.
   */
  test("a poll between a failed attempt and its live retry adopts NO token", async () => {
    const { client, get } = clientWithOrderPayments([
      { ...AUTHORIZATION_PAYMENT, id: "pay_DEAD", status: "failed", token_id: "token_DEAD", created_at: 1786369938 },
      { ...AUTHORIZATION_PAYMENT, status: "created", created_at: 1786369938 },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
    // NOTHING is persisted — persisting either token here is what made the
    // stall permanent, because the stored halves win from then on.
    expect(result.providerMandateId).toBeNull();
    expect(result.providerTxnId).toBeNull();
    // And no token was even read: there is no settled authorization to name one.
    expect(get.mock.calls.map((c) => c[0])).not.toContainEqual(
      expect.stringContaining("/tokens/")
    );
  });

  test("the same order activates on the next poll once the retry settles", async () => {
    // The other half of TAM-156: having adopted nothing, the very next tick sees
    // the captured retry and resolves the REAL token. Self-healing, no operator.
    const { client } = clientWithOrderPayments([
      { ...AUTHORIZATION_PAYMENT, id: "pay_DEAD", status: "failed", token_id: "token_DEAD", created_at: 1786369938 },
      { ...AUTHORIZATION_PAYMENT, created_at: 1786369938 },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("active");
    expect(result.providerMandateId).toBe(
      composeMandateRef("cust_ABC123", "token_TOK1")
    );
    expect(result.providerTxnId).toBe("pay_REAL");
  });

  test("a failed-only order settles nothing and names no payment", async () => {
    // Both attempts dead — the genuine non-approval. It must not hand the
    // deposit settle a failed `pay_xxx` to write as the gateway payment id.
    const { client } = clientWithOrderPayments([
      { ...AUTHORIZATION_PAYMENT, id: "pay_DEAD", status: "failed" },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
    expect(result.providerTxnId).toBeNull();
  });

  test("an order read failure reports pending rather than throwing into the poll", async () => {
    const { client, get } = fakeClient();
    get.mockRejectedValue(new Error("connreset"));

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
      registrationRef: "order_REG1",
    });

    expect(result.state).toBe("pending");
  });

  test("a mandate with no stored order reports pending without asking", async () => {
    // A row registered before the checkout block was kept. Unresolvable, and
    // `pending` stalls it visibly rather than guessing.
    const { client, get } = clientWithOrderPayments([AUTHORIZATION_PAYMENT]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: null,
    });

    expect(result.state).toBe("pending");
    expect(get).not.toHaveBeenCalled();
  });

  test("once the token is known the stored composite wins over a re-read", async () => {
    // Past approval both halves are on the row. A live mandate must not depend
    // on re-deriving them from a read that can fail.
    const { client, get } = clientWithOrderPayments([
      // Deliberately disagrees: if the order were preferred, this would move a
      // live mandate onto a different token.
      { ...AUTHORIZATION_PAYMENT, token_id: "token_OTHER" },
    ]);

    const result = await new RazorpayMandateProvider(client).getMandateStatus({
      referenceId: "pj_mnd_abc",
      providerMandateId: composeMandateRef("cust_ABC123", "token_TOK1"),
      registrationRef: "order_REG1",
    });

    expect(get.mock.calls.map((c) => c[0])).toContain(
      "/customers/cust_ABC123/tokens/token_TOK1"
    );
    expect(result.providerMandateId).toBe(
      composeMandateRef("cust_ABC123", "token_TOK1")
    );
  });
});
