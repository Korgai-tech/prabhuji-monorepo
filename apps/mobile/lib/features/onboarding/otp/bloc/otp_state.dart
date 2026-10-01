import 'package:equatable/equatable.dart';

sealed class OtpState extends Equatable {
  const OtpState({
    required this.otpDigits,
    required this.attemptCount,
    required this.resendCount,
    required this.countdownRemainingSeconds,
  });

  /// Concatenated digit string (0..otpLength). Never surfaced in analytics —
  /// only its length is exported.
  final String otpDigits;

  /// How many verify attempts the current session has consumed.
  final int attemptCount;

  /// How many resend requests have been issued (across all attempts).
  final int resendCount;

  /// Seconds remaining before the Resend CTA becomes tappable.
  final int countdownRemainingSeconds;

  @override
  List<Object?> get props => [
        otpDigits,
        attemptCount,
        resendCount,
        countdownRemainingSeconds,
      ];
}

/// Idle — the user is entering digits or waiting to resend.
class OtpIdle extends OtpState {
  const OtpIdle({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
  });

  OtpIdle copyWith({
    String? otpDigits,
    int? attemptCount,
    int? resendCount,
    int? countdownRemainingSeconds,
  }) =>
      OtpIdle(
        otpDigits: otpDigits ?? this.otpDigits,
        attemptCount: attemptCount ?? this.attemptCount,
        resendCount: resendCount ?? this.resendCount,
        countdownRemainingSeconds:
            countdownRemainingSeconds ?? this.countdownRemainingSeconds,
      );
}

/// The verify mutation is in flight. Submit is disabled.
class OtpVerifying extends OtpState {
  const OtpVerifying({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
  });
}

/// Verify succeeded — JWT stored, orchestrator refreshed. The screen navigates
/// to /name-language as a safety net; the orchestrator will emit the correct
/// target on the next tick.
class OtpVerified extends OtpState {
  const OtpVerified({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
    required this.token,
    required this.isNewUser,
  });

  final String token;
  final bool isNewUser;

  @override
  List<Object?> get props =>
      [...super.props, token, isNewUser];
}

/// Verify came back with OTP_INVALID (401). Show the red-border invalid state,
/// clear the digits so the user can re-enter.
class OtpInvalid extends OtpState {
  const OtpInvalid({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
    required this.errorMessage,
  });

  final String errorMessage;

  @override
  List<Object?> get props => [...super.props, errorMessage];
}

/// Verify came back with OTP_SESSION_EXHAUSTED / OTP_RATE_LIMITED — the user
/// is temporarily blocked from further submits.
class OtpRateLimited extends OtpState {
  const OtpRateLimited({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
    required this.message,
  });

  final String message;

  @override
  List<Object?> get props => [...super.props, message];
}

/// Resend request is in flight.
class OtpResending extends OtpState {
  const OtpResending({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
  });
}

/// Transient — Resend succeeded; the screen surfaces a brief snackbar and the
/// bloc immediately transitions back to [OtpIdle] with a reset countdown.
class OtpResendSuccess extends OtpState {
  const OtpResendSuccess({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
    required this.resendAvailableAfterSeconds,
  });

  final int resendAvailableAfterSeconds;

  @override
  List<Object?> get props => [...super.props, resendAvailableAfterSeconds];
}

/// Resend request failed. The countdown does NOT reset (per PRD §6.4 — the
/// user shouldn't be able to spam retries on a persistent server error).
class OtpResendFailure extends OtpState {
  const OtpResendFailure({
    required super.otpDigits,
    required super.attemptCount,
    required super.resendCount,
    required super.countdownRemainingSeconds,
    required this.message,
  });

  final String message;

  @override
  List<Object?> get props => [...super.props, message];
}
