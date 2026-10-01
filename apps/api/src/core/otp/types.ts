export interface SendOtpInput {
  phoneCountryCode: string;
  phoneNumber: string;
  /**
   * TAM-123 — 11-char Google SMS Retriever hash. Optional: iOS / older
   * clients omit it, and the SMS is delivered without the retriever suffix.
   */
  appSignatureHash?: string;
  /**
   * Firebase `app_instance_id` (the client's `pseudo_id`). Analytics only —
   * carried to the session so verify can stamp it on `bk_account_created`.
   * `null` is accepted on the wire and means exactly what absent means.
   */
  pseudoId?: string | null;
}

export interface VerifyOtpInput {
  otpSessionId: string;
  otp: string;
}

export interface ResendOtpInput {
  otpSessionId: string;
}

export interface SendOtpResult {
  otpSessionId: string;
  /** The lead row written by this send — same id verify later returns. */
  userId: string;
  resendAvailableAfterSeconds: number;
  otpLength: number;
}

/**
 * The user shape returned by verify. Carries the PHONE, not an email: an
 * OTP account has no email at all now, and the phone is the identity the caller
 * just proved. Nullable because the columns are — a row is only guaranteed to
 * have them by `user_login_type_shape`, which the type system cannot see.
 */
export interface VerifyOtpUser {
  id: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
}

export interface VerifyOtpResult {
  token: string;
  user: VerifyOtpUser;
  isNewUser: boolean;
}

export interface ResendOtpResult {
  resendAvailableAfterSeconds: number;
}

/**
 * Session state tracked by the OTP provider seam. The stub keeps this in
 * process memory (per-instance); a real provider (Dostii/MSG91) will persist
 * to Redis so state survives across workers and restarts.
 */
export interface SessionMetadata {
  otpSessionId: string;
  phoneCountryCode: string;
  /** The real number — this is what `markPhoneVerified` stamps on verify. */
  phoneNumber: string;
  createdAt: number;
  attempts: number;
  resendCount: number;
  invalidated: boolean;
  /**
   * Captured at send (`SendOtpInput.pseudoId`) and echoed back on verify so the
   * signup event can be joined to the install's client-side rows. Undefined for
   * clients that don't send it and for sessions created before it existed.
   */
  pseudoId?: string;
}

export interface VerifyProviderResult {
  ok: boolean;
  metadata: SessionMetadata;
  /**
   * When ok=false the provider returns a discriminant so the service can map
   * to the correct public error code.
   */
  reason?: "invalid_otp" | "session_expired" | "session_exhausted" | "session_not_found";
}
