// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `analytics:` etc. — the private field names
// would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:flutter/scheduler.dart';

import '../features/home/home_routes.dart';
import 'analytics.dart';
import 'firebase_notifications.dart';
import 'firebase_notifications_router.dart';
import 'navigation_stack.dart';
import 'notification_analytics.dart';

/// Turns a [NotificationTap] into navigation plus the click half of the push
/// funnel: `notification_clicked` the moment the tap arrives, then
/// `notification_destination_opened` once routing has settled.
///
/// ## Parking
///
/// A tap can arrive before the app can honour it — the one that launched the
/// app lands while the splash is still deciding where to go, and a
/// logged-out user has nowhere to be sent. Navigating then would be undone
/// by the orchestrator's own `go('/home')` (or would skip onboarding), so the
/// tap is parked and replayed from [onHomeReached], the same "landed on
/// Home" milestone share links use (`deep_link_replay.dart`). Only the latest
/// tap is kept.
///
/// ## Navigation and the Pro gate
///
/// Same shape as a share link (`DeepLinkService.handleUri`): Home is the
/// base, the target is pushed on top. Home is the only free target; for
/// anything else a non-Pro user gets the paywall over Home first, and the
/// target opens only if they come out of it Pro. Otherwise they stay on Home
/// (`fallback_to_home`, `not_pro`). Unlike the share-link replay, a
/// dismissed paywall does NOT open the target.
///
/// ## Fallback
///
/// A payload that maps to no route still opens Home (`fallback_to_home`)
/// rather than leaving the user wherever the app happened to be.
class NotificationTapHandler {
  NotificationTapHandler({
    required Analytics? analytics,
    required void Function(List<String> stack) navigate,
    required String Function() currentLocation,
    required bool Function() isLoggedIn,
    required bool Function() isProUser,
    required Future<void> Function() openPaywall,
    Future<void> Function()? settle,
    DateTime Function()? clock,
  })  : _analytics = analytics,
        _navigate = navigate,
        _currentLocation = currentLocation,
        _isLoggedIn = isLoggedIn,
        _isProUser = isProUser,
        _openPaywall = openPaywall,
        _settle = settle ?? _endOfFrame,
        _clock = clock ?? DateTime.now;

  final Analytics? _analytics;
  final void Function(List<String> stack) _navigate;
  final String Function() _currentLocation;
  final bool Function() _isLoggedIn;
  final bool Function() _isProUser;

  /// Push the paywall; completes once it has closed, however it closed.
  final Future<void> Function() _openPaywall;
  final Future<void> Function() _settle;
  final DateTime Function() _clock;

  bool _homeReached = false;
  NotificationTap? _parked;

  /// Test hook.
  NotificationTap? get parkedTap => _parked;

  void handle(NotificationTap tap) {
    _trackClicked(tap, _clock());

    if (!_homeReached || !_isLoggedIn()) {
      _parked = tap;
      return;
    }
    unawaited(_route(tap));
  }

  /// The router landed on Home with a logged-in user.
  void onHomeReached() {
    _homeReached = true;
    final tap = _parked;
    _parked = null;
    if (tap != null) unawaited(_route(tap));
  }

  /// Logged out: the next session must reach Home again before a tap can
  /// route, or a tap mid-onboarding would skip it.
  void onLoggedOut() {
    _homeReached = false;
  }

  void _trackClicked(NotificationTap tap, DateTime now) {
    final sentAt = tap.sentAt;
    final seconds = sentAt == null
        ? null
        : (now.difference(sentAt).inMilliseconds / 1000).clamp(0.0, double.infinity);
    unawaited(_analytics?.trackEvent(NotificationEvents.clicked, properties: {
      ...notificationIdentityProps(tap.data),
      NotificationEventProps.deeplinkTarget: _intendedTarget(tap),
      NotificationEventProps.timeToClickSec: seconds,
    }));
  }

  Future<void> _route(NotificationTap tap) async {
    final path = resolveNotificationRoute(tap.data);
    final stack = navigationStackFor(path ?? HomeRoutes.home);

    if (path != null && _isProGated(stack.last) && !_isProUser()) {
      _safeNavigate(const [HomeRoutes.home]);
      await _settle();
      await _openPaywall();
      await _settle();
      if (!_isProUser()) {
        _trackDestination(
          tap,
          status: NotificationRoutingStatus.fallbackToHome,
          failure: NotificationRoutingFailure.notPro,
        );
        return;
      }
    }

    _safeNavigate(stack);
    await _settle();

    final actual = _currentLocation();
    final String status;
    String? failure;
    if (path == null) {
      status = NotificationRoutingStatus.fallbackToHome;
      failure = _rawTarget(tap.data) != null
          ? NotificationRoutingFailure.unknownRoute
          : NotificationRoutingFailure.missingTarget;
    } else {
      status = NotificationRoutingStatus.success;
      if (Uri.parse(actual).path != Uri.parse(stack.last).path) {
        failure = NotificationRoutingFailure.redirected;
      }
    }
    _trackDestination(tap, status: status, failure: failure, actual: actual);
  }

  void _safeNavigate(List<String> stack) {
    try {
      _navigate(stack);
    } catch (_) {
      // Reported through `actual_destination`: the location won't match.
    }
  }

  void _trackDestination(
    NotificationTap tap, {
    required String status,
    String? failure,
    String? actual,
  }) {
    unawaited(_analytics?.trackEvent(
      NotificationEvents.destinationOpened,
      properties: {
        ...notificationIdentityProps(tap.data),
        NotificationEventProps.actualDestination: actual ?? _currentLocation(),
        NotificationEventProps.routingStatus: status,
        NotificationEventProps.failureReason: failure,
      },
    ));
  }

  /// Everything but Home is Pro content — the share-link rule. The paywall
  /// itself is a target too, and gating it would open it twice.
  static bool _isProGated(String target) {
    final path = Uri.parse(target).path;
    return path != HomeRoutes.home && path != '/paywall';
  }

  /// Where the payload asks to go: the resolved route, else the raw
  /// `path` / `type` so an unmapped target is still visible in the data.
  static String? _intendedTarget(NotificationTap tap) {
    final resolved = resolveNotificationRoute(tap.data);
    if (resolved != null) return navigationStackFor(resolved).last;
    return _rawTarget(tap.data);
  }

  static String? _rawTarget(Map<String, dynamic> data) {
    final raw = data['path'] ?? data['type'];
    return raw == null || raw.toString().isEmpty ? null : raw.toString();
  }

  static Future<void> _endOfFrame() {
    SchedulerBinding.instance.ensureVisualUpdate();
    return SchedulerBinding.instance.endOfFrame;
  }
}
