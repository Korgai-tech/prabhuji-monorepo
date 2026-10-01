import { describe, expect, test } from "vitest";
import { redactPayload, redactedJson } from "../redact.js";

/**
 * Gateway payload redaction.
 *
 * This is the gate that makes logging full request/response bodies safe. These
 * logs leave the building — pino → OpenTelemetry → ClickHouse Cloud + the
 * HyperDX UI — so a miss here puts a real customer's UPI handle or phone number
 * in a third party's system, permanently, at the rate of one per payment.
 *
 * The tests are therefore written in two halves that pull against each other:
 * what MUST be blanked, and what MUST survive. Redaction that keeps nothing is
 * as useless as redaction that keeps everything.
 */

/** Shaped like a real Cashfree create-subscription body. */
const CASHFREE_REQUEST = {
  subscription_id: "pj_mnd_abc",
  customer_details: {
    customer_id: "pj_mnd_abc",
    customer_email: "user-1@no-reply.prabhuji.app",
    customer_phone: "9876543210",
  },
  plan_details: {
    plan_name: "Prabhuji VIP Membership",
    plan_amount: 299,
    plan_currency: "INR",
    plan_intervals: 1,
  },
  authorization_details: {
    authorization_amount: 2,
    payment_methods: ["upi"],
  },
  subscription_note: "Prabhuji VIP Membership",
};

/** Shaped like a real Cashfree status response after approval. */
const CASHFREE_RESPONSE = {
  cf_subscription_id: "295829976",
  subscription_status: "ACTIVE",
  subscription_payment_id: "cf_pay_991",
  authorization_details: {
    authorization_status: "SUCCESS",
    payment_method: { upi: { channel: "link", upi_id: "rishabh@okhdfcbank" } },
  },
  customer_details: { customer_phone: "9876543210" },
  payer_name: "Rishabh B",
  message: "Subscription is active",
};

describe("what must never survive", () => {
  test("payer identity is blanked everywhere it appears", () => {
    const out = JSON.stringify([
      redactPayload(CASHFREE_REQUEST),
      redactPayload(CASHFREE_RESPONSE),
    ]);

    expect(out).not.toContain("9876543210");
    expect(out).not.toContain("rishabh@okhdfcbank");
    expect(out).not.toContain("Rishabh B");
    expect(out).not.toContain("user-1@no-reply.prabhuji.app");
  });

  test("credentials and signatures are blanked", () => {
    const out = JSON.stringify(
      redactPayload({
        client_id: "cf-live-id",
        client_secret: "cfsk_ma_prod_supersecret",
        "x-webhook-signature": "abc123==",
        authorization: "Bearer nope",
      })
    );

    expect(out).not.toContain("cfsk_ma_prod_supersecret");
    expect(out).not.toContain("cf-live-id");
    expect(out).not.toContain("abc123==");
    expect(out).not.toContain("Bearer nope");
  });

  test("spelling variants across gateways are all caught", () => {
    // The two gateways disagree about the name of every one of these, which is
    // why matching is by substring rather than an exact key list. A missed
    // variant is a real phone number in a third-party log.
    const out = JSON.stringify(
      redactPayload({
        payerVa: "a@okicici",
        payer_va: "b@okicici",
        vpa: "c@okicici",
        upiId: "d@okicici",
        payerMobile: "9000000001",
        mobileNumber: "9000000002",
        accountNumber: "1234567890",
        ifscCode: "HDFC0001",
      })
    );
    for (const secret of [
      "okicici",
      "9000000001",
      "9000000002",
      "1234567890",
      "HDFC0001",
    ]) {
      expect(out).not.toContain(secret);
    }
  });
});

