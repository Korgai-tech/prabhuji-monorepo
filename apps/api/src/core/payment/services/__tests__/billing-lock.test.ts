import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The subset of ioredis the lock touches.
 *
 * Typed via the generics rather than bare `vi.fn()` so `mock.calls` is a tuple
 * TypeScript can index — the release test reads the script and token
 * positionally, and an untyped mock makes every one of those an `any`.
 */
interface FakeRedis {
  set: ReturnType<
    typeof vi.fn<
      (
        key: string,
        value: string,
        px: "PX",
        ttlMs: number,
        nx: "NX"
      ) => Promise<string | null>
    >
  >;
  eval: ReturnType<
    typeof vi.fn<
      (script: string, keyCount: number, key: string, token: string) => Promise<number>
    >
  >;
}

const getRedis = vi.fn<() => FakeRedis | null>();
vi.mock("@api/shared/database", () => ({ getRedis: () => getRedis() }));

const { BillingLock } = await import("../billing-lock.js");

function fakeRedis(): FakeRedis {
  return {
    set: vi.fn(() => Promise.resolve<string | null>("OK")),
    eval: vi.fn(() => Promise.resolve(1)),
  };
}

beforeEach(() => {
  getRedis.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("acquire", () => {
  test("takes the lock with NX and a TTL", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    const release = await new BillingLock(25 * 60_000).acquire();

    expect(release).not.toBeNull();
    // NX is what makes this a lock rather than a stomp; PX is what stops a
    // crashed holder from blocking billing forever.
    expect(redis.set).toHaveBeenCalledWith(
      "payment:billing:lock",
      expect.any(String),
      "PX",
      25 * 60_000,
      "NX"
    );
  });

  test("returns null when another run holds it", async () => {
    const redis = fakeRedis();
    // What ioredis returns when the NX precondition fails.
    redis.set.mockImplementation(() => Promise.resolve(null));
    getRedis.mockReturnValue(redis);

    expect(await new BillingLock(1_000).acquire()).toBeNull();
  });

  /**
   * The property that matters most, and the reason the lock is not simply
   * `DEL` on the way out.
   *
   * If a run overshoots its TTL, its lock has already expired and a successor
   * may hold a lock under the SAME key with a different token. An
   * unconditional delete would release the successor's lock while it is still
   * working — turning a rare overlap into a guaranteed one, which is strictly
   * worse than having no lock at all.
   */
  test("release compares the token before deleting", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    const release = await new BillingLock(1_000).acquire();
    await release!();

    const [script, keyCount, key, token] = redis.eval.mock.calls[0];
    expect(script).toContain('redis.call("get", KEYS[1]) == ARGV[1]');
    expect(keyCount).toBe(1);
    expect(key).toBe("payment:billing:lock");
    // The same token the SET was made with — a fresh uuid here would never
    // match and the lock would leak until its TTL.
    expect(token).toBe(redis.set.mock.calls[0][1]);
  });
});

describe("redis disabled", () => {
  /**
   * ENABLE_REDIS=false is the normal local-dev state, and Redis being down in
   * production is a real possibility. Neither may stop billing: the coarse
   * lock is a convenience, and what actually prevents a double charge is the
   * `(mandate_id, cycle_date)` unique constraint, which is unaffected.
   * Skipping the cycle here would trade a duplicate-charge risk we do not have
   * for a lost-revenue certainty we would.
   */
  test("degrades to a no-op release rather than blocking the run", async () => {
    getRedis.mockReturnValue(null);

    const release = await new BillingLock(1_000).acquire();

    expect(release).not.toBeNull();
    await expect(release!()).resolves.toBeUndefined();
  });
});
