import { OTP_PROVIDER } from "@api/shared/config";
import { Msg91Client } from "@api/core/otp/repositories";
import type { OtpSmsSender } from "@api/core/otp/services/sms-sender";

/**
 * MSG91 delivery adapter. Translation only — no business rules, no retry, no
 * session state: `LocalOtpProvider` owns all of that.
 *
 * Lives in `services/` rather than `repositories/` because `arch-boundaries.json`
 * forbids `repositories/` importing `/services/` (including type-only imports —
 * the `allowTypeOnly` escape hatch covers only per-module `api` facade paths),
 * and this has to implement the `OtpSmsSender` interface declared next door.
 * `services/ -> repositories/` is the sanctioned direction, and it keeps company
 * with `StubOtpProvider`. The HTTP call itself stays in `Msg91Client`.
 */
export class Msg91SmsSender implements OtpSmsSender {
  readonly name = OTP_PROVIDER.MSG91;

  constructor(private readonly client: Msg91Client = new Msg91Client()) {}

  async sendOtp(input: {
    phoneCountryCode: string;
    phoneNumber: string;
    otp: string;
    appSignatureHash?: string;
  }): Promise<void> {
    // Resolves only on an accepted send; the client throws on a non-2xx, an
    // unparseable body, or MSG91's 200-with-{"type":"error"}. The request id it
    // returns is already logged there, so there is nothing to pass upward — the
    // caller only needs "delivered or not".
    await this.client.sendTemplatedOtp(
      {
        phoneCountryCode: input.phoneCountryCode,
        phoneNumber: input.phoneNumber,
      },
      input.otp,
      { appSignatureHash: input.appSignatureHash }
    );
  }
}
