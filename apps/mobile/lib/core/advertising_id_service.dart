// Constructor uses a function-typed seam for storage so tests can drive the
// service without pulling in the shared_preferences plugin.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:io';

import 'package:advertising_id/advertising_id.dart';
import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Resolves and caches the platform advertising identifier (Google Advertising
/// ID on Android, IDFA on iOS) so every analytics event can ride it as the
/// top-level `adid` Amplitude field.
///
/// Mirrors `krutyug_flutter_app/lib/core/services/advertising_id_service.dart`
/// so both apps land the same identifier in the warehouse column.
///
/// **Lifecycle**
///
///   1. [resolve] is called once at `Analytics.init` (fire-and-forget path
///      inside `main`). It reads the cached value from SharedPreferences —
///      if the cache holds a real ID we're done; otherwise it fetches from
///      the platform (Android: Google Play services; iOS: ATT-gated IDFA).
///   2. Every subsequent [current] read returns the in-memory value
///      synchronously — safe to call inside `Analytics.trackEvent` without
///      awaiting a platform channel per event.
///
/// **Empty-ID sentinel**
///
/// Google Play services (Android) and IDFA (iOS with ATT denied / limit-ad-
/// tracking on) return the all-zero UUID
/// `00000000-0000-0000-0000-000000000000` when no real ID is available. We
/// treat that as "no adid" (returned as `null`) so downstream analytics can
/// distinguish "user opted out" from "user granted tracking".
///
/// **iOS App Tracking Transparency**
///
/// iOS 14.5+ requires an explicit `AppTrackingTransparency` prompt before the
/// IDFA is populated. We request it once (guarded by a persisted flag so we
/// never re-prompt) and fall back to the empty sentinel on any failure. The
/// prompt's copy is set by `NSUserTrackingUsageDescription` in
/// `ios/Runner/Info.plist`.
class AdvertisingIdService {
  AdvertisingIdService({
    required Future<String?> Function(String key) readString,
    required Future<void> Function(String key, String value) writeString,
    required Future<bool?> Function(String key) readBool,
    required Future<void> Function(String key, bool value) writeBool,
  })  : _readString = readString,
        _writeString = writeString,
        _readBool = readBool,
        _writeBool = writeBool;

  /// Convenience factory backed by `shared_preferences`. Keeps the plugin
  /// resolution out of this file so tests can pass raw fakes.
  factory AdvertisingIdService.fromPreferences(SharedPreferences prefs) {
    return AdvertisingIdService(
      readString: (k) async => prefs.getString(k),
      writeString: (k, v) async {
        await prefs.setString(k, v);
      },
      readBool: (k) async => prefs.getBool(k),
      writeBool: (k, v) async {
        await prefs.setBool(k, v);
      },
    );
  }

  /// The all-zero UUID Google Play services / iOS returns when tracking is
  /// unavailable. Treat as "no adid" so the wire field is omitted.
  static const emptyAdId = '00000000-0000-0000-0000-000000000000';

  static const _cacheKey = 'analytics_advertising_id_v1';
  static const _attPromptedKey = 'analytics_att_prompted_v1';

  final Future<String?> Function(String key) _readString;
  final Future<void> Function(String key, String value) _writeString;
  final Future<bool?> Function(String key) _readBool;
  final Future<void> Function(String key, bool value) _writeBool;

  String? _cached;
  bool _resolved = false;

  /// The last resolved advertising id, or `null` if we haven't resolved yet or
  /// the platform returned the empty sentinel. Safe to call synchronously per
  /// event once [resolve] has completed.
  String? get current => _cached;

  bool _isValidAdId(String value) {
    final normalized = value.trim();
    return normalized.isNotEmpty &&
        normalized.toLowerCase() != 'null' &&
        normalized != emptyAdId;
  }

  /// Resolve the platform advertising id, caching it in memory + SharedPrefs.
  /// Idempotent: after the first successful resolution, further calls return
  /// the cached value without touching the platform channel again.
  Future<String?> resolve() async {
    if (_resolved) return _cached;

    try {
      final cached = await _readString(_cacheKey);
      if (cached != null && _isValidAdId(cached)) {
        _cached = cached;
        _resolved = true;
        return _cached;
      }

      if (Platform.isIOS) {
        await _maybeRequestAttOnce();
      }

      final adId =
          await AdvertisingId.id(true).catchError((_) => null) ?? emptyAdId;
      await _writeString(_cacheKey, adId);
      _cached = _isValidAdId(adId) ? adId : null;
      _resolved = true;
      return _cached;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AdvertisingIdService] resolve failed: $e');
      }
      _resolved = true;
      return null;
    }
  }

  /// Ask for ATT permission once per install; the persisted flag prevents a
  /// re-prompt if the user denied. Swallows failures — the caller falls back
  /// to the empty sentinel if IDFA stays unavailable.
  Future<void> _maybeRequestAttOnce() async {
    final alreadyPrompted = await _readBool(_attPromptedKey);
    if (alreadyPrompted == true) return;
    try {
      final status =
          await AppTrackingTransparency.trackingAuthorizationStatus;
      if (status == TrackingStatus.notDetermined) {
        await AppTrackingTransparency.requestTrackingAuthorization();
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AdvertisingIdService] ATT prompt failed: $e');
      }
    } finally {
      await _writeBool(_attPromptedKey, true);
    }
  }
}
