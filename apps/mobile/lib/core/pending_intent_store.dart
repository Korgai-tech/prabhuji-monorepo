import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists a single "pending" deep-link URI across process boundaries
/// (TAM-124).
///
/// Three flows all need to hold a deep-link target while something else
/// happens first — one store serves all three so there is exactly one
/// pending-intent surface to reason about:
///
///  1. **Deferred deep linking on Android** — user taps a share URL, Play
///     Store install-referrer captures the path, the app reads it on first
///     launch and stores it here until onboarding completes.
///  2. **Logged-out share** — user without an account taps a share URL, the
///     login redirect fires; we store the target and replay it after
///     onboarding lands on `/home`.
///  3. **Paywall interstitial** (product-directed, TAM-124 #PATH_DECISION)
///     — every deep-link arrival for a non-Pro user pushes `/paywall`
///     first; when the paywall pops (any outcome), we replay the target.
///
/// Contract: **consumed exactly once**. [consumeOnce] returns the URI (if
/// any) AND clears the store in the same call — even if the payload was
/// malformed or stale. This prevents replay loops: a target that failed to
/// route can't fire again on the next app open, and a target that succeeded
/// can't fire again on top of itself.
///
/// Stored under [_key] in `flutter_secure_storage` (the same keystore the
/// JWT uses). We don't need in-memory caching like [AuthStore] does — this
/// store is written rarely and read at well-defined milestones (onboarding
/// complete, paywall pop, first launch), not on every navigation.
class PendingIntentStore {
  PendingIntentStore({
    PendingIntentStorage? storage,
    DateTime Function()? now,
    this._staleAfter = const Duration(hours: 24),
  })  : _storage = storage ?? SecurePendingIntentStorage(),
        _now = now ?? DateTime.now;

  final PendingIntentStorage _storage;
  final DateTime Function() _now;
  final Duration _staleAfter;

  /// In-memory cache used by [write] when `sessionOnly: true`. Not
  /// persisted — dies with the isolate. See [write] for the design
  /// rationale.
  Uri? _sessionUri;
  DateTime? _sessionSavedAt;

  /// Save [uri] as the pending intent, stamped with the current time.
  ///
  /// **Invariant: at most one intent at a time.** Any write clears both the
  /// session cache AND the persistent store before setting the new value —
  /// there's no "queue of pending intents". This keeps the mental model
  /// simple and prevents an old intent from firing after a newer one.
  ///
  /// [sessionOnly] controls durability:
  ///
  ///   * `false` (default) — persists to secure storage. Survives app
  ///     kill, device reboot, up to [_staleAfter]. Used for the two flows
  ///     that legitimately need to survive a boot cycle:
  ///       - Android Play Install Referrer read on first launch after
  ///         install (the Play Store install process itself restarts the
  ///         app several times before onboarding starts).
  ///       - Logged-out share replay: user taps share → onboarding →
  ///         intent should fire after signup even if user backgrounds
  ///         or kills the app mid-flow.
  ///
  ///   * `true` — held in memory ONLY. Wiped when the isolate dies. Used
  ///     for the paywall-interstitial replay: if the user kills the app
  ///     mid-paywall, the intent should NOT resurrect a stale deep-link
  ///     tap from earlier when they reopen the app days later.
  Future<void> write(Uri uri, {bool sessionOnly = false}) async {
    // Invariant enforcement — clear both surfaces before writing.
    await _storage.delete();
    _sessionUri = null;
    _sessionSavedAt = null;

    if (sessionOnly) {
      _sessionUri = uri;
      _sessionSavedAt = _now();
      return;
    }
    final payload = jsonEncode({
      'uri': uri.toString(),
      'savedAt': _now().toIso8601String(),
    });
    await _storage.write(payload);
  }

