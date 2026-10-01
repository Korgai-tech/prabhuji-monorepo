export { OtpService } from "./otp.service.js";
export { OtpAnalyticsService, otpAnalytics } from "./otp-analytics.service.js";
export { StubOtpProvider } from "./stub-otp.provider.js";
export { LocalOtpProvider, type TestUserLookup } from "./local-otp.provider.js";
export { Msg91SmsSender } from "./msg91.sms-sender.js";
export { TrustSignalSmsSender } from "./trustsignal.sms-sender.js";
export { RedisOtpSessionStore } from "./otp-session.store.js";
export type {
  StoredOtpSession,
  CreateOtpSessionInput,
} from "./otp-session.store.js";
export type { OtpProvider } from "./otp.provider.js";
export type { OtpSmsSender } from "./sms-sender.js";
export { rateLimitBucket } from "./phone.bucket.js";
export {
  OTP_LENGTH,
  OTP_RESEND_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_TEMP_BLOCK_MINUTES,
  OTP_EXPIRY_MINUTES,
  OTP_EXPIRY_MS,
  OTP_TEMP_BLOCK_MS,
  SEND_RATE_LIMIT_MAX,
  SEND_RATE_LIMIT_WINDOW_SECONDS,
  RESEND_RATE_LIMIT_MAX,
  RESEND_RATE_LIMIT_WINDOW_SECONDS,
  DELIVERY_RATE_LIMIT_MAX,
  DELIVERY_RATE_LIMIT_WINDOW_SECONDS,
  STUB_FIXED_OTP,
} from "./otp.config.js";
