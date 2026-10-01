import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import { Msg91ApiError, Msg91Client, toMsg91Mobile } from "../msg91.client.js";

const AUTH_KEY = "test-auth-key-not-a-real-credential";
const TEMPLATE_ID = "template-123";
const OTP = "4821";
const PHONE = "9876543210";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Captured as a string at record time — the client always sends JSON. */
  body: string;
}

/** Installs a fake `fetch` and hands back the recorded calls. */
function stubFetch(response: Response | (() => Response | Promise<Response>)): {
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({
        url,
        method: String(init.method),
        headers: init.headers as Record<string, string>,
        body: typeof init.body === "string" ? init.body : "",
      });
      return Promise.resolve(typeof response === "function" ? response() : response);
    })
  );
  return { calls };
}

function bodyOf(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(call.body) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "dev-pepper-for-tests-only-not-secret-32ch";
  process.env.MEDIA_BUCKET = "test-bucket";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example.com";
  process.env.MSG91_AUTH_KEY = AUTH_KEY;
  process.env.MSG91_TEMPLATE_ID = TEMPLATE_ID;
  process.env.MSG91_SENDER_ID = "";
  process.env.MSG91_OTP_VAR = "otp";
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.MSG91_SENDER_ID;
});

describe("toMsg91Mobile", () => {
  test("concatenates the country code without the plus", () => {
    expect(toMsg91Mobile({ phoneCountryCode: "+91", phoneNumber: PHONE })).toBe(
      "919876543210"
    );
  });
});

