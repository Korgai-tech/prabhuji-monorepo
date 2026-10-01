import type { PaywallConfigProvider } from "@api/core/paywall/services";
import type { PurchasablePlan } from "@api/core/paywall/types";

/**
 * Public facade for the paywall module.
 *
 * Cross-module consumers (Phase-2 admin CMS routes, other backend modules)
 * reach the paywall via this handle:
 *   `performServiceCall("paywall", api => api.getConfigProvider().getConfig(…), …)`
 *
 * `getConfigProvider()` is the TAM-46 shape — the raw-row provider. TAM-45
 * added `invalidateResponseCache` so a CMS write hook (or an integration
 * test) can force the response-level cache built on top of the provider to
 * refresh; the provider's own raw-row cache lives on `getConfigProvider()`.
 * Both should typically be cleared together — see `PaywallApi.invalidate`
 * for the "wipe everything" helper.
 */
export interface IPaywallApi {
  getConfigProvider(): PaywallConfigProvider;
  /**
   * Enabled plans with their machine-readable price, for the payment module.
   *
   * Locale-independent by design: what we charge must not depend on which
   * language the client asked for. `core/payment` calls this to resolve a
   * `planId` into an amount, so the client only ever sends the plan.
   */
  getPurchasablePlans(paywallId?: string): Promise<PurchasablePlan[]>;
  /**
   * Which paywall the user is ASSIGNED to (TAM-159 bucketing), for callers that
   * need the A/B arm as a dimension rather than a screen to render — today the
   * backend payment analytics, which stamps it on `bk_trial_success` and
   * `bk_subscription_started`.
   *
   * NOT app-version gated (see `PaywallService.resolvePaywallIdForUser`): the
   * callers are a provider callback and the billing sweep, neither of which has
   * a client `app_version`. Fails soft to the default rather than throwing.
   */
  resolvePaywallIdForUser(userId: string | undefined): Promise<string>;
  /**
   * Wipe the composed-response cache for `paywallId` (defaults to the
   * singleton `vip-membership-v1`). Complement to
   * `getConfigProvider().invalidate(...)` — CMS write hooks should call
   * `invalidate` (below) which clears both.
   */
  invalidateResponseCache(paywallId?: string): void;
  /**
   * Full invalidation: clears BOTH the raw-row provider cache AND the
   * response cache. This is the entry point a CMS write handler wires to.
   */
  invalidate(paywallId?: string): void;
}
