import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "@api/app";
import { startTestDb, stopTestDb } from "@api/shared/testing";
import { disconnectPrisma, getPrisma } from "@api/shared/database";
import { clearGlobalServices } from "@api/shared/workspace";
import { resetEnvCache } from "@api/shared/config";
import { initOtpModule } from "@api/core/otp";
import { initSubscriptionModule } from "@api/core/subscription";
import { OTP_MAX_ATTEMPTS, STUB_FIXED_OTP } from "@api/core/otp/services";

// A different phone per test so we don't collide on the (+91, phoneHash)
// unique index across tests (they share the same testcontainers Postgres).
function freshPhone(seed = 1): string {
  const digits = String(6_000_000_000 + Math.floor(Math.random() * 3_000_000_000) + seed);
  return digits.slice(0, 10);
}

interface SendBody {
  success: boolean;
  data: { otpSessionId: string; resendAvailableAfterSeconds: number; otpLength: number };
}
interface VerifyBody {
  success: boolean;
  data: {
    token: string;
    user: {
      id: string;
      phoneCountryCode: string | null;
      phoneNumber: string | null;
    };
    isNewUser: boolean;
  };
}
interface ResendBody {
  success: boolean;
  data: { resendAvailableAfterSeconds: number };
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = "a-sufficiently-long-secret-for-tests";
  process.env.AUTH_OTP_PEPPER = "integration-test-pepper-not-secret-32chars";
  process.env.AUTH_OTP_PROVIDER = "stub";
  process.env.ENABLE_REDIS = "false";
  resetEnvCache();
  await startTestDb();
  app = await buildApp();
  // TAM-47: subscription MUST init BEFORE OTP so the OTP verify path can
  // resolve the `subscription` facade via `performServiceCall` and seed
  // the free-tier row for new users. Same ordering as `bootstrap.ts`.
  initSubscriptionModule(app);
  initOtpModule(app);
  await app.ready();
}, 120_000);

afterAll(async () => {
  await app.close();
  clearGlobalServices();
  await disconnectPrisma();
  await stopTestDb();
});

