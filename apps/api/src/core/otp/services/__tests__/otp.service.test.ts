import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import jwt from "jsonwebtoken";

/**
 * Verify is the first moment a user id exists for a device, so it is where the
 * device-context cache is seeded. Stubbed at the Redis seam so the real
 * `cacheDeviceContext` runs — including its ordering against the `void`ed
 * analytics sends, which is the whole reason the write lives in the service.
 */
const fakeRedis = {
  data: new Map<string, string>(),
  set: vi.fn((key: string, value: string) => {
    fakeRedis.data.set(key, value);
    return Promise.resolve("OK" as const);
  }),
};

vi.mock("@api/shared/database", () => ({
  getRedis: () => fakeRedis,
}));

import { resetEnvCache } from "@api/shared/config";
import { fakeSubscriptionApi } from "@api/shared/testing";
import {
  clearGlobalServices,
  registerGlobalService,
} from "@api/shared/workspace";
import { OtpService } from "../otp.service.js";
import { StubOtpProvider } from "../stub-otp.provider.js";
import { rateLimitBucket } from "../phone.bucket.js";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  RESEND_RATE_LIMIT_MAX,
  RESEND_RATE_LIMIT_WINDOW_SECONDS,
  STUB_FIXED_OTP,
  UTM_CAPTURE_VERIFY_BUDGET_MS,
} from "../otp.config.js";
import type { RateLimitVerdict } from "@api/shared/rate-limit";
import {
  analyticsEventsClient,
  type AnalyticsEventInput,
} from "@api/shared/analytics";
import { clearDeviceContextWriteCache } from "@api/shared/analytics/device-context.js";
import type { UpsertResult } from "@api/core/otp/repositories";
import type { ISubscriptionApi } from "@api/core/subscription/api";

/**
 * Declared as function-valued PROPERTIES typed through `vi.fn`'s generics
 * rather than as a bare `RedisRateLimiter`, so `mock.calls` stays a tuple the
 * rate-limit assertions can index positionally. Structurally assignable to
 * `RedisRateLimiter`, which is all `OtpService` asks for.
 */
interface FakeLimiter {
  consume: ReturnType<
    typeof vi.fn<
      (key: string, max: number, windowSeconds: number) => Promise<RateLimitVerdict>
    >
  >;
  reset: ReturnType<typeof vi.fn<(key: string) => Promise<void>>>;
}

// A permissive rate-limiter stub: allows everything, so unit tests focus on
// provider + service logic. Rate-limiting is exercised in integration tests.
function alwaysAllowLimiter(): FakeLimiter {
  return {
    consume: vi.fn(() =>
      Promise.resolve({ allowed: true, remaining: 999, retryAfterSeconds: 0 })
    ),
    reset: vi.fn(() => Promise.resolve()),
  };
}

/**
 * Same shape trick as `FakeLimiter`: function-valued PROPERTIES, not methods, so
 * `TAM-154`'s call-order and not-called assertions can read `.mock` off them
 * without tripping `@typescript-eslint/unbound-method`.
 */
interface FakeRepo {
  ensureUserForPhone: ReturnType<
    typeof vi.fn<(phoneCountryCode: string, phoneNumber: string) => Promise<string>>
  >;
  markPhoneVerified: ReturnType<
    typeof vi.fn<
      (phoneCountryCode: string, phoneNumber: string) => Promise<UpsertResult>
    >
  >;
  findIdByPhone: ReturnType<
    typeof vi.fn<
      (phoneCountryCode: string, phoneNumber: string) => Promise<string | null>
    >
  >;
  findFirstUtmReportedAt: ReturnType<
    typeof vi.fn<(userId: string) => Promise<Date | null>>
  >;
  markFirstUtmReported: ReturnType<
    typeof vi.fn<
      (userId: string, at: Date, firstUtmGroup: string | null) => Promise<void>
    >
  >;
  isTestUserPhone: ReturnType<
    typeof vi.fn<(phoneCountryCode: string, phoneNumber: string) => Promise<boolean>>
  >;
}

function makeRepo(overrides: Partial<FakeRepo> = {}): FakeRepo {
  return {
    ensureUserForPhone: vi.fn(() => Promise.resolve("user-1")),
    markPhoneVerified: vi.fn(() =>
      Promise.resolve<UpsertResult>({
        user: {
          id: "user-1",
          phoneCountryCode: "+91",
          phoneNumber: "9876543210",
          createdAt: new Date("2026-08-14T09:30:00.000Z"),
        },
        isNewUser: true,
      })
    ),
    findIdByPhone: vi.fn(() => Promise.resolve<string | null>("user-1")),
    // Unstamped by default, so a test that wires a UTM upstream sees the
    // first-capture branch. `fetchLatestUtm` no-ops without the analytics env, so
    // neither of these is reached in the suite as it stands.
    findFirstUtmReportedAt: vi.fn(() => Promise.resolve<Date | null>(null)),
    markFirstUtmReported: vi.fn(() => Promise.resolve()),
    isTestUserPhone: vi.fn(() => Promise.resolve(false)),
    ...overrides,
  };
}

