import { randomUUID } from "node:crypto";
import { LRUCache } from "lru-cache";
import { getRedis } from "@api/shared/database";
import { createModuleLogger } from "@api/shared/logs";
import { REFRESH_INTERVAL_MS } from "./rotation.js";

const log = createModuleLogger("rotation:plan-cache");

/**
 * Two-level cache for a built rotation plan (an ordered id list).
 *
 *   L1 — an in-process LRU, so the steady state costs nothing at all.
 *   L2 — Redis, so the ~dozen ECS tasks share ONE plan per refresh instead of
 *        each reading the catalogue and building their own.
 *
 * Why L2 exists even though the plan is a pure function of `(epoch, catalogue)`:
 * the epoch is identical everywhere, but the CATALOGUE is only identical if
 * every task reads it at the same instant. At 00:00 they don't — a CMS write
 * landing between two tasks' reads gives them plans differing by an item, and a
 * user whose page 1 and page 2 hit different tasks then sees one item repeated
 * or skipped at the seam. Publishing the plan once removes that window, and
 * removes N-1 catalogue reads per refresh as a side effect.
 *
 * Redis is a CONVENIENCE here, never load-bearing. Every failure path —
 * disabled, unreachable, lock contention, timeout — falls through to building
 * locally, which is a CORRECT answer because the function is deterministic. A
 * Redis outage costs duplicate work, never a broken or empty feed.
 *
 * L1 stores the in-flight PROMISE, not the array: at 00:00 every request on a
 * task hits a cold key at once, and caching the promise collapses that into one
 * resolution (and one `bk_feed_refresh_triggered` emission per task).
 */
/**
 * Raised from 200 for TAM-175. An "all gods" request used to touch ONE key
 * (`status:*:<locale>`); split by deity it touches three, and across the user
 * base the hot set spans every deity — roughly `(deities + 1) × (locales + 1)`
 * per rotated surface, for status, ringtone and wallpaper alike, and two refresh
 * epochs are alive at once because the cursor clamp lets an open session keep
 * paging the previous one. 200 would evict plans that are still being scrolled
 * and re-read the catalogue to rebuild them.
 *
 * Entries are mostly SMALL — a per-deity pool is a fraction of its catalogue —
 * and the LRU evicts by recency, so the hot set self-selects. If catalogues ever
 * grow enough for the byte cost to matter, switch to `lru-cache`'s `maxSize`
 * with a `sizeCalculation`; that is not possible today because the cached value
 * is a PENDING PROMISE whose size is unknown when it is inserted.
 */
const PLAN_CACHE_MAX_ENTRIES = 600;

/**
 * Two refresh cycles — DERIVED, so shortening `REFRESH_INTERVAL_MS` for a test
 * run doesn't leave half-day-old keys piling up in Redis.
 *
 * It must exceed ONE cycle: the cursor clamp lets an open session keep paging
 * the previous epoch's plan, and that key has to still be readable. (Even if it
 * has expired the plan is simply rebuilt — same epoch, same catalogue, same
 * answer — so this is an optimisation, not a correctness boundary.)
 */
const PLAN_CACHE_TTL_MS = REFRESH_INTERVAL_MS * 2;

/**
 * Ceiling on how long a crashed builder can block its peers. Well above a
 * catalogue read, well below the time a waiter is willing to wait.
 */
const BUILD_LOCK_TTL_MS = 15_000;

/** How long a task that lost the race waits for the winner to publish. */
const WAIT_TIMEOUT_MS = 3_000;
const WAIT_POLL_MS = 50;

