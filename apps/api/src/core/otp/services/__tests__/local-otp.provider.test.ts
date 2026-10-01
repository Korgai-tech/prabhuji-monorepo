import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { LocalOtpProvider } from "../local-otp.provider.js";
import {
  DELIVERY_RATE_LIMIT_MAX,
  OTP_EXPIRY_MS,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
} from "../otp.config.js";
import type {
  CreateOtpSessionInput,
  StoredOtpSession,
} from "../otp-session.store.js";
import type { RateLimitVerdict } from "@api/shared/rate-limit";

const PHONE = { phoneCountryCode: "+91", phoneNumber: "9876543210" };

interface SendInput {
  phoneCountryCode: string;
  phoneNumber: string;
  otp: string;
  // TAM-123 — the SMS Retriever hash. Optional so pre-TAM-123 tests can call
  // `sendOtp(PHONE)` unchanged; new tests assert threading by inspecting
  // `sender.sendOtp.mock.calls[…][0].appSignatureHash`.
  appSignatureHash?: string;
}

/**
 * The fakes below declare their methods as function-valued PROPERTIES typed
 * through `vi.fn`'s generics, not as interface methods — the same idiom as
 * `payment/services/__tests__/billing-lock.test.ts`. That keeps `mock.calls` a
 * tuple TypeScript can index (several assertions read arguments positionally)
 * and keeps `expect(fake.method)` off the `unbound-method` rule.
 */
interface FakeStore {
  sessions: Map<string, StoredOtpSession>;
  create: ReturnType<typeof vi.fn<(input: CreateOtpSessionInput) => Promise<void>>>;
  get: ReturnType<typeof vi.fn<(id: string) => Promise<StoredOtpSession | null>>>;
  incrementAttempts: ReturnType<typeof vi.fn<(id: string) => Promise<number>>>;
  invalidate: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  refresh: ReturnType<
    typeof vi.fn<
      (id: string, input: { otpHash: string; createdAt: number }) => Promise<number>
    >
  >;
}

interface FakeSender {
  name: string;
  delivered: Array<{ phoneNumber: string; otp: string }>;
  sendOtp: ReturnType<typeof vi.fn<(input: SendInput) => Promise<void>>>;
}

interface FakeLimiter {
  consume: ReturnType<
    typeof vi.fn<
      (key: string, max: number, windowSeconds: number) => Promise<RateLimitVerdict>
    >
  >;
  reset: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
}

/**
 * An in-memory stand-in for the Redis store, exercising the real provider logic
 * without Redis. Records what was written so tests can assert the OTP is never
 * stored in the clear.
 */
function fakeStore(): FakeStore {
  const sessions = new Map<string, StoredOtpSession>();
  return {
    sessions,
    create: vi.fn((input: CreateOtpSessionInput) => {
      sessions.set(input.otpSessionId, {
        ...input,
        attempts: 0,
        resendCount: 0,
        invalidated: false,
      });
      return Promise.resolve();
    }),
    get: vi.fn((id: string) => Promise.resolve(sessions.get(id) ?? null)),
    incrementAttempts: vi.fn((id: string) => {
      const s = sessions.get(id);
      if (!s) return Promise.resolve(0);
      s.attempts += 1;
      return Promise.resolve(s.attempts);
    }),
    invalidate: vi.fn((id: string) => {
      const s = sessions.get(id);
      if (s) s.invalidated = true;
      return Promise.resolve();
    }),
    refresh: vi.fn((id: string, input: { otpHash: string; createdAt: number }) => {
      const s = sessions.get(id);
      if (!s) return Promise.resolve(0);
      s.otpHash = input.otpHash;
      s.createdAt = input.createdAt;
      s.attempts = 0;
      s.resendCount += 1;
      return Promise.resolve(s.resendCount);
    }),
  };
}

/** Captures every delivered code so tests can read the OTP the user would see. */
function fakeSender(behaviour: { fail?: Error } = {}): FakeSender {
  const delivered: Array<{ phoneNumber: string; otp: string }> = [];
  return {
    name: "fake",
    delivered,
    sendOtp: vi.fn((input: SendInput) => {
      if (behaviour.fail) return Promise.reject(behaviour.fail);
      delivered.push({ phoneNumber: input.phoneNumber, otp: input.otp });
      return Promise.resolve();
    }),
  };
}