/**
 * A permissive subscription facade stub — records the call so tests can
 * assert the free-tier seed was invoked (TAM-47) without exercising the
 * real repository. Registered per-test so it doesn't leak.
 */
interface StubSubscriptionApi extends ISubscriptionApi {
  seededUserIds: string[];
}

function makeSubscriptionStub(): StubSubscriptionApi {
  const seededUserIds: string[] = [];
  return {
    seededUserIds,
    // Everything except the seed hook comes from the shared fake, so adding a
    // facade method doesn't drag this file along. Only the one behaviour this
    // suite actually asserts on is overridden.
    ...fakeSubscriptionApi({
      createFreeSubscriptionForUser: vi.fn((userId: string) => {
        seededUserIds.push(userId);
        return Promise.resolve();
      }),
    }),
  };
}

let subscriptionStub: StubSubscriptionApi;

/**
 * ONE spy for the whole file. Two `vi.spyOn` calls on the same method stack —
 * the second wraps the first, so the inner one stops recording and whichever
 * block declared it sees no calls at all.
 */
const send = vi.spyOn(analyticsEventsClient, "send");

const eventsSent = (): AnalyticsEventInput[] => send.mock.calls.flatMap((call) => call[0]);

/**
 * The trackers are `void`ed on the request path, so give them a tick — and match
 * on the TYPE rather than taking the last batch: a new-user verify fires two of
 * them side by side, so "the last send" is a race, not a fact.
 */
const awaitEvent = async (type: string): Promise<AnalyticsEventInput> => {
  let found: AnalyticsEventInput | undefined;
  await vi.waitFor(() => {
    found = eventsSent().find((event) => event.event_type === type);
    expect(found).toBeDefined();
  });
  if (!found) throw new Error(`no ${type} event was sent`);
  return found;
};

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "dev-pepper-for-tests-only-not-secret-32ch";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  clearGlobalServices();
  // The OTP verify path calls `performServiceCall("subscription", ...)` to
  // seed the free-tier row for new users (TAM-47). Register a stub so the
  // lookup succeeds — unit tests don't wire the real subscription module.
  subscriptionStub = makeSubscriptionStub();
  registerGlobalService("subscription", subscriptionStub);
  fakeRedis.data.clear();
  fakeRedis.set.mockClear();
  clearDeviceContextWriteCache();
});

/**
 * The digest no longer identifies a stored user — it only buckets the send-OTP
 * rate limiter. These still matter: a bucket that varied between calls would
 * silently disable rate limiting rather than fail, so determinism is the
 * property under test, not secrecy.
 */
