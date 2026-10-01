import { describe, expect, test } from "vitest";
import { razorpayGateway } from "../razorpay.gateway.js";
import { CALLBACK_KIND } from "@api/core/payment/constants.js";
import { RAZORPAY_NOTE_KEY } from "@api/core/payment/repositories/razorpay.constants.js";

const REF = "pj_mnd_60d484c7-1111-2222-3333-444455556666";

/**
 * A `token.confirmed` body shaped the way Razorpay ACTUALLY delivers it.
 *
 * Its documented `contains` is `["token"]` — `payload.token.entity` and nothing
 * else. No payment entity, no order entity, and the token entity itself has no
 * `notes` and no `customer_id`. So there is genuinely NOTHING in this body that
 * can be matched back to our mandate, which is why activation does not depend on
 * it: `getMandateStatus` discovers the approved token by listing the customer's
 * tokens instead.
 *
 * An earlier version of this test invented a `payload.payment.entity` carrying
 * `notes`, `customer_id` and `order_id`, and passed against a body Razorpay does
 * not send.
 */
function tokenConfirmed() {
  return {
    event: "token.confirmed",
    payload: {
      token: {
        entity: {
          id: "token_M7K2eFBU7vToaQ",
          method: "upi",
          recurring_details: { status: "confirmed" },
        },
      },
    },
  };
}

/**
 * A `payment.captured` body. This one DOES carry the payment entity, and an
 * order's `notes` propagate onto it — which is what lets a settlement callback
 * resolve. Unverified against a live account (plan OQ7), which is why nothing
 * depends on it alone.
 */
function paymentCaptured(opts: { withNote: boolean }) {
  return {
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_EAm09NKReXi2e0",
          customer_id: "cust_4xbQrmEoA5WJ01",
          token_id: "token_M7K2eFBU7vToaQ",
          order_id: "order_1Aa00000000002",
          status: "captured",
          ...(opts.withNote
            ? { notes: { [RAZORPAY_NOTE_KEY.referenceId]: REF } }
            : {}),
        },
      },
    },
  };
}

describe("callbackKindFor", () => {
  test.each([
    ["token.confirmed", CALLBACK_KIND.MANDATE],
    ["token.cancelled", CALLBACK_KIND.MANDATE],
    ["token.paused", CALLBACK_KIND.MANDATE],
    ["payment.captured", CALLBACK_KIND.PRESENTATION],
    ["payment.failed", CALLBACK_KIND.PRESENTATION],
    ["order.paid", CALLBACK_KIND.PRESENTATION],
  ])("%s classifies as %s", (event, expected) => {
    expect(razorpayGateway.callbackKindFor({ event })).toBe(expected);
  });

  /**
   * `order.notification.*` is an order event, so it MUST be tested before
   * anything order-shaped. Getting this order wrong is what routed every
   * Decentro PDN callback into the settlement handler and discarded the
   * sequence id — the failure looked exactly like the provider not sending
   * callbacks at all.
   */
  test.each(["order.notification.delivered", "order.notification.failed"])(
    "%s classifies as PDN, not presentation",
    (event) => {
      expect(razorpayGateway.callbackKindFor({ event })).toBe(CALLBACK_KIND.PDN);
    }
  );

  /**
   * No kind may ever be the fallback: a body we cannot classify must not reach
   * the code that settles money.
   */
  test.each([
    ["invoice.paid", "we raise no invoices"],
    ["subscription.charged", "a Subscriptions-API event we never opted into"],
    ["", "no event name at all"],
  ])("%s is unclassified (%s)", (event) => {
    expect(razorpayGateway.callbackKindFor({ event })).toBeNull();
  });

  test("an empty body is unclassified rather than guessed at", () => {
    expect(razorpayGateway.callbackKindFor({})).toBeNull();
  });

  /**
   * THE reason classification is an allow-list and not a prefix.
   *
   * Razorpay's `payment.` namespace holds far more than settlements. A
   * `payment.` prefix swept every dispute and downtime event into PRESENTATION —
   * the handler that settles a debit. A dispute carries presentation-shaped keys
   * (a payment id, an order id), so it resolved to a REAL mandate and was handed
   * to the settlement path for a debit that had already completed. That is the
   * same hazard `docs/PAYMENT-FLOW.md` documents for Decentro refunds:
   * "its status tokens must be checked FIRST, or it will be read as the original
   * debit and overwrite that debit's outcome with the refund's."
   *
   * A downtime event fails more quietly: it carries no payment entity at all, so
   * it resolves to nothing and burns a provider status read per delivery.
   */
  test.each([
    "payment.dispute.created",
    "payment.dispute.won",
    "payment.dispute.lost",
    "payment.dispute.closed",
    "payment.dispute.under_review",
    "payment.dispute.action_required",
    "payment.downtime.started",
    "payment.downtime.updated",
    "payment.downtime.resolved",
  ])("%s is NOT a presentation — it must never reach the settlement path", (event) => {
    expect(razorpayGateway.callbackKindFor({ event })).toBeNull();
  });

  /**
   * Events from Razorpay products we do not use. Subscribing to one by accident
   * in the dashboard must cost an ack and a log line, never a routing decision.
   */
  test.each([
    "subscription.charged",
    "subscription.cancelled",
    "invoice.paid",
    "invoice.partially_paid",
    "refund.processed",
    "refund.created",
    "settlement.processed",
    "payment_link.paid",
    "fund_account.validation.completed",
    "engage.rewards.enabled",
  ])("%s is unclassified — a product we do not use", (event) => {
    expect(razorpayGateway.callbackKindFor({ event })).toBeNull();
  });

  /**
   * An event Razorpay has not invented yet. A prefix would have claimed it
   * silently; an allow-list makes it arrive as `null` — acked, logged, and never
   * given to the code that moves money.
   */
  test("an unrecognised future event under a known namespace is not claimed", () => {
    expect(razorpayGateway.callbackKindFor({ event: "payment.something.new" })).toBeNull();
    expect(razorpayGateway.callbackKindFor({ event: "token.something.new" })).toBeNull();
  });

  /** The ones we DO act on, stated exhaustively so the set is greppable. */
  test.each([
    ["token.authenticated", CALLBACK_KIND.MANDATE],
    ["token.cancellation_initiated", CALLBACK_KIND.MANDATE],
    ["payment.authorized", CALLBACK_KIND.PRESENTATION],
  ])("%s classifies as %s", (event, expected) => {
    expect(razorpayGateway.callbackKindFor({ event })).toBe(expected);
  });
});

