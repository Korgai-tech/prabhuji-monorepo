// Named fields kept explicit — see the equivalent note on
// OnboardingOrchestratorBloc.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:mobile/core/auth_store.dart';

/// In-memory [AuthStore] that skips flutter_secure_storage's platform channel
/// so bloc + widget tests can run under `flutter test` without a device.
///
/// Mirrors the real store's current contract: [read] is SYNCHRONOUS against a
/// hydrated cache, [changes] broadcasts every token transition, and [hydrate]
/// is the once-at-boot warm-up (a no-op here — the cache is already in memory).
class FakeAuthStore implements AuthStore {
  FakeAuthStore({String? token}) : _token = token;

  String? _token;
  int reads = 0;
  int writes = 0;
  int clears = 0;

  final StreamController<String?> _controller =
      StreamController<String?>.broadcast();

  @override
  Stream<String?> get changes => _controller.stream;

  @override
  Future<void> hydrate() async {
    // No-op: the in-memory cache is already warm.
  }

  @override
  String? read() {
    reads++;
    return _token;
  }

  @override
  Future<void> write(String token) async {
    writes++;
    _token = token;
    _controller.add(token);
  }

  @override
  Future<void> clear() async {
    clears++;
    _token = null;
    _controller.add(null);
  }
}
