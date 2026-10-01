import 'package:notification_state/notification_state.dart';

/// Push-notification funnel: permission → received → clicked → destination.
///
///  * `notification_permission_result` — the user answered the splash
///    POST_NOTIFICATIONS dialog ([NotificationPermission]).
///  * `notification_permission_dismissed` — they closed it without choosing
///    (back / tap outside). Fires alongside the result's `dismissed`.
///  * `notification_received` — a payload reached the device, in any app
///    state. Background / killed deliveries are sent from the FCM background
///    isolate (`notification_background_receipt.dart`).
///  * `notification_clicked` — the user tapped it (all three tap paths).
///  * `notification_destination_opened` — routing after the tap finished.
///
/// `app_opened` carries `entry_source = notification` (+ the ids below) when
/// the cold launch itself came from a tap.
class NotificationEvents {
  NotificationEvents._();

  static const String permissionResult = 'notification_permission_result';
  static const String permissionDismissed = 'notification_permission_dismissed';
  static const String received = 'notification_received';
  static const String clicked = 'notification_clicked';
  static const String destinationOpened = 'notification_destination_opened';
}

class NotificationEventProps {
  NotificationEventProps._();

  static const String permissionStatus = 'permission_status';
  static const String notificationId = 'notification_id';
  static const String campaignId = 'campaign_id';
  static const String appState = 'app_state';

  /// `notification_received` only: true when the app was open on screen.
  /// Mirrors `app_state == foreground` as a plain boolean for filtering.
  static const String isForeground = 'is_foreground';
  static const String suppressedReason = 'suppressed_reason';
  static const String deeplinkTarget = 'deeplink_target';
  static const String timeToClickSec = 'time_to_click_sec';
  static const String actualDestination = 'actual_destination';
  static const String routingStatus = 'routing_status';
  static const String failureReason = 'failure_reason';

  /// `app_opened` only.
  static const String entrySource = 'entry_source';
  static const String entrySourceNotification = 'notification';
}

/// Values of `permission_status`.
class PushPermissionValue {
  PushPermissionValue._();

  static const String granted = 'granted';
  static const String denied = 'denied';
  static const String dismissed = 'dismissed';
}

class NotificationAppState {
  NotificationAppState._();

  static const String foreground = 'foreground';
  static const String background = 'background';
  static const String killed = 'killed';
}

/// `suppressed_reason` values. Absent (blank) means the notification was
/// shown.
class NotificationSuppressedReason {
  NotificationSuppressedReason._();

  static const String permissionOff = 'permission_off';
  static const String channelOff = 'channel_off';
  static const String dnd = 'dnd';
  static const String inForeground = 'in_foreground';
}

class NotificationRoutingStatus {
  NotificationRoutingStatus._();

  static const String success = 'success';
  static const String fallbackToHome = 'fallback_to_home';
}

/// `failure_reason` values on `notification_destination_opened`.
class NotificationRoutingFailure {
  NotificationRoutingFailure._();

  /// The payload's `type` / `path` maps to no route.
  static const String unknownRoute = 'unknown_route';

  /// The payload carries no routing intent at all.
  static const String missingTarget = 'missing_target';

  /// Navigation ran but a guard (login, onboarding) landed the user
  /// elsewhere. Only set alongside `success`, since the route itself was
  /// valid — `actual_destination` shows where the user ended up.
  static const String redirected = 'redirected';

  /// Pro-only target, and the user left the paywall without Pro. Sent with
  /// `fallback_to_home`.
  static const String notPro = 'not_pro';
}

/// Keys the sending tool puts in the FCM `data` block.
class NotificationPayloadKeys {
  NotificationPayloadKeys._();

  static const String notificationId = 'notification_id';
  static const String campaignId = 'campaign_id';
}

/// FCM default channel — MUST match `FirebaseNotifications._channelId` and
/// the manifest's `default_notification_channel_id`.
const String kDefaultNotificationChannelId = 'prabhuji_default';

/// `notification_id` + `campaign_id` from an FCM `data` payload, with absent
/// ids sent as null so the columns stay present.
Map<String, Object?> notificationIdentityProps(Map<String, dynamic> data) {
  String? read(String key) {
    final v = data[key];
    if (v == null) return null;
    final s = v.toString();
    return s.isEmpty ? null : s;
  }

  return <String, Object?>{
    NotificationEventProps.notificationId:
        read(NotificationPayloadKeys.notificationId),
    NotificationEventProps.campaignId: read(NotificationPayloadKeys.campaignId),
  };
}

/// Why a notification delivered now would not be shown, or null when it
/// would be. Precedence follows the order a user would have to fix things:
/// app permission, then channel, then Do Not Disturb, then our own
/// foreground hold-back ([heldInForeground]).
String? suppressedReasonFor(
  NotificationDeviceState state, {
  bool heldInForeground = false,
}) {
  if (state.notificationsEnabled == false) {
    return NotificationSuppressedReason.permissionOff;
  }
  if (state.channelEnabled == false) {
    return NotificationSuppressedReason.channelOff;
  }
  if (state.dndActive == true) return NotificationSuppressedReason.dnd;
  if (heldInForeground) return NotificationSuppressedReason.inForeground;
  return null;
}
