// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `analytics:` etc. — the private field names
// would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';

import 'analytics.dart';
import 'notification_analytics.dart';

/// Ask, then report what the user did: `notification_permission_result`
/// whenever a dialog was shown, plus `notification_permission_dismissed`
/// when they closed it without choosing.
Future<void> askNotificationPermission(
  NotificationPermission permission,
  Analytics? analytics,
) async {
  final result = await permission.requestAndClassify();
  if (result == null || analytics == null) return;
  unawaited(analytics.trackEvent(
    NotificationEvents.permissionResult,
    properties: {NotificationEventProps.permissionStatus: result},
  ));
  if (result == PushPermissionValue.dismissed) {
    unawaited(analytics.trackEvent(NotificationEvents.permissionDismissed));
  }
}

/// POST_NOTIFICATIONS ask, classified for `notification_permission_result`
/// (and `notification_permission_dismissed`): what the user did with the
/// dialog.
///
/// Only Android's dialog is classified (iOS isn't shipped); elsewhere the ask
/// is delegated to `requestNonAndroid` and reports nothing.
///
/// ## Why `dismissed` is an approximation
///
/// Android returns "denied" both when the user taps Don't allow and when they
/// back out of the dialog. The one observable difference is
/// `shouldShowRequestPermissionRationale`: a real first denial flips it to
/// true, a dismissal leaves it unchanged. A second real denial comes back as
/// permanently denied. Anything else that ends not-granted is `dismissed`.
///
/// ## Why the timing check
///
/// The splash asks on every launch, and most of those asks show nothing
/// (already granted, or Android has stopped asking). A permanently-denied
/// state recorded by FCM's own ask, before this class existed, is invisible
/// to `permission_handler`, so the status alone can't rule those out. A
/// request that returns faster than a person can react never showed a dialog.
class NotificationPermission {
  NotificationPermission({
    Future<PermissionStatus> Function()? status,
    Future<PermissionStatus> Function()? request,
    Future<bool> Function()? shouldShowRationale,
    Future<int?> Function()? androidSdkInt,
    Future<void> Function()? requestNonAndroid,
    DateTime Function()? clock,
  })  : _requestNonAndroid = requestNonAndroid,
        _status = status ?? (() => Permission.notification.status),
        _request = request ?? (() => Permission.notification.request()),
        _shouldShowRationale = shouldShowRationale ??
            (() => Permission.notification.shouldShowRequestRationale),
        _androidSdkInt = androidSdkInt ?? _readAndroidSdkInt,
        _clock = clock ?? DateTime.now;

  final Future<PermissionStatus> Function() _status;
  final Future<PermissionStatus> Function() _request;
  final Future<bool> Function() _shouldShowRationale;
  final Future<int?> Function() _androidSdkInt;

  /// The ask off Android (FCM's, which covers APNS). Not classified.
  final Future<void> Function()? _requestNonAndroid;
  final DateTime Function() _clock;

  /// Below this, the request resolved without a dialog on screen.
  static const Duration minDialogDuration = Duration(milliseconds: 400);

  /// Android 13 (Tiramisu) — first version with the runtime dialog.
  static const int _firstRuntimeSdk = 33;

  /// Ask for POST_NOTIFICATIONS. Returns what the user did with the dialog
  /// (a [PushPermissionValue] value), or null when no dialog was shown.
  /// Never throws.
  Future<String?> requestAndClassify() async {
    try {
      final sdk = await _androidSdkInt();
      if (sdk == null) {
        await _requestNonAndroid?.call();
        return null;
      }
      if (sdk < _firstRuntimeSdk) return null;

      final before = await _status();
      if (before.isGranted || before.isPermanentlyDenied) return null;
      final rationaleBefore = await _shouldShowRationale();

      final startedAt = _clock();
      final result = await _request();
      final elapsed = _clock().difference(startedAt);

      if (elapsed < minDialogDuration) return null;
      if (result.isGranted || result.isLimited || result.isProvisional) {
        return PushPermissionValue.granted;
      }
      if (result.isPermanentlyDenied) return PushPermissionValue.denied;
      final rationaleAfter = await _shouldShowRationale();
      if (rationaleAfter && !rationaleBefore) return PushPermissionValue.denied;
      return PushPermissionValue.dismissed;
    } catch (_) {
      return null;
    }
  }

  static Future<int?> _readAndroidSdkInt() async {
    if (!Platform.isAndroid) return null;
    final info = await DeviceInfoPlugin().androidInfo;
    return info.version.sdkInt;
  }
}
