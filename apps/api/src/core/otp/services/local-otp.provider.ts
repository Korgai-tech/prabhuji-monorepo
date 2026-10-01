import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@api/shared/config";
import { AppError } from "@api/shared/errors";
import { createModuleLogger } from "@api/shared/logs";
import type { SessionMetadata, VerifyProviderResult } from "@api/core/otp/types";
import {
  DELIVERY_RATE_LIMIT_MAX,
  DELIVERY_RATE_LIMIT_WINDOW_SECONDS,
  OTP_EXPIRY_MS,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
} from "@api/core/otp/services/otp.config";
import { rateLimitBucket } from "@api/core/otp/services/phone.bucket";
import type { OtpProvider } from "@api/core/otp/services/otp.provider";
import { RedisRateLimiter } from "@api/shared/rate-limit";
import type { OtpSmsSender } from "@api/core/otp/services/sms-sender";
import type {
  RedisOtpSessionStore,
  StoredOtpSession,
} from "@api/core/otp/services/otp-session.store";

const log = createModuleLogger("otp:local-provider");

/** Is this phone an admin-created test account (`User.isTestUser`)? TAM-187. */
export type TestUserLookup = (
  phoneCountryCode: string,
  phoneNumber: string
) => Promise<boolean>;

/**
 * The OTP lifecycle, owned by us — shared by EVERY real provider.
 *
 * We generate the code, hash it, expire it, count attempts against it, and burn
 * it on first success. The vendor is handed one job: deliver a string
 * (`OtpSmsSender`). That split is the point of the design:
 *
 *   - `OTP_EXPIRY_MINUTES` / `OTP_MAX_ATTEMPTS` mean the same thing on every
 *     provider, instead of being whatever the vendor's own OTP product does.
 *   - Adding a vendor is one `OtpSmsSender` file, not another session lifecycle.
 *   - The security-sensitive part is unit-testable with no network and no
 *     credentials.
 *
 * Session state lives in `RedisOtpSessionStore`, so it survives restarts and
 * spans workers. Contrast `StubOtpProvider`, whose in-process `Map` deliberately
 * does not.
 *
 * ## The one deliberate difference from the stub
 *
 * Resending on an EXPIRED session is refused here (the stub re-issues). A
 * resend chain that resurrects a dead session has no natural end, and the phone
 * has already proven nothing. Users get a clear 401 and press "send" again.
 */
export class LocalOtpProvider implements OtpProvider {
  constructor(
    private readonly sender: OtpSmsSender,
    private readonly store: RedisOtpSessionStore,
    private readonly rateLimiter: RedisRateLimiter = new RedisRateLimiter(),
    // TAM-187 — admin-created test accounts (`User.isTestUser`). Injected, not
    // imported, because this is a service and the flag lives behind a
    // repository; the default means "none", which is what every test that
    // predates the flag wants.
    private readonly isTestUser: TestUserLookup = () => Promise.resolve(false)
  ) {}

  /**
   * The fixed code for a test account, or `null` for everyone else: an env
   * `TEST_NUMBERS` entry, or (TAM-187) a user an admin created as a test user.
   * Both take the one `TEST_OTP`, and both stay FAIL-CLOSED on it — no
   * `TEST_OTP`, no fixed code, a real SMS goes out instead.
   *
   * The env list is checked first so a configured number never costs a query.
   */
  private async fixedOtpFor(
    phoneCountryCode: string,
    phoneNumber: string
  ): Promise<string | null> {
    const fromEnv = testOtpFor(phoneNumber);
    if (fromEnv !== null) return fromEnv;
    const { TEST_OTP } = loadEnv();
    if (!TEST_OTP) return null;
    return (await this.isTestUser(phoneCountryCode, phoneNumber)) ? TEST_OTP : null;
  }

  /** Surfaced as the `provider` field in OTP service logs — e.g. "msg91". */
  get name(): string {
    return this.sender.name;
  }