/**
 * Ceiling on any single Redis call made from this file.
 *
 * A DEAD Redis is easy — the command rejects and we build locally. A SICK one
 * is the dangerous case: the shared client runs ioredis defaults
 * (`enableOfflineQueue: true`, `maxRetriesPerRequest: 20`), so while the server
 * is unreachable a `GET` is QUEUED and retried with backoff for seconds rather
 * than refused. Without this ceiling a Redis brownout would stall every feed
 * request that missed L1 — strictly worse than Redis being off.
 *
 * The timeout lives here rather than on the client in `shared/database/redis.ts`
 * on purpose: OTP sessions, rate limiting and the billing lock share that
 * client and have completely different latency tolerances. 200ms is ~100× a
 * healthy in-VPC ElastiCache round trip and a fraction of the local rebuild it
 * falls back to.
 */
const REDIS_CALL_TIMEOUT_MS = 200;

class RedisCallTimeout extends Error {
  constructor(op: string) {
    super(`redis ${op} exceeded ${REDIS_CALL_TIMEOUT_MS}ms`);
    this.name = "RedisCallTimeout";
  }
}

/**
 * Race a Redis call against the ceiling. The losing operation is left running
 * with its rejection swallowed — abandoning it must not surface as an unhandled
 * rejection, and ioredis will settle it on its own schedule.
 */
async function withTimeout<T>(op: string, run: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const pending = run();
  pending.catch(() => {
    /* abandoned — the caller already fell through to the local build */
  });
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RedisCallTimeout(op)), REDIS_CALL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const store = new LRUCache<string, Promise<unknown>>({
  max: PLAN_CACHE_MAX_ENTRIES,
  ttl: PLAN_CACHE_TTL_MS,
  allowStale: false,
});

const planKey = (key: string): string => `feed:plan:${key}`;
const lockKey = (key: string): string => `feed:plan:lock:${key}`;

/**
 * An ordered id list for one epoch — the original and still the common case.
 */
export async function getOrBuildPlan(
  key: string,
  build: () => Promise<string[]>
): Promise<string[]> {
  return getOrBuildCached(key, build, isStringArray);
}

/**
 * The same two-level cache for any JSON-serialisable value (TAM-175).
 *
 * The home feed caches a BUNDLE of pools — one ordered list per
 * `(contentType, deity)` — rather than a single plan, because all of them come
 * out of ONE catalogue read. Giving each pool its own key would turn that read
 * into dozens, which is the exact cost the plan cache exists to avoid.
 *
 * `isValid` guards what comes back from Redis. It is required, not optional: a
 * stored value is data another process wrote, possibly from an older deploy
 * with a different shape, and trusting it into a feed page is how a malformed
 * cache entry becomes a 500 for everyone sharing that key.
 */
export async function getOrBuildCached<T>(
  key: string,
  build: () => Promise<T>,
  isValid: (value: unknown) => value is T
): Promise<T> {
  const hit = store.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const pending = resolvePlan(key, build, isValid).catch((err: unknown) => {
    store.delete(key);
    throw err;
  });
  store.set(key, pending);
  return pending;
}

/** The default validator: an array of strings, i.e. a plain plan. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string");
}

/**
 * Read the shared plan, or build it under a lock and publish it. Only ONE task
 * per refresh reaches `build`; the rest read what it wrote.
 */