function alwaysAllowLimiter(): FakeLimiter {
  return {
    consume: vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 999, retryAfterSeconds: 0 })
    ),
    reset: vi.fn(() => Promise.resolve()),
  };
}

function alwaysDenyLimiter(): FakeLimiter {
  return {
    consume: vi.fn(() =>
      Promise.resolve({ allowed: false, remaining: 0, retryAfterSeconds: 42 })
    ),
    reset: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "dev-pepper-for-tests-only-not-secret-32ch";
  process.env.MEDIA_BUCKET = "test-bucket";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example.com";
  resetEnvCache();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("sendOtp", () => {
  test("mints a session, delivers a fresh code, and reports empty counters", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const meta = await new LocalOtpProvider(
      sender,
      store,
      alwaysAllowLimiter()
    ).sendOtp(PHONE);

    expect(meta.otpSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(meta).toMatchObject({ ...PHONE, attempts: 0, resendCount: 0, invalidated: false });
    expect(sender.delivered).toHaveLength(1);
    expect(sender.delivered[0].otp).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });

  test("the provider name is the sender's, so logs name the real vendor", () => {
    expect(new LocalOtpProvider(fakeSender(), fakeStore(), alwaysAllowLimiter()).name).toBe(
      "fake"
    );
  });

  test("stores a digest, never the code itself", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const meta = await new LocalOtpProvider(sender, store, alwaysAllowLimiter()).sendOtp(
      PHONE
    );

    const stored = store.sessions.get(meta.otpSessionId);
    const otp = sender.delivered[0].otp;
    expect(stored?.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.otpHash).not.toBe(otp);

    // Field by field, NOT `JSON.stringify(stored)`.
    //
    // The whole-blob check was flaky at ~0.26% — about one run in 380, which is
    // frequent enough to fail the stage deploy gate on somebody's unrelated
    // branch and rare enough that it reads as a fluke. A real failure: otp
    // `6685` inside the session uuid `…-154c6f966859`. Three fields are random
    // or fixed in ways that can contain any given 4-digit code by chance —
    // `otpSessionId` (a uuid), `createdAt` (a timestamp), and `phoneNumber`
    // (which literally contains 9876, 8765, 7654, 6543, 5432, 4321 and 3210).
    //
    // None of the three CAN leak the code: the id is minted before the code
    // exists, the timestamp is `Date.now()`, and the number came from the
    // caller. So they are checked for EQUALITY (storing the code as any of them
    // would still be a leak) while every other field — including any field
    // added later, since this names only the three — keeps the containment
    // check the security property actually needs.
    const cannotCarryTheCode = new Set(["otpSessionId", "createdAt", "phoneNumber"]);
    const fields = Object.entries(stored ?? {});
    expect(fields.length).toBeGreaterThan(0);
    for (const [key, value] of fields) {
      if (cannotCarryTheCode.has(key)) {
        expect(String(value)).not.toBe(otp);
      } else {
        expect(String(value)).not.toContain(otp);
      }
    }
  });

  test("two sends produce different session ids and independent codes", async () => {
    const provider = new LocalOtpProvider(fakeSender(), fakeStore(), alwaysAllowLimiter());
    const a = await provider.sendOtp(PHONE);
    const b = await provider.sendOtp(PHONE);
    expect(a.otpSessionId).not.toBe(b.otpSessionId);
  });

  test("a delivery failure burns the session and surfaces OTP_SEND_FAILED", async () => {
    const store = fakeStore();
    const provider = new LocalOtpProvider(
      fakeSender({ fail: new Error("vendor rejected") }),
      store,
      alwaysAllowLimiter()
    );

    await expect(provider.sendOtp(PHONE)).rejects.toMatchObject({
      statusCode: 500,
      errorCode: "OTP_SEND_FAILED",
    });
    // A live session behind an SMS that never arrived is a code screen the user
    // can never satisfy.
    expect([...store.sessions.values()].every((s) => s.invalidated)).toBe(true);
  });

  test("the vendor's error text never reaches the client", async () => {
    const provider = new LocalOtpProvider(
      fakeSender({ fail: new Error("MSG91: insufficient balance on account 4471") }),
      fakeStore(),
      alwaysAllowLimiter()
    );

    const err = await provider
      .sendOtp(PHONE)
      .then(() => null)
      .catch((e: unknown) => e as Error);
    expect(err?.message).toBe("Failed to send OTP");
  });

  test("the per-phone delivery cap blocks the send and burns the session", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysDenyLimiter());

    await expect(provider.sendOtp(PHONE)).rejects.toMatchObject({
      statusCode: 429,
      errorCode: "OTP_RATE_LIMITED",
    });
    expect(sender.delivered).toHaveLength(0);
  });

  test("the delivery-cap key is a peppered digest, not the raw number", async () => {
    const limiter = alwaysAllowLimiter();
    await new LocalOtpProvider(fakeSender(), fakeStore(), limiter).sendOtp(PHONE);

    const [key, max] = limiter.consume.mock.calls[0];
    expect(key).toContain("otp:delivery:");
    expect(key).not.toContain("9876543210");
    expect(max).toBe(DELIVERY_RATE_LIMIT_MAX);
  });
});

