import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import type { CallbackAuthContext } from "@api/core/payment/gateway.js";
import {
  RazorpaySignatureAuthenticator,
  verifyRazorpayWebhookSignature,
} from "../razorpay-callback-auth.js";

/**
 * Razorpay's webhook signature, pinned against a precomputed digest rather than
 * against a recomputation of the same expression the implementation uses.
 *
 * A self-referential test ("hash it the same way and compare") passes for every
 * wrong scheme too, and this scheme is wrong in three tempting ways: the
 * Cashfree implementation next door concatenates the timestamp into the MESSAGE
 * and emits BASE64, while Razorpay uses the secret as the HMAC KEY only and
 * emits HEX. The literal below is the ground truth.
 */

const SECRET = "rzp_wh_secret_2026";
/** The EXACT bytes a Razorpay delivery would carry. */
const RAW_BODY =
  '{"event":"token.confirmed","payload":{"token":{"entity":{"id":"token_TOK1"}}}}';
/** hex(HMAC_SHA256(key = SECRET, msg = RAW_BODY)). Precomputed, not derived. */
const EXPECTED_HEX =
  "b2a303521b49916b0744b07face90e71602d65739c170d21bbdc3b46e5ede034";

describe("verifyRazorpayWebhookSignature", () => {
  test("accepts the documented hex digest for a known secret and body", () => {
    expect(verifyRazorpayWebhookSignature(RAW_BODY, EXPECTED_HEX, SECRET)).toBe(
      true
    );
  });

  test("the digest is HEX — the base64 form of the same HMAC is rejected", () => {
    // Copying the Cashfree implementation's `.digest("base64")` would make every
    // real delivery fail while the code looked right.
    const base64 = createHmac("sha256", SECRET)
      .update(RAW_BODY, "utf8")
      .digest("base64");
    expect(verifyRazorpayWebhookSignature(RAW_BODY, base64, SECRET)).toBe(false);
  });

  test("the secret is the KEY, not part of the message", () => {
    // Cashfree signs HMAC(timestamp + rawBody). Anything concatenated into the
    // message here produces a digest that never matches.
    const wrong = createHmac("sha256", SECRET)
      .update(SECRET + RAW_BODY, "utf8")
      .digest("hex");
    expect(verifyRazorpayWebhookSignature(RAW_BODY, wrong, SECRET)).toBe(false);
  });

  test("rejects a TAMPERED body under a valid-looking signature", () => {
    // The whole point of signing: the digest binds to the exact payload, so an
    // attacker cannot swap `token.confirmed` for a mandate they do not own.
    const tampered = RAW_BODY.replace("token_TOK1", "token_ATTACKER");
    expect(verifyRazorpayWebhookSignature(tampered, EXPECTED_HEX, SECRET)).toBe(
      false
    );
  });

  test("rejects a body that is merely RE-SERIALISED", () => {
    // A JSON round-trip preserves meaning and changes bytes, which is why this
    // must run on `ctx.rawBody` and never on the parsed body.
    const reserialized = JSON.stringify(JSON.parse(RAW_BODY));
    expect(
      verifyRazorpayWebhookSignature(
        `${reserialized} `,
        EXPECTED_HEX,
        SECRET
      )
    ).toBe(false);
  });

  test("rejects the wrong secret", () => {
    expect(verifyRazorpayWebhookSignature(RAW_BODY, EXPECTED_HEX, "nope")).toBe(
      false
    );
  });

  test.each([
    ["no body", undefined, EXPECTED_HEX, SECRET],
    ["no signature", RAW_BODY, undefined, SECRET],
    ["no secret", RAW_BODY, EXPECTED_HEX, undefined],
    ["empty body", "", EXPECTED_HEX, SECRET],
  ])("fails CLOSED with %s", (_label, body, signature, secret) => {
    expect(verifyRazorpayWebhookSignature(body, signature, secret)).toBe(false);
  });

  test("a short signature is rejected, not a 500", () => {
    // `timingSafeEqual` THROWS on a length mismatch, so the length check has to
    // come first — otherwise a one-character signature gets a 500 instead of a
    // 401, which is both a worse answer and a free liveness probe.
    expect(() =>
      verifyRazorpayWebhookSignature(RAW_BODY, "ab", SECRET)
    ).not.toThrow();
    expect(verifyRazorpayWebhookSignature(RAW_BODY, "ab", SECRET)).toBe(false);
  });
});

describe("RazorpaySignatureAuthenticator", () => {
  function ctx(
    overrides: Partial<CallbackAuthContext> = {}
  ): CallbackAuthContext {
    return {
      headers: { "x-razorpay-signature": EXPECTED_HEX },
      rawBody: RAW_BODY,
      sourceIp: "203.0.113.7",
      ...overrides,
    };
  }

  test("reads X-Razorpay-Signature and accepts a genuine delivery", () => {
    expect(new RazorpaySignatureAuthenticator(SECRET).authenticate(ctx())).toBe(
      true
    );
  });

  test("rejects a delivery with no signature header", () => {
    expect(
      new RazorpaySignatureAuthenticator(SECRET).authenticate(ctx({ headers: {} }))
    ).toBe(false);
  });

  test("rejects a tampered body", () => {
    expect(
      new RazorpaySignatureAuthenticator(SECRET).authenticate(
        ctx({ rawBody: RAW_BODY.replace("token_TOK1", "token_ATTACKER") })
      )
    ).toBe(false);
  });

  /**
   * Razorpay always issues a signing key, so — unlike Cashfree, whose account
   * issues none and which therefore wires `UnverifiedAuthenticator` — an unset
   * secret here means the DEPLOYMENT is wrong, not that this gateway is
   * unsigned. Trusting unsigned POSTs is the wrong way to discover that.
   */
  test("an unset webhook secret REJECTS rather than waving the callback through", () => {
    expect(
      new RazorpaySignatureAuthenticator(undefined).authenticate(ctx())
    ).toBe(false);
    expect(new RazorpaySignatureAuthenticator("").authenticate(ctx())).toBe(false);
  });

  test("ignores a repeated header (an array), rather than guessing", () => {
    expect(
      new RazorpaySignatureAuthenticator(SECRET).authenticate(
        ctx({ headers: { "x-razorpay-signature": [EXPECTED_HEX, "other"] } })
      )
    ).toBe(false);
  });
});