async function resolvePlan<T>(
  key: string,
  build: () => Promise<T>,
  isValid: (value: unknown) => value is T
): Promise<T> {
  // The catalogue read happens AT MOST ONCE per call, however many paths below
  // reach for it. Without this, a database outage would make `build()` throw
  // inside the try and then be retried by the catch — doubling the load on an
  // already-failing database and mislabelling the failure as a Redis problem.
  let building: Promise<T> | null = null;
  const buildOnce = (): Promise<T> => (building ??= build());

  const redis = getRedis();
  // ENABLE_REDIS=false is the normal local-dev state, not a fault.
  if (!redis) return buildOnce();

  try {
    const published = await readPlan(key, isValid);
    if (published) return published;

    const release = await acquireBuildLock(key);
    if (release) {
      try {
        // Re-read inside the lock: a task may have published between our miss
        // and our acquire, and rebuilding would undo the point of the lock.
        const raced = await readPlan(key, isValid);
        if (raced) return raced;
        const plan = await buildOnce();
        // Publishing is best-effort — we already hold a correct plan, and
        // failing the request because we couldn't SHARE it would be absurd.
        await publishPlan(key, plan).catch((err: unknown) => {
          log.warn(
            { err, event: "rotation_plan_publish_failed", plan_key: key },
            "rotation plan built but not published — peers will build their own"
          );
        });
        return plan;
      } finally {
        // Also best-effort: an unreleased lock expires on its own in 15s.
        await release().catch((err: unknown) => {
          log.warn(
            { err, event: "rotation_plan_unlock_failed", plan_key: key },
            "rotation build lock not released — expiring on its TTL"
          );
        });
      }
    }

    // Someone else is building — wait for their plan rather than duplicating
    // the catalogue read.
    const waited = await waitForPlan(key, isValid);
    if (waited) return waited;

    log.warn(
      { event: "rotation_plan_wait_timeout", plan_key: key },
      "no shared rotation plan within the wait window — building locally"
    );
    return buildOnce();
  } catch (err) {
    // Redis is never load-bearing: a deterministic local build is still the
    // right answer, just not a shared one. If the throw came from `build()`
    // itself, `buildOnce` returns the SAME rejected promise — the database is
    // not hit twice and the error still reaches the caller.
    log.warn(
      { err, event: "rotation_plan_share_failed", plan_key: key },
      "shared rotation plan unavailable — building locally"
    );
    return buildOnce();
  }
}

async function readPlan<T>(
  key: string,
  isValid: (value: unknown) => value is T
): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await withTimeout("get", () => redis.get(planKey(key)));
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  // A malformed value is treated as absent — never trusted into a page. It can
  // legitimately happen mid-rollout, when an older deploy still writes the
  // previous shape under the same key.
  if (!isValid(parsed)) {
    log.warn(
      { event: "rotation_plan_malformed", plan_key: key },
      "stored rotation plan failed its shape check — ignoring"
    );
    return null;
  }
  return parsed;
}

async function publishPlan<T>(key: string, plan: T): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await withTimeout("set", () =>
    redis.set(planKey(key), JSON.stringify(plan), "PX", PLAN_CACHE_TTL_MS)
  );
  log.info(
    {
      event: "rotation_plan_published",
      plan_key: key,
      items: Array.isArray(plan) ? plan.length : undefined,
    },
    "rotation plan published for this refresh"
  );
}

/**
 * Take the build lock, returning a release function, or null when another task
 * holds it.
 *
 * The token is what makes release safe: deleting unconditionally would let a
 * builder whose TTL had already expired delete its SUCCESSOR's lock on the way
 * out (the same reasoning as `core/payment/services/billing-lock.ts`).
 */
async function acquireBuildLock(key: string): Promise<(() => Promise<void>) | null> {
  const redis = getRedis();
  if (!redis) return null;
  const token = randomUUID();
  const acquired = await withTimeout("set-nx", () =>
    redis.set(lockKey(key), token, "PX", BUILD_LOCK_TTL_MS, "NX")
  );
  if (acquired !== "OK") return null;
  return async () => {
    // Compare-and-delete, atomically — GET then DEL from the client would
    // reopen the window the token exists to close.
    await withTimeout("eval", () =>
      redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
           return redis.call("del", KEYS[1])
         else
           return 0
         end`,
        1,
        lockKey(key),
        token
      )
    );
  };
}

/** Poll for the winner's plan, up to `WAIT_TIMEOUT_MS`. */
async function waitForPlan<T>(
  key: string,
  isValid: (value: unknown) => value is T
): Promise<T | null> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
    const plan = await readPlan(key, isValid);
    if (plan) return plan;
  }
  return null;
}

/** Test-only: drop every cached plan (the in-process level). */
export function clearPlanCache(): void {
  store.clear();
}