describe("verifyOtp", () => {
  async function seed(): Promise<{
    provider: LocalOtpProvider;
    store: FakeStore;
    sender: FakeSender;
    otpSessionId: string;
    otp: string;
  }> {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp(PHONE);
    return { provider, store, sender, otpSessionId, otp: sender.delivered[0].otp };
  }

  test("accepts the delivered code and returns the phone for the upsert", async () => {
    const { provider, otpSessionId, otp } = await seed();

    const verdict = await provider.verifyOtp({ otpSessionId, otp });

    expect(verdict.ok).toBe(true);
    expect(verdict.metadata.phoneCountryCode).toBe("+91");
    expect(verdict.metadata.phoneNumber).toBe("9876543210");
  });

  test("rejects a wrong code and counts the attempt", async () => {
    const { provider, otpSessionId, otp } = await seed();
    const wrong = otp === "0000" ? "1111" : "0000";

    const verdict = await provider.verifyOtp({ otpSessionId, otp: wrong });

    expect(verdict).toMatchObject({ ok: false, reason: "invalid_otp" });
    expect(verdict.metadata.attempts).toBe(1);
  });

  test("a code from another session does not verify (the digest is session-bound)", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const first = await provider.sendOtp(PHONE);
    await provider.sendOtp(PHONE);
    const secondOtp = sender.delivered[1].otp;

    // Only meaningful when the two random codes differ.
    if (secondOtp !== sender.delivered[0].otp) {
      const verdict = await provider.verifyOtp({
        otpSessionId: first.otpSessionId,
        otp: secondOtp,
      });
      expect(verdict.ok).toBe(false);
    }
  });

  test("exhausts the session at OTP_MAX_ATTEMPTS", async () => {
    const { provider, otpSessionId, otp } = await seed();
    const wrong = otp === "0000" ? "1111" : "0000";

    let last = await provider.verifyOtp({ otpSessionId, otp: wrong });
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      last = await provider.verifyOtp({ otpSessionId, otp: wrong });
    }

    expect(last).toMatchObject({ ok: false, reason: "session_exhausted" });
    expect(last.metadata.invalidated).toBe(true);
    // Even the right code is dead once the session is burned.
    await expect(provider.verifyOtp({ otpSessionId, otp })).resolves.toMatchObject({
      ok: false,
      reason: "session_exhausted",
    });
  });

  test("a replay after a successful verify is refused", async () => {
    const { provider, otpSessionId, otp } = await seed();
    await provider.verifyOtp({ otpSessionId, otp });

    await expect(provider.verifyOtp({ otpSessionId, otp })).resolves.toMatchObject({
      ok: false,
      reason: "session_exhausted",
    });
  });

  test("an unknown session reports session_not_found without leaking a phone", async () => {
    const provider = new LocalOtpProvider(fakeSender(), fakeStore(), alwaysAllowLimiter());

    const verdict = await provider.verifyOtp({
      otpSessionId: "11111111-2222-4333-8444-555555555555",
      otp: "1234",
    });

    expect(verdict).toMatchObject({ ok: false, reason: "session_not_found" });
    expect(verdict.metadata.phoneNumber).toBe("");
  });

  test("an expired session reports session_expired and is burned", async () => {
    const { provider, store, otpSessionId, otp } = await seed();
    const session = store.sessions.get(otpSessionId);
    if (session) session.createdAt = Date.now() - OTP_EXPIRY_MS - 1_000;

    const verdict = await provider.verifyOtp({ otpSessionId, otp });

    expect(verdict).toMatchObject({ ok: false, reason: "session_expired" });
    expect(store.sessions.get(otpSessionId)?.invalidated).toBe(true);
  });

  test("an expired session does not spend an attempt", async () => {
    const { provider, store, otpSessionId, otp } = await seed();
    const session = store.sessions.get(otpSessionId);
    if (session) session.createdAt = Date.now() - OTP_EXPIRY_MS - 1_000;

    await provider.verifyOtp({ otpSessionId, otp });

    expect(store.incrementAttempts).not.toHaveBeenCalled();
  });
});