  async sendOtp(input: {
    phoneCountryCode: string;
    phoneNumber: string;
    appSignatureHash?: string;
    pseudoId?: string;
  }): Promise<SessionMetadata> {
    const otpSessionId = randomUUID();
    // A configured test number gets the fixed code and no SMS; everyone else
    // gets a fresh random one. This is the ONLY thing that differs for them —
    // the session below is built and hashed identically, so verification runs
    // the ordinary path with the ordinary expiry, attempt cap and one-shot
    // burn. Nothing about the verify logic knows test numbers exist.
    const fixedOtp = await this.fixedOtpFor(input.phoneCountryCode, input.phoneNumber);
    const otp = fixedOtp ?? generateOtp();
    const createdAt = Date.now();

    await this.store.create({
      otpSessionId,
      phoneCountryCode: input.phoneCountryCode,
      phoneNumber: input.phoneNumber,
      otpHash: hashOtp(otpSessionId, otp),
      createdAt,
      // TAM-123 — stash the hash on the session so `resendOtp` can reuse it
      // without the client having to resupply it on every resend.
      appSignatureHash: input.appSignatureHash,
      // Analytics only — parked here so verify can stamp it on the signup
      // event without the client having to resend it.
      pseudoId: input.pseudoId,
    });

    if (fixedOtp !== null) {
      // Deliberately NOT delivered. These numbers are unallocated, so MSG91
      // would answer `type:success` for a message no handset ever receives —
      // and we would pay for it.
      //
      // The full number IS logged here, breaking this module's usual
      // country-code-and-length rule. That rule protects a real payer's
      // handset; these are operator-configured fixtures, and this is a login
      // bypass whose audit trail is worthless if it cannot say which account
      // was entered. The code itself is never logged.
      log.warn(
        {
          event: "otp_test_number_used",
          phone_number: `${input.phoneCountryCode}${input.phoneNumber}`,
          otp_session_id: otpSessionId,
        },
        "TEST NUMBER — fixed OTP issued, no SMS sent"
      );
      return {
        otpSessionId,
        phoneCountryCode: input.phoneCountryCode,
        phoneNumber: input.phoneNumber,
        createdAt,
        attempts: 0,
        resendCount: 0,
        invalidated: false,
        pseudoId: input.pseudoId,
      };
    }

    await this.deliver(otpSessionId, {
      phoneCountryCode: input.phoneCountryCode,
      phoneNumber: input.phoneNumber,
      otp,
      appSignatureHash: input.appSignatureHash,
    });

    return {
      otpSessionId,
      phoneCountryCode: input.phoneCountryCode,
      phoneNumber: input.phoneNumber,
      createdAt,
      attempts: 0,
      resendCount: 0,
      invalidated: false,
      pseudoId: input.pseudoId,
    };
  }

  async verifyOtp(input: {
    otpSessionId: string;
    otp: string;
  }): Promise<VerifyProviderResult> {
    const session = await this.store.get(input.otpSessionId);
    if (!session) {
      return {
        ok: false,
        reason: "session_not_found",
        metadata: emptyMetadata(input.otpSessionId),
      };
    }

    if (session.invalidated) {
      return {
        ok: false,
        reason: "session_exhausted",
        metadata: toMetadata(session),
      };
    }

    if (Date.now() - session.createdAt > OTP_EXPIRY_MS) {
      // Expired: also invalidate so subsequent verifies short-circuit.
      await this.store.invalidate(input.otpSessionId);
      return {
        ok: false,
        reason: "session_expired",
        metadata: toMetadata({ ...session, invalidated: true }),
      };
    }

    // Increment BEFORE checking so the exhaustion signal is precise, and so a
    // burst of concurrent guesses cannot each spend the same attempt.
    const attempts = await this.store.incrementAttempts(input.otpSessionId);
    const metadata = toMetadata({ ...session, attempts });

    if (digestsMatch(session.otpHash, hashOtp(input.otpSessionId, input.otp))) {
      // One-shot session; further verify calls report `session_exhausted`.
      await this.store.invalidate(input.otpSessionId);
      return { ok: true, metadata: { ...metadata, invalidated: true } };
    }

    if (attempts >= OTP_MAX_ATTEMPTS) {
      await this.store.invalidate(input.otpSessionId);
      return {
        ok: false,
        reason: "session_exhausted",
        metadata: { ...metadata, invalidated: true },
      };
    }

    return { ok: false, reason: "invalid_otp", metadata };
  }