describe("sendTemplatedOtp", () => {
  test("posts the template, the recipient and the OTP variable", async () => {
    const { calls } = stubFetch(jsonResponse({ type: "success", message: "req-1" }));

    const requestId = await new Msg91Client().sendTemplatedOtp(
      { phoneCountryCode: "+91", phoneNumber: PHONE },
      OTP
    );

    expect(requestId).toBe("req-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://control.msg91.com/api/v5/flow/");
    expect(calls[0].method).toBe("POST");

    const body = bodyOf(calls[0]);
    expect(body.template_id).toBe(TEMPLATE_ID);
    expect(body.short_url).toBe("0");
    expect(body.recipients).toEqual([{ mobiles: "919876543210", otp: OTP }]);
    // Unset sender must be omitted entirely, not sent as "".
    expect(body).not.toHaveProperty("sender");
  });

  test("uses the configured template variable name", async () => {
    process.env.MSG91_OTP_VAR = "var1";
    resetEnvCache();
    const { calls } = stubFetch(jsonResponse({ type: "success", message: "req-2" }));

    await new Msg91Client().sendTemplatedOtp(
      { phoneCountryCode: "+91", phoneNumber: PHONE },
      OTP
    );

    expect(bodyOf(calls[0]).recipients).toEqual([
      { mobiles: "919876543210", var1: OTP },
    ]);
  });

  test("includes the sender only when one is configured", async () => {
    process.env.MSG91_SENDER_ID = "PRBHJI";
    resetEnvCache();
    const { calls } = stubFetch(jsonResponse({ type: "success", message: "req-3" }));

    await new Msg91Client().sendTemplatedOtp(
      { phoneCountryCode: "+91", phoneNumber: PHONE },
      OTP
    );

    expect(bodyOf(calls[0]).sender).toBe("PRBHJI");
  });

  test("URL-encodes the appSignatureHash so MSG91's single decode pass preserves `+` and `/`", async () => {
    // Real observed round-trip on the Flow API:
    //  - raw hash sent            → "FA+9qCX9VSu" arrived as "FA 9qCX9VSu"
    //    (MSG91 URL-decoded `+` to space, Retriever match failed).
    //  - double-encoded (`%252B`) → "FA%2b9qCX9VSu" arrived (only one decode
    //    pass happened, so we ended up over-encoded).
    // The Flow API therefore decodes exactly ONCE, and single-encoding is the
    // correct pre-image. Verify both `+` and `/` (the two base64 chars that
    // need encoding at all).
    const { calls } = stubFetch(jsonResponse({ type: "success", message: "ok" }));

    await new Msg91Client().sendTemplatedOtp(
      { phoneCountryCode: "+91", phoneNumber: PHONE },
      OTP,
      { appSignatureHash: "FA+9qCX9/Su" }
    );

    expect(bodyOf(calls[0]).recipients).toEqual([
      { mobiles: "919876543210", otp: OTP, otphash: "FA%2B9qCX9%2FSu" },
    ]);
  });

  test("omits the hash variable when no appSignatureHash is provided", async () => {
    const { calls } = stubFetch(jsonResponse({ type: "success", message: "ok" }));

    await new Msg91Client().sendTemplatedOtp(
      { phoneCountryCode: "+91", phoneNumber: PHONE },
      OTP
    );

    const [recipient] = bodyOf(calls[0]).recipients as Array<Record<string, unknown>>;
    expect(recipient).not.toHaveProperty("otphash");
  });

  test("sends the auth key as the `authkey` header", async () => {
    const { calls } = stubFetch(jsonResponse({ type: "success", message: "ok" }));

    await new Msg91Client().sendTemplatedOtp(
      { phoneCountryCode: "+91", phoneNumber: PHONE },
      OTP
    );

    expect(calls[0].headers.authkey).toBe(AUTH_KEY);
  });

  /**
   * The single most important behaviour in this file. MSG91 reports
   * application-level failures as HTTP 200 with `{"type":"error"}`. Trusting
   * the status code means telling the user "OTP sent" for a message that never
   * left, and they wait on a code screen forever.
   */
  test("throws on HTTP 200 carrying type:error", async () => {
    stubFetch(jsonResponse({ type: "error", message: "template id missing" }));

    await expect(
      new Msg91Client().sendTemplatedOtp(
        { phoneCountryCode: "+91", phoneNumber: PHONE },
        OTP
      )
    ).rejects.toMatchObject({
      name: "Msg91ApiError",
      status: 200,
      msg91Message: "template id missing",
    });
  });

  test("throws when the body has no recognisable type at all", async () => {
    stubFetch(jsonResponse({ nonsense: true }));

    await expect(
      new Msg91Client().sendTemplatedOtp(
        { phoneCountryCode: "+91", phoneNumber: PHONE },
        OTP
      )
    ).rejects.toBeInstanceOf(Msg91ApiError);
  });

  test("throws on a non-2xx", async () => {
    stubFetch(jsonResponse({ type: "error", message: "unauthorized" }, 401));

    await expect(
      new Msg91Client().sendTemplatedOtp(
        { phoneCountryCode: "+91", phoneNumber: PHONE },
        OTP
      )
    ).rejects.toMatchObject({ status: 401 });
  });

  test("throws on a 2xx with an unparseable body (fail closed)", async () => {
    stubFetch(new Response("<html>gateway</html>", { status: 200 }));

    await expect(
      new Msg91Client().sendTemplatedOtp(
        { phoneCountryCode: "+91", phoneNumber: PHONE },
        OTP
      )
    ).rejects.toBeInstanceOf(Msg91ApiError);
  });

  test("never retries — one call means at most one SMS", async () => {
    const { calls } = stubFetch(jsonResponse({ type: "error", message: "boom" }, 500));

    await expect(
      new Msg91Client().sendTemplatedOtp(
        { phoneCountryCode: "+91", phoneNumber: PHONE },
        OTP
      )
    ).rejects.toBeInstanceOf(Msg91ApiError);
    expect(calls).toHaveLength(1);
  });

  test("propagates a transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNRESET"))));

    await expect(
      new Msg91Client().sendTemplatedOtp(
        { phoneCountryCode: "+91", phoneNumber: PHONE },
        OTP
      )
    ).rejects.toThrow("ECONNRESET");
  });

  /**
   * The thrown error travels into logs and error trackers, so it must not carry
   * the credential, the handset, or the live code.
   */
  test("the thrown error leaks neither the auth key, the phone, nor the OTP", async () => {
    stubFetch(jsonResponse({ type: "error", message: "blocked number" }));

    const err = (await new Msg91Client()
      .sendTemplatedOtp({ phoneCountryCode: "+91", phoneNumber: PHONE }, OTP)
      .then(() => null)
      .catch((e: unknown) => e)) as Msg91ApiError;

    const serialized = JSON.stringify({
      message: err.message,
      status: err.status,
      msg91Message: err.msg91Message,
    });
    expect(serialized).not.toContain(AUTH_KEY);
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(OTP);
  });

  test("refuses to construct without credentials, naming the missing key", () => {
    process.env.MSG91_AUTH_KEY = "";
    resetEnvCache();
    expect(() => new Msg91Client()).toThrow(/MSG91_AUTH_KEY/);
  });
});