describe("rate-limit bucket", () => {
  test("produces a deterministic sha256 hex over pepper + code + number", () => {
    const h1 = rateLimitBucket("pepper-32-chars-xxxxxxxxxxxxxxxxxx", "+91", "9876543210");
    const h2 = rateLimitBucket("pepper-32-chars-xxxxxxxxxxxxxxxxxx", "+91", "9876543210");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("different pepper produces a different bucket", () => {
    const a = rateLimitBucket("pepper-a-32-chars-xxxxxxxxxxxxxxxx", "+91", "9876543210");
    const b = rateLimitBucket("pepper-b-32-chars-xxxxxxxxxxxxxxxx", "+91", "9876543210");
    expect(a).not.toBe(b);
  });

  test("the raw number never appears in the bucket", () => {
    // The whole reason this is hashed rather than used directly: the value ends
    // up in a Redis key, which surfaces in MONITOR, SLOWLOG and key dumps.
    const bucket = rateLimitBucket("pepper-32-chars-xxxxxxxxxxxxxxxxxx", "+91", "9876543210");
    expect(bucket).not.toContain("9876543210");
  });
});

describe("StubOtpProvider session lifecycle", () => {
  test("sendOtp returns a UUID session with empty counters", async () => {
    const provider = new StubOtpProvider();
    const meta = await provider.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    expect(meta.otpSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(meta.attempts).toBe(0);
    expect(meta.resendCount).toBe(0);
    expect(meta.invalidated).toBe(false);
  });

  test("verifyOtp accepts the fixed OTP and invalidates the session", async () => {
    const provider = new StubOtpProvider();
    const meta = await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9876543210" });
    const first = await provider.verifyOtp({
      otpSessionId: meta.otpSessionId,
      otp: STUB_FIXED_OTP,
    });
    expect(first.ok).toBe(true);
    // Reuse blocked by invalidated flag.
    const second = await provider.verifyOtp({
      otpSessionId: meta.otpSessionId,
      otp: STUB_FIXED_OTP,
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("session_exhausted");
  });

  test("wrong OTP increments attempts", async () => {
    const provider = new StubOtpProvider();
    const meta = await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9876543210" });
    const r = await provider.verifyOtp({ otpSessionId: meta.otpSessionId, otp: "0000" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_otp");
    expect(r.metadata.attempts).toBe(1);
  });

  test("exhausting attempts invalidates the session with session_exhausted", async () => {
    const provider = new StubOtpProvider();
    const meta = await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9876543210" });
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
       
      await provider.verifyOtp({ otpSessionId: meta.otpSessionId, otp: "0000" });
    }
    const final = await provider.verifyOtp({
      otpSessionId: meta.otpSessionId,
      otp: "0000",
    });
    expect(final.ok).toBe(false);
    expect(final.reason).toBe("session_exhausted");
    const session = provider.peek(meta.otpSessionId);
    expect(session?.invalidated).toBe(true);
  });

  test("resend increments resendCount and resets the attempt window", async () => {
    const provider = new StubOtpProvider();
    const meta = await provider.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9876543210" });
    await provider.verifyOtp({ otpSessionId: meta.otpSessionId, otp: "0000" });
    const after = await provider.resendOtp({ otpSessionId: meta.otpSessionId });
    expect(after.resendCount).toBe(1);
    expect(after.attempts).toBe(0);
  });

  test("verify returns session_not_found for unknown session ids", async () => {
    const provider = new StubOtpProvider();
    const r = await provider.verifyOtp({
      otpSessionId: "00000000-0000-4000-8000-000000000000",
      otp: STUB_FIXED_OTP,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("session_not_found");
  });
});

describe("OtpService", () => {
  test("sendOtp returns config-driven metadata", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const result = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    expect(result.otpSessionId).toBeTruthy();
    expect(result.resendAvailableAfterSeconds).toBe(OTP_RESEND_SECONDS);
    expect(result.otpLength).toBe(4);
  });

  /**
   * TAM-154 — lead capture. The row has to be in the database BEFORE the SMS
   * leaves, because the person this exists for is precisely the one who never
   * comes back: a send that succeeds and is then abandoned must still leave a
   * userId and a number to call.
   */
  test("sendOtp writes the user row before the SMS goes out", async () => {
    const provider = new StubOtpProvider();
    const providerSpy = vi.spyOn(provider, "sendOtp");
    const repo = makeRepo();
    const service = new OtpService(repo, provider, alwaysAllowLimiter());

    const result = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    // The id of that lead row is what the response carries back.
    expect(result.userId).toBe("user-1");
    expect(repo.ensureUserForPhone).toHaveBeenCalledWith("+91", "9876543210");
    expect(repo.ensureUserForPhone.mock.invocationCallOrder[0]).toBeLessThan(
      providerSpy.mock.invocationCallOrder[0]
    );
  });

  /**
   * The write sits BEHIND the abuse gate. `/auth/otp/send` is unauthenticated and
   * there is no global limiter, so the per-phone bucket is the only thing between
   * a stranger and an unbounded number of `User` rows.
   */
  test("a rate-limited send writes no user row", async () => {
    const repo = makeRepo();
    const limiter: FakeLimiter = {
      consume: vi.fn(() =>
        Promise.resolve({ allowed: false, remaining: 0, retryAfterSeconds: 300 })
      ),
      reset: vi.fn(() => Promise.resolve()),
    };
    const service = new OtpService(repo, new StubOtpProvider(), limiter);

    await expect(
      service.sendOtp({ phoneCountryCode: "+91", phoneNumber: "9876543210" })
    ).rejects.toMatchObject({ statusCode: 429, errorCode: "OTP_RATE_LIMITED" });
    expect(repo.ensureUserForPhone).not.toHaveBeenCalled();
  });

  test("verifyOtp mints a JWT with sub + email and returns isNewUser", async () => {
    const provider = new StubOtpProvider();
    const repo = makeRepo();
    const service = new OtpService(repo, provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    const verified = await service.verifyOtp({
      otpSessionId: sent.otpSessionId,
      otp: STUB_FIXED_OTP,
    });
    expect(verified.isNewUser).toBe(true);
    // The phone, not a synthetic address. Verify used to return
    // `otp-<id>@prabhuji.internal`, which existed only to satisfy a NOT NULL
    // column and which the app then rendered as the user's avatar initial.
    expect(verified.user.phoneNumber).toBe("9876543210");
    expect(verified.user.phoneCountryCode).toBe("+91");

    const decoded = jwt.verify(verified.token, "a-sufficiently-long-secret") as {
      sub: string;
      email?: string;
    };
    expect(decoded.sub).toBe("user-1");
    // No email claim at all — not an empty string, not null. `analytics.dart`
    // keys its identify call on the claim being a non-empty string, so an
    // absent key is what stops junk reaching the warehouse.
    expect(decoded).not.toHaveProperty("email");
  });

  test("verifyOtp with the wrong OTP throws OTP_INVALID", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    await expect(
      service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: "0000" })
    ).rejects.toMatchObject({ errorCode: "OTP_INVALID", statusCode: 401 });
  });

  test("exhausting attempts surfaces OTP_SESSION_EXHAUSTED", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
       
      await service
        .verifyOtp({ otpSessionId: sent.otpSessionId, otp: "0000" })
        .catch(() => undefined);
    }
    await expect(
      service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: "0000" })
    ).rejects.toMatchObject({ errorCode: "OTP_SESSION_EXHAUSTED", statusCode: 401 });
  });

  test("resendOtp returns the configured resend window", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    const r = await service.resendOtp({ otpSessionId: sent.otpSessionId });
    expect(r.resendAvailableAfterSeconds).toBe(OTP_RESEND_SECONDS);
  });

  /**
   * Resend used to be the one unmetered path — send and verify were both
   * capped, resend was not. Harmless against a stub; against a paid gateway it
   * is a billable-SMS faucet on a public, unauthenticated route.
   */
  test("resendOtp is rate limited per session", async () => {
    const provider = new StubOtpProvider();
    const limiter = alwaysAllowLimiter();
    const service = new OtpService(makeRepo(), provider, limiter);
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    await service.resendOtp({ otpSessionId: sent.otpSessionId });

    const [key, max, window] = limiter.consume.mock.calls[1];
    expect(key).toBe(`otp:resend:${sent.otpSessionId}`);
    expect(max).toBe(RESEND_RATE_LIMIT_MAX);
    expect(window).toBe(RESEND_RATE_LIMIT_WINDOW_SECONDS);
  });

  test("resendOtp answers 429 once the cap is hit, without reaching the provider", async () => {
    const provider = new StubOtpProvider();
    const resendSpy = vi.spyOn(provider, "resendOtp");
    // Allow the initial send, deny the resend.
    let call = 0;
    const limiter: FakeLimiter = {
      consume: vi.fn(() => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? { allowed: true, remaining: 2, retryAfterSeconds: 0 }
            : { allowed: false, remaining: 0, retryAfterSeconds: 300 }
        );
      }),
      reset: vi.fn(() => Promise.resolve()),
    };
    const service = new OtpService(makeRepo(), provider, limiter);
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    await expect(
      service.resendOtp({ otpSessionId: sent.otpSessionId })
    ).rejects.toMatchObject({ statusCode: 429, errorCode: "OTP_RATE_LIMITED" });
    // Short-circuits before the provider — a blocked resend costs nothing.
    expect(resendSpy).not.toHaveBeenCalled();
  });

  test("verifyOtp seeds a subscription row for the user (TAM-47)", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    await service.verifyOtp({
      otpSessionId: sent.otpSessionId,
      otp: STUB_FIXED_OTP,
    });
    // `seededUserIds` is populated by the stub impl on every call — it's
    // both the "was called?" and "what args?" assertion in one array.
    expect(subscriptionStub.seededUserIds).toEqual(["user-1"]);
  });

  /**
   * The cache write has to land BEFORE the `void`ed analytics sends read it,
   * or the login funnel — the one series that most needs segmenting by app
   * version — is the only one that ships unenriched.
   */
  test("verifyOtp caches the device context before emitting its events", async () => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    await service.verifyOtp(
      { otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP },
      { version_name: "1.4.2", device_model: "Pixel 7" }
    );

    expect(fakeRedis.data.get("analytics:device-ctx:user-1")).toBe(
      '{"version_name":"1.4.2","device_model":"Pixel 7"}'
    );
    await awaitEvent("bk_otp_verification_result");
    expect(fakeRedis.set.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]
    );
  });

  test("a verify with no device headers writes nothing", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });

    expect(fakeRedis.set).not.toHaveBeenCalled();
  });

  test("a Redis outage does not change the verify outcome", async () => {
    fakeRedis.set.mockRejectedValueOnce(new Error("redis down"));
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    const verified = await service.verifyOtp(
      { otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP },
      { version_name: "1.4.2" }
    );
    expect(verified.token).toBeTruthy();
  });

  test("existing user returns isNewUser=false", async () => {
    const provider = new StubOtpProvider();
    const repo = makeRepo({
      markPhoneVerified: vi.fn(() =>
        Promise.resolve<UpsertResult>({
          user: {
            id: "user-2",
            phoneCountryCode: "+91",
            phoneNumber: "9876543210",
            createdAt: new Date("2026-08-14T09:30:00.000Z"),
          },
          isNewUser: false,
        })
      ),
    });
    const service = new OtpService(repo, provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    const verified = await service.verifyOtp({
      otpSessionId: sent.otpSessionId,
      otp: STUB_FIXED_OTP,
    });
    expect(verified.isNewUser).toBe(false);
  });
});

