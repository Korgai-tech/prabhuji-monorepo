import { PROVIDER } from "@api/shared/config";
import { CALLBACK_KIND, type CallbackKind } from "@api/core/payment/constants.js";
import type { CallbackRef } from "@api/core/payment/types";
import type { PaymentGateway } from "@api/core/payment/gateway.js";
import { UnverifiedAuthenticator } from "@api/core/payment/services/cashfree-callback-auth.js";
import { str } from "@api/core/payment/services/callback.service.js";
import { CashfreeMandateProvider } from "@api/core/payment/repositories/cashfree-mandate.repository.js";
import { isJsonObject } from "@api/core/payment/repositories/cashfree.client.js";
import {
  CASHFREE_MANDATE_EVENT_TYPES,
  CASHFREE_PRESENTATION_EVENT_TYPES,
} from "@api/core/payment/repositories/cashfree.constants.js";

/**
 * Cashfree gateway plug-in — the default real UPI Autopay provider.
 *
 * Bundles the adapter, the webhook authenticator, and Cashfree's (nested) body
 * parsing behind the provider-agnostic `PaymentGateway` seam.
 */
export const cashfreeGateway: PaymentGateway = {
  name: PROVIDER.CASHFREE,

  createProvider: () => new CashfreeMandateProvider(),

  // Unverified by design: this Cashfree account issues no webhook signing key,
  // so there is no secret to check against. Safe because the callback body is
  // never believed — CallbackService re-reads the provider's status API before
  // any entitlement moves. See UnverifiedAuthenticator's docblock.
  createCallbackAuthenticator: () => new UnverifiedAuthenticator(),

  extractRef: extractCashfreeRef,

  callbackKindFor,
};

/**
 * Pull the routing fields out of a Cashfree webhook body.
 *
 * Cashfree nests the payload under `data` with `subscription` / payment
 * sub-objects, so we search a small set of candidate scopes. `referenceId` is
 * OUR `subscription_id` (echoed back); `providerMandateId` is Cashfree's
 * `cf_subscription_id`; `callbackTxnId` is a per-event id used for dedupe.
 */
function extractCashfreeRef(
  kind: CallbackKind,
  body: Record<string, unknown>
): CallbackRef {
  const scopes = candidateScopes(body);
  return {
    kind,
    referenceId: pickAcross(scopes, ["subscription_id"]),
    providerMandateId: pickAcross(scopes, ["cf_subscription_id"]),
    // Cashfree's notify is synchronous, so it sends no PDN callback and there is
    // nothing here to route on. Null rather than omitted, so a future Cashfree
    // notification callback has an obvious place to land.
    presentationSequenceId: null,
    callbackTxnId: pickAcross(scopes, [
      "cf_payment_id",
      "payment_id",
      "event_id",
      "cf_event_id",
    ]),
    callbackAttempt: null,
    // Cashfree sends no delivery confirmation for a notification.
    notificationDeliveredAt: null,
  };
}

/**
 * Classify a Cashfree webhook by its top-level event `type`. Auth/status events
 * are mandate-lifecycle triggers; payment events are presentation triggers. An
 * unlisted type returns null → the endpoint acks 200 without acting.
 */
function callbackKindFor(body: Record<string, unknown>): CallbackKind | null {
  const type = str(body.type)?.toUpperCase();
  if (!type) return null;
  if (CASHFREE_MANDATE_EVENT_TYPES.includes(type)) return CALLBACK_KIND.MANDATE;
  if (CASHFREE_PRESENTATION_EVENT_TYPES.includes(type)) {
    return CALLBACK_KIND.PRESENTATION;
  }
  return null;
}

/** The objects a routing field might live in: the body and its nested payloads. */
function candidateScopes(
  body: Record<string, unknown>
): Record<string, unknown>[] {
  const scopes: Record<string, unknown>[] = [body];
  const data = body.data;
  if (isJsonObject(data)) {
    scopes.push(data);
    for (const key of [
      "subscription",
      "subscription_details",
      "subscription_payment",
      "payment",
    ]) {
      const nested = data[key];
      if (isJsonObject(nested)) scopes.push(nested);
    }
  }
  return scopes;
}

/** First non-empty string for any of `keys`, across the candidate scopes. */
function pickAcross(
  scopes: Record<string, unknown>[],
  keys: readonly string[]
): string | null {
  for (const scope of scopes) {
    for (const key of keys) {
      const found = str(scope[key]);
      if (found) return found;
    }
  }
  return null;
}
