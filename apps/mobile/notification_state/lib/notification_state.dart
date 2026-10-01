/// Device-side notification delivery state — can a notification posted right
/// now actually reach the user?
///
/// Android-only. On any other platform (and under `flutter test`, where the
/// channel has no handler) every read degrades to [NotificationDeviceState.unknown],
/// which reports "shown" — we never invent a suppression we couldn't observe.
library;

import 'package:flutter/services.dart';

/// One snapshot of the three switches that can hold back a notification.
/// Each field is null when the platform couldn't answer.
class NotificationDeviceState {
  const NotificationDeviceState({
    this.notificationsEnabled,
    this.channelEnabled,
    this.dndActive,
  });

  static const unknown = NotificationDeviceState();

  /// App-level switch (includes the Android 13+ POST_NOTIFICATIONS grant).
  final bool? notificationsEnabled;

  /// The target channel's switch. Null when the channel doesn't exist yet.
  final bool? channelEnabled;

  /// Do Not Disturb is filtering interruptions.
  final bool? dndActive;
}

class NotificationStateReader {
  const NotificationStateReader({
    MethodChannel channel = const MethodChannel('prabhuji/notification_state'),
  }) : _channel = channel;

  final MethodChannel _channel;

  /// Never throws.
  Future<NotificationDeviceState> read({String? channelId}) async {
    try {
      final raw = await _channel.invokeMapMethod<String, Object?>(
        'getState',
        <String, Object?>{'channelId': channelId},
      );
      if (raw == null) return NotificationDeviceState.unknown;
      return NotificationDeviceState(
        notificationsEnabled: raw['notificationsEnabled'] as bool?,
        channelEnabled: raw['channelEnabled'] as bool?,
        dndActive: raw['dndActive'] as bool?,
      );
    } catch (_) {
      return NotificationDeviceState.unknown;
    }
  }
}
