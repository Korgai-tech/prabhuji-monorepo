import type { Env, PaymentProviderName } from "@api/shared/config";
import type { CallbackRef } from "@api/core/payment/types";
import type { MandateProvider } from "@api/core/payment/mandate.provider.js";
import type { CallbackKind } from "@api/core/payment/constants.js";

/**
 * The payment-gateway plug-in seam.
 *
 * A `PaymentGateway` bundles EVERYTHING provider-specific behind provider-
 * agnostic interfaces: the mandate adapter, how its webhooks authenticate, how
 * to read its webhook body, and how to classify a webhook. The composition root
 * (`initPaymentModule`), the single callback controller, and `CallbackService`
 * consume a gateway and contain no `if (provider === ...)` branches.
 *
 * Adding a provider = implement one `PaymentGateway` and add it to the
 * `GATEWAYS` registry (`gateways.ts`). No route, controller, or service edit.
 *
 * Design: this is the Strategy behind an Abstract Factory — `createProvider` /
 * `createCallbackAuthenticator` are factory methods producing a coherent family
 * (adapter + matching auth scheme) that can never be mismatched.
 */
export interface PaymentGateway {
  /** Registry key and `MandateProvider.name`; matches `PAYMENT_PROVIDER`. */
  readonly name: PaymentProviderName;

  /** The mandate adapter (a `repositories/` class speaking domain types). */
  createProvider(): MandateProvider;

  /** How this gateway's webhooks are authenticated (token+IP vs HMAC). */
  createCallbackAuthenticator(env: Env): CallbackAuthenticator;

  /**
   * Pull the routing fields out of an (untrusted) webhook body. The body is
   * never believed — these only decide which mandate/debit to ask the
   * provider's status API about.
   */
  extractRef(kind: CallbackKind, body: Record<string, unknown>): CallbackRef;

  /**
   * Classify a webhook as mandate-lifecycle vs debit-presentation from its own
   * payload. `null` = not routable (ignore it); the shared endpoint responds
   * 200 without acting.
   */
  callbackKindFor(body: Record<string, unknown>): CallbackKind | null;
}

/**
 * The minimal, framework-agnostic view of an inbound webhook an authenticator
 * needs. Deliberately NOT `FastifyRequest`: keeping the seam to primitives
 * keeps authenticators in `services/` free of a web-framework dependency and
 * trivially unit-testable. The controller builds this from the request.
 */
export interface CallbackAuthContext {
  /** Lower-cased header map (Fastify normalises names). */
  readonly headers: Record<string, string | string[] | undefined>;
  /** The exact raw request bytes — required for HMAC signature verification. */
  readonly rawBody: string | undefined;
  /** The resolved client IP (last trusted X-Forwarded-For hop, or socket). */
  readonly sourceIp: string;
}

/**
 * Verify a webhook is authentic. Three implementations: `TokenIpAuthenticator`
 * (static token + IP allowlist, Decentro), `UnverifiedAuthenticator` (accepts
 * everything — what Cashfree wires, because that account issues no signing key),
 * and `HmacAuthenticator` (signed body; currently unwired, ready for a provider
 * that does sign). `false` → the controller responds 401.
 */
export interface CallbackAuthenticator {
  authenticate(ctx: CallbackAuthContext): boolean;
}
