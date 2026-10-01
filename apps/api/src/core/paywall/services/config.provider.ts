import { createModuleLogger } from "@api/shared/logs";
import type { PaywallConfigRepository } from "@api/core/paywall/repositories";
import type {
  RawBenefit,
  RawHeroMedia,
  RawLegalLinks,
  RawPaywallConfig,
  RawPlan,
  RawTranslation,
} from "@api/core/paywall/types";
import { PaywallLruCache } from "@api/core/paywall/services/cache";

const log = createModuleLogger("paywall:provider");

/**
 * The contract with TAM-45.
 *
 * TAM-45's controller/service consumes ONLY through this interface (never
 * Prisma directly). If we ever swap Postgres for an external CMS
 * (Strapi/Directus/AppConfig), we ship a new implementation class and swap
 * it in the composition root — no route or client change.
 *
 * All methods are Prisma-free at the interface level; the default
 * implementation (`DbPaywallConfigProvider`) delegates to the repository +
 * caches the result. Locale fallback is intentionally NOT handled here —
 * consumers own the resolution so this provider caches raw `(paywallId,
 * locale)` reads without cache-key blow-up. See spec Notes.
 */
export interface PaywallConfigProvider {
  getConfig(input: { paywallId: string }): Promise<RawPaywallConfig | null>;
  /**
   * TAM-159. `paywallId` is the CANONICAL paywall owning the plan rows (and so
   * the price); `variantPaywallId` selects only which copy row wins. Defaults to
   * `paywallId`, which is the pre-variant behaviour exactly.
   */
  getEnabledPlans(input: {
    paywallId: string;
    locale: string;
    variantPaywallId?: string;
  }): Promise<RawPlan[]>;
  /** TAM-159. Ordered hero assets for one `(paywallId, locale)`. Empty is a valid answer. */
  getHeroMedia(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawHeroMedia[]>;
  getEnabledBenefits(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawBenefit[]>;
  getTranslation(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawTranslation | null>;
  getLegalLinks(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawLegalLinks | null>;
  /**
   * Wipe every cache key for `paywallId`. Called from a CMS write hook (Phase
   * 2). No-op when the paywall id has no cached keys — safe to call any time.
   */
  invalidate(input: { paywallId: string }): void;
}

/**
 * DB-backed implementation of `PaywallConfigProvider`.
 *
 * Caching strategy:
 *   - One key per (query, paywallId, locale). See `keyFor*` below.
 *   - TTL 5 min (see `cache.ts`); explicit `invalidate` clears all keys for a
 *     paywallId in one call.
 *   - Cache holds raw repository return values (arrays, objects, or `null`);
 *     `null` IS cached because "no config for this paywall" is a stable answer
 *     until an invalidation lands.
 */
export class DbPaywallConfigProvider implements PaywallConfigProvider {
  constructor(
    private readonly repo: PaywallConfigRepository,
    private readonly cache: PaywallLruCache = new PaywallLruCache()
  ) {}

  async getConfig(input: { paywallId: string }): Promise<RawPaywallConfig | null> {
    const key = keyForConfig(input.paywallId);
    const hit = this.cache.get<RawPaywallConfig | null>(key);
    if (hit !== undefined) return hit;
    const value = await this.repo.findConfig(input.paywallId);
    this.cache.set(key, value);
    return value;
  }

  async getEnabledPlans(input: {
    paywallId: string;
    locale: string;
    variantPaywallId?: string;
  }): Promise<RawPlan[]> {
    // Keyed on the VARIANT, not the canonical paywall: two variants sharing the
    // same plan rows still resolve different copy, so a key on `paywallId` alone
    // would serve the first variant's wording to the second.
    const variantPaywallId = input.variantPaywallId ?? input.paywallId;
    const key = keyForPlans(variantPaywallId, input.locale);
    const hit = this.cache.get<RawPlan[]>(key);
    if (hit !== undefined) return hit;
    const value = await this.repo.findEnabledPlansWithTranslations(
      input.paywallId,
      input.locale,
      variantPaywallId
    );
    this.cache.set(key, value);
    return value;
  }

  async getHeroMedia(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawHeroMedia[]> {
    const key = keyForHeroMedia(input.paywallId, input.locale);
    const hit = this.cache.get<RawHeroMedia[]>(key);
    if (hit !== undefined) return hit;
    const value = await this.repo.findHeroMedia(input.paywallId, input.locale);
    this.cache.set(key, value);
    return value;
  }

  async getEnabledBenefits(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawBenefit[]> {
    const key = keyForBenefits(input.paywallId, input.locale);
    const hit = this.cache.get<RawBenefit[]>(key);
    if (hit !== undefined) return hit;
    const value = await this.repo.findEnabledBenefitsWithTranslations(
      input.paywallId,
      input.locale
    );
    this.cache.set(key, value);
    return value;
  }

  async getTranslation(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawTranslation | null> {
    const key = keyForTranslation(input.paywallId, input.locale);
    const hit = this.cache.get<RawTranslation | null>(key);
    if (hit !== undefined) return hit;
    const value = await this.repo.findTranslation(input.paywallId, input.locale);
    this.cache.set(key, value);
    return value;
  }

  async getLegalLinks(input: {
    paywallId: string;
    locale: string;
  }): Promise<RawLegalLinks | null> {
    const key = keyForLegal(input.paywallId, input.locale);
    const hit = this.cache.get<RawLegalLinks | null>(key);
    if (hit !== undefined) return hit;
    const value = await this.repo.findLegalLinks(input.paywallId, input.locale);
    this.cache.set(key, value);
    return value;
  }

  invalidate(input: { paywallId: string }): void {
    // Every cache key we set starts with one of six kind-prefixes followed
    // by the paywall id: `config:<id>`, `plans:<id>:<locale>`,
    // `benefits:<id>:<locale>`, `translation:<id>:<locale>`,
    // `legal:<id>:<locale>`, `hero:<id>:<locale>`. Sweep each shape — LRU is
    // small (<256) so this is O(entries * kinds), effectively negligible.
    //
    // A new key shape MUST be added here. A missing prefix does not fail loudly;
    // it just serves that slice stale for up to the 5-minute TTL, which reads as
    // "the CMS save didn't take" and is diagnosed as a caching bug days later.
    const prefixes = [
      `config:${input.paywallId}`,
      `plans:${input.paywallId}:`,
      `benefits:${input.paywallId}:`,
      `translation:${input.paywallId}:`,
      `legal:${input.paywallId}:`,
      `hero:${input.paywallId}:`,
    ];
    let count = 0;
    for (const prefix of prefixes) {
      count += this.cache.deleteByPrefix(prefix);
    }
    log.info(
      { paywall_id: input.paywallId, entries_cleared: count },
      "paywall cache invalidated"
    );
  }
}

// ---- cache-key helpers (exported for tests) --------------------------------

export function keyForConfig(paywallId: string): string {
  return `config:${paywallId}`;
}

export function keyForPlans(paywallId: string, locale: string): string {
  return `plans:${paywallId}:${locale}`;
}

export function keyForBenefits(paywallId: string, locale: string): string {
  return `benefits:${paywallId}:${locale}`;
}

export function keyForTranslation(paywallId: string, locale: string): string {
  return `translation:${paywallId}:${locale}`;
}

export function keyForLegal(paywallId: string, locale: string): string {
  return `legal:${paywallId}:${locale}`;
}

export function keyForHeroMedia(paywallId: string, locale: string): string {
  return `hero:${paywallId}:${locale}`;
}

