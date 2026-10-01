import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resetEnvCache } from "@api/shared/config";
import {
  TrustSignalApiError,
  TrustSignalClient,
  renderOtpMessage,
  toTrustSignalMobile,
} from "../trustsignal.client.js";

const API_KEY = "test-api-key-not-a-real-credential";
const SENDER_ID = "PBJAI";
const TEMPLATE_ID = "1177178592792846266";
const TEMPLATE =
  "Your OTP for Prabhuji {#num#}. This code is valid for 10 minutes. Do not share it with anyone. {#alp#} -Prabhu Ji";
const OTP = "4821";
const PHONE = "9876543210";

/** A real accepted-send body, shape-for-shape. */
function acceptedBody(transactionId = "txn-1"): unknown {
  return {
    message: "Request process successfully",
    results: [{ phone: 919876543210, transaction_id: transactionId, sms_cost: 1 }],
    success: true,
  };
}

/** A real rejection body, shape-for-shape. */
function rejectedBody(message = "Invalid Template ID sent in the request"): unknown {
  return {
    errors: [{ code: "118", codeMsg: "INVALID_TEMPLATE_ID", message }],
    success: false,
  };
}

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

function send(options: { appSignatureHash?: string } = {}): Promise<string | null> {
  return new TrustSignalClient().sendTemplatedOtp(
    { phoneCountryCode: "+91", phoneNumber: PHONE },
    OTP,
    options
  );
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
  process.env.JWT_SECRET = "a-sufficiently-long-secret";
  process.env.AUTH_OTP_PEPPER = "dev-pepper-for-tests-only-not-secret-32ch";
  process.env.MEDIA_BUCKET = "test-bucket";
  process.env.MEDIA_PUBLIC_BASE_URL = "https://cdn.example.com";
  process.env.TRUSTSIGNAL_API_KEY = API_KEY;
  process.env.TRUSTSIGNAL_SENDER_ID = SENDER_ID;
  process.env.TRUSTSIGNAL_TEMPLATE_ID = TEMPLATE_ID;
  process.env.TRUSTSIGNAL_MESSAGE_TEMPLATE = TEMPLATE;
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.TRUSTSIGNAL_API_KEY;
  delete process.env.TRUSTSIGNAL_SENDER_ID;
  delete process.env.TRUSTSIGNAL_TEMPLATE_ID;
  delete process.env.TRUSTSIGNAL_MESSAGE_TEMPLATE;
  delete process.env.TRUSTSIGNAL_ROUTE;
});

describe("toTrustSignalMobile", () => {
  test("keeps the leading plus — the opposite of toMsg91Mobile", () => {
    expect(toTrustSignalMobile({ phoneCountryCode: "+91", phoneNumber: PHONE })).toBe(
      "+919876543210"
    );
  });

  test("does not double the plus when the country code lacks one", () => {
    expect(toTrustSignalMobile({ phoneCountryCode: "91", phoneNumber: PHONE })).toBe(
      "+919876543210"
    );
  });
});

/**
 * The body is what the DLT operator matches against its registration. A
 * mismatch is dropped AFTER TrustSignal answers `success: true`, so these are
 * the assertions that stand between us and silently undelivered logins.
 */
describe("renderOtpMessage", () => {
  test("substitutes both DLT slots", () => {
    expect(renderOtpMessage(TEMPLATE, OTP, "FA+9qCX9/Su")).toBe(
      "Your OTP for Prabhuji 4821. This code is valid for 10 minutes. Do not share it with anyone. FA+9qCX9/Su -Prabhu Ji"
    );
  });

  test("leaves no double space when there is no hash (every iOS send)", () => {
    const rendered = renderOtpMessage(TEMPLATE, OTP);
    expect(rendered).toBe(
      "Your OTP for Prabhuji 4821. This code is valid for 10 minutes. Do not share it with anyone. -Prabhu Ji"
    );
    expect(rendered).not.toMatch(/ {2,}/);
  });

  test("inserts `$`-bearing values literally, not as replacement patterns", () => {
    // `$&` in a string replacement means "the matched substring". A hash is
    // base64 so it will not contain one today, but the failure mode — a hash
    // silently rendered as "{#alp#}" — is invisible until a handset reads it.
    expect(renderOtpMessage("a {#alp#} b", OTP, "$&$'x")).toBe("a $&$'x b");
  });

  test("substitutes every occurrence, not just the first", () => {
    expect(renderOtpMessage("{#num#} and {#num#}", OTP)).toBe("4821 and 4821");
  });
});

