// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `authStore:`, `dio:` etc. — the private
// field names would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:io' show Platform;
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_store.dart';

/// Owns the mobile ↔ server side of the FCM lifecycle. One instance lives in
/// the service locator for the process, wired up in `main()` after Firebase is
/// initialised.
///
///  - `syncIfAuthenticated()` runs on app open (and after login): fetch the
///    current FCM token from `FirebaseMessaging`, POST it to
///    `/firebase-tokens` when the user is logged in, and stash it locally so
///    the next sync is a no-op if nothing changed.
///  - `onTokenRefresh` (wired in [start]) fires when FCM rotates the token
///    asynchronously (app restore, uninstall/reinstall, GCM update), and the
///    server needs the new one.
///  - `logout()` DELETEs the current device's row on the server and calls
///    `FirebaseMessaging.instance.deleteToken()` so the token is invalidated
///    with FCM itself. Must run BEFORE the auth token is cleared — the DELETE
///    needs a valid Bearer.
///
/// Every network call is guarded and never rethrows: a broken FCM/network path
/// must not prevent login, refresh, or logout from completing.
class FirebaseTokenSync {
  FirebaseTokenSync({
    required AuthStore authStore,
    required Dio dio,
    FirebaseMessaging? messaging,
    FlutterSecureStorage? storage,
  })  : _authStore = authStore,
        _dio = dio,
        _messaging = messaging ?? FirebaseMessaging.instance,
        _storage = storage ?? const FlutterSecureStorage();

  final AuthStore _authStore;
  final Dio _dio;
  final FirebaseMessaging _messaging;
  final FlutterSecureStorage _storage;

  static const _deviceIdKey = 'firebase_device_id';
  static const _lastSyncedTokenKey = 'firebase_last_synced_token';

  StreamSubscription<String>? _refreshSub;
  bool _wired = false;

  /// Wires the `onTokenRefresh` listener. Idempotent — safe to call twice.
  void start() {
    if (_wired) return;
    _wired = true;
    _refreshSub = _messaging.onTokenRefresh.listen(
      (newToken) {
        unawaited(_pushToken(newToken));
      },
      onError: (Object err, StackTrace st) {
        if (kDebugMode) {
          debugPrint('[FirebaseTokenSync] onTokenRefresh error: $err');
        }
      },
    );
  }

  /// Grab the current FCM token and register it if the user is authenticated
  /// AND the token changed since the last successful register (dedupe cache).
  /// Called from `main()` after login-restoration and from the auth-change
  /// stream on fresh login.
  Future<void> syncIfAuthenticated() async {
    if (_authStore.read() == null) return;
    try {
      final token = await _messaging.getToken();
      if (token == null || token.isEmpty) return;
      await _pushToken(token);
    } catch (e) {
      if (kDebugMode) debugPrint('[FirebaseTokenSync] getToken failed: $e');
    }
  }

  /// Send [token] to the server. No-op when the same token was already sent
  /// (dedupe against `_lastSyncedTokenKey`) — cheap to call on every app open.
  Future<void> _pushToken(String token) async {
    if (_authStore.read() == null) return;
    final lastSent = await _storage.read(key: _lastSyncedTokenKey);
    if (lastSent == token) return;

    final deviceId = await _ensureDeviceId();
    try {
      await _dio.post<dynamic>(
        '/firebase-tokens',
        data: {
          'token': token,
          'deviceId': deviceId,
          'platform': _platformValue(),
        },
      );
      await _storage.write(key: _lastSyncedTokenKey, value: token);
    } catch (e) {
      // A failed sync must not break the calling flow. The next app open or
      // onTokenRefresh will retry naturally.
      if (kDebugMode) debugPrint('[FirebaseTokenSync] register failed: $e');
    }
  }

  /// Logout side: DELETE the row on the server, then invalidate the FCM token
  /// with Google. Must run BEFORE [AuthStore.clear] so the Bearer is still
  /// attached to the DELETE.
  Future<void> logout() async {
    if (_authStore.read() != null) {
      try {
        final deviceId = await _readDeviceId();
        if (deviceId != null) {
          await _dio.delete<dynamic>(
            '/firebase-tokens',
            data: {'deviceId': deviceId},
          );
        }
      } catch (e) {
        if (kDebugMode) debugPrint('[FirebaseTokenSync] delete failed: $e');
      }
    }
    try {
      await _messaging.deleteToken();
    } catch (e) {
      if (kDebugMode) debugPrint('[FirebaseTokenSync] deleteToken failed: $e');
    }
    try {
      await _storage.delete(key: _lastSyncedTokenKey);
    } catch (_) {
      // Dedupe cache clear is best-effort.
    }
  }

  /// Best-effort disposal for tests / hot-restart.
  Future<void> dispose() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
    _wired = false;
  }

  Future<String> _ensureDeviceId() async {
    final existing = await _storage.read(key: _deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final fresh = _uuidV4();
    await _storage.write(key: _deviceIdKey, value: fresh);
    return fresh;
  }

  Future<String?> _readDeviceId() => _storage.read(key: _deviceIdKey);

  /// Cheap install-scoped UUIDv4. `flutter_secure_storage` persists across app
  /// restarts but is wiped on uninstall — exactly the lifetime we want, since
  /// FCM tokens are also install-scoped.
  String _uuidV4() {
    final rand = Random.secure();
    final b = List<int>.generate(16, (_) => rand.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    String hex(int v) => v.toRadixString(16).padLeft(2, '0');
    return '${hex(b[0])}${hex(b[1])}${hex(b[2])}${hex(b[3])}-'
        '${hex(b[4])}${hex(b[5])}-'
        '${hex(b[6])}${hex(b[7])}-'
        '${hex(b[8])}${hex(b[9])}-'
        '${hex(b[10])}${hex(b[11])}${hex(b[12])}${hex(b[13])}${hex(b[14])}${hex(b[15])}';
  }

  String _platformValue() => Platform.isIOS ? 'ios' : 'android';
}
