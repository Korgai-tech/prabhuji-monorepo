import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The subset of ioredis the store touches. Typed via the generics rather than
 * bare `vi.fn()` so `mock.calls` is a tuple TypeScript can index — several
 * assertions read arguments positionally.
 */
interface FakeRedis {
  hset: ReturnType<
    typeof vi.fn<(key: string, value: Record<string, string> | string, field?: string) => Promise<number>>
  >;
  hgetall: ReturnType<typeof vi.fn<(key: string) => Promise<Record<string, string>>>>;
  hincrby: ReturnType<
    typeof vi.fn<(key: string, field: string, by: number) => Promise<number>>
  >;
  expire: ReturnType<typeof vi.fn<(key: string, seconds: number) => Promise<number>>>;
}

const getRedis = vi.fn<() => FakeRedis | null>();
vi.mock("@api/shared/database", () => ({ getRedis: () => getRedis() }));

const { RedisOtpSessionStore } = await import("../otp-session.store.js");

function fakeRedis(overrides: Partial<FakeRedis> = {}): FakeRedis {
  return {
    hset: vi.fn(() => Promise.resolve(1)),
    hgetall: vi.fn(() => Promise.resolve<Record<string, string>>({})),
    hincrby: vi.fn(() => Promise.resolve(1)),
    expire: vi.fn(() => Promise.resolve(1)),
    ...overrides,
  };
}

const SESSION_ID = "11111111-2222-4333-8444-555555555555";
const KEY = `otp:session:${SESSION_ID}`;

/** OTP_EXPIRY_MINUTES (15) + the 5-minute grace, in seconds. */
const EXPECTED_TTL = 20 * 60;

beforeEach(() => {
  getRedis.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("fail-closed behaviour", () => {
  /**
   * Every other Redis consumer here degrades to a no-op when Redis is off. This
   * one must not: a session store that silently forgets is a broken login, and
   * one that silently invents would be an auth bypass.
   */
  test.each([
    ["create", (s: InstanceType<typeof RedisOtpSessionStore>) =>
      s.create({
        otpSessionId: SESSION_ID,
        phoneCountryCode: "+91",
        phoneNumber: "9876543210",
        otpHash: "abc",
        createdAt: 1,
      })],
    ["get", (s: InstanceType<typeof RedisOtpSessionStore>) => s.get(SESSION_ID)],
    ["incrementAttempts", (s: InstanceType<typeof RedisOtpSessionStore>) =>
      s.incrementAttempts(SESSION_ID)],
    ["invalidate", (s: InstanceType<typeof RedisOtpSessionStore>) => s.invalidate(SESSION_ID)],
    ["refresh", (s: InstanceType<typeof RedisOtpSessionStore>) =>
      s.refresh(SESSION_ID, { otpHash: "abc", createdAt: 1 })],
  ])("%s throws when Redis is off", async (_name, call) => {
    getRedis.mockReturnValue(null);
    await expect(call(new RedisOtpSessionStore())).rejects.toMatchObject({
      statusCode: 500,
      errorCode: "OTP_STORE_UNAVAILABLE",
    });
  });
});

describe("create", () => {
  test("writes the session under a random-uuid key and sets the TTL", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    await new RedisOtpSessionStore().create({
      otpSessionId: SESSION_ID,
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
      otpHash: "deadbeef",
      createdAt: 1_700_000_000_000,
    });

    expect(redis.hset).toHaveBeenCalledWith(KEY, {
      cc: "+91",
      num: "9876543210",
      hash: "deadbeef",
      createdAt: "1700000000000",
      attempts: "0",
      resendCount: "0",
      invalidated: "0",
    });
    expect(redis.expire).toHaveBeenCalledWith(KEY, EXPECTED_TTL);
  });

  /**
   * The key is what shows up in MONITOR, SLOWLOG and key dumps. The number may
   * live in the value (verify has to know which phone to upsert) but never
   * there.
   */
  test("the phone number never appears in the key", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    await new RedisOtpSessionStore().create({
      otpSessionId: SESSION_ID,
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
      otpHash: "deadbeef",
      createdAt: 1,
    });

    expect(String(redis.hset.mock.calls[0][0])).not.toContain("9876543210");
    expect(String(redis.expire.mock.calls[0][0])).not.toContain("9876543210");
  });

  test("the TTL outlives the OTP so expiry stays distinguishable from absence", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    await new RedisOtpSessionStore().create({
      otpSessionId: SESSION_ID,
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
      otpHash: "x",
      createdAt: 1,
    });

    expect(redis.expire.mock.calls[0][1]).toBeGreaterThan(15 * 60);
  });
});

describe("get", () => {
  test("parses a stored hash into a typed session", async () => {
    getRedis.mockReturnValue(
      fakeRedis({
        hgetall: vi.fn(() =>
          Promise.resolve({
            cc: "+91",
            num: "9876543210",
            hash: "deadbeef",
            createdAt: "1700000000000",
            attempts: "2",
            resendCount: "1",
            invalidated: "1",
          })
        ),
      })
    );

    await expect(new RedisOtpSessionStore().get(SESSION_ID)).resolves.toEqual({
      otpSessionId: SESSION_ID,
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
      otpHash: "deadbeef",
      createdAt: 1_700_000_000_000,
      attempts: 2,
      resendCount: 1,
      invalidated: true,
    });
  });

  test("returns null for a missing key (ioredis answers {} not null)", async () => {
    getRedis.mockReturnValue(fakeRedis());
    await expect(new RedisOtpSessionStore().get(SESSION_ID)).resolves.toBeNull();
  });
});

describe("incrementAttempts", () => {
  test("uses HINCRBY and returns the new count", async () => {
    const redis = fakeRedis({ hincrby: vi.fn(() => Promise.resolve(3)) });
    getRedis.mockReturnValue(redis);

    await expect(
      new RedisOtpSessionStore().incrementAttempts(SESSION_ID)
    ).resolves.toBe(3);
    // Atomic on the server: two racing verifies must not each read the
    // pre-increment value and get a free attempt.
    expect(redis.hincrby).toHaveBeenCalledWith(KEY, "attempts", 1);
  });
});

describe("invalidate", () => {
  test("marks the session rather than deleting it", async () => {
    const redis = fakeRedis();
    getRedis.mockReturnValue(redis);

    await new RedisOtpSessionStore().invalidate(SESSION_ID);

    // Keeping the key until its TTL is what lets a replay report
    // `session_exhausted` instead of the vaguer `session_not_found`.
    expect(redis.hset).toHaveBeenCalledWith(KEY, "invalidated", "1");
  });
});

describe("refresh", () => {
  test("re-issues: new hash, new window, attempts reset, resend counted", async () => {
    const redis = fakeRedis({ hincrby: vi.fn(() => Promise.resolve(2)) });
    getRedis.mockReturnValue(redis);

    const resendCount = await new RedisOtpSessionStore().refresh(SESSION_ID, {
      otpHash: "cafebabe",
      createdAt: 1_700_000_009_000,
    });

    expect(resendCount).toBe(2);
    expect(redis.hset).toHaveBeenCalledWith(KEY, {
      hash: "cafebabe",
      createdAt: "1700000009000",
      attempts: "0",
    });
    expect(redis.hincrby).toHaveBeenCalledWith(KEY, "resendCount", 1);
    // A resent code must live as long as a fresh one.
    expect(redis.expire).toHaveBeenCalledWith(KEY, EXPECTED_TTL);
  });
});
