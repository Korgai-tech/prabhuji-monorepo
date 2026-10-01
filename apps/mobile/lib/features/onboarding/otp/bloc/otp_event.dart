import 'package:equatable/equatable.dart';

sealed class OtpEvent extends Equatable {
  const OtpEvent();

  @override
  List<Object?> get props => const [];
}

/// The user changed one of the digit boxes. [digits] is the concatenated
/// value across the whole entry field so the bloc doesn't reconstruct it.
class DigitEntered extends OtpEvent {
  const DigitEntered(this.digits);
  final String digits;

  @override
  List<Object?> get props => [digits];
}

/// User tapped Submit — the bloc gates on `digits.length == otpLength` and
/// dispatches the verify mutation.
class SubmitTapped extends OtpEvent {
  const SubmitTapped();
}

/// User tapped Resend OTP — only valid when the countdown has hit zero.
class ResendTapped extends OtpEvent {
  const ResendTapped();
}

/// One-second countdown pulse, dispatched from the bloc's own
/// `Stream.periodic` — the state manager owns the timer per PRD §6.4.
class CountdownTicked extends OtpEvent {
  const CountdownTicked();
}

/// User tapped "Change No." — the widget hops back to /phone-input; the bloc
/// records the analytics event but doesn't emit new state.
class ChangeNumberTapped extends OtpEvent {
  const ChangeNumberTapped();
}
