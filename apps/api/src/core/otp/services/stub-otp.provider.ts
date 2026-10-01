import { randomUUID } from "node:crypto";
import { AppError } from "@api/shared/errors";
import type { SessionMetadata, VerifyProviderResult } from "@api/core/otp/types";
import {
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  STUB_FIXED_OTP,
} from "@api/core/otp/services/otp.config";
import type { OtpProvider } from "@api/core/otp/services/otp.provider";

/**
 * Local / test provider — accepts the fixed OTP `STUB_FIXED_OTP` ("1234")
 * on verify. Real UUID v4 session ids are minted so callers can't tell the
 * shape apart from a production provider.
 *
 * State is kept in an in-process Map — this is fine for dev + integration
 * tests but does NOT survive a restart and does NOT scale across workers.
 * Production providers own their own durable session store (Redis for
 * MSG91-style providers, provider-side for Twilio Verify / Dostii). This
 * limitation is documented on `SessionMetadata` and is not a bug of this
 * stub — do not "fix" it by hand-rolling Redis storage here.
 */
export class StubOtpProvider implements OtpProvider {
  readonly name = "stub";
  private readonly sessions = new Map<string, SessionMetadata>();

  sendOtp(input: {
    phoneCountryCode: string;
    phoneNumber: string;
    // TAM-123 — accepted for interface parity with LocalOtpProvider but
    // ignored: the stub never sends a real SMS and has no template to render.
    appSignatureHash?: string;
    /** Kept on the session so verify echoes it back, exactly as Redis does. */
    pseudoId?: string;
  }): Promise<SessionMetadata> {
    const now = Date.now();
    const otpSessionId = randomUUID();
    const meta: SessionMetadata = {
      otpSessionId,
      phoneCountryCode: input.phoneCountryCode,
      phoneNumber: input.phoneNumber,
      createdAt: now,
      attempts: 0,
      resendCount: 0,
      invalidated: false,
      pseudoId: input.pseudoId,
    };
    this.sessions.set(otpSessionId, meta);
    return Promise.resolve(meta);
  }

  verifyOtp(input: { otpSessionId: string; otp: string }): Promise<VerifyProviderResult> {
    const session = this.sessions.get(input.otpSessionId);
    if (!session) {
      // No such session — treat as "not found". Caller maps this to 401.
      return Promise.resolve({
        ok: false,
        reason: "session_not_found",
        metadata: this.emptyMetadata(input.otpSessionId),
      });
    }

    if (session.invalidated) {
      return Promise.resolve({ ok: false, reason: "session_exhausted", metadata: session });
    }

    if (Date.now() - session.createdAt > OTP_EXPIRY_MS) {
      // Expired: also invalidate so subsequent verifies short-circuit.
      session.invalidated = true;
      return Promise.resolve({ ok: false, reason: "session_expired", metadata: session });
    }

    // Increment BEFORE checking so the exhaustion signal is precise.
    session.attempts += 1;

    if (input.otp === STUB_FIXED_OTP) {
      session.invalidated = true; // one-shot session; further verify calls fail
      return Promise.resolve({ ok: true, metadata: { ...session } });
    }

    if (session.attempts >= OTP_MAX_ATTEMPTS) {
      session.invalidated = true;
      return Promise.resolve({ ok: false, reason: "session_exhausted", metadata: session });
    }

    return Promise.resolve({ ok: false, reason: "invalid_otp", metadata: session });
  }

  resendOtp(input: { otpSessionId: string }): Promise<SessionMetadata> {
    const session = this.sessions.get(input.otpSessionId);
    if (!session) {
      throw new AppError("OTP session not found", 404, "OTP_SESSION_NOT_FOUND");
    }
    if (session.invalidated) {
      throw new AppError("OTP session is no longer valid", 401, "OTP_SESSION_EXHAUSTED");
    }
    session.resendCount += 1;
    // Refresh the OTP window so resend is effectively a re-issue.
    session.createdAt = Date.now();
    session.attempts = 0;
    return Promise.resolve(session);
  }

  /** Test-only helper to inspect session state. */
  peek(otpSessionId: string): SessionMetadata | undefined {
    return this.sessions.get(otpSessionId);
  }

  /** Test-only helper to clear state between test runs. */
  reset(): void {
    this.sessions.clear();
  }

  private emptyMetadata(otpSessionId: string): SessionMetadata {
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
}
