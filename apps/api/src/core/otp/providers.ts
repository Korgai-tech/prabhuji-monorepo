import { OTP_PROVIDER, type OtpProviderName } from "@api/shared/config";
import { Msg91Client, OtpRepository, TrustSignalClient } from "@api/core/otp/repositories";
import {
  LocalOtpProvider,
  Msg91SmsSender,
  RedisOtpSessionStore,
  StubOtpProvider,
  TrustSignalSmsSender,
  type OtpProvider,
  type TestUserLookup,
} from "@api/core/otp/services";
import { RedisRateLimiter } from "@api/shared/rate-limit";

/** TAM-187 — admin-created test accounts log in with `TEST_OTP`, like `TEST_NUMBERS`. */
const isTestUser: TestUserLookup = (phoneCountryCode, phoneNumber) =>
  new OtpRepository().isTestUserPhone(phoneCountryCode, phoneNumber);

/**
 * The OTP-provider registry — the single point of provider selection.
 *
 * The composition root looks a provider up by `AUTH_OTP_PROVIDER` (see
 * `initOtpModule`). Adding a provider is one entry here plus its
 * `OTP_PROVIDERS` tuple entry and, if it needs credentials, one
 * `OTP_PROVIDER_REQUIRED_KEYS` row — nothing else in the module changes.
 * Full checklist: `add_new_otp_provider.md`.
 *
 * Note what a real provider is made of: `LocalOtpProvider` (shared, owns the
 * whole OTP lifecycle) + a vendor `OtpSmsSender`. A second gateway is that one
 * sender and one line here — no session handling, no expiry rules, no
 * attempt counting.
 *
 * Entries are FACTORIES, not instances, and that is load-bearing: booting on
 * `stub` must never construct `Msg91Client`, whose constructor reads MSG91
 * credentials and throws when they are absent.
 *
 * Lives at the module root, like `core/payment/gateways.ts`, because it wires
 * `services/` to `repositories/` and so belongs to neither layer.
 */
export const OTP_PROVIDER_FACTORIES = {
  [OTP_PROVIDER.STUB]: () => new StubOtpProvider(),
  [OTP_PROVIDER.MSG91]: () =>
    new LocalOtpProvider(
      new Msg91SmsSender(new Msg91Client()),
      new RedisOtpSessionStore(),
      new RedisRateLimiter(),
      isTestUser
    ),
  [OTP_PROVIDER.TRUSTSIGNAL]: () =>
    new LocalOtpProvider(
      new TrustSignalSmsSender(new TrustSignalClient()),
      new RedisOtpSessionStore(),
      new RedisRateLimiter(),
      isTestUser
    ),
} as const satisfies Record<OtpProviderName, () => OtpProvider>;

/** Build the active provider. Total over `OtpProviderName` by construction. */
export function otpProviderFor(name: OtpProviderName): OtpProvider {
  return OTP_PROVIDER_FACTORIES[name]();
}
