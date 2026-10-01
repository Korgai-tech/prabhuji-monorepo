import type { Redis } from "ioredis";
import { getRedis } from "@api/shared/database";
import { AppError } from "@api/shared/errors";
import { OTP_EXPIRY_MS } from "@api/core/otp/services/otp.config";

/**
 * Durable OTP session state, in Redis.
 *
 * ## Why this exists
 *
 * Real SMS gateways key everything by mobile number and have no notion of our
 * `otpSessionId` (a UUID v4 the route schema pins), so the sessionId -> phone
 * mapping is ours to keep — and it has to survive a restart and span workers,
 * which `StubOtpProvider`'s in-process `Map` does not.
 *
 * ## Why it fails closed
 *
 * Every other Redis consumer in this codebase degrades to a no-op when Redis is
 * off, because each is a convenience (a lock, a rate limiter) with a real
 * correctness guarantee behind it. This one has nothing behind it: a session
 * store that silently forgets is not a slower login, it is a broken one — and a
 * store that silently *invents* would be an auth bypass. So it throws.
 *
 * In practice this can only fire on a live Redis outage: `env.ts` refuses to
 * boot with `AUTH_OTP_PROVIDER != stub` unless `ENABLE_REDIS=true`.
 *
 * ## PII
 *
 * The phone number is stored as a VALUE under a random-UUID key, never as part
 * of a key — so the "no raw numbers in `MONITOR` / `SLOWLOG` / `KEYS`" property
 * that `phone.bucket.ts` establishes still holds, and the value is TTL-bounded.
 * The OTP is stored only as a peppered HMAC, so a Redis dump yields no live
 * codes.
 */

const KEY_PREFIX = "otp:session:";

/**
 * Grace on top of the OTP's own validity window.
 *
 * The key outliving the OTP by a few minutes is what lets `verifyOtp`
 * distinguish "expired" from "never existed" — both answer 401 to the caller,
 * but only one of them is a user who typed too slowly, and the logs should say
 * which.
 */
const TTL_GRACE_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = Math.ceil(OTP_EXPIRY_MS / 1000) + TTL_GRACE_SECONDS;

/** Redis hash field names. Kept in one place so a rename can't half-land. */
const FIELD = {
  phoneCountryCode: "cc",
  phoneNumber: "num",
  otpHash: "hash",
  // TAM-123 — Google SMS Retriever 11-char app signature. Distinct field name
  // (`sigHash`, not `hash`) so it can't collide with the OTP hash above.
  appSignatureHash: "sigHash",
  // Firebase `app_instance_id` — analytics identity, read back on verify.
  pseudoId: "pseudoId",
  createdAt: "createdAt",
  attempts: "attempts",
  resendCount: "resendCount",
  invalidated: "invalidated",
} as const;

export interface StoredOtpSession {
  otpSessionId: string;
  phoneCountryCode: string;
  phoneNumber: string;
  otpHash: string;
  createdAt: number;
  attempts: number;
  resendCount: number;
  invalidated: boolean;
  /**
   * TAM-123 — captured on send so resend can render it into the SMS body
   * without the client having to resupply it. Undefined for iOS clients and
   * for sessions created before the field existed.
   */
  appSignatureHash?: string;
  /**
   * Firebase `app_instance_id`, captured on send so `bk_account_created` can
   * carry it at verify. Undefined for clients that don't send one.
   */
  pseudoId?: string;
}

export interface CreateOtpSessionInput {
  otpSessionId: string;
  phoneCountryCode: string;
  phoneNumber: string;
  otpHash: string;
  createdAt: number;
  appSignatureHash?: string;
  pseudoId?: string;
}

/**
 * Every method is public and there are no private members, deliberately: a test
 * fake can then satisfy this type structurally, without a cast.
 */