describe("resendOtp", () => {
  test("issues a NEW code, resets attempts and counts the resend", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp(PHONE);
    const firstOtp = sender.delivered[0].otp;
    await provider.verifyOtp({ otpSessionId, otp: firstOtp === "0000" ? "1111" : "0000" });

    const meta = await provider.resendOtp({ otpSessionId });

    expect(meta.resendCount).toBe(1);
    expect(meta.attempts).toBe(0);
    expect(sender.delivered).toHaveLength(2);
  });

  test("the previous code stops working once a new one is issued", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp(PHONE);
    const firstOtp = sender.delivered[0].otp;

    await provider.resendOtp({ otpSessionId });
    const secondOtp = sender.delivered[1].otp;

    if (secondOtp !== firstOtp) {
      await expect(
        provider.verifyOtp({ otpSessionId, otp: firstOtp })
      ).resolves.toMatchObject({ ok: false });
    }
    await expect(
      provider.verifyOtp({ otpSessionId, otp: secondOtp })
    ).resolves.toMatchObject({ ok: true });
  });

  test("refuses an unknown session", async () => {
    const provider = new LocalOtpProvider(fakeSender(), fakeStore(), alwaysAllowLimiter());
    await expect(
      provider.resendOtp({ otpSessionId: "11111111-2222-4333-8444-555555555555" })
    ).rejects.toMatchObject({ statusCode: 404, errorCode: "OTP_SESSION_NOT_FOUND" });
  });

  test("refuses a burned session", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp(PHONE);
    await provider.verifyOtp({ otpSessionId, otp: sender.delivered[0].otp });

    await expect(provider.resendOtp({ otpSessionId })).rejects.toMatchObject({
      statusCode: 401,
      errorCode: "OTP_SESSION_EXHAUSTED",
    });
  });

  /**
   * The one deliberate divergence from `StubOtpProvider`, which re-issues on an
   * expired session. A resend chain that resurrects a dead session has no
   * natural end, and the handset has proven nothing.
   */
  test("refuses an expired session instead of resurrecting it", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp(PHONE);
    const session = store.sessions.get(otpSessionId);
    if (session) session.createdAt = Date.now() - OTP_EXPIRY_MS - 1_000;

    await expect(provider.resendOtp({ otpSessionId })).rejects.toMatchObject({
      statusCode: 401,
      errorCode: "OTP_SESSION_EXPIRED",
    });
    expect(sender.delivered).toHaveLength(1);
  });

  test("a resend is billable, so the per-phone delivery cap applies to it too", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const limiter = alwaysAllowLimiter();
    const provider = new LocalOtpProvider(sender, store, limiter);
    const { otpSessionId } = await provider.sendOtp(PHONE);

    await provider.resendOtp({ otpSessionId });

    expect(limiter.consume).toHaveBeenCalledTimes(2);
    const sendKey = limiter.consume.mock.calls[0][0];
    const resendKey = limiter.consume.mock.calls[1][0];
    // Same bucket, so "a fresh session per resend" cannot route around the cap.
    expect(resendKey).toBe(sendKey);
  });

  // TAM-123 — the hash captured on the ORIGINAL send is what carries the
  // Retriever suffix on every subsequent resend, so the client never has to
  // resupply it and the on-device listener matches the resent SMS.
  test("reuses the send-time appSignatureHash on resend", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp({
      ...PHONE,
      appSignatureHash: "AbCd12+/xyz",
    });

    await provider.resendOtp({ otpSessionId });

    expect(sender.sendOtp).toHaveBeenCalledTimes(2);
    expect(sender.sendOtp.mock.calls[0][0].appSignatureHash).toBe("AbCd12+/xyz");
    expect(sender.sendOtp.mock.calls[1][0].appSignatureHash).toBe("AbCd12+/xyz");
  });
});