describe("POST /auth/otp/send", () => {
  test("happy path returns otpSessionId + config", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: freshPhone() },
    });
    expect(res.statusCode).toBe(200);
    const body: SendBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.otpSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(body.data.otpLength).toBe(4);
    expect(body.data.resendAvailableAfterSeconds).toBe(20);
  });

  /**
   * TAM-154 — the feature, end to end. A send alone must leave a callable lead:
   * a real `User` row with the number on it, marked unverified. Before this, a
   * person who never entered the code left nothing at all.
   */
  test("send alone creates the lead row, unverified", async () => {
    const phone = freshPhone();
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    expect(res.statusCode).toBe(200);

    const row = await getPrisma().user.findUnique({
      where: { user_phone_unique: { phoneCountryCode: "+91", phoneNumber: phone } },
    });
    expect(row?.phoneNumber).toBe(phone);
    expect(row?.loginType).toBe("otp");
    expect(row?.phoneVerifiedAt).toBeNull();
  });

  test("rejects a non-+91 country code with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+1", phoneNumber: "9876543210" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, data: null });
  });

  test("rejects a phone starting with 5 with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: "5876543210" },
    });
    expect(res.statusCode).toBe(400);
  });

  test("rejects a phone shorter than 10 digits with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: "98765" },
    });
    expect(res.statusCode).toBe(400);
  });

  // TAM-123 — SMS Retriever app-signature hash. The field is optional so
  // clients that don't ship it (iOS, older builds) still work; presence is
  // strictly validated as the 11-char base64 shape the Retriever API emits.
  test("accepts an optional 11-char appSignatureHash", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: {
        phoneCountryCode: "+91",
        phoneNumber: freshPhone(),
        appSignatureHash: "AbCd12+/xyz",
      },
    });
    expect(res.statusCode).toBe(200);
    const body: SendBody = res.json();
    expect(body.success).toBe(true);
    expect(body.data.otpSessionId).toBeTruthy();
  });

  test("rejects an appSignatureHash that is too short with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: {
        phoneCountryCode: "+91",
        phoneNumber: freshPhone(),
        appSignatureHash: "tooShort",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  test("rejects an appSignatureHash with non-base64 characters with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: {
        phoneCountryCode: "+91",
        phoneNumber: freshPhone(),
        // 11 chars including a `!` — length matches, alphabet does not.
        appSignatureHash: "AbCd12!/xyz",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("send + verify", () => {
  test("happy path — creates a new user + returns JWT + isNewUser=true", async () => {
    const phone = freshPhone();
    const send = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    expect(send.statusCode).toBe(200);
    const sendBody: SendBody = send.json();

    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { otpSessionId: sendBody.data.otpSessionId, otp: STUB_FIXED_OTP },
    });
    expect(verify.statusCode).toBe(200);
    const body: VerifyBody = verify.json();
    expect(body.data.token).toBeTruthy();
    expect(body.data.isNewUser).toBe(true);
    // The verified number comes back, not a synthetic address. And the row
    // carries no credentials — the end-to-end proof of the whole change.
    expect(body.data.user.phoneNumber).toBe(phone);
    expect(body.data.user.phoneCountryCode).toBe("+91");

    const row = await getPrisma().user.findUnique({
      where: { id: body.data.user.id },
    });
    expect(row?.loginType).toBe("otp");
    expect(row?.email).toBeNull();
    expect(row?.passwordHash).toBeNull();
    // TAM-154: the send already created this row — verify stamped it rather than
    // inserting a second one, and `isNewUser` above still means "first verify".
    expect(row?.phoneVerifiedAt).not.toBeNull();
  });

  test("new user verify seeds a subscriptions row with status='free' (TAM-47)", async () => {
    const phone = freshPhone();
    const send = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    const sendBody: SendBody = send.json();
    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { otpSessionId: sendBody.data.otpSessionId, otp: STUB_FIXED_OTP },
    });
    expect(verify.statusCode).toBe(200);
    const body: VerifyBody = verify.json();
    expect(body.data.isNewUser).toBe(true);

    // Subscription row exists with `status: 'free'` and every provider
    // field null — the write path (`'free' → 'active'`) waits for a
    // payment-provider ticket.
    const row = await getPrisma().subscription.findUnique({
      where: { userId: body.data.user.id },
    });
    expect(row).not.toBeNull();
    expect(row?.status).toBe("free");
    expect(row?.activePlanId).toBeNull();
    expect(row?.activeProductId).toBeNull();
    expect(row?.provider).toBeNull();
    expect(row?.providerSubscriptionId).toBeNull();
    expect(row?.expiresAt).toBeNull();
  });

  test("existing verified phone returns isNewUser=false", async () => {
    const phone = freshPhone();
    // First round — create the user.
    const send1 = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    const s1: SendBody = send1.json();
    await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { otpSessionId: s1.data.otpSessionId, otp: STUB_FIXED_OTP },
    });

    // Second round — same phone.
    const send2 = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    const s2: SendBody = send2.json();
    const verify2 = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { otpSessionId: s2.data.otpSessionId, otp: STUB_FIXED_OTP },
    });
    expect(verify2.statusCode).toBe(200);
    const body: VerifyBody = verify2.json();
    expect(body.data.isNewUser).toBe(false);
  });

  test("wrong OTP returns 401 with OTP_INVALID", async () => {
    const phone = freshPhone();
    const send = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    const sendBody: SendBody = send.json();
    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { otpSessionId: sendBody.data.otpSessionId, otp: "0000" },
    });
    expect(verify.statusCode).toBe(401);
    expect(verify.json()).toMatchObject({
      success: false,
      errorCode: "OTP_INVALID",
    });
  });

  test("exhausted attempts returns OTP_SESSION_EXHAUSTED", async () => {
    const phone = freshPhone();
    const send = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    const sendBody: SendBody = send.json();
    // Burn all attempts.
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await app.inject({
        method: "POST",
        url: "/auth/otp/verify",
        payload: { otpSessionId: sendBody.data.otpSessionId, otp: "0000" },
      });
    }
    // Now even the correct OTP fails — the session is exhausted.
    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: { otpSessionId: sendBody.data.otpSessionId, otp: STUB_FIXED_OTP },
    });
    expect(verify.statusCode).toBe(401);
    expect(verify.json()).toMatchObject({
      success: false,
      errorCode: "OTP_SESSION_EXHAUSTED",
    });
  });

  test("verify with unknown otpSessionId returns 401", async () => {
    const verify = await app.inject({
      method: "POST",
      url: "/auth/otp/verify",
      payload: {
        otpSessionId: "00000000-0000-4000-8000-000000000000",
        otp: STUB_FIXED_OTP,
      },
    });
    expect(verify.statusCode).toBe(401);
  });
});

describe("POST /auth/otp/resend", () => {
  test("returns the configured resend window", async () => {
    const phone = freshPhone();
    const send = await app.inject({
      method: "POST",
      url: "/auth/otp/send",
      payload: { phoneCountryCode: "+91", phoneNumber: phone },
    });
    const sendBody: SendBody = send.json();
    const resend = await app.inject({
      method: "POST",
      url: "/auth/otp/resend",
      payload: { otpSessionId: sendBody.data.otpSessionId },
    });
    expect(resend.statusCode).toBe(200);
    const body: ResendBody = resend.json();
    expect(body.data.resendAvailableAfterSeconds).toBe(20);
  });
});

describe("PII log hygiene", () => {
  test("no log line contains the raw OTP or the raw phone number", async () => {
    // Capture stdout + stderr while the flow runs.
    const captured: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        captured.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
        return true;
      });

    try {
      const phone = freshPhone();
      const send = await app.inject({
        method: "POST",
        url: "/auth/otp/send",
        payload: { phoneCountryCode: "+91", phoneNumber: phone },
      });
      const sendBody: SendBody = send.json();
      await app.inject({
        method: "POST",
        url: "/auth/otp/verify",
        payload: { otpSessionId: sendBody.data.otpSessionId, otp: STUB_FIXED_OTP },
      });

      const all = captured.join("");
      // The raw OTP MUST NOT leak.
      expect(all.includes(STUB_FIXED_OTP)).toBe(false);
      // The full 10-digit phone MUST NOT leak.
      expect(all.includes(phone)).toBe(false);
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