describe("extractRef", () => {
  /**
   * `token.confirmed` carries nothing we can resolve on, and that is a FACT
   * about Razorpay rather than a gap to paper over.
   *
   * It matters that this is asserted rather than assumed: the activation path
   * was built on the belief that this callback could identify our mandate, and
   * it silently could not — the payer approved, the deposit was taken, and the
   * mandate stayed `pending` forever. Activation now runs off
   * `getMandateStatus` listing the customer's tokens, so this callback being
   * unresolvable costs nothing.
   */
  test("token.confirmed yields no reference — activation cannot depend on it", () => {
    const ref = razorpayGateway.extractRef(CALLBACK_KIND.MANDATE, tokenConfirmed());
    expect(ref.referenceId).toBeNull();
    // Only the bare token id; no customer id is present to compose with.
    expect(ref.providerMandateId).toBe("token_M7K2eFBU7vToaQ");
  });

  /**
   * A settlement callback DOES carry the payment entity, so our reference can
   * ride along in the order's `notes`.
   */
  test("our reference is recovered from notes on a payment callback", () => {
    const ref = razorpayGateway.extractRef(
      CALLBACK_KIND.PRESENTATION,
      paymentCaptured({ withNote: true })
    );
    expect(ref.referenceId).toBe(REF);
  });

  test("without the note there is nothing to resolve by — the reason it is sent", () => {
    const ref = razorpayGateway.extractRef(
      CALLBACK_KIND.PRESENTATION,
      paymentCaptured({ withNote: false })
    );
    expect(ref.referenceId).toBeNull();
  });

  /**
   * Both halves are needed: a token is addressed only as
   * `/customers/:cid/tokens/:tid`, and `presentDebit` sends `customer_id` and
   * `token` as separate fields.
   */
  test("the mandate id carries the customer/token pair when both are present", () => {
    const ref = razorpayGateway.extractRef(
      CALLBACK_KIND.PRESENTATION,
      paymentCaptured({ withNote: true })
    );
    expect(ref.providerMandateId).toBe(
      "cust_4xbQrmEoA5WJ01:token_M7K2eFBU7vToaQ"
    );
  });

  /**
   * The order id, not the payment id: the order is what the notification was
   * keyed on and what `presentDebit` sends as `order_id`, so it is what a
   * presentation or PDN callback has to route on.
   */
  test("the sequence id is the order id", () => {
    const ref = razorpayGateway.extractRef(
      CALLBACK_KIND.PRESENTATION,
      paymentCaptured({ withNote: true })
    );
    expect(ref.presentationSequenceId).toBe("order_1Aa00000000002");
  });

  /**
   * Razorpay's per-delivery id is the `x-razorpay-event-id` HEADER, which this
   * seam cannot see. The body-only substitute must still be stable across
   * redeliveries of the same event (that is what dedupe is for) and distinct
   * between the several events one payment produces.
   */
  test("the dedupe key is stable across redeliveries and distinct across events", () => {
    const body = paymentCaptured({ withNote: true });
    const first = razorpayGateway.extractRef(CALLBACK_KIND.PRESENTATION, body);
    const redelivery = razorpayGateway.extractRef(CALLBACK_KIND.PRESENTATION, body);
    expect(first.callbackTxnId).toBe(redelivery.callbackTxnId);

    const authorized = razorpayGateway.extractRef(CALLBACK_KIND.PRESENTATION, {
      ...body,
      event: "payment.authorized",
    });
    expect(authorized.callbackTxnId).not.toBe(first.callbackTxnId);
  });

  test("a body carrying nothing we route on yields nulls rather than throwing", () => {
    const ref = razorpayGateway.extractRef(CALLBACK_KIND.MANDATE, {});
    expect(ref.referenceId).toBeNull();
    expect(ref.providerMandateId).toBeNull();
    expect(ref.presentationSequenceId).toBeNull();
  });
});