// TAM-123 — thread the hash from send → sender + session storage. Kept in
// its own block because the earlier `sendOtp` describe pre-dates this field.
describe("TAM-123 — appSignatureHash threading", () => {
  test("passes the hash to the sender when the caller provided one", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());

    await provider.sendOtp({ ...PHONE, appSignatureHash: "AbCd12+/xyz" });

    expect(sender.sendOtp).toHaveBeenCalledTimes(1);
    expect(sender.sendOtp.mock.calls[0][0].appSignatureHash).toBe("AbCd12+/xyz");
  });

  test("stores the hash on the session so resend can reuse it", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());

    const { otpSessionId } = await provider.sendOtp({
      ...PHONE,
      appSignatureHash: "AbCd12+/xyz",
    });

    expect(store.sessions.get(otpSessionId)?.appSignatureHash).toBe("AbCd12+/xyz");
  });

  test("omits the field when the caller didn't provide one (iOS / older clients)", async () => {
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());

    await provider.sendOtp(PHONE);

    expect(sender.sendOtp).toHaveBeenCalledTimes(1);
    expect(sender.sendOtp.mock.calls[0][0].appSignatureHash).toBeUndefined();
  });
});

/**
 * Test numbers (TAM-149) — QA and app-store-reviewer accounts.
 *
 * These numbers are unallocated, so a real SMS is billed and never arrives.
 * `TEST_NUMBERS` + `TEST_OTP` make them skip delivery and accept a fixed code.
 *
 * The security property under test is that this changes ONLY the code and the
 * delivery. Everything that makes OTP safe — the hash at rest, the attempt
 * cap, the one-shot burn, the expiry — must still be the ordinary path, and the
 * mechanism must be inert unless BOTH env vars are set.
 */
describe("test numbers", () => {
  const TEST_NUMBER = "9111111111";
  const FIXED_OTP = "0123";

  // `null` rather than `undefined` for "no code": passing `undefined` to a
  // parameter with a default silently RE-APPLIES the default, which is exactly
  // how the first version of the fail-closed test below quietly asserted
  // nothing.
  function enable(numbers = TEST_NUMBER, otp: string | null = FIXED_OTP) {
    process.env.TEST_NUMBERS = numbers;
    if (otp === null) delete process.env.TEST_OTP;
    else process.env.TEST_OTP = otp;
    resetEnvCache();
  }

  // The shared `beforeEach` does not clear these, so without this they leak
  // into every later test in the file.
  afterEach(() => {
    delete process.env.TEST_NUMBERS;
    delete process.env.TEST_OTP;
    resetEnvCache();
  });

  test("issues the fixed code, sends no SMS, and verifies", async () => {
    enable();
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());

    const { otpSessionId } = await provider.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: TEST_NUMBER,
    });

    expect(sender.sendOtp).not.toHaveBeenCalled();
    // Still hashed at rest — the fixed code is no more storable in the clear
    // than a random one.
    expect(store.sessions.get(otpSessionId)?.otpHash).not.toContain(FIXED_OTP);

    await expect(
      provider.verifyOtp({ otpSessionId, otp: FIXED_OTP })
    ).resolves.toMatchObject({ ok: true });
  });

  test("a wrong code is still rejected, and the session still burns", async () => {
    enable();
    const store = fakeStore();
    const provider = new LocalOtpProvider(fakeSender(), store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: TEST_NUMBER,
    });

    await expect(
      provider.verifyOtp({ otpSessionId, otp: "9999" })
    ).resolves.toMatchObject({ ok: false, reason: "invalid_otp" });

    await provider.verifyOtp({ otpSessionId, otp: FIXED_OTP });
    // One-shot: the correct code cannot be replayed.
    await expect(
      provider.verifyOtp({ otpSessionId, otp: FIXED_OTP })
    ).resolves.toMatchObject({ ok: false, reason: "session_exhausted" });
  });

  test("resend keeps the SAME fixed code and still sends no SMS", async () => {
    // Re-randomising on resend would make TEST_OTP stop working the moment a
    // tester pressed the button — indistinguishable from the feature being broken.
    enable();
    const store = fakeStore();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, store, alwaysAllowLimiter());
    const { otpSessionId } = await provider.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: TEST_NUMBER,
    });

    await provider.resendOtp({ otpSessionId });

    expect(sender.sendOtp).not.toHaveBeenCalled();
    await expect(
      provider.verifyOtp({ otpSessionId, otp: FIXED_OTP })
    ).resolves.toMatchObject({ ok: true });
  });

  test("an unlisted number is untouched — random code, real SMS", async () => {
    enable();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, fakeStore(), alwaysAllowLimiter());

    await provider.sendOtp(PHONE);

    expect(sender.sendOtp).toHaveBeenCalledTimes(1);
    expect(sender.delivered[0].otp).toHaveLength(OTP_LENGTH);
    expect(sender.delivered[0].otp).not.toBe(FIXED_OTP);
  });

  test("matching is exact — a longer number sharing the prefix is NOT a test number", async () => {
    // `includes`/`startsWith` here would turn one entry into a whole range of
    // admissible numbers.
    enable();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, fakeStore(), alwaysAllowLimiter());

    await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: `${TEST_NUMBER}9` });

    expect(sender.sendOtp).toHaveBeenCalledTimes(1);
    expect(sender.delivered[0].otp).not.toBe(FIXED_OTP);
  });

  test("fails CLOSED — TEST_NUMBERS without TEST_OTP refuses to boot", async () => {
    // The half-configured state never reaches the provider at all: env
    // validation rejects it, so the task crash-loops instead of coming up with
    // listed numbers that quietly receive a real (undeliverable) SMS.
    enable(TEST_NUMBER, null);
    const provider = new LocalOtpProvider(
      fakeSender(),
      fakeStore(),
      alwaysAllowLimiter()
    );

    await expect(
      provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: TEST_NUMBER })
    ).rejects.toThrow(/TEST_OTP/);
  });

  test("multiple numbers, whitespace-tolerant", async () => {
    enable(` 9111111111 , 9222222222 ,9333333333`);
    const sender = fakeSender();
    const provider = new LocalOtpProvider(sender, fakeStore(), alwaysAllowLimiter());

    await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9222222222" });
    await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9333333333" });

    expect(sender.sendOtp).not.toHaveBeenCalled();
  });
});

