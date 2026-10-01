import { PROVIDER } from "@api/shared/config";
import { CALLBACK_KIND, type CallbackKind } from "@api/core/payment/constants.js";
import type { PaymentGateway } from "@api/core/payment/gateway.js";
import {
  parseCidrList,
  TokenIpAuthenticator,
} from "@api/core/payment/services/callback-auth.js";
import { extractRef } from "@api/core/payment/services/callback.service.js";
import { DecentroMandateProvider } from "@api/core/payment/repositories/decentro-mandate.repository.js";
import { DECENTRO_CALLBACK_FIELDS } from "@api/core/payment/repositories/decentro.constants.js";

/**
 * Decentro gateway plug-in — the production UPI Autopay provider.
 *
 * Bundles the adapter, the static-token+IP authenticator, and Decentro's body
 * parsing behind the provider-agnostic `PaymentGateway` seam.
 */
export const decentroGateway: PaymentGateway = {
  name: PROVIDER.DECENTRO,

  createProvider: () => new DecentroMandateProvider(),

  createCallbackAuthenticator: (env) =>
    new TokenIpAuthenticator({
      token: env.PAYMENT_CALLBACK_TOKEN,
      headerName: env.PAYMENT_CALLBACK_HEADER,
      allowedCidrs: parseCidrList(env.PAYMENT_CALLBACK_IP_ALLOWLIST),
    }),

  extractRef,

  callbackKindFor,
};

/**
 * Classify a Decentro callback from its body.
 *
 * Decentro posts every kind to the single `:provider` endpoint and does not label
 * them, so the kind is inferred from WHICH STATUS FIELD the payload carries.
 *
 * ORDER MATTERS, most-specific-first. A presentation callback also echoes the
 * mandate id and the notification's sequence id, so a looser check would claim it.
 *
 * WHAT CHANGED AND WHY. This was a two-way split with PRESENTATION as the
 * FALLBACK — anything without `mandate_status` was called a presentation. A PDN
 * callback carries `notification_status`, so every one was routed to the settlement
 * handler: it looked for a submitted debit, found none, fell through to a mandate
 * refresh, burned the dedupe key, and recorded the `presentation_sequence_id`
 * NOWHERE. The asynchronous notify flow had no inbound path, and the symptom was
 * indistinguishable from Decentro not sending the callback.
 *
 * An unrecognised body now returns `null`, which the controller acks 200 and logs
 * as unclassified. That is the honest answer, and it is strictly better than
 * guessing `presentation`: a body we do not understand must not be handed to the
 * code that settles money.
 *
 * NOT HANDLED: refunds. We raise none through Decentro. If that changes, a refund
 * callback carries presentation-shaped keys and its status tokens must be checked
 * FIRST, or it will be read as the original debit and overwrite that debit's
 * outcome with the refund's.
 */
function callbackKindFor(body: Record<string, unknown>): CallbackKind | null {
  const F = DECENTRO_CALLBACK_FIELDS;
  if (F.presentationStatus in body) return CALLBACK_KIND.PRESENTATION;
  if (F.notificationStatus in body) return CALLBACK_KIND.PDN;
  if (F.mandateStatus in body) return CALLBACK_KIND.MANDATE;
  return null;
}