  /// Read and clear in one call. Returns the URI iff one is present and
  /// still fresh (not older than [_staleAfter]). Otherwise returns null.
  /// Both the session cache and the persistent store are cleared regardless
  /// of the result — garbage doesn't get to sit forever.
  ///
  /// Session cache is checked first because [write]'s invariant guarantees
  /// there's at most one of the two set at a time — but if both somehow
  /// coexisted (e.g. a race across the two `write` overloads), session wins
  /// as the more-recent, in-session context.
  /// [persistentOnly] restricts the consume to the STORED intent, leaving
  /// any session intent untouched. The two live in one store but have
  /// different owners:
  ///
  ///   * persistent — the logged-out share replay and the install-referrer
  ///     replay. Consumed when the user finally lands on `/home`.
  ///   * session — the paywall interstitial. Owned exclusively by the
  ///     paywall's dispose hook.
  ///
  /// Without the split, the "landed on home" trigger would eat the paywall's
  /// own intent while the paywall is still being pushed, and since the replay
  /// deliberately bypasses the paywall gate, that would walk a non-Pro user
  /// straight into Pro content.
  Future<Uri?> consumeOnce({bool persistentOnly = false}) async {
    // Serialised. Two consumers can fire in the same frame (the home-landing
    // trigger and the paywall-dispose hook, or two route changes), and the
    // persistent path awaits a storage read before its delete — so without
    // this both read the same payload and both replay. Observed on device:
    // two `deep_link_replayed` events 40ms apart.
    //
    // The lock is created per call, in the caller's zone, rather than seeded
    // with a pre-completed future at construction: a future from another
    // zone schedules its continuations there, which is how the first version
    // of this hung under the widget-test binding.
    final previous = _inFlight;
    final done = Completer<void>();
    _inFlight = done.future;
    try {
      if (previous != null) await previous;
      return await _consumeOnceUnsafe(persistentOnly: persistentOnly);
    } finally {
      done.complete();
      if (identical(_inFlight, done.future)) _inFlight = null;
    }
  }

  Future<void>? _inFlight;

  Future<Uri?> _consumeOnceUnsafe({required bool persistentOnly}) async {
    // Snapshot + clear session cache.
    final session = persistentOnly ? null : _sessionUri;
    final sessionAt = persistentOnly ? null : _sessionSavedAt;
    if (!persistentOnly) {
      _sessionUri = null;
      _sessionSavedAt = null;
    }

    if (session != null && sessionAt != null) {
      if (_now().difference(sessionAt) <= _staleAfter) {
        // Clear persistent too — one intent per consume.
        await _storage.delete();
        return session;
      }
      // Session was stale — fall through to check persistent.
    }

    final raw = await _storage.read();
    if (raw == null) return null;

    // Clear first so a corrupt payload can't wedge subsequent launches.
    await _storage.delete();

    final Map<String, dynamic> json;
    try {
      json = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }

    final uriStr = json['uri'];
    final savedAtStr = json['savedAt'];
    if (uriStr is! String || savedAtStr is! String) return null;

    final savedAt = DateTime.tryParse(savedAtStr);
    if (savedAt == null) return null;
    if (_now().difference(savedAt) > _staleAfter) return null;

    return Uri.tryParse(uriStr);
  }

  /// Force-clear without consuming — used at logout so a pending intent
  /// captured for one user doesn't fire in the next user's session. Wipes
  /// both the session cache and the persistent store.
  Future<void> clear() async {
    _sessionUri = null;
    _sessionSavedAt = null;
    await _storage.delete();
  }
}

/// Storage seam so [PendingIntentStore] can be unit-tested with an
/// in-memory fake instead of a platform-channel mock.
///
/// The production impl ([SecurePendingIntentStorage]) wraps
/// `flutter_secure_storage`; the test fake lives in the test file.
abstract class PendingIntentStorage {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> delete();
}

/// Production storage — persists to `flutter_secure_storage` under a
/// dedicated key. The `flutter_secure_storage` instance is injectable so
/// higher-level fakes can be substituted in integration tests too.
class SecurePendingIntentStorage implements PendingIntentStorage {
  SecurePendingIntentStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'pending_deep_link_intent';

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);

  @override
  Future<void> delete() => _storage.delete(key: _key);
}