export class RedisOtpSessionStore {
  async create(input: CreateOtpSessionInput): Promise<void> {
    const redis = client();
    const key = keyFor(input.otpSessionId);
    // Field map is built dynamically because ioredis's `hset` errors on an
    // `undefined` value — we omit `sigHash` entirely for clients that didn't
    // ship one (iOS, older builds), rather than storing an empty string that
    // `get()` would then round-trip back as a truthy "".
    const record: Record<string, string> = {
      [FIELD.phoneCountryCode]: input.phoneCountryCode,
      [FIELD.phoneNumber]: input.phoneNumber,
      [FIELD.otpHash]: input.otpHash,
      [FIELD.createdAt]: String(input.createdAt),
      [FIELD.attempts]: "0",
      [FIELD.resendCount]: "0",
      [FIELD.invalidated]: "0",
    };
    if (input.appSignatureHash) {
      record[FIELD.appSignatureHash] = input.appSignatureHash;
    }
    if (input.pseudoId) {
      record[FIELD.pseudoId] = input.pseudoId;
    }
    await redis.hset(key, record);
    await redis.expire(key, SESSION_TTL_SECONDS);
  }

  async get(otpSessionId: string): Promise<StoredOtpSession | null> {
    const redis = client();
    const raw = await redis.hgetall(keyFor(otpSessionId));
    // ioredis answers a missing key with `{}`, not null.
    if (Object.keys(raw).length === 0) return null;
    const storedHash = raw[FIELD.appSignatureHash];
    const storedPseudoId = raw[FIELD.pseudoId];
    return {
      otpSessionId,
      phoneCountryCode: raw[FIELD.phoneCountryCode] ?? "",
      phoneNumber: raw[FIELD.phoneNumber] ?? "",
      otpHash: raw[FIELD.otpHash] ?? "",
      createdAt: toInt(raw[FIELD.createdAt]),
      attempts: toInt(raw[FIELD.attempts]),
      resendCount: toInt(raw[FIELD.resendCount]),
      invalidated: raw[FIELD.invalidated] === "1",
      appSignatureHash: storedHash && storedHash.length > 0 ? storedHash : undefined,
      pseudoId: storedPseudoId && storedPseudoId.length > 0 ? storedPseudoId : undefined,
    };
  }

  /**
   * Atomic increment, returning the NEW count. Atomic because two verifies
   * racing must not both read the pre-increment value and each get a free
   * attempt — that is how a 5-attempt cap becomes a 10-attempt cap.
   */
  async incrementAttempts(otpSessionId: string): Promise<number> {
    const redis = client();
    return redis.hincrby(keyFor(otpSessionId), FIELD.attempts, 1);
  }

  /**
   * One-shot burn. The key is kept (not deleted) until its TTL so a replay gets
   * the precise `session_exhausted` reason rather than `session_not_found`.
   */
  async invalidate(otpSessionId: string): Promise<void> {
    const redis = client();
    await redis.hset(keyFor(otpSessionId), FIELD.invalidated, "1");
  }

  /**
   * Re-issue: a fresh OTP hash, a fresh window, attempts back to zero, and one
   * more on the resend counter (returned). The TTL is pushed out too, so a
   * resent code lives as long as a fresh one.
   */
  async refresh(
    otpSessionId: string,
    input: { otpHash: string; createdAt: number }
  ): Promise<number> {
    const redis = client();
    const key = keyFor(otpSessionId);
    await redis.hset(key, {
      [FIELD.otpHash]: input.otpHash,
      [FIELD.createdAt]: String(input.createdAt),
      [FIELD.attempts]: "0",
    });
    const resendCount = await redis.hincrby(key, FIELD.resendCount, 1);
    await redis.expire(key, SESSION_TTL_SECONDS);
    return resendCount;
  }

}

function client(): Redis {
  const redis = getRedis();
  if (!redis) {
    // Not a degraded mode — see the class doc. `env.ts` makes this unreachable
    // at boot, so getting here means Redis died under us.
    throw new AppError(
      "OTP service is temporarily unavailable",
      500,
      "OTP_STORE_UNAVAILABLE"
    );
  }
  return redis;
}

function keyFor(otpSessionId: string): string {
  return `${KEY_PREFIX}${otpSessionId}`;
}

function toInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
