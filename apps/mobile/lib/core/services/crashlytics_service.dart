/// Firebase Crashlytics seam.
///
/// The ONE file allowed to import `package:firebase_crashlytics/...`. Every
/// other consumer (main.dart's boot + auth hooks, any caught-error report)
/// goes through the [CrashlyticsService] singleton.
///
/// Grep invariant (enforced by convention + PR review):
///
///     grep -R "package:firebase_crashlytics" apps/mobile/lib \
///       --exclude=lib/core/services/crashlytics_service.dart
///
/// should return zero results.
///
/// Design (ported from krutyug_flutter_app's CrashlyticsService):
///
///   1. **Firebase-gated.** [initialize] no-ops when `Firebase.apps` is empty
///      (init failed, or a widget test), and every other verb short-circuits
///      until init succeeds. Crash reporting must never break the app.
///   2. **Chains, never replaces.** The previous `FlutterError.onError` and
///      `PlatformDispatcher.onError` still run first.
///   3. **Dart errors are non-fatal by default.** They don't terminate a
///      Flutter app — the engine swallows them and carries on. True crashes
///      (native exceptions, ANRs) are captured by the native SDK and land in
///      the Fatal bucket on their own, so the crash-free-users metric stays
///      honest. Exception: null-check / `late` init failures are escalated to
///      fatal — they're real bugs the user almost certainly saw.
///   4. **Collection on in every build, debug included** (same as the
///      reference app) so debug-build crashes are visible in the console.
///   5. **No PII.** The user identifier is the JWT `sub` (our user id) —
///      never phone / email / name.
library;

import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

import '../app_config.dart';
import '../jwt.dart';

class CrashlyticsService {
  CrashlyticsService._internal();

  static final CrashlyticsService instance = CrashlyticsService._internal();

  bool _initialized = false;

  /// Last user requested via [setUserIdentifier] / [clearUserIdentifier].
  /// Boot starts [initialize] fire-and-forget, so a restored session's id can
  /// arrive before init finishes — it's replayed once init completes.
  String _userId = '';

  /// Whether [initialize] completed and reports are being sent.
  bool get isInitialized => _initialized;

  Future<void> initialize() async {
    if (_initialized) return;

    try {
      if (Firebase.apps.isEmpty) {
        debugPrint('[Crashlytics] Firebase not initialized, skipping');
        return;
      }

      // Installed synchronously (before the first await) so an error thrown
      // while the rest of init is in flight is still captured.
      final originalFlutterOnError = FlutterError.onError;
      FlutterError.onError = (FlutterErrorDetails details) {
        originalFlutterOnError?.call(details);
        try {
          if (isFatalDartError(details.exception)) {
            FirebaseCrashlytics.instance.recordFlutterFatalError(details);
          } else {
            FirebaseCrashlytics.instance.recordFlutterError(details);
          }
        } catch (e) {
          debugPrint('[Crashlytics] recordFlutterError failed: $e');
        }
      };

      final originalPlatformOnError = PlatformDispatcher.instance.onError;
      PlatformDispatcher.instance.onError = (error, stack) {
        originalPlatformOnError?.call(error, stack);
        try {
          FirebaseCrashlytics.instance.recordError(
            error,
            stack,
            fatal: isFatalDartError(error),
          );
        } catch (e) {
          debugPrint('[Crashlytics] recordError failed: $e');
        }
        return true;
      };

      final crashlytics = FirebaseCrashlytics.instance;
      await crashlytics.setCrashlyticsCollectionEnabled(true);
      await crashlytics.setCustomKey('platform', Platform.operatingSystem);
      await crashlytics.setCustomKey(
        'platform_version',
        Platform.operatingSystemVersion,
      );
      await crashlytics.setCustomKey(
        'environment',
        AppConfig.instance.environment,
      );

      await crashlytics.setUserIdentifier(_userId);

      _initialized = true;
      debugPrint('[Crashlytics] Initialized');
    } catch (e) {
      debugPrint('[Crashlytics] Initialization failed: $e');
    }
  }

  /// Attributes subsequent reports to the user in [token] (JWT `sub`), or
  /// clears the attribution when [token] is null (logout). Wired to
  /// `AuthStore.changes` in main.dart, plus once for a restored session.
  Future<void> setUserFromToken(String? token) async {
    final sub = token == null ? null : decodeJwtClaims(token)?['sub'];
    if (sub is String && sub.isNotEmpty) {
      await setUserIdentifier(sub);
    } else {
      await clearUserIdentifier();
    }
  }

  Future<void> setUserIdentifier(String identifier) {
    _userId = identifier;
    return _guard('setUserIdentifier', (c) => c.setUserIdentifier(identifier));
  }

  /// Clears the user so a crash after logout isn't pinned on the last user.
  Future<void> clearUserIdentifier() => setUserIdentifier('');

  /// Reports a caught error. Non-fatal unless [fatal] is set explicitly.
  Future<void> recordError(
    Object exception,
    StackTrace? stack, {
    Object? reason,
    Iterable<Object> information = const [],
    bool fatal = false,
  }) => _guard(
    'recordError',
    (c) => c.recordError(
      exception,
      stack,
      reason: reason,
      information: information,
      fatal: fatal,
    ),
  );

  Future<void> setCustomKey(String key, Object value) =>
      _guard('setCustomKey', (c) => c.setCustomKey(key, value));

  /// Breadcrumb attached to the next report.
  Future<void> log(String message) => _guard('log', (c) => c.log(message));

  Future<void> _guard(
    String op,
    Future<void> Function(FirebaseCrashlytics c) body,
  ) async {
    if (!_initialized) return;
    try {
      await body(FirebaseCrashlytics.instance);
    } catch (e) {
      debugPrint('[Crashlytics] $op failed: $e');
    }
  }

  /// Dart errors escalated to fatal even though the framework caught them:
  /// null-assertion (`!` on null / a `Null` cast) and `late` init failures.
  @visibleForTesting
  static bool isFatalDartError(Object error) {
    if (error is TypeError) {
      final msg = error.toString();
      if (msg.contains('Null check operator used on a null value') ||
          msg.contains("type 'Null' is not a subtype")) {
        return true;
      }
    }
    // LateInitializationError is private in dart:core; match by name.
    final type = error.runtimeType.toString();
    return type == 'LateError' || type == '_LateInitializationError';
  }
}
