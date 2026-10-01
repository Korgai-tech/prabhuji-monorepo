/**
 * The canonical list of OTP-provider identifiers.
 *
 * This lives in `shared/` — not in `core/otp/` — for exactly one reason: the env
 * schema in `shared/config/env.ts` needs it to build the `AUTH_OTP_PROVIDER`
 * enum, and `shared/` must never import `core/` (an arch-boundary rule).
 * `core/otp` imports this back to key its provider registry, so the list is
 * defined ONCE and the config layer and the module agree by construction rather
 * than by two hand-synced literals. Same reasoning as `payment-providers.ts`.
 *
 * Adding a provider is therefore: one entry here, one row in
 * `OTP_PROVIDER_REQUIRED_KEYS` (env.ts), and one entry in the
 * `OTP_PROVIDER_FACTORIES` registry (core/otp/providers.ts). Nothing else lists
 * provider names. See `core/otp/add_new_otp_provider.md`.
 *
 * `dostii` used to sit here as a placeholder that fell back to the stub with a
 * warning. It was never implemented and is gone — a provider name that silently
 * means "stub" is worse than no name at all.
 */
export const OTP_PROVIDERS = ["stub", "msg91", "trustsignal"] as const;

export type OtpProviderName = (typeof OTP_PROVIDERS)[number];

/** Named constants so no string literal `"msg91"` is retyped anywhere. */
export const OTP_PROVIDER = {
  STUB: "stub",
  MSG91: "msg91",
  TRUSTSIGNAL: "trustsignal",
} as const satisfies Record<string, OtpProviderName>;
