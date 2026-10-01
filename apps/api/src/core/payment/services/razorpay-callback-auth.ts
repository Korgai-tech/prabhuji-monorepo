import { createHmac, timingSafeEqual } from "node:crypto";
import { createModuleLogger } from "@api/shared/logs";
import type {
  CallbackAuthContext,
  CallbackAuthenticator,
} from "@api/core/payment/gateway.js";
import { RAZORPAY_WEBHOOK_HEADER } from "@api/core/payment/repositories/razorpay.constants.js";

const log = createModuleLogger("payment:razorpay-callback-auth");

/**
 * Verify a Razorpay webhook's HMAC signature.
 *
 * `hex(HMAC_SHA256(key = webhook_secret, message = RAW request body))`, sent in
 * `X-Razorpay-Signature`.
 *
 * ## Three ways to get this wrong, all of them silent
 *
 * 1. **The secret is the HMAC KEY, not part of the message.** Cashfree signs
 *    `HMAC(timestamp + rawBody)` and the Cashfree implementation next door
 *    reflects that. Copying its shape here — concatenating anything into the
 *    message — produces a digest that never matches, and the symptom is every
 *    webhook 401ing while the code looks correct.
 * 2. **Hex, not base64.** Cashfree's digest is base64. Razorpay's is hex.
 * 3. **The RAW bytes.** A re-serialised body will never match: JSON round-trips
 *    reorder nothing but do change whitespace and unicode escaping. `ctx.rawBody`
 *    is the exact payload Fastify received, retained by the callback route's
 *    scoped content-type parser precisely for this.
 *
 * There is no timestamp in Razorpay's scheme, so there is no replay window to
 * check here. `CallbackService` re-reads the provider's status API before any
 * entitlement moves, which is what bounds a replayed delivery to a wasted poll.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | undefined,
  signature: string | undefined,
  secret: string | undefined
): boolean {
  // Fail CLOSED on anything missing. A webhook with no signature is not
  // "unsigned and therefore fine" — it is unauthenticated.
  if (!rawBody || !signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Length first: `timingSafeEqual` THROWS on a length mismatch rather than
  // returning false, so an attacker sending a short signature would otherwise
  // get a 500 instead of a 401.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Razorpay's webhook authenticator.
 *
 * Unlike Cashfree — whose account issues no signing key, hence
 * `UnverifiedAuthenticator` — Razorpay always issues one, so there is no
 * accept-everything posture to fall back to. A missing `RAZORPAY_WEBHOOK_SECRET`
 * therefore REJECTS rather than waves through: the env schema already requires
 * the key for an enabled provider, so an unset one at runtime means something is
 * wrong with the deployment, and quietly trusting unsigned POSTs is the wrong
 * way to find out.
 *
 * The secret is typed optional because `Env` types it as `optionalSecret` (an
 * unset var renders as `""` in a task definition). Rejecting is the only safe
 * reading of that.
 */
export class RazorpaySignatureAuthenticator implements CallbackAuthenticator {
  constructor(private readonly secret: string | undefined) {}

  authenticate(ctx: CallbackAuthContext): boolean {
    const signature = headerValue(ctx.headers[RAZORPAY_WEBHOOK_HEADER.signature]);

    const ok = verifyRazorpayWebhookSignature(ctx.rawBody, signature, this.secret);
    if (!ok) {
      log.warn(
        {
          event: "callback_bad_signature",
          source_ip: ctx.sourceIp,
          has_secret: Boolean(this.secret),
          has_signature: Boolean(signature),
        },
        "Razorpay callback rejected — HMAC signature mismatch"
      );
    }
    return ok;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
