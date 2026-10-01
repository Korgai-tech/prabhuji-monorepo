import { PROVIDER } from "@api/shared/config";
import { CALLBACK_KIND, type CallbackKind } from "@api/core/payment/constants.js";
import type { CallbackRef } from "@api/core/payment/types";
import type { PaymentGateway } from "@api/core/payment/gateway.js";
import { RazorpaySignatureAuthenticator } from "@api/core/payment/services/razorpay-callback-auth.js";
import { str } from "@api/core/payment/services/callback.service.js";
import {
  composeMandateRef,
  RazorpayMandateProvider,
} from "@api/core/payment/repositories/razorpay-mandate.repository.js";
import { isJsonObject } from "@api/core/payment/repositories/razorpay.client.js";
import {
  RAZORPAY_NOTE_KEY,
  RAZORPAY_PDN_DELIVERED_EVENT,
  razorpayEventKind,
} from "@api/core/payment/repositories/razorpay.constants.js";

/**
 * Razorpay gateway plug-in.
 *
 * Bundles the adapter, the HMAC webhook authenticator, and Razorpay's
 * (`payload.<entity>.entity`) body parsing behind the provider-agnostic
 * `PaymentGateway` seam.
 */
export const razorpayGateway: PaymentGateway = {
  name: PROVIDER.RAZORPAY,

  createProvider: () => new RazorpayMandateProvider(),

  // Razorpay always issues a webhook signing key, so — unlike Cashfree — there
  // is no unverified posture here. A missing secret rejects; see the
  // authenticator's docblock.
  createCallbackAuthenticator: (env) =>
    new RazorpaySignatureAuthenticator(env.RAZORPAY_WEBHOOK_SECRET),

  extractRef: extractRazorpayRef,

  callbackKindFor,
};

/**
 * Classify a Razorpay webhook by its `event` name.
 *
 * ORDER MATTERS, most-specific-first, and an unrecognised body returns `null` —
 * NO kind is ever the fallback. A body we do not understand must not be handed
 * to the code that settles money; the controller acks 200 and logs it
 * unclassified, which is the honest answer.
 *
 * Matched on EXACT event names (`razorpayEventKind`), never prefixes. Razorpay's
 * `payment.` namespace also holds `payment.dispute.*` and `payment.downtime.*`,
 * and a `payment.` prefix swept every one of those into PRESENTATION — the
 * handler that settles a debit. A dispute carries presentation-shaped keys, so it
 * would have resolved to a real mandate and been handed to the settlement path
 * for a debit that already completed; `docs/PAYMENT-FLOW.md` documents exactly
 * that hazard for Decentro refunds. A prefix is a fallback wearing a disguise —
 * it silently claims every event Razorpay adds under that namespace in future.
 *
 * The full event set Razorpay can deliver: `token.confirmed`, `token.rejected`,
 * `token.cancelled`, `token.paused`, `payment.authorized`, `payment.captured`,
 * `payment.failed`, `order.paid`, `invoice.paid`, `invoice.expired`,
 * `order.notification.delivered`, `order.notification.failed`. `invoice.*` is
 * deliberately unclassified — we raise no invoices, and a body we do not
 * understand is better ignored than guessed at.
 *
 * NOTE: there is no `token.resumed` event. Coming off `paused` is OBSERVED on
 * the next status read, never announced, so nothing may wait for one.
 */
function callbackKindFor(body: Record<string, unknown>): CallbackKind | null {
  const payload = childObject(body, "payload");
  const event = str(body.event) ?? "";

  // The notification ENTITY outranks the event name: it is the stronger signal
  // and it is present on exactly the deliveries that are about a notification.
  if (isJsonObject(childObject(payload, "notification").entity)) {
    return CALLBACK_KIND.PDN;
  }

  switch (razorpayEventKind(event)) {
    case "pdn":
      return CALLBACK_KIND.PDN;
    case "mandate":
      return CALLBACK_KIND.MANDATE;
    case "presentation":
      return CALLBACK_KIND.PRESENTATION;
    default:
      return null;
  }
}

/**
 * Pull the ROUTING fields out of a Razorpay webhook body.
 *
 * Routing only, never state: nothing here is believed. These values decide which
 * mandate or debit `CallbackService` asks Razorpay's status API about, and the
 * API's answer is what moves entitlement.
 *
 * Razorpay nests every entity as `payload.<name>.entity`, so the four we care
 * about are read from fixed positions rather than searched for.
 *
 * ## Two decisions worth reading before changing anything here
 *
 * **`providerMandateId` is the COMPOSITE `cust_xxx:token_xxx`, not the bare
 * token id.** Every per-mandate Razorpay call needs both halves — a token is
 * addressed as `/customers/:cid/tokens/:tid`, and the recurring-payment body
 * takes `customer_id` and `token` as separate fields — while `MandateProvider`
 * gives an adapter exactly one opaque id to work with. This callback is the only
 * place both halves are ever in the same payload, so it is the only place the
 * pair can be captured. Falls back to the bare token id when the customer id is
 * absent, and `parseMandateRef` accepts either.
 *
 * **`callbackTxnId` is derived from the BODY, not from the delivery header.**
 * Razorpay's true per-delivery id is `X-Razorpay-Event-Id`, and it is the right
 * dedupe key — but `extractRef(kind, body)` is handed the parsed body and
 * nothing else, so the header is simply not reachable from this seam. The
 * `event + entity id` pair is the best body-only substitute: it is stable across
 * Razorpay's redeliveries of the same event (which is what dedupe is for) and
 * distinct between the several events one payment produces. Widening the seam to
 * pass headers would be the real fix; until then this is deliberate, not an
 * oversight.
 */