/**
 * The wiring, not the shaping — `otp-analytics.service.test.ts` owns the event's
 * payload. What matters here is that BOTH outcomes reach the warehouse, and that
 * a failure is attributable at all (which only works because the send-time row
 * from TAM-154 exists to be looked up).
 */
describe("bk_otp_verification_result wiring", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
  });

  const lastEvent = (): Promise<AnalyticsEventInput> =>
    awaitEvent("bk_otp_verification_result");

  test("a successful verify reports result=success", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });

    const event = await lastEvent();
    expect(event.event_type).toBe("bk_otp_verification_result");
    expect(event.user_id).toBe("user-1");
    expect(event.event_properties).toMatchObject({
      result: "success",
      phone_number: "+919876543210",
      error_code: null,
      attempt_number: 1,
    });
  });

  test("a wrong OTP reports result=failure with the error code, attributed to the lead", async () => {
    const provider = new StubOtpProvider();
    const repo = makeRepo();
    const service = new OtpService(repo, provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    await expect(
      service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: "0000" })
    ).rejects.toMatchObject({ errorCode: "OTP_INVALID" });

    const event = await lastEvent();
    // Resolved from the session's phone — the failure path has no user on its
    // stack, so this is only answerable because the row exists from send time.
    expect(repo.findIdByPhone).toHaveBeenCalledWith("+91", "9876543210");
    expect(event.user_id).toBe("user-1");
    expect(event.event_properties).toMatchObject({
      result: "failure",
      phone_number: "+919876543210",
      error_code: "OTP_INVALID",
      attempt_number: 1,
    });
  });

  test("an unknown session emits nothing — there is no identity to attach", async () => {
    // The provider returns empty phone strings for `session_not_found`, and the
    // collector drops identity-less events, so guessing a user would be worse
    // than staying silent.
    const provider = new StubOtpProvider();
    const repo = makeRepo();
    const service = new OtpService(repo, provider, alwaysAllowLimiter());

    await expect(
      service.verifyOtp({
        otpSessionId: "00000000-0000-4000-8000-000000000000",
        otp: STUB_FIXED_OTP,
      })
    ).rejects.toMatchObject({ errorCode: "OTP_SESSION_EXPIRED" });

    expect(repo.findIdByPhone).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  test("a collector outage does not change the verify outcome", async () => {
    send.mockRejectedValue(new Error("collector down"));
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });

    const verified = await service.verifyOtp({
      otpSessionId: sent.otpSessionId,
      otp: STUB_FIXED_OTP,
    });
    expect(verified.token).toBeTruthy();
  });
});

