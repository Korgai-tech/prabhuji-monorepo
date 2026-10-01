import { randomUUID } from "node:crypto";
import { getRedis } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("payment:billing-lock");

/**
 * The lock key. Every task sweeping the same rows must pick the same one for
 * the lock to mean anything.
 *
 * Scoped by provider when a run is restricted to one gateway (`--provider`),
 * because two such runs touch disjoint row sets and serialising them would make
 * one gateway's incident stall the other's revenue — the opposite of why the
 * filter exists. A full sweep takes the unscoped key and is therefore mutually
 * exclusive with everything, which is the safe default.
 */
function lockKey(scope: string | null): string {
  return scope ? `payment:billing:lock:${scope}` : "payment:billing:lock";
}

/**
 * Coarse mutual exclusion for the billing cycle.
 *
 * The scheduler is a one-off ECS task fired by EventBridge, which does NOT
 * guarantee non-overlap: a run that outlives its slot is re-entered while it is
 * still working. This is that guard.
 *
 * It is a CONVENIENCE, not the guarantee — and the distinction matters enough
 * to state plainly. What actually makes double-charging impossible is the
 * `(mandate_id, cycle_date)` unique constraint that `claimCycle` inserts
 * against (see `repositories/payment-attempt.repository.ts`), which holds even
 * when this lock is unavailable, disabled, or flushed. Nothing here may ever
 * become load-bearing for correctness; if Redis is down we would rather run the
 * cycle than skip a month of revenue.
 *
 * Follows `core/otp/services/rate-limiter.ts`: reads `getRedis()` per call and
 * degrades to a no-op when Redis is off, which is the normal local-dev state.
 */
export class BillingLock {
  /**
   * TTL is a ceiling on how long a crashed holder can block the next run, so
   * it should sit just under the schedule interval: long enough that a healthy
   * run never has its own lock expire underneath it, short enough that a task
   * killed mid-run doesn't cost more than one tick.
   */
  constructor(private readonly ttlMs: number) {}

  /**
   * Take the lock, returning a release function, or null when someone else
   * holds it.
   *
   * The token is what makes release safe. Deleting the key unconditionally
   * would let a run whose TTL had already expired delete its SUCCESSOR's lock
   * on the way out, which is worse than having no lock at all — it converts a
   * rare overlap into a guaranteed one.
   */
  async acquire(scope: string | null = null): Promise<(() => Promise<void>) | null> {
    const redis = getRedis();
    if (!redis) {
      log.warn(
        { event: "billing_lock_disabled" },
        "billing lock no-op (ENABLE_REDIS=false) — relying on the cycle-date unique constraint"
      );
      return async () => {};
    }

    const key = lockKey(scope);
    const token = randomUUID();
    const acquired = await redis.set(key, token, "PX", this.ttlMs, "NX");
    if (acquired !== "OK") {
      log.warn(
        { event: "billing_lock_busy", lock_key: key },
        "another billing run holds the lock — skipping this tick"
      );
      return null;
    }

    return async () => {
      // Compare-and-delete, atomically. `GET` then `DEL` from the client would
      // reopen the exact window this token exists to close.
      await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
           return redis.call("del", KEYS[1])
         else
           return 0
         end`,
        1,
        key,
        token
      );
    };
  }
}