/**
 * TAM-187 — admin-created test users (`User.isTestUser`) take the same fixed
 * `TEST_OTP` as a `TEST_NUMBERS` entry, looked up per send via the injected
 * lookup rather than from env.
 */
describe("admin test users", () => {
  const FIXED_OTP = "0123";
  const isTestUser = (phoneNumber: string) =>
    vi.fn((_cc: string, n: string) => Promise.resolve(n === phoneNumber));

  afterEach(() => {
    delete process.env.TEST_OTP;
    resetEnvCache();
  });

  test("a flagged user gets TEST_OTP, no SMS, on send AND resend", async () => {
    process.env.TEST_OTP = FIXED_OTP;
    resetEnvCache();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(
      sender,
      fakeStore(),
      alwaysAllowLimiter(),
      isTestUser(PHONE.phoneNumber)
    );

    const { otpSessionId } = await provider.sendOtp(PHONE);
    await provider.resendOtp({ otpSessionId });

    expect(sender.sendOtp).not.toHaveBeenCalled();
    await expect(
      provider.verifyOtp({ otpSessionId, otp: FIXED_OTP })
    ).resolves.toMatchObject({ ok: true });
  });

  test("everyone else is untouched — random code, real SMS", async () => {
    process.env.TEST_OTP = FIXED_OTP;
    resetEnvCache();
    const sender = fakeSender();
    const provider = new LocalOtpProvider(
      sender,
      fakeStore(),
      alwaysAllowLimiter(),
      isTestUser("9000000000")
    );

    await provider.sendOtp(PHONE);

    expect(sender.sendOtp).toHaveBeenCalledTimes(1);
    expect(sender.delivered[0].otp).not.toBe(FIXED_OTP);
  });

  test("fails CLOSED — no TEST_OTP means a real SMS, and no lookup at all", async () => {
    const sender = fakeSender();
    const lookup = isTestUser(PHONE.phoneNumber);
    const provider = new LocalOtpProvider(sender, fakeStore(), alwaysAllowLimiter(), lookup);

    await provider.sendOtp(PHONE);

    expect(lookup).not.toHaveBeenCalled();
    expect(sender.sendOtp).toHaveBeenCalledTimes(1);
  });
});
