import { PROVIDER, type PaymentProviderName } from "@api/shared/config";
import type { PaymentGateway } from "./gateway.js";
import { stubGateway } from "./providers/stub.gateway.js";
import { decentroGateway } from "./providers/decentro.gateway.js";
import { cashfreeGateway } from "./providers/cashfree.gateway.js";
import { razorpayGateway } from "./providers/razorpay.gateway.js";

/**
 * The payment-gateway registry — the single point of provider selection.
 *
 * The composition root looks a gateway up by `PAYMENT_PROVIDER` (see
 * `initPaymentModule`); the callback endpoint resolves the `:provider` path
 * param against it. Adding a provider is one entry here plus its
 * `PAYMENT_PROVIDERS` tuple entry and `PROVIDER_REQUIRED_KEYS` row — nothing
 * else in the module changes.
 */
export const GATEWAYS = {
  [PROVIDER.STUB]: stubGateway,
  [PROVIDER.DECENTRO]: decentroGateway,
  [PROVIDER.CASHFREE]: cashfreeGateway,
  [PROVIDER.RAZORPAY]: razorpayGateway,
} as const satisfies Record<PaymentProviderName, PaymentGateway>;

/** Resolve the active gateway. Total over `PaymentProviderName` by construction. */
export function gatewayFor(name: PaymentProviderName): PaymentGateway {
  return GATEWAYS[name];
}
