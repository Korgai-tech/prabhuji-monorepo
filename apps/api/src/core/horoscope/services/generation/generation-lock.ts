import { randomUUID } from "node:crypto";
import { getRedis } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("horoscope:generation-lock");

/**
 * Single-flight guard for daily-content generation, per `(zodiacId, dateIst)`.
 *
 * Generation is triggered by USER REQUESTS, so the natural failure is a
 * thundering herd: at IST midnight every request for a sign misses, and without
 * this each one starts its own generation. That is a dozen redundant model calls
 * per sign and a dozen racing writes.
 *
 * It is a CONVENIENCE, not the guarantee — the same distinction `BillingLock`
 * draws, and worth repeating. What actually makes duplicate content impossible
 * is the `daily_horoscope_result_unique` constraint on
 * `(zodiacId, modeId, dateIst, languageCode)`: a lost race surfaces as a 409
 * from `createResult`, which the generator treats as "someone else won" and
 * re-reads. Nothing here may become load-bearing for correctness; when Redis is
 * off (the normal local-dev state) this degrades to a no-op and the constraint
 * still holds.
 *
 * Follows `core/payment/services/billing-lock.ts`: `getRedis()` per call, token
 * compare-and-delete on release.
 */
export class HoroscopeGenerationLock {
  /**
   * TTL is a ceiling on how long a crashed holder blocks the next attempt. It
   * must exceed a realistic generation (one call producing four languages, plus
   * one regeneration) or a healthy run loses its own lock
   * mid-flight and a second run starts underneath it.
   */
  constructor(private readonly ttlMs: number = 180_000) {}

  /** Take the lock for a key, or get null when another run holds it. */
  async acquire(
    zodiacId: string,
    dateIst: string
  ): Promise<(() => Promise<void>) | null> {
    const redis = getRedis();
    if (!redis) {
      // No warn-log here (unlike BillingLock): this path runs on ordinary user
      // requests in local dev, and logging per request would be noise.
      return async () => {};
    }

    const key = `horoscope:generate:${dateIst}:${zodiacId}`;
    const token = randomUUID();
    const acquired = await redis.set(key, token, "PX", this.ttlMs, "NX");
    if (acquired !== "OK") return null;

    return async () => {
      // Compare-and-delete, atomically. An unconditional DEL would let a run
      // whose TTL had already expired delete its SUCCESSOR's lock on the way
      // out, turning a rare overlap into a guaranteed one.
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

  /**
   * Claim the right to run the day's WARM sweep, at most once per window.
   *
   * The zodiac grid is free and hit on every tab open, so without this the
   * "anything missing today?" query would run on every one of those requests.
   * Returns false when another process already claimed the window. Without
   * Redis this returns true every time — the caller's fallback is a single
   * indexed count, which is cheap enough to run per request.
   */
  async claimWarmWindow(dateIst: string, windowMs: number): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return true;
    const acquired = await redis.set(
      `horoscope:warm:${dateIst}`,
      "1",
      "PX",
      windowMs,
      "NX"
    );
    if (acquired !== "OK") return false;
    log.debug({ event: "horoscope_warm_window_claimed", dateIst }, "warm sweep claimed");
    return true;
  }
}