  async resendOtp(input: { otpSessionId: string }): Promise<SessionMetadata> {
    const session = await this.store.get(input.otpSessionId);
    if (!session) {
      throw new AppError("OTP session not found", 404, "OTP_SESSION_NOT_FOUND");
    }
    if (session.invalidated) {
      throw new AppError(
        "OTP session is no longer valid",
        401,
        "OTP_SESSION_EXHAUSTED"
      );
    }
    if (Date.now() - session.createdAt > OTP_EXPIRY_MS) {
      await this.store.invalidate(input.otpSessionId);
      throw new AppError("OTP session expired", 401, "OTP_SESSION_EXPIRED");
    }

    // A resend issues a NEW code rather than re-sending the old one: the
    // previous digest is all we kept, and re-deriving a code from a hash is the
    // whole point of hashing it.
    // A test number must resend the SAME fixed code. Re-randomising here would
    // silently stop `TEST_OTP` working the moment a tester pressed "resend",
    // which looks exactly like the feature being broken.
    const fixedOtp = await this.fixedOtpFor(session.phoneCountryCode, session.phoneNumber);
    const otp = fixedOtp ?? generateOtp();
    const createdAt = Date.now();
    const resendCount = await this.store.refresh(input.otpSessionId, {
      otpHash: hashOtp(input.otpSessionId, otp),
      createdAt,
    });

    if (fixedOtp !== null) {
      log.warn(
        {
          event: "otp_test_number_used",
          phone_number: `${session.phoneCountryCode}${session.phoneNumber}`,
          otp_session_id: input.otpSessionId,
        },
        "TEST NUMBER — fixed OTP re-issued, no SMS sent"
      );
      return {
        otpSessionId: input.otpSessionId,
        phoneCountryCode: session.phoneCountryCode,
        phoneNumber: session.phoneNumber,
        createdAt,
        attempts: 0,
        resendCount,
        invalidated: false,
      };
    }

    await this.deliver(input.otpSessionId, {
      phoneCountryCode: session.phoneCountryCode,
      phoneNumber: session.phoneNumber,
      otp,
      // TAM-123 — reuse the hash captured on the original send so the
      // resent SMS carries the same retriever suffix. Sessions created
      // before this field existed simply resolve to `undefined` here and
      // the SMS goes out without a suffix (backwards-compatible).
      appSignatureHash: session.appSignatureHash,
    });

    return {
      otpSessionId: input.otpSessionId,
      phoneCountryCode: session.phoneCountryCode,
      phoneNumber: session.phoneNumber,
      createdAt,
      attempts: 0,
      resendCount,
      invalidated: false,
    };
  }

  /**
   * Hand the code to the vendor — the single point at which a real, billable
   * message leaves. Both `sendOtp` and `resendOtp` funnel through here, which
   * is why the per-phone ceiling lives here and not at an entry point: this is
   * the only place that sees every message AND knows which handset it is for.
   *
   * On any failure, burn the session before throwing: a live session behind an
   * SMS that never arrived is a code screen the user can never satisfy, and it
   * would keep consuming their verify budget.
   */
  private async deliver(
    otpSessionId: string,
    input: {
      phoneCountryCode: string;
      phoneNumber: string;
      otp: string;
      appSignatureHash?: string;
    }
  ): Promise<void> {
    const verdict = await this.rateLimiter.consume(
      // Same peppered-digest scheme as the send limiter: a raw number here
      // would be recoverable from `MONITOR`, `SLOWLOG` or a key listing.
      `otp:delivery:${input.phoneCountryCode}${rateLimitBucket(
        loadEnv().AUTH_OTP_PEPPER,
        input.phoneCountryCode,
        input.phoneNumber
      )}`,
      DELIVERY_RATE_LIMIT_MAX,
      DELIVERY_RATE_LIMIT_WINDOW_SECONDS
    );
    if (!verdict.allowed) {
      await this.burn(otpSessionId);
      log.warn(
        {
          provider: this.sender.name,
          country_code: input.phoneCountryCode,
          phone_number_length: input.phoneNumber.length,
          retry_after_seconds: verdict.retryAfterSeconds,
          error_code: "OTP_RATE_LIMITED",
        },
        "OTP delivery rate limited"
      );
      throw new AppError(
        "Too many OTP requests for this phone",
        429,
        "OTP_RATE_LIMITED"
      );
    }

    try {
      await this.sender.sendOtp(input);
    } catch (err) {
      await this.burn(otpSessionId);
      log.error(
        {
          provider: this.sender.name,
          country_code: input.phoneCountryCode,
          phone_number_length: input.phoneNumber.length,
          error_code: "OTP_SEND_FAILED",
          err,
        },
        "OTP delivery failed"
      );
      // 500 is already declared on /send and /resend, so this needs no schema
      // change. The vendor's reason stays in the log above, not in the response.
      throw new AppError("Failed to send OTP", 500, "OTP_SEND_FAILED");
    }
  }

