import { LRUCache } from "lru-cache";

/**
 * Small TTL LRU used by the paywall config provider.
 *
 * Sized for one paywall (`vip-membership-v1`) × 8 supported locales × 5 keys
 * (config + plans + benefits + translation + legal), which is well under the
 * 256-entry cap. The cap exists as a safety net if we ever key on more than
 * one paywallId — LRU eviction kicks in long before we hit it.
 *
 * TTL is 5 minutes: paywall config changes are rare (ops workflow, not
 * per-request) and the cache is cleared explicitly via `invalidate` when a
 * CMS write lands, so the TTL is mainly a "self-healing" backstop that
 * bounds staleness after a process restart missed the invalidation signal.
 *
 * In-process — see the spec's #PATH_DECISION: multi-instance consistency
 * isn't a Phase 1 concern (paywall config is tiny; cache warmth is fast).
 *
 * Storage detail: lru-cache v11 constrains the value type to `NonNullable<>`
 * (extends `{}`), so `null` results ("this paywallId doesn't exist") can't
 * be stored directly. We wrap every value in a `{ value }` sentinel — that
 * way `null` still fits and the provider can distinguish a cache miss
 * (`undefined`) from a cached null (`{ value: null }`).
 */

export const PAYWALL_CACHE_TTL_MS = 5 * 60 * 1000;
export const PAYWALL_CACHE_MAX_ENTRIES = 256;

interface Wrapped<T> {
  value: T;
}

export class PaywallLruCache {
  private readonly store: LRUCache<string, Wrapped<unknown>>;

  constructor(options: { ttlMs?: number; maxEntries?: number } = {}) {
    this.store = new LRUCache<string, Wrapped<unknown>>({
      max: options.maxEntries ?? PAYWALL_CACHE_MAX_ENTRIES,
      ttl: options.ttlMs ?? PAYWALL_CACHE_TTL_MS,
      // Return stale-then-fresh disabled: readers must always see a fresh
      // value or a miss so invalidation semantics stay strict.
      allowStale: false,
    });
  }

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (hit === undefined) return undefined;
    return hit.value as T;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, { value });
  }

  /**
   * Delete every key whose string starts with `prefix`. Used by the provider
   * to clear all keys for one `paywallId` in a single sweep.
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    // `keys()` returns an iterator over live (non-expired) keys — snapshot to
    // an array first so we don't mutate the map while iterating.
    const snapshot = Array.from(this.store.keys());
    for (const key of snapshot) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count += 1;
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  /** Test-only helper to inspect the current size. */
  size(): number {
    return this.store.size;
  }
}
