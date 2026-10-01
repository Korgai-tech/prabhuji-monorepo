import 'package:flutter/services.dart';

/// The native set-as-phone-ringtone seam (TAM-68 Native tasks). Interface +
/// real platform-channel impl + a `FakeSetRingtoneService` (test support), per
/// flutter-feed-screen.md ("platform-channel boundaries get an interface + a
/// fake"). The Dart-side state machine ([SetRingtoneBloc]) drives ONLY this
/// interface, so it is unit-testable with no Android device.
///
/// `WRITE_SETTINGS` is a SPECIAL (AppOps) permission granted only from the
/// system settings screen (`Settings.ACTION_MANAGE_WRITE_SETTINGS`), NOT via a
/// runtime permission dialog — hence [openWriteSettings] deep-links there and
/// the flow re-checks [hasWriteSettingsPermission] when the app resumes.
abstract interface class SetRingtoneService {
  /// `Settings.System.canWrite(context)` on Android.
  Future<bool> hasWriteSettingsPermission();

  /// Launch `ACTION_MANAGE_WRITE_SETTINGS` for this package so the user can
  /// grant the permission. Returns once the intent is launched (the grant
  /// happens on the settings screen; the caller re-checks on resume).
  Future<void> openWriteSettings();

  /// Download/point at [audioUrl], write it to `MediaStore`, and call
  /// `RingtoneManager.setActualDefaultRingtoneUri(TYPE_RINGTONE, uri)`. Returns
  /// `true` on success, `false` on any failure (a thrown [PlatformException] is
  /// also treated as failure by the state machine).
  Future<bool> setPhoneRingtone({required String audioUrl, required String title});
}

/// Real implementation over the `prabhuji/ringtone` [MethodChannel]. The Kotlin
/// handler (`RingtonePlugin.kt`) owns the `RingtoneManager` + `MediaStore` work;
/// this class is a thin, typed boundary. Not device-verified in CI (no Android
/// emulator here) — see the spec Evidence note.
class ChannelSetRingtoneService implements SetRingtoneService {
  const ChannelSetRingtoneService([this._channel = _defaultChannel]);

  static const MethodChannel _defaultChannel = MethodChannel('prabhuji/ringtone');
  final MethodChannel _channel;

  @override
  Future<bool> hasWriteSettingsPermission() async {
    final ok = await _channel.invokeMethod<bool>('hasWriteSettingsPermission');
    return ok ?? false;
  }

  @override
  Future<void> openWriteSettings() =>
      _channel.invokeMethod<void>('openWriteSettings');

  @override
  Future<bool> setPhoneRingtone({
    required String audioUrl,
    required String title,
  }) async {
    final ok = await _channel.invokeMethod<bool>('setPhoneRingtone', {
      'audioUrl': audioUrl,
      'title': title,
    });
    return ok ?? false;
  }
}
