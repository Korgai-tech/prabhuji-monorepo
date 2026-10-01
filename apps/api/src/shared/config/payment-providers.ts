/**
 * The canonical list of payment-gateway identifiers.
 *
 * This lives in `shared/` — not in `core/payment/` — for exactly one reason:
 * the env schema in `shared/config/env.ts` needs it to build the
 * `PAYMENT_PROVIDER` enum, and `shared/` must never import `core/` (an
 * arch-boundary rule). `core/payment` imports this back to key its gateway
 * registry, so the list is defined ONCE and the config layer and the module
 * agree by construction rather than by two hand-synced literals.
 *
 * Adding a gateway is therefore: one entry here, one row in
 * `PROVIDER_REQUIRED_KEYS` (env.ts), and one entry in the `GATEWAYS` registry
 * (core/payment/gateways.ts). Nothing else lists provider names.
 */
export const PAYMENT_PROVIDERS = [
  "stub",
  "decentro",
  "cashfree",
  "razorpay",
] as const;

export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

/** Named constants so no string literal `"cashfree"` is retyped anywhere. */
export const PROVIDER = {
  STUB: "stub",
  DECENTRO: "decentro",
  CASHFREE: "cashfree",
  RAZORPAY: "razorpay",
} as const satisfies Record<string, PaymentProviderName>;

/** Narrowing guard for a value that may or may not name a known gateway. */
export function isPaymentProviderName(
  value: string
): value is PaymentProviderName {
  return (PAYMENT_PROVIDERS as readonly string[]).includes(value);
}