  /** Best-effort invalidation. Never masks the error that prompted it. */
  private async burn(otpSessionId: string): Promise<void> {
    try {
      await this.store.invalidate(otpSessionId);
    } catch (cleanupErr) {
      log.warn(
        { provider: this.sender.name, err: cleanupErr },
        "failed to invalidate the OTP session after a delivery failure"
      );
    }
  }
}

/**
 * The fixed code for a configured test number, or `null` for everyone else.
 *
 * Test numbers exist so QA and app-store reviewers can sign in without a real
 * handset — the numbers are unallocated, so a real SMS would be billed and
 * never arrive. Configured entirely by env (`TEST_NUMBERS`, `TEST_OTP`); unset
 * means the mechanism does not exist.
 *
 * FAIL-CLOSED and EXACT. No `TEST_OTP` returns `null` even when the number is
 * listed, so a half-configured deploy sends a real OTP rather than accepting a
 * guessable one. Matching is `===` against the whole national number after
 * trimming — never `startsWith`/`includes`, which would turn one entry into a
 * range of admissible numbers.
 */
function testOtpFor(phoneNumber: string): string | null {
  const env = loadEnv();
  if (!env.TEST_OTP || !env.TEST_NUMBERS) return null;
  const allowed = env.TEST_NUMBERS.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return allowed.includes(phoneNumber) ? env.TEST_OTP : null;
}

/**
 * A cryptographically random `OTP_LENGTH`-digit code, zero-padded so every code
 * is the same width (`randomInt` alone would make "0042" a 2-digit code).
 * `randomInt` over `Math.random` because this is a credential.
 */
function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

/**
 * HMAC-SHA256 over the session id AND the code, keyed by `AUTH_OTP_PEPPER`.
 *
 * Hashed so a Redis dump yields no live codes. Bound to the session id so the
 * same code issued in two sessions produces different digests — otherwise a
 * digest observed anywhere could be replayed into another session, and with a
 * 4-digit space the whole rainbow table is 10,000 entries.
 */
function hashOtp(otpSessionId: string, otp: string): string {
  return createHmac("sha256", loadEnv().AUTH_OTP_PEPPER)
    .update(`${otpSessionId}:${otp}`)
    .digest("hex");
}

/** Constant-time digest comparison. Length is checked first — `timingSafeEqual` throws on a mismatch. */
function digestsMatch(stored: string, candidate: string): boolean {
  if (stored.length !== candidate.length || stored.length === 0) return false;
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(candidate, "hex"));
}

function toMetadata(session: StoredOtpSession): SessionMetadata {
  return {
    otpSessionId: session.otpSessionId,
    phoneCountryCode: session.phoneCountryCode,
    phoneNumber: session.phoneNumber,
    createdAt: session.createdAt,
    attempts: session.attempts,
    resendCount: session.resendCount,
    invalidated: session.invalidated,
    pseudoId: session.pseudoId,
  };
}

function emptyMetadata(otpSessionId: string): SessionMetadata {
  return {
    otpSessionId,
    phoneCountryCode: "",
    phoneNumber: "",
    createdAt: 0,
    attempts: 0,
    resendCount: 0,
    invalidated: true,
  };
}
