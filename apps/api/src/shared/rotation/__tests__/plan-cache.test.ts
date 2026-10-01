import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rotation plan is SHARED through Redis so the whole ECS service serves one
 * order per refresh — the point being that tasks never disagree at the 00:00 /
 * 12:00 boundary, where a CMS write between two tasks' catalogue reads would
 * otherwise give them plans differing by an item.
 *
 * What matters here is the failure behaviour as much as the happy path: Redis
 * is a convenience, and every path through it must still yield a usable plan.
 */

/** Minimal ioredis stand-in: just the four calls `plan-cache` makes. */
class FakeRedis {
  readonly data = new Map<string, string>();
  failOn: "get" | "set" | null = null;
  /** Simulates a SICK server: commands queue forever instead of refusing. */
  hang = false;

  get(key: string): Promise<string | null> {
    if (this.hang) return new Promise(() => {});
    if (this.failOn === "get") return Promise.reject(new Error("redis down"));
    return Promise.resolve(this.data.get(key) ?? null);
  }

  set(key: string, value: string, _px: string, _ttl: number, nx?: string): Promise<"OK" | null> {
    if (this.hang) return new Promise(() => {});
    if (this.failOn === "set") return Promise.reject(new Error("redis down"));
    if (nx === "NX" && this.data.has(key)) return Promise.resolve(null);
    this.data.set(key, value);
    return Promise.resolve("OK");
  }

  eval(_script: string, _numKeys: number, key: string, token: string): Promise<number> {
    if (this.data.get(key) === token) {
      this.data.delete(key);
      return Promise.resolve(1);
    }
    return Promise.resolve(0);
  }
}

let redis: FakeRedis | null = null;

vi.mock("@api/shared/database", () => ({
  getRedis: () => redis,
}));

const { clearPlanCache, getOrBuildPlan } = await import("../plan-cache.js");

const KEY = "home:40000";
const PLAN = ["a", "b", "c"];

/** A fresh task: same Redis, empty in-process cache. */
function newTask(plan = PLAN) {
  clearPlanCache();
  return vi.fn().mockResolvedValue(plan);
}

beforeEach(() => {
  redis = new FakeRedis();
  clearPlanCache();
});

describe("getOrBuildPlan", () => {
  it("builds once per refresh across tasks — the rest read the shared plan", async () => {
    const first = newTask();
    expect(await getOrBuildPlan(KEY, first)).toEqual(PLAN);
    expect(first).toHaveBeenCalledTimes(1);

    // a second ECS task, same epoch: it must NOT read the catalogue again
    const second = newTask(["different", "order"]);
    expect(await getOrBuildPlan(KEY, second)).toEqual(PLAN);
    expect(second).not.toHaveBeenCalled();
  });

  it("serves the in-process copy without touching Redis again", async () => {
    await getOrBuildPlan(KEY, newTask());
    const reads = redis?.data.size ?? 0;
    const again = vi.fn().mockResolvedValue(["x"]);
    expect(await getOrBuildPlan(KEY, again)).toEqual(PLAN);
    expect(again).not.toHaveBeenCalled();
    expect(redis?.data.size).toBe(reads);
  });

  it("waits for the winner's plan instead of duplicating the build", async () => {
    // another task holds the build lock and publishes a moment later
    await redis?.set(`feed:plan:lock:${KEY}`, "other-task", "PX", 15_000, "NX");
    setTimeout(() => {
      void redis?.set(`feed:plan:${KEY}`, JSON.stringify(PLAN), "PX", 1000);
    }, 80);

    const loser = newTask(["locally", "built"]);
    expect(await getOrBuildPlan(KEY, loser)).toEqual(PLAN);
    expect(loser).not.toHaveBeenCalled();
  });

  it("releases the lock so the next refresh can be built", async () => {
    await getOrBuildPlan(KEY, newTask());
    expect(redis?.data.has(`feed:plan:lock:${KEY}`)).toBe(false);
  });

  it("builds locally when Redis is disabled (the local-dev state)", async () => {
    redis = null;
    const build = newTask();
    expect(await getOrBuildPlan(KEY, build)).toEqual(PLAN);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("builds locally when Redis fails — an outage never breaks the feed", async () => {
    const failing = new FakeRedis();
    failing.failOn = "get";
    redis = failing;
    const build = newTask();
    expect(await getOrBuildPlan(KEY, build)).toEqual(PLAN);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed stored plan rather than serving it", async () => {
    await redis?.set(`feed:plan:${KEY}`, JSON.stringify([1, 2, 3]), "PX", 1000);
    const build = newTask();
    expect(await getOrBuildPlan(KEY, build)).toEqual(PLAN);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("falls through to the database when Redis HANGS rather than errors", async () => {
    // The dangerous shape: ioredis queues commands against an unreachable
    // server instead of refusing them. Without the 200ms ceiling this request
    // would wait on Redis's retry schedule.
    const sick = new FakeRedis();
    sick.hang = true;
    redis = sick;

    const build = newTask();
    const started = performance.now();
    const plan = await getOrBuildPlan(KEY, build);
    const elapsed = performance.now() - started;

    expect(plan).toEqual(PLAN);
    expect(build).toHaveBeenCalledTimes(1);
    // one timed-out GET, then straight to the database
    expect(elapsed).toBeLessThan(1_000);
  });

  it("still serves the plan it built when publishing it fails", async () => {
    const halfDead = new FakeRedis();
    halfDead.failOn = "set"; // reads fine, writes fail
    redis = halfDead;

    const build = newTask();
    expect(await getOrBuildPlan(KEY, build)).toEqual(PLAN);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("hits the database once, not twice, when the build itself fails", async () => {
    // A database outage must not be amplified by the Redis fallback path.
    const build = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(getOrBuildPlan(KEY, build)).rejects.toThrow("db down");
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed build", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(getOrBuildPlan(KEY, failing)).rejects.toThrow("db down");
    const retry = vi.fn().mockResolvedValue(PLAN);
    expect(await getOrBuildPlan(KEY, retry)).toEqual(PLAN);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
