import 'package:equatable/equatable.dart';

sealed class PhoneOtpEvent extends Equatable {
  const PhoneOtpEvent();

  @override
  List<Object?> get props => const [];
}

/// User typed something into the phone-number field. Only the last-committed
/// digits are held — the raw string is never surfaced in analytics.
class PhoneChanged extends PhoneOtpEvent {
  const PhoneChanged(this.phoneNumber);
  final String phoneNumber;

  @override
  List<Object?> get props => [phoneNumber];
}

/// User toggled the terms checkbox (default: checked).
class TermsToggled extends PhoneOtpEvent {
  const TermsToggled(this.accepted);
  final bool accepted;

  @override
  List<Object?> get props => [accepted];
}

/// User tapped "Get OTP" (Phone Input) or "Continue with Phone Number" post
/// input. The bloc will re-validate terms + regex before it dials the API.
///
/// [appSignatureHash] is TAM-123's runtime-computed Google SMS Retriever hash
/// (Android only; `null` on iOS or when the plugin failed). Passed straight
/// through to `POST /auth/otp/send` so MSG91's template can suffix it into the
/// OTP SMS body — required for the on-device retriever to auto-fill the OTP.
class SendOtpRequested extends PhoneOtpEvent {
  const SendOtpRequested(this.phoneNumber, {this.appSignatureHash});
  final String phoneNumber;
  final String? appSignatureHash;

  @override
  List<Object?> get props => [phoneNumber, appSignatureHash];
}