describe("sendTemplatedOtp", () => {
  test("posts the sender, recipient, route, rendered message and template id", async () => {
    const { calls } = stubFetch(jsonResponse(acceptedBody("txn-abc")));

    const transactionId = await send();

    expect(transactionId).toBe("txn-abc");
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toContain("https://sms.trustsignal.io/v1/sms/countrycode");

    const body = bodyOf(calls[0]);
    expect(body.sender_id).toBe(SENDER_ID);
    expect(body.to).toEqual(["+919876543210"]);
    expect(body.route).toBe("transactional");
    expect(body.template_id).toBe(TEMPLATE_ID);
    expect(body.message).toBe(renderOtpMessage(TEMPLATE, OTP));
  });

  test("sends the api key as a query parameter, not a header", async () => {
    const { calls } = stubFetch(jsonResponse(acceptedBody()));

    await send();

    expect(new URL(calls[0].url).searchParams.get("api_key")).toBe(API_KEY);
    expect(JSON.stringify(calls[0].headers)).not.toContain(API_KEY);
  });

  test("honours a configured route override", async () => {
    process.env.TRUSTSIGNAL_ROUTE = "promotional";
    resetEnvCache();
    const { calls } = stubFetch(jsonResponse(acceptedBody()));

    await send();

    expect(bodyOf(calls[0]).route).toBe("promotional");
  });

  test("renders the SMS Retriever hash into the message when provided", async () => {
    const { calls } = stubFetch(jsonResponse(acceptedBody()));

    await send({ appSignatureHash: "FA+9qCX9/Su" });

    // Verbatim, NOT URL-encoded: unlike MSG91's Flow API there is no decode
    // pass here — the string we send is the string the handset receives, so
    // pre-encoding `+` would put a literal "%2B" in front of the user.
    expect(bodyOf(calls[0]).message).toContain("FA+9qCX9/Su");
  });

  /**
   * The single most important behaviour in this file. TrustSignal reports
   * application-level failures in the BODY. Trusting the status code means
   * telling the user "OTP sent" for a message that never left.
   */
  test("throws on a body carrying success:false", async () => {
    stubFetch(jsonResponse(rejectedBody()));

    await expect(send()).rejects.toMatchObject({
      name: "TrustSignalApiError",
      status: 200,
      providerMessage: "Invalid Template ID sent in the request",
    });
  });

  test("throws on success:true carrying no results (accepted, never queued)", async () => {
    stubFetch(jsonResponse({ success: true, message: "ok", results: [] }));

    await expect(send()).rejects.toBeInstanceOf(TrustSignalApiError);
  });

  test("throws when the body has no recognisable success flag at all", async () => {
    stubFetch(jsonResponse({ nonsense: true }));

    await expect(send()).rejects.toBeInstanceOf(TrustSignalApiError);
  });

  test("throws on a non-2xx, surfacing the vendor's reason", async () => {
    stubFetch(jsonResponse(rejectedBody("API Key is required in the request"), 400));

    await expect(send()).rejects.toMatchObject({
      status: 400,
      providerMessage: "API Key is required in the request",
    });
  });

  test("throws on a 2xx with an unparseable body (fail closed)", async () => {
    stubFetch(new Response("<html>gateway</html>", { status: 200 }));

    await expect(send()).rejects.toBeInstanceOf(TrustSignalApiError);
  });

  test("never retries — one call means at most one SMS", async () => {
    const { calls } = stubFetch(jsonResponse(rejectedBody("boom"), 500));

    await expect(send()).rejects.toBeInstanceOf(TrustSignalApiError);
    expect(calls).toHaveLength(1);
  });

  test("propagates a transport failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNRESET"))));

    await expect(send()).rejects.toThrow("ECONNRESET");
  });

  /**
   * The thrown error travels into logs and error trackers, so it must not carry
   * the credential, the handset, or the live code. Sharper here than for MSG91:
   * the OTP is a substring of the request body, so a careless error message
   * that echoed the payload would leak it.
   */
  test("the thrown error leaks neither the api key, the phone, nor the OTP", async () => {
    stubFetch(jsonResponse(rejectedBody("blocked number")));

    const err = (await send()
      .then(() => null)
      .catch((e: unknown) => e)) as TrustSignalApiError;

    const serialized = JSON.stringify({
      message: err.message,
      status: err.status,
      providerMessage: err.providerMessage,
    });
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(OTP);
  });

  test.each([
    "TRUSTSIGNAL_API_KEY",
    "TRUSTSIGNAL_SENDER_ID",
    "TRUSTSIGNAL_TEMPLATE_ID",
    "TRUSTSIGNAL_MESSAGE_TEMPLATE",
  ])("refuses to construct without %s, naming the missing key", (key) => {
    process.env[key] = "";
    resetEnvCache();
    expect(() => new TrustSignalClient()).toThrow(new RegExp(key));
  });
});