/**
 * Same split as above: the payload is `otp-analytics.service.test.ts`'s problem.
 * What this owns is the gate — the event must follow the `isNewUser` flip and
 * nothing else, because that flip is the only thing that knows an account was
 * actually born on this call.
 */
describe("bk_account_created wiring", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
  });

  test("a first verify reports the account, timed at now rather than createdAt", async () => {
    const provider = new StubOtpProvider();
    const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });

    const event = await awaitEvent("bk_account_created");
    expect(event.user_id).toBe("user-1");
    expect(event.time).toBeUndefined();
    // `bucket_id` is null here because this suite leaves `ABTEST_BASE_URL`
    // unset, which is the real shape of an env that resolves experiments
    // in-process — the key stays on the event regardless. The configured case
    // is the test below.
    expect(event.event_properties).toEqual({
      account_created_at: "2026-08-14T09:30:00.000Z",
      bucket_id: null,
    });
  });

  /**
   * TAM-258. The ad group has to go down in the SAME guarded write as the
   * marker — the landing resolver reads it as first-touch, and `/latest` can
   * never answer "which campaign was first?" after the fact. This is the only
   * moment that question is answerable at all, so a regression here is
   * permanent for every user it touches.
   */
  test("a first UTM capture persists the ad group alongside the marker", async () => {
    process.env.ANALYTICS_EVENTS_ENABLED = "true";
    process.env.REFERRAL_BASE_URL = "https://platform.example.test";
    process.env.REFERRAL_TENANT_KEY = "prabhuji.keyid.secret";
    resetEnvCache();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/referral/v1/")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                adgroup_name: "prabhuji_STS_hi",
                campaign_name: "diwali",
                referral_info: { utm_source: "google", utm_medium: "cpc" },
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          );
        }
        // Every other fail-soft client on this path answers "nothing here".
        return Promise.resolve(new Response("{}", { status: 404 }));
      })
    );

    try {
      const repo = makeRepo();
      const provider = new StubOtpProvider();
      const service = new OtpService(repo, provider, alwaysAllowLimiter());
      const sent = await service.sendOtp({
        phoneCountryCode: "+91",
        phoneNumber: "9876543210",
      });
      await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });
      await vi.waitFor(() => {
        expect(repo.markFirstUtmReported).toHaveBeenCalled();
      });

      const call = vi.mocked(repo.markFirstUtmReported).mock.calls[0];
      expect(call?.[0]).toBe("user-1");
      expect(call?.[2]).toBe("prabhuji_STS_hi");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.ANALYTICS_EVENTS_ENABLED;
      delete process.env.REFERRAL_BASE_URL;
      delete process.env.REFERRAL_TENANT_KEY;
      resetEnvCache();
    }
  });

  /**
   * The race these three tests exist for.
   *
   * `GET /users/me` decides the ad landing from `users.first_utm_group`, and the
   * app calls it the instant verify hands back a token. While the capture was a
   * bare `void`, the two raced over a ~70–80 ms window (measured on prod
   * 2026-09-25) and losing it LOST the landing rather than delaying it: the
   * early `/users/me` answers `utm_missing` and routes Home, then a later
   * refresh matches and SPENDS the once-only `ad_landing_consumed_at` with
   * nobody listening. Prod: 9 markers consumed, 2 landings delivered.
   */
  describe("first UTM capture is settled before the verify replies", () => {
    function stubReferral(respond: () => Promise<Response>): void {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          if (url.includes("/referral/v1/")) return respond();
          return Promise.resolve(new Response("{}", { status: 404 }));
        })
      );
    }

    function enableReferralEnv(): void {
      process.env.ANALYTICS_EVENTS_ENABLED = "true";
      process.env.REFERRAL_BASE_URL = "https://platform.example.test";
      process.env.REFERRAL_TENANT_KEY = "prabhuji.keyid.secret";
      resetEnvCache();
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.ANALYTICS_EVENTS_ENABLED;
      delete process.env.REFERRAL_BASE_URL;
      delete process.env.REFERRAL_TENANT_KEY;
      resetEnvCache();
    });

    async function verifyOnce(repo: FakeRepo): Promise<void> {
      const service = new OtpService(repo, new StubOtpProvider(), alwaysAllowLimiter());
      const sent = await service.sendOtp({
        phoneCountryCode: "+91",
        phoneNumber: "9876543210",
      });
      await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });
    }

    test("the ad group is stamped BEFORE verifyOtp resolves — no waitFor", async () => {
      // The actual guarantee. Asserted with no `vi.waitFor`, deliberately: the
      // point is that the write has already happened when the caller gets the
      // token, not that it happens eventually. A `waitFor` here would pass just
      // as well against the old racy code and prove nothing.
      enableReferralEnv();
      stubReferral(() =>
        Promise.resolve(
          new Response(JSON.stringify({ adgroup_name: "AD11_RTG_x", campaign_name: "d" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      );

      const repo = makeRepo();
      await verifyOnce(repo);

      expect(repo.markFirstUtmReported).toHaveBeenCalledTimes(1);
      expect(vi.mocked(repo.markFirstUtmReported).mock.calls[0]?.[2]).toBe("AD11_RTG_x");
    });

    test("a RETURNING login is never held, even by a hung referral service", async () => {
      // Already stamped, so nothing this capture finds could be written and
      // there is nothing worth waiting for. It STILL makes the round trip —
      // `bk_latest_utm_source` is reported on every login, not just the first —
      // so the assertion is that the reply is not held by it, not that it is
      // skipped. A hung upstream is what tells the two apart: if this path were
      // awaited the verify would sit here for the whole budget.
      enableReferralEnv();
      stubReferral(() => new Promise<Response>(() => {}));

      const repo = makeRepo({
        findFirstUtmReportedAt: vi.fn(() => Promise.resolve<Date | null>(new Date())),
      });
      const startedAt = Date.now();
      await verifyOnce(repo);

      expect(Date.now() - startedAt).toBeLessThan(UTM_CAPTURE_VERIFY_BUDGET_MS / 2);
      expect(repo.markFirstUtmReported).not.toHaveBeenCalled();
    });

    test("a hung referral service cannot hold the reply past the budget", async () => {
      // Fail OPEN. The capture is raced against a timer, never cancelled, so an
      // overrun degrades to the previous behaviour (stamp lands after the
      // reply, marker left unspent) instead of stalling a login behind a sick
      // upstream.
      enableReferralEnv();
      stubReferral(() => new Promise<Response>(() => {}));

      const repo = makeRepo();
      const startedAt = Date.now();
      await verifyOnce(repo);
      const elapsed = Date.now() - startedAt;

      expect(elapsed).toBeLessThan(UTM_CAPTURE_VERIFY_BUDGET_MS * 3);
      expect(repo.markFirstUtmReported).not.toHaveBeenCalled();
    });

    test("a hung MARKER READ cannot hold the reply either — the budget covers it", async () => {
      // The marker read sits INSIDE the race, not ahead of it. Prisma's default
      // pool timeout is ~10s, so a read placed in front of the timer could stall
      // a verify for all of it under pool pressure while the budget stood by
      // unstarted. This pins that it cannot.
      enableReferralEnv();
      stubReferral(() =>
        Promise.resolve(
          new Response(JSON.stringify({ adgroup_name: "AD11_RTG_x" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      );

      const repo = makeRepo({
        findFirstUtmReportedAt: vi.fn(() => new Promise<Date | null>(() => {})),
      });
      const startedAt = Date.now();
      await verifyOnce(repo);

      expect(Date.now() - startedAt).toBeLessThan(UTM_CAPTURE_VERIFY_BUDGET_MS * 3);
      expect(repo.markFirstUtmReported).not.toHaveBeenCalled();
    });

    test("a capture that throws still returns a successful verify", async () => {
      // The OTP session is already burned by this point, so a 500 here is one
      // the user cannot retry. Every failure stays swallowed.
      enableReferralEnv();
      stubReferral(() => Promise.reject(new Error("referral exploded")));

      const repo = makeRepo({
        findFirstUtmReportedAt: vi.fn(() => Promise.reject(new Error("db down"))),
      });

      await expect(verifyOnce(repo)).resolves.toBeUndefined();
    });
  });

  test("stamps the bucket the abtesting service reports for the new user id", async () => {
    // The subject is the USER ID — the same subject every `evaluateAbtest`
    // call site names — so the bucket on this signup row is the one that will
    // decide every experiment this user is ever in.
    process.env.ABTEST_BASE_URL = "https://platform.example.test/abtesting";
    process.env.ABTEST_TENANT_KEY = "prabhuji.keyid.secret";
    resetEnvCache();
    const bucketCalls: string[] = [];
    // Matched on the URL so the other fail-soft clients on this path (referral
    // conversion, utm capture) cannot be answered with a bucket payload.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (!url.includes("/bucket-space/subject/")) {
          return Promise.reject(new Error("not stubbed"));
        }
        bucketCalls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify({ subjectId: "user-1", bucket: 4211 }), { status: 200 })
        );
      })
    );

    try {
      const provider = new StubOtpProvider();
      const service = new OtpService(makeRepo(), provider, alwaysAllowLimiter());
      const sent = await service.sendOtp({
        phoneCountryCode: "+91",
        phoneNumber: "9876543210",
      });
      await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });

      const event = await awaitEvent("bk_account_created");
      expect(event.event_properties?.bucket_id).toBe(4211);
      expect(bucketCalls).toEqual([
        "https://platform.example.test/abtesting/bucket-space/subject/user-1",
      ]);
    } finally {
      vi.unstubAllGlobals();
      delete process.env.ABTEST_BASE_URL;
      delete process.env.ABTEST_TENANT_KEY;
      resetEnvCache();
    }
  });

  test("a returning user does not report a new account", async () => {
    const provider = new StubOtpProvider();
    const repo = makeRepo({
      markPhoneVerified: vi.fn(() =>
        Promise.resolve<UpsertResult>({
          user: {
            id: "user-2",
            phoneCountryCode: "+91",
            phoneNumber: "9876543210",
            createdAt: new Date("2026-08-14T09:30:00.000Z"),
          },
          isNewUser: false,
        })
      ),
    });
    const service = new OtpService(repo, provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });

    // Waiting on the sibling event first is what makes this a real negative
    // rather than "nothing has been emitted yet" — both are `void`ed together.
    await awaitEvent("bk_otp_verification_result");
    expect(eventsSent().map((event) => event.event_type)).not.toContain(
      "bk_account_created"
    );
  });
});

