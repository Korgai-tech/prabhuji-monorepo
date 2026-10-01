import 'package:meta/meta.dart';

/// The WRITE_SETTINGS set-ringtone state machine (TAM-68 Native tasks §6.6):
/// `idle → permissionRequired (settings opened) → enabled → setting →
/// success | failed`, with a `permissionDenied` branch when the user returns
/// from settings without granting. Modeled explicitly because `WRITE_SETTINGS`
/// is a settings-screen grant (not a runtime dialog) that must be re-checked on
/// app resume — the single most error-prone piece (#PATH_DECISION).
enum SetRingtoneStatus {
  idle,
  permissionRequired,
  setting,
  success,
  failed,
  permissionDenied,
}

@immutable
class SetRingtoneState {
  const SetRingtoneState({
    this.status = SetRingtoneStatus.idle,
    this.message,
    this.setCount,
  });

  final SetRingtoneStatus status;

  /// User-facing copy for the [permissionDenied]/[failed] states.
  final String? message;

  /// The server-authoritative set count after a successful set (drives the
  /// Preview's "N ringtone set" line).
  final int? setCount;

  static const String deniedCopy =
      'Please enable ringtone permission from Settings to set this ringtone.';
  static const String failedCopy =
      "Couldn't set ringtone. Please try again.";

  bool get isBusy =>
      status == SetRingtoneStatus.permissionRequired ||
      status == SetRingtoneStatus.setting;
}
