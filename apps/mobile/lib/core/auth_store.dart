import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Single source of truth for the auth JWT.
///
/// Wraps `flutter_secure_storage` with an in-memory cache that is hydrated
/// once at boot from `main()`. Every subsequent read is synchronous, which
/// (a) eliminates the interceptor race where a request-time
/// `await storage.read()` could return a stale value on some Android builds,
/// and (b) removes the need for a parallel Riverpod state mirror the app
/// used to keep in lockstep manually (that mirror was the root of the
/// "post-OTP tap-Status bounces to /phone-choice" bug).
///
/// Writes are still awaited (they hit the encrypted store) but update the
/// cache first — so any read immediately after `write()` returns the new
/// value. [changes] is a broadcast stream that fires whenever the token
/// transitions (login/logout); the router listens to it as its
/// `refreshListenable` source, and the analytics identity is tied to it too.
class AuthStore {
  AuthStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'auth_token';

  final StreamController<String?> _controller =
      StreamController<String?>.broadcast();

  String? _token;
  bool _hydrated = false;

  /// Broadcast: emits the new token (or `null` on clear) whenever the store
  /// mutates. Router, analytics, and anything else that reacts to auth
  /// transitions should subscribe here — no polling, no mirrored state.
  Stream<String?> get changes => _controller.stream;

  /// MUST be called once from `main()` before any consumer reads. After this
  /// returns, [read] is safe to call synchronously.
  Future<void> hydrate() async {
    if (_hydrated) return;
    _token = await _storage.read(key: _key);
    _hydrated = true;
  }

  /// Synchronous — the cache is always in sync with what's on disk because
  /// [write] and [clear] update the cache before returning. Returns `null`
  /// when logged out (or when called before [hydrate], which is a bug).
  String? read() => _token;

  Future<void> write(String token) async {
    _token = token;
    await _storage.write(key: _key, value: token);
    _controller.add(token);
  }

  Future<void> clear() async {
    _token = null;
    await _storage.delete(key: _key);
    _controller.add(null);
  }
}
