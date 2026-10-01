import type {
  PaywallConfigProvider,
  PaywallService,
} from "@api/core/paywall/services";
import { DEFAULT_PAYWALL_ID } from "@api/core/paywall/services";
import type { PaywallConfigRepository } from "@api/core/paywall/repositories";
import type { PurchasablePlan } from "@api/core/paywall/types";
import type { IPaywallApi } from "./paywall.api.js";

/**
 * Facade implementation — thin passthrough handles to the module's
 * singletons (provider + response-cache service) built in the composition
 * root. Constructed once at boot; the routes/controller pull the service
 * per-request, and any cross-module caller reads through this facade.
 */
export class PaywallApi implements IPaywallApi {
  constructor(
    private readonly provider: PaywallConfigProvider,
    private readonly service: PaywallService,
    private readonly repo: PaywallConfigRepository
  ) {}

  getConfigProvider(): PaywallConfigProvider {
    return this.provider;
  }

  /**
   * Reads the repository directly rather than going through the cached
   * provider. Pricing is read once per purchase attempt, so the cache buys
   * nothing — and serving a stale amount after a price change would charge the
   * old price for up to the cache TTL.
   */
  async getPurchasablePlans(
    paywallId: string = DEFAULT_PAYWALL_ID
  ): Promise<PurchasablePlan[]> {
    return this.repo.findPurchasablePlans(paywallId);
  }

  async resolvePaywallIdForUser(userId: string | undefined): Promise<string> {
    return this.service.resolvePaywallIdForUser(userId);
  }

  invalidateResponseCache(paywallId: string = DEFAULT_PAYWALL_ID): void {
    this.service.invalidateResponseCache(paywallId);
  }

  invalidate(paywallId: string = DEFAULT_PAYWALL_ID): void {
    // Order: response cache first, then raw-row cache. If a concurrent
    // request lands between these two calls, the response cache is already
    // gone (worst case: one extra provider read; no stale wire response).
    this.service.invalidateResponseCache(paywallId);
    this.provider.invalidate({ paywallId });
  }
}
