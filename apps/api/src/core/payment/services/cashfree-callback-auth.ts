import { createHmac, timingSafeEqual } from "node:crypto";
import { createModuleLogger } from "@api/shared/logs";
import type {
  CallbackAuthContext,
  CallbackAuthenticator,
} from "@api/core/payment/gateway.js";
import { CASHFREE_WEBHOOK_HEADER } from "@api/core/payment/repositories/cashfree.constants.js";

const log = createModuleLogger("payment:cashfree-callback-auth");

/**
 * Verify a Cashfree webhook's HMAC signature.
 *
 * Cashfree signs each webhook as `base64(HMAC-SHA256(timestamp + rawBody,
 * secret))`, sending the digest in `x-webhook-signature` and the timestamp in
 * `x-webhook-timestamp`. Unlike a static token this binds to the exact payload,
 * so it must be computed over the RAW request bytes (a re-serialised body would
 * not match). The compare is constant-time.
 */
export function verifyWebhookHmac(
  rawBody: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: string
): boolean {
  if (!rawBody || !timestamp || !signature) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Accept every callback, unverified — Cashfree's posture here.
 *
 * NOT a placeholder and not a TODO: this Cashfree account issues no webhook
 * signing key, so there is nothing to verify against and no env var holding one.
 * Accepting is safe because authentication is not what protects this endpoint —
 * `CallbackService` treats a callback as a TRIGGER and re-reads Cashfree's
 * status API before touching any entitlement. A forged POST therefore costs one
 * status call and grants nothing. It is the same confirm-by-poll posture the
 * unsigned Decentro callbacks rely on.
 *
 * Every acceptance warn-logs, so the unverified state stays visible in the logs
 * rather than becoming invisible ambient behaviour.
 *
 * If Cashfree ever issues a signing key, swap this for `HmacAuthenticator`
 * below and pass the secret in.
 */
export class UnverifiedAuthenticator implements CallbackAuthenticator {
  authenticate(ctx: CallbackAuthContext): boolean {
    log.warn(
      { event: "callback_signature_skipped", source_ip: ctx.sourceIp },
      "accepting webhook WITHOUT signature verification (no signing key issued; relying on confirm-by-poll)"
    );
    return true;
  }
}

/**
 * HMAC-signature authenticator — Cashfree's documented webhook auth scheme.
 *
 * Currently UNUSED by the Cashfree gateway (see `UnverifiedAuthenticator`), and
 * kept because it is the reusable building block `add_new_gateway.md` points the
 * next signed-webhook provider at, and because turning verification back on is
 * then a one-line wiring change rather than a re-implementation.
 *
 * Reads the raw body (retained by the callback route's content-type parser) and
 * the two signature headers.
 */
export class HmacAuthenticator implements CallbackAuthenticator {
  constructor(private readonly secret: string) {}

  authenticate(ctx: CallbackAuthContext): boolean {
    const signature = headerValue(ctx.headers[CASHFREE_WEBHOOK_HEADER.signature]);
    const timestamp = headerValue(ctx.headers[CASHFREE_WEBHOOK_HEADER.timestamp]);

    const ok = verifyWebhookHmac(ctx.rawBody, timestamp, signature, this.secret);
    if (!ok) {
      log.warn(
        { event: "callback_bad_signature", source_ip: ctx.sourceIp },
        "callback rejected — HMAC signature mismatch"
      );
    }
    return ok;
  }
}

function headerValue(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" ? value : undefined;
}
