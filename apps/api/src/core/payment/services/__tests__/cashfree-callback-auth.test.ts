import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import type { CallbackAuthContext } from "../../gateway.js";
import {
  HmacAuthenticator,
  UnverifiedAuthenticator,
  verifyWebhookHmac,
} from "../cashfree-callback-auth.js";

/**
 * Cashfree signs each webhook as base64(HMAC-SHA256(timestamp + rawBody,
 * secret)). The signature binds to the exact bytes, so verification must run on
 * the RAW body — a tampered payload or a wrong secret must fail closed.
 */

const SECRET = "cashfree_test_secret";
const TS = "1690000000";
const BODY = '{"type":"SUBSCRIPTION_PAYMENT_SUCCESS","data":{}}';

function sign(timestamp: string, rawBody: string, secret = SECRET): string {
  return createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
}

describe("verifyWebhookHmac", () => {
  test("accepts a correctly signed payload", () => {
    expect(verifyWebhookHmac(BODY, TS, sign(TS, BODY), SECRET)).toBe(true);
  });

  test("rejects a tampered body", () => {
    expect(verifyWebhookHmac(`${BODY} `, TS, sign(TS, BODY), SECRET)).toBe(false);
  });

  test("rejects a signature made with the wrong secret", () => {
    expect(verifyWebhookHmac(BODY, TS, sign(TS, BODY, "other"), SECRET)).toBe(
      false
    );
  });

  test("rejects a mismatched or missing timestamp", () => {
    expect(verifyWebhookHmac(BODY, "999", sign(TS, BODY), SECRET)).toBe(false);
    expect(verifyWebhookHmac(BODY, undefined, sign(TS, BODY), SECRET)).toBe(
      false
    );
  });

  test("rejects a missing body or signature", () => {
    expect(verifyWebhookHmac(undefined, TS, sign(TS, BODY), SECRET)).toBe(false);
    expect(verifyWebhookHmac(BODY, TS, undefined, SECRET)).toBe(false);
  });
});

describe("HmacAuthenticator", () => {
  function ctx(overrides: Partial<CallbackAuthContext> = {}): CallbackAuthContext {
    return {
      headers: {
        "x-webhook-signature": sign(TS, BODY),
        "x-webhook-timestamp": TS,
      },
      rawBody: BODY,
      sourceIp: "1.2.3.4",
      ...overrides,
    };
  }

  test("passes a correctly signed webhook", () => {
    expect(new HmacAuthenticator(SECRET).authenticate(ctx())).toBe(true);
  });

  test("rejects a tampered body", () => {
    expect(
      new HmacAuthenticator(SECRET).authenticate(ctx({ rawBody: `${BODY}x` }))
    ).toBe(false);
  });

  test("rejects a missing signature header", () => {
    expect(
      new HmacAuthenticator(SECRET).authenticate(
        ctx({ headers: { "x-webhook-timestamp": TS } })
      )
    ).toBe(false);
  });
});

describe("UnverifiedAuthenticator", () => {
  // What the Cashfree gateway actually wires: this account issues no signing
  // key. Accepting is the deliberate posture — the callback body is never
  // believed, so an unauthenticated POST can only trigger a status re-read.
  // Asserted explicitly so flipping it to reject shows up as a failing test
  // rather than a silent outage on every real Cashfree webhook.
  const auth = new UnverifiedAuthenticator();
  const base: CallbackAuthContext = {
    headers: {},
    rawBody: BODY,
    sourceIp: "1.2.3.4",
  };

  test("accepts an unsigned webhook", () => {
    expect(auth.authenticate(base)).toBe(true);
  });

  test("accepts regardless of a present-but-bogus signature", () => {
    expect(
      auth.authenticate({
        ...base,
        headers: { "x-webhook-signature": "not-a-real-signature" },
      })
    ).toBe(true);
  });
});
