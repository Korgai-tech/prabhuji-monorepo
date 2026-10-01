import { timingSafeEqual } from "node:crypto";
import { createModuleLogger } from "@api/shared/logs";
import type {
  CallbackAuthContext,
  CallbackAuthenticator,
} from "@api/core/payment/gateway.js";

const log = createModuleLogger("payment:callback-auth");

/**
 * Provider callback authentication.
 *
 * Decentro's India v3 payments stack has NO HMAC signing — their docs
 * prescribe "share your auth of preference with us, which will then be
 * propagated as part of the callback request", i.e. a static token you supply
 * and they echo back, plus IP allowlisting. (The HMAC `X-Signature` scheme
 * documented on `global.docs.decentro.tech` belongs to a different product and
 * is not available here.)
 *
 * A static bearer token is replayable and leaks permanently if it is ever
 * logged, so it is treated as ONE layer, not the answer. The load-bearing
 * control is that no callback body is ever believed: the handler extracts the
 * reference id and then asks the provider's status API what actually happened.
 * A forged callback claiming "Active" therefore grants nothing.
 */

/**
 * Static-token + IP-allowlist authenticator — the Decentro (and stub) scheme.
 *
 * The `CallbackAuthenticator` the Decentro gateway hands the controller; the
 * logic was previously inlined in `PaymentCallbackController.authorize`.
 */
export class TokenIpAuthenticator implements CallbackAuthenticator {
  constructor(
    private readonly config: {
      token: string | undefined;
      headerName: string;
      allowedCidrs: readonly string[];
    }
  ) {}

  authenticate(ctx: CallbackAuthContext): boolean {
    // A missing token means payments were never configured. Rejecting is the
    // only safe reading: an unauthenticated public write endpoint is strictly
    // worse than a provider seeing 401s while someone fixes the config.
    if (!this.config.token) {
      log.error(
        { event: "callback_token_unset" },
        "callback received but PAYMENT_CALLBACK_TOKEN is unset — rejecting"
      );
      return false;
    }

    const presented = ctx.headers[this.config.headerName.toLowerCase()];
    if (
      !tokensMatch(
        typeof presented === "string" ? presented : undefined,
        this.config.token
      )
    ) {
      log.warn(
        { event: "callback_bad_token", source_ip: ctx.sourceIp },
        "callback rejected — token mismatch"
      );
      return false;
    }

    if (!ipAllowed(ctx.sourceIp, this.config.allowedCidrs)) {
      log.warn(
        { event: "callback_ip_blocked", source_ip: ctx.sourceIp },
        "callback rejected — source IP not in allowlist"
      );
      return false;
    }

    return true;
  }
}

/**
 * Constant-time token comparison.
 *
 * `timingSafeEqual` throws on length mismatch, and a naive `===` leaks both
 * the length and the common prefix through timing. Comparing lengths first
 * (not secret — the token length is fixed by config) and only then doing the
 * constant-time compare gives neither.
 */
export function tokensMatch(
  presented: string | undefined,
  expected: string
): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Resolve the true client IP behind the ALB.
 *
 * `X-Forwarded-For` is `client, proxy1, proxy2...` and is CLIENT-CONTROLLED at
 * the left. Anyone can send `X-Forwarded-For: 1.2.3.4` and have it land first
 * in the list. Only entries appended by our own trusted hops can be believed,
 * so we take the LAST one — the address the ALB actually observed.
 *
 * Returns `null` when there is no forwarded header, so the caller can fall
 * back to the socket address.
 */
export function clientIpFromForwardedFor(
  header: string | undefined
): string | null {
  if (!header) return null;
  const hops = header
    .split(",")
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  return hops.length > 0 ? hops[hops.length - 1] : null;
}

/**
 * Is `ip` inside any of the allowlisted CIDRs?
 *
 * An EMPTY allowlist allows everything — deliberate, because the provider does
 * not publish stable egress ranges and an allowlist that silently drops every
 * callback is a worse failure than not having one. The composition root logs a
 * warning at boot when it is empty, so this is a visible choice rather than an
 * accident.
 *
 * IPv4 only. The provider does not send IPv6 callbacks today, and a
 * half-correct IPv6 matcher is worse than an explicit "not supported".
 */
export function ipAllowed(ip: string | null, cidrs: readonly string[]): boolean {
  if (cidrs.length === 0) return true;
  if (!ip) return false;
  const addr = ipv4ToInt(ip);
  if (addr === null) return false;

  return cidrs.some((cidr) => {
    const [base, bitsRaw] = cidr.split("/");
    const baseInt = ipv4ToInt(base?.trim() ?? "");
    if (baseInt === null) return false;
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    // `>>> 0` keeps the mask unsigned — JS bitwise ops yield signed int32, so
    // a /1 mask would otherwise compare as a negative number.
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return ((addr & mask) >>> 0) === ((baseInt & mask) >>> 0);
  });
}

/** Parse comma-separated CIDRs from env. Blank entries are dropped. */
export function parseCidrList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

function ipv4ToInt(ip: string): number | null {
  // Strip an IPv4-mapped IPv6 prefix — Node reports `::ffff:127.0.0.1` for a
  // v4 client on a dual-stack socket, which would otherwise fail every match.
  const bare = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = bare.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out = ((out << 8) | n) >>> 0;
  }
  return out;
}
