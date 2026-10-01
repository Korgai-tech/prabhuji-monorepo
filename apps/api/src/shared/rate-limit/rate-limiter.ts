import { getRedis } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("rate-limiter");

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Redis-backed sliding-window-ish rate limiter using INCR + EXPIRE.
 *
 * NOTE: If Redis is disabled (`ENABLE_REDIS=false`) the limiter is a no-op
 * that always allows the request. This matches the local dev experience —
 * the ticket calls this out explicitly and a `logger.warn` is emitted on
 * every disabled call so it's visible in dev logs.
 *
 * Keys are caller-supplied and namespaced by the caller (e.g. `otp:send:*`,
 * `otp:verify:*`, `reports:create:*`). The window resets when the key TTL
 * expires — good enough for abuse control without pulling in a full
 * sliding-window impl.
 *
 * Lives in `shared/` rather than inside a module because more than one module
 * needs it (OTP and reports today) and modules must never import each other's
 * internals.
 */
export class RedisRateLimiter {
  async consume(key: string, max: number, windowSeconds: number): Promise<RateLimitVerdict> {
    const redis = getRedis();
    if (!redis) {
      log.warn({ key }, "rate-limiter no-op (ENABLE_REDIS=false) — request allowed");
      return { allowed: true, remaining: max, retryAfterSeconds: 0 };
    }
    // INCR is atomic; the first hit sets a TTL. Subsequent hits just increment.
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    if (count > max) {
      const ttl = await redis.ttl(key);
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }
    return { allowed: true, remaining: Math.max(0, max - count), retryAfterSeconds: 0 };
  }

  async reset(key: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(key);
  }
}
