import 'package:equatable/equatable.dart';

sealed class PhoneOtpState extends Equatable {
  const PhoneOtpState({
    required this.termsAccepted,
    required this.phoneNumber,
  });

  /// Terms checkbox — checked-by-default per PRD §6.2 / §6.3.
  final bool termsAccepted;

  /// Last-known phone number typed into the input. Kept on state so the
  /// terms toggle + inline validation don't drop it. Never emitted to logs.
  final String phoneNumber;

  /// Client-side validation mirror of the backend Zod refinement
  /// (`^[6-9]\d{9}$`).
  bool get isPhoneValid => _phoneRegex.hasMatch(phoneNumber);

  bool get canSubmit => termsAccepted && isPhoneValid;

  @override
  List<Object?> get props => [termsAccepted, phoneNumber];
}

/// Initial state — the two entry points (phone-choice + phone-input) both
/// land here with terms checked-by-default.
class PhoneOtpInitial extends PhoneOtpState {
  const PhoneOtpInitial({
    super.termsAccepted = true,
    super.phoneNumber = '',
  });
}

/// The send-OTP mutation is in flight — the CTA shows a spinner and disables
/// itself so the user can't double-tap.
class PhoneOtpSending extends PhoneOtpState {
  const PhoneOtpSending({
    required super.termsAccepted,
    required super.phoneNumber,
  });
}

/// Send-OTP succeeded — the screen navigates to `/otp` with the session
/// metadata carried on the state so the OTP screen can seed its resend timer.
class PhoneOtpSendSuccess extends PhoneOtpState {
  const PhoneOtpSendSuccess({
    required super.termsAccepted,
    required super.phoneNumber,
    required this.otpSessionId,
    required this.phoneCountryCode,
    required this.resendAvailableAfterSeconds,
    required this.otpLength,
    this.pendingUserId,
  });

  final String otpSessionId;
  final String phoneCountryCode;
  final int resendAvailableAfterSeconds;
  final int otpLength;

  /// The server-issued User row id minted (or found) by `POST /auth/otp/send`
  /// per TAM-154. Null on server builds that don't yet return the field, and
  /// on the pre-verify abandon path — in which case Clarity + analytics stay
  /// un-attributed rather than fabricating one. Same id becomes the JWT
  /// `sub` after verify, so attaching it here means the Clarity session
  /// survives login as a same-user no-op re-init.
  final String? pendingUserId;

  @override
  List<Object?> get props => [
        ...super.props,
        otpSessionId,
        phoneCountryCode,
        resendAvailableAfterSeconds,
        otpLength,
        pendingUserId,
      ];
}

/// Send-OTP failed — the screen shows [errorMessage] inline and keeps the
/// user on the input; the caller can dispatch [SendOtpRequested] again once
/// the user retries.
class PhoneOtpSendFailure extends PhoneOtpState {
  const PhoneOtpSendFailure({
    required super.termsAccepted,
    required super.phoneNumber,
    required this.errorMessage,
    this.errorCode,
  });

  final String errorMessage;
  final String? errorCode;

  @override
  List<Object?> get props => [...super.props, errorMessage, errorCode];
}

final RegExp _phoneRegex = RegExp(r'^[6-9]\d{9}$');
