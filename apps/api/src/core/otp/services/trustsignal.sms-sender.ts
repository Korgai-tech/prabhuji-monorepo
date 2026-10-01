import { OTP_PROVIDER } from "@api/shared/config";
import { TrustSignalClient } from "@api/core/otp/repositories";
import type { OtpSmsSender } from "@api/core/otp/services/sms-sender";

/**
 * TrustSignal delivery adapter. Translation only — no business rules, no retry,
 * no session state: `LocalOtpProvider` owns all of that.
 *
 * Note this adapter is the "vendor that composes its own text" case the
 * `OtpSmsSender` contract calls out: TrustSignal has no server-side template
 * rendering, so the SMS body is assembled from the DLT-registered template in
 * `TrustSignalClient`. The seam is unchanged — the OTP still crosses it as a
 * value, never as formatted copy.
 *
 * Lives in `services/` rather than `repositories/` for the same reason
 * `Msg91SmsSender` does: `arch-boundaries.json` forbids `repositories/`
 * importing `/services/` (including type-only imports), and this has to
 * implement the `OtpSmsSender` interface declared next door.
 * `services/ -> repositories/` is the sanctioned direction.
 */
export class TrustSignalSmsSender implements OtpSmsSender {
  readonly name = OTP_PROVIDER.TRUSTSIGNAL;

  constructor(private readonly client: TrustSignalClient = new TrustSignalClient()) {}

  async sendOtp(input: {
    phoneCountryCode: string;
    phoneNumber: string;
    otp: string;
    appSignatureHash?: string;
  }): Promise<void> {
    // Resolves only on an accepted send; the client throws on a non-2xx, an
    // unparseable body, `success:false`, or success-with-no-results. The
    // transaction id it returns is already logged there, so there is nothing to
    // pass upward — the caller only needs "delivered or not".
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
