import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";

const { reportRegistrationConversion, reportPaymentConversion, isConversionReportingEnabled } =
  await import("../referral-conversions.js");

/**
 * What prabhuji reports to the referral service's `/v1/conversions` — the same
 * events cricsignal sends, plus `event_id` = the transaction id on payments.
 *
 * Every way this goes wrong is silent — a wrong body still answers 200 — so the
 * assertions are on the BODY and on WHETHER a request was made at all.
 */

const ORIGINAL_ENV = { ...process.env };

const baseEnv = {
  NODE_ENV: "production",
  // env.ts refuses the default stub providers under NODE_ENV=production.
  ALLOW_STUB_PROVIDERS_IN_PRODUCTION: "true",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  JWT_SECRET: "a-sufficiently-long-secret",
  MEDIA_BUCKET: "test-bucket",
  MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
  ANALYTICS_EVENTS_TIMEOUT_MS: "1234",
  REFERRAL_BASE_URL: "https://platform.example.test",
  REFERRAL_TENANT_KEY: "prabhuji.keyid.secret",
};

const USER = "019f5f4c-793c-7358-aec3-f7941d852db6";
const TXN = "01a08a27-9e9e-75f0-b06f-c8a34c5e50e7";
const CONVERSIONS_URL = "https://platform.example.test/referral/v1/conversions";

const stubFetch = (
  responder: () => Promise<Response>
): { calls: Array<{ url: string; init: RequestInit }> } => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responder();
    })
  );
  return { calls };
};

const accepted = (): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));

const bodiesOf = (calls: Array<{ init: RequestInit }>): Array<Record<string, unknown>> =>
  calls.map((call) => JSON.parse(call.init.body as string) as Record<string, unknown>);

const payment = (isFirstCharge: boolean, amountPaise = 29900) => ({
  isFirstCharge,
  userId: USER,
  transactionId: TXN,
  amountPaise,
  currency: "INR",
});

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, ...baseEnv };
  // `ORIGINAL_ENV` is a snapshot of whatever the worker already had, and a test
  // file that ran earlier in the same worker may have left the media dev
  // carve-out switched on — `env.test.ts` sets it and does not put it back.
  // Combined with `NODE_ENV: production` above, that makes `loadEnv()` throw and
  // every case here fail for a reason that has nothing to do with conversions.
  // Clearing it is what makes this file order-independent; `setProdBaseEnv` in
  // `env.test.ts` deletes the same key for the same reason.
  delete process.env.MEDIA_ALLOW_INSECURE_URLS;
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
  resetEnvCache();
});

describe("registration — exactly as cricsignal sends it", () => {
  it("posts the standard and custom pair, with no event_id and no money", async () => {
    const { calls } = stubFetch(accepted);
    await reportRegistrationConversion({ userId: USER, phone: "+919812345678" });

    expect(calls.map((call) => call.url)).toEqual([CONVERSIONS_URL, CONVERSIONS_URL]);
    expect(bodiesOf(calls)).toEqual([
      {
        user_id: USER,
        type: "registration",
        fb_standard_event: "CompleteRegistration",
        phone: "+919812345678",
      },
      {
        user_id: USER,
        type: "custom",
        event_name: "registration_successful",
        phone: "+919812345678",
      },
    ]);
  });

  it("omits phone entirely when none is known", async () => {
    const { calls } = stubFetch(accepted);
    await reportRegistrationConversion({ userId: USER, phone: null });
    for (const body of bodiesOf(calls)) expect(body).not.toHaveProperty("phone");
  });
});

describe("payments — cricsignal's two moments, event_id = transaction id", () => {
  it("the first charge (the deposit) reports StartTrial + trial_success, subscription:true", async () => {
    const { calls } = stubFetch(accepted);
    await reportPaymentConversion(payment(true));

    expect(bodiesOf(calls)).toEqual([
      {
        user_id: USER,
        type: "subscription",
        fb_standard_event: "StartTrial",
        subscription: true,
        event_id: TXN,
        order_id: TXN,
        value: 299,
        currency: "INR",
      },
      {
        user_id: USER,
        type: "custom",
        event_name: "trial_success",
        event_id: TXN,
        order_id: TXN,
        value: 299,
        currency: "INR",
      },
    ]);
  });

  it("a renewal reports Purchase + subscription_renewed, subscription:false", async () => {
    const { calls } = stubFetch(accepted);
    await reportPaymentConversion(payment(false));

    const [standard, custom] = bodiesOf(calls);
    expect(standard).toMatchObject({
      type: "subscription",
      fb_standard_event: "Purchase",
      subscription: false,
      event_id: TXN,
    });
    expect(custom).toMatchObject({
      type: "custom",
      event_name: "subscription_renewed",
      event_id: TXN,
    });
  });

  it("reports rupees, not paise — the ₹1 deposit is value 1", async () => {
    const { calls } = stubFetch(accepted);
    await reportPaymentConversion(payment(true, 100));
    expect(bodiesOf(calls)[0]).toHaveProperty("value", 1);
  });
});

describe("the wire", () => {
  it("sends the constant tenant and the referral key", async () => {
    const { calls } = stubFetch(accepted);
    await reportRegistrationConversion({ userId: USER });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-tenant-id"]).toBe("prabhuji");
    expect(headers["x-tenant-key"]).toBe("prabhuji.keyid.secret");
    expect(headers["content-type"]).toBe("application/json");
  });
});

describe("only when NODE_ENV === production", () => {
  it.each(["development", "test"])("sends nothing when NODE_ENV=%s", async (nodeEnv) => {
    process.env.NODE_ENV = nodeEnv;
    resetEnvCache();
    const { calls } = stubFetch(accepted);
    await reportRegistrationConversion({ userId: USER });
    await reportPaymentConversion(payment(true));
    expect(calls).toHaveLength(0);
    expect(isConversionReportingEnabled()).toBe(false);
  });

  it("sends nothing in production when the referral key is missing", async () => {
    process.env.REFERRAL_TENANT_KEY = "";
    resetEnvCache();
    const { calls } = stubFetch(accepted);
    await reportRegistrationConversion({ userId: USER });
    expect(calls).toHaveLength(0);
    expect(isConversionReportingEnabled()).toBe(false);
  });

  it("is enabled in production with the referral service configured", () => {
    expect(isConversionReportingEnabled()).toBe(true);
  });
});

describe("a failure never escapes", () => {
  it("resolves on a rejection and still attempts the other half of the pair", async () => {
    const { calls } = stubFetch(() => Promise.resolve(new Response("boom", { status: 500 })));
    await expect(reportRegistrationConversion({ userId: USER })).resolves.toBeUndefined();
    // One attempt per report and no retry — a replayed conversion double-counts.
    expect(calls).toHaveLength(2);
  });

  it("resolves when the network throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );
    await expect(reportPaymentConversion(payment(false))).resolves.toBeUndefined();
  });
});