function extractRazorpayRef(
  kind: CallbackKind,
  body: Record<string, unknown>
): CallbackRef {
  const payload = childObject(body, "payload");
  const token = entityOf(payload, "token");
  const payment = entityOf(payload, "payment");
  const order = entityOf(payload, "order");
  const notification = entityOf(payload, "notification");
  const event = str(body.event);

  const tokenId =
    str(token.id) ?? str(payment.token_id) ?? str(notification.token_id);
  const customerId = str(token.customer_id) ?? str(payment.customer_id);

  return {
    kind,
    // OUR reference, from `notes` — the only field Razorpay echoes that we
    // control. Every order we create carries it (registration and each cycle's
    // notification), and an order's notes ride along on the PAYMENT entity its
    // webhooks deliver, which is what lets a settlement callback resolve.
    //
    // IT DOES NOT RESCUE `token.confirmed`, and it is worth being explicit
    // because assuming otherwise cost a whole broken activation path. That
    // payload carries `payload.token.entity` and nothing else; a token entity
    // has no `notes` and no `customer_id`, so NOTHING in it can be matched back
    // to our mandate. Activation therefore does not run off a callback at all —
    // `getMandateStatus` discovers the approved token by listing the customer's
    // tokens, driven by our own poll. See plan finding R8.
    //
    // `order.receipt` is kept only as a last resort and will usually MISS: it is
    // the registration or notification receipt (a hash), never the mandate's
    // `pj_mnd_…` reference.
    referenceId: noteReference(payment, order, token) ?? str(order.receipt) ?? null,
    providerMandateId:
      customerId && tokenId ? composeMandateRef(customerId, tokenId) : tokenId,
    // The ORDER id — that is what the notification was keyed on and what
    // `presentDebit` sends as `order_id`, so it is what a presentation or PDN
    // callback has to route on.
    presentationSequenceId:
      str(payment.order_id) ?? str(notification.order_id) ?? str(order.id),
    callbackTxnId: bodyDedupeKey(event, payment, notification, token, order),
    // Razorpay does not put a delivery attempt count in the body.
    callbackAttempt: null,
    notificationDeliveredAt: deliveredAt(event, body),
  };
}

/**
 * The instant the pre-debit notification reached the payer, from a delivery
 * confirmation — `null` for every other event, including its sibling
 * `order.notification.failed`, which says the opposite.
 *
 * Razorpay stamps webhooks with a top-level `created_at` in UNIX SECONDS. Read
 * from the body rather than taken as "now" on receipt, because a redelivery
 * hours later would otherwise push the presentation window that much further
 * out for a notification that landed on time.
 *
 * Guarded on being a finite number: `new Date(NaN * 1000)` is an Invalid Date,
 * and one of those written to `scheduled_debit_at` compares false against every
 * instant, so the presentation gate would pass or fail at random rather than
 * fail loudly.
 */
function deliveredAt(
  event: string | null,
  body: Record<string, unknown>
): Date | null {
  if (event !== RAZORPAY_PDN_DELIVERED_EVENT) return null;
  const seconds = body.created_at;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/**
 * Our reference id out of whichever entity's `notes` carries it.
 *
 * Payment first: it is the entity present on the widest set of events, and it
 * inherits its order's notes. Order and token are checked after so a body that
 * only carries one of those still resolves.
 */
function noteReference(
  ...entities: Record<string, unknown>[]
): string | null {
  for (const entity of entities) {
    const notes = entity.notes;
    if (!isJsonObject(notes)) continue;
    const found = str(notes[RAZORPAY_NOTE_KEY.referenceId]);
    if (found) return found;
  }
  return null;
}

/** `<event>:<the most specific entity id present>`, or null if neither exists. */
function bodyDedupeKey(
  event: string | null,
  payment: Record<string, unknown>,
  notification: Record<string, unknown>,
  token: Record<string, unknown>,
  order: Record<string, unknown>
): string | null {
  const entityId =
    str(payment.id) ?? str(notification.id) ?? str(token.id) ?? str(order.id);
  if (!event && !entityId) return null;
  return `${event ?? "unknown"}:${entityId ?? "unknown"}`;
}

/** `payload.<name>.entity`, or `{}` so every reader stays null-safe. */
function entityOf(
  payload: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  return childObject(childObject(payload, name), "entity");
}

function childObject(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const inner = obj[key];
  return isJsonObject(inner) ? inner : {};
}