/**
 * The registration conversion (`CompleteRegistration` + `registration_successful`
 * to the referral service) is CHAINED on `bk_account_created`, not fired beside
 * it: Meta is told about a signup only once the warehouse has the row. The
 * conversion is production-only and one-shot, so this runs under the same
 * production env as `referral-conversions.test.ts` and asserts on ORDER and on
 * WHETHER a request was made at all — the body itself is that file's problem.
 */
describe("registration conversion wiring", () => {
  const CONVERSIONS_URL = "https://platform.example.test/referral/v1/conversions";
  let envSnapshot: NodeJS.ProcessEnv;
  /** Every collector send and every conversion POST, in the order they happened. */
  let sequence: string[];
  let conversionBodies: Array<Record<string, unknown>>;

  const recordSends = (events: AnalyticsEventInput[]): void => {
    for (const event of events) sequence.push(`send:${event.event_type}`);
  };
  const conversions = (): string[] => sequence.filter((step) => step.startsWith("conversion:"));

  beforeEach(() => {
    envSnapshot = { ...process.env };
    process.env.NODE_ENV = "production";
    // env.ts refuses the stub OTP provider under NODE_ENV=production.
    process.env.ALLOW_STUB_PROVIDERS_IN_PRODUCTION = "true";
    process.env.MEDIA_BUCKET = "test-bucket";
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.example.test";
    // A dev-only carve-out an earlier file in this worker may have left on; it
    // makes `loadEnv()` throw under production (see `referral-conversions.test.ts`).
    delete process.env.MEDIA_ALLOW_INSECURE_URLS;
    process.env.REFERRAL_BASE_URL = "https://platform.example.test";
    process.env.REFERRAL_TENANT_KEY = "prabhuji.keyid.secret";
    resetEnvCache();

    sequence = [];
    conversionBodies = [];
    send.mockReset();
    send.mockImplementation((events) => {
      recordSends(events);
      return Promise.resolve();
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === CONVERSIONS_URL) {
          const body = JSON.parse(init?.body as string) as Record<string, unknown>;
          conversionBodies.push(body);
          sequence.push(`conversion:${String(body.event_name ?? body.fb_standard_event)}`);
          return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        }
        // Every other fail-soft client on this path (utm capture, bucket) answers
        // "nothing here".
        return Promise.resolve(new Response("{}", { status: 404 }));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...envSnapshot };
    resetEnvCache();
  });

  async function verify(repo: FakeRepo = makeRepo()): Promise<void> {
    const provider = new StubOtpProvider();
    const service = new OtpService(repo, provider, alwaysAllowLimiter());
    const sent = await service.sendOtp({
      phoneCountryCode: "+91",
      phoneNumber: "9876543210",
    });
    await service.verifyOtp({ otpSessionId: sent.otpSessionId, otp: STUB_FIXED_OTP });
  }

  /** The chain after a send settles is microtasks only, so one macrotask tick is enough. */
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  test("both conversion events go out only after bk_account_created is accepted", async () => {
    await verify();
    await vi.waitFor(() => expect(conversions()).toHaveLength(2));

    const accountCreatedAt = sequence.indexOf("send:bk_account_created");
    expect(accountCreatedAt).toBeGreaterThanOrEqual(0);
    expect(sequence.indexOf("conversion:CompleteRegistration")).toBeGreaterThan(accountCreatedAt);
    expect(sequence.indexOf("conversion:registration_successful")).toBeGreaterThan(
      accountCreatedAt
    );
    // The same user, under the same E.164 phone the account row was reported for.
    for (const body of conversionBodies) {
      expect(body).toMatchObject({ user_id: "user-1", phone: "+919876543210" });
    }
  });

  test("a collector that rejects bk_account_created suppresses the conversion", async () => {
    send.mockImplementation((events) => {
      recordSends(events);
      return Promise.reject(new Error("collector down"));
    });

    await verify();
    await awaitEvent("bk_account_created");
    await settle();

    expect(conversions()).toEqual([]);
  });

  test("a returning login reports neither the account nor a conversion", async () => {
    const repo = makeRepo({
      markPhoneVerified: vi.fn(() =>
        Promise.resolve<UpsertResult>({
          user: {
            id: "user-2",
            phoneCountryCode: "+91",
            phoneNumber: "9876543210",
            createdAt: new Date("2026-08-14T09:30:00.000Z"),
          },
          isNewUser: false,
        })
      ),
    });

    await verify(repo);
    await awaitEvent("bk_otp_verification_result");
    await settle();

    expect(sequence).not.toContain("send:bk_account_created");
    expect(conversions()).toEqual([]);
  });
});