describe("what must survive — otherwise the log is worthless", () => {
  test("amounts, statuses, ids and error codes are kept", () => {
    const req = redactPayload(CASHFREE_REQUEST) as Record<string, never>;
    const res = JSON.stringify(redactPayload(CASHFREE_RESPONSE));

    expect(JSON.stringify(req)).toContain("299");
    expect(JSON.stringify(req)).toContain("Prabhuji VIP Membership");
    expect(JSON.stringify(req)).toContain("pj_mnd_abc");
    // The registration deposit amount — the number this whole ledger exists to
    // record — sits under `authorization_details`.
    expect(JSON.stringify(req)).toContain('"authorization_amount":2');

    // Every id and status a support ticket or a settlement match needs.
    expect(res).toContain("295829976");
    expect(res).toContain("ACTIVE");
    expect(res).toContain("cf_pay_991");
    // `authorization_status` must survive: it is the field that says whether
    // the mandate was approved. It matches `authorization` only as a substring,
    // which is precisely why that one is an exact-match key.
    expect(res).toContain("SUCCESS");
    expect(res).toContain("authorization_status");
    expect(res).toContain("Subscription is active");
  });

  /**
   * The refinement worth having. `payment_method.upi` is an OBJECT, and the
   * `channel` inside it is exactly what you need when a gateway rejects a
   * request — so a sensitive key holding an object recurses rather than
   * blanking the subtree, and only the `upi_id` string inside it goes.
   */
  test("a sensitive key holding an object keeps its structure", () => {
    const out = JSON.stringify(redactPayload(CASHFREE_RESPONSE));
    expect(out).toContain("channel");
    expect(out).toContain("link");
    expect(out).not.toContain("rishabh@okhdfcbank");
  });

  test("numbers and booleans are never redacted", () => {
    // An amount is not identity, and blanking it would defeat the point.
    const out = redactPayload({
      payer_amount: 29900,
      phone_verified: true,
    }) as Record<string, unknown>;
    expect(out.payer_amount).toBe(29900);
    expect(out.phone_verified).toBe(true);
  });

  test("arrays keep their shape", () => {
    const out = redactPayload({
      payment_methods: ["upi", "card"],
      payers: [{ vpa: "a@ok", amount: 100 }],
    }) as Record<string, unknown>;
    expect(out.payment_methods).toEqual(["upi", "card"]);
    expect(JSON.stringify(out)).not.toContain("a@ok");
    expect(JSON.stringify(out)).toContain("100");
  });

  /**
   * The backstop, added after a real miss: `authorization_reference` carries the
   * payer's UPI handle on Cashfree and matched none of the key rules, so a live
   * VPA would have reached the logs. Keys are only as good as the vendor's
   * naming, and both gateways have surprised us once already.
   */
  test("a handle-shaped value is redacted under ANY key", () => {
    const out = JSON.stringify(
      redactPayload({
        authorization_reference: "someone@okicici",
        totally_innocent_key: "another@okhdfcbank",
        contact: "user@example.com",
      })
    );
    expect(out).not.toContain("okicici");
    expect(out).not.toContain("okhdfcbank");
    expect(out).not.toContain("example.com");
  });

  test("ordinary copy containing @ is left alone", () => {
    // The shape rule must not eat product copy or notes.
    const out = redactPayload({
      plan_note: "Prabhuji @ VIP Membership",
      subscription_note: "billed monthly",
    }) as Record<string, string>;
    expect(out.plan_note).toBe("Prabhuji @ VIP Membership");
    expect(out.subscription_note).toBe("billed monthly");
  });

  test("the input is never mutated", () => {
    const input = { customer_phone: "9876543210" };
    redactPayload(input);
    // A log statement that corrupts the object about to be sent to a payment
    // gateway would be a spectacular way to break a debit.
    expect(input.customer_phone).toBe("9876543210");
  });
});

describe("redactedJson", () => {
  test("caps a wall of text and says how much it dropped", () => {
    const out = redactedJson({ note: "x".repeat(9000) });
    expect(out!.length).toBeLessThan(4100);
    expect(out).toContain("truncated");
  });

  test("null and undefined stay null rather than the string 'null'", () => {
    expect(redactedJson(null)).toBeNull();
    expect(redactedJson(undefined)).toBeNull();
  });

  test("a circular payload degrades instead of throwing", () => {
    // Logging must never be able to fail a payment.
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(redactedJson(circular)).toBe("[unserializable]");
  });
});

/**
 * A real Cashfree presentation webhook, redacted for the log line.
 *
 * The inbound body is the one payload we cannot ask for again — the gateway
 * sends it once (plus its own retries) — so `callback_received` logs it in
 * full. That makes redaction load-bearing on the way IN as well as out: a
 * webhook carries the payer's handle exactly like a status response does.
 */
describe("inbound webhook bodies", () => {
  const WEBHOOK = {
    type: "SUBSCRIPTION_PAYMENT_SUCCESS",
    data: {
      subscription_id: "pj_mnd_abc",
      cf_subscription_id: "296209753",
      payment: {
        cf_payment_id: "862234066",
        payment_status: "SUCCESS",
        payment_amount: 5,
        bank_reference_number: "521912345678",
      },
      authorization_details: {
        authorization_reference: "someone@okicici",
      },
      customer_details: { customer_phone: "9876543210" },
    },
  };

  test("routing fields and outcome survive; payer identity does not", () => {
    const out = redactedJson(WEBHOOK)!;

    // Everything an incident needs to trace the callback.
    expect(out).toContain("SUBSCRIPTION_PAYMENT_SUCCESS");
    expect(out).toContain("pj_mnd_abc");
    expect(out).toContain("296209753");
    expect(out).toContain("862234066");
    expect(out).toContain("SUCCESS");
    expect(out).toContain("521912345678");

    // And nothing that identifies the human.
    expect(out).not.toContain("someone@okicici");
    expect(out).not.toContain("9876543210");
  });
});
