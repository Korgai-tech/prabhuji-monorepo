import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../features/paywall/data/subscription_repository.dart';
import 'auth_store.dart';
import 'service_locator.dart';
import 'user_properties.dart';

/// A cached entitlement decision, with the deadline the server attached to it.
///
/// The pair is the whole point. Holding only a `bool` meant the cache could
/// never expire on its own: `refresh()` deliberately keeps the previous value on
/// a network error (revoking a paying user's UI on a dropped packet is
/// hostile), so a user whose trial ended while the app was backgrounded kept a
/// Pro UI indefinitely, and every failed refresh extended it again.
///
/// With [until] the client can REVOKE by itself but can never GRANT — it holds
/// an expiry, not the rule. `computeIsEntitled` on the server remains the sole
/// derivation; this only stops honouring a decision the server already scoped.
class Entitlement {
  const Entitlement({required this.granted, required this.until});

  const Entitlement.free() : granted = false, until = null;

  /// What the server last said.
  final bool granted;

  /// When [granted] lapses. Null means no deadline — a lifetime grant, or
  /// simply not entitled. Never "expired now".
  final DateTime? until;

  /// The live answer: what the server said, minus anything that has since run
  /// out. Never more generous than [granted].
  bool get isPro =>
      granted && (until == null || DateTime.now().isBefore(until!));
}

/// Persistence seam for the entitlement — split behind an interface so the
/// notifier stays unit-testable without a platform channel. Production uses
/// [SecureEntitlementStorage] (flutter_secure_storage, same encrypted-Keystore
/// backing as the JWT + pending deep-link intent); tests inject an in-memory
/// fake.
abstract interface class EntitlementStorage {
  Future<Entitlement?> read();
  Future<void> write(Entitlement value);
  Future<void> delete();
}

/// flutter_secure_storage-backed persistence for [Entitlement].
///
/// Written on every `seed()` / server refresh; hydrated on app boot so the
/// PaywallGate reads the LAST KNOWN Pro decision immediately — before the
/// orchestrator's `/subscription/status` round-trip completes. Without this,
/// a user who paid successfully then killed the app during a poor-connection
/// moment would see the paywall re-appear at cold restart until the API
/// call succeeds.
class SecureEntitlementStorage implements EntitlementStorage {
  SecureEntitlementStorage([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _key = 'entitlement_v1';

  @override
  Future<Entitlement?> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final granted = json['granted'] as bool? ?? false;
      final untilIso = json['until'] as String?;
      final until = untilIso == null ? null : DateTime.tryParse(untilIso);
      return Entitlement(granted: granted, until: until);
    } catch (_) {
      // Corrupt payload — treat as no cache and let the API re-seed.
      return null;
    }
  }

  @override
  Future<void> write(Entitlement value) async {
    await _storage.write(
      key: _key,
      value: jsonEncode({
        'granted': value.granted,
        'until': value.until?.toIso8601String(),
      }),
    );
  }

  @override
  Future<void> delete() => _storage.delete(key: _key);
}

/// Live "is this user Pro?" surface for the whole app (TAM-58).
///
/// The [PaywallGate] reads this (never a boolean captured earlier in a widget)
/// so entitlement is always the live, server-restored state. Seeded at app start
/// from the restored subscription snapshot and re-`refresh`ed after the user
/// returns from the paywall (post-purchase continuation).
///
/// **Persistence**: every `seed()` (including via `refresh()`) also writes to
/// [EntitlementStorage] (secure storage in prod). On app boot, [hydrate] loads
/// the cached decision synchronously into [state] — so a cold restart after a
/// successful purchase surfaces the Pro flag immediately, without waiting for
/// the orchestrator's `/subscription/status` round-trip to complete. `until`
/// still enforces expiry client-side, so a stale grant can't outlive its
/// deadline.
class EntitlementNotifier extends Notifier<Entitlement> {
  /// Optional test injection point. Production reads the default from
  /// [entitlementStateProvider] which builds a [SecureEntitlementStorage].
  EntitlementNotifier([EntitlementStorage? storage])
      : _storage = storage ?? SecureEntitlementStorage();

  final EntitlementStorage _storage;
  DateTime? _fetchedAt;

  @override
  Entitlement build() => const Entitlement.free();

  /// Re-hits `/subscription/status` and updates [state]. Best-effort: on a
  /// network error we keep the previous value rather than flip a user to free.
  ///
  /// Keeping it is safe precisely BECAUSE the value carries its own deadline —
  /// a stale `true` still expires on time.
  Future<void> refresh() async {
    if (!serviceLocator.isRegistered<SubscriptionRepository>()) return;
    // No session, nothing to ask. `/subscription/status` is an authenticated
    // endpoint, and this runs from app resume (`refreshIfStale`) as well as
    // from the paywall and deep-link screens — so a logged-out user used to
    // fire it, unauthenticated, every time they came back to the app (e.g.
    // after switching to Messages for their OTP). A logged-out user is free
    // by definition; the orchestrator seeds the real value at login.
    if (serviceLocator.isRegistered<AuthStore>() &&
        serviceLocator<AuthStore>().read() == null) {
      return;
    }
    try {
      final snapshot = await serviceLocator<SubscriptionRepository>().getStatus();
      seed(snapshot);
    } catch (_) {
      // keep prior entitlement — a transient failure must not revoke access UX
    }
  }

  /// Refresh only if the cached decision is older than [maxAge].
  ///
  /// The bound on how long we go WITHOUT asking — the honest complement to
  /// "we never revoke on error". Wired to app resume.
  Future<void> refreshIfStale(Duration maxAge) async {
    final at = _fetchedAt;
    if (at != null && DateTime.now().difference(at) < maxAge) return;
    await refresh();
  }

  /// Seed from an already-fetched snapshot (e.g. the orchestrator's app-start
  /// subscription check, or the payment bloc's post-success refresh) without
  /// an extra round-trip. Persists to secure storage as a side-effect so a
  /// subsequent cold-start sees the same decision immediately via [hydrate].
  void seed(SubscriptionSnapshot snapshot) {
    _fetchedAt = DateTime.now();
    final entitlement = Entitlement(
      granted: snapshot.isPro,
      until: snapshot.entitledUntil,
    );
    state = entitlement;
    // Fire-and-forget write — a persistence hiccup must never block the UI.
    unawaited(_persist(entitlement));
    // Sheet-3 user-properties identify — every server-visible subscription
    // change (initial cold-start seed, payment success, cancellation) flows
    // through here, so this is the single tap-point that keeps the
    // `subscription_*` user properties in sync. Deduper suppresses no-ops.
    if (serviceLocator.isRegistered<UserPropertiesTracker>()) {
      serviceLocator<UserPropertiesTracker>().onSubscriptionChanged(
        status: snapshot.status.value,
        planId: snapshot.activePlanId,
        expiresAt: snapshot.expiresAt,
      );
    }
  }

  /// Drop to free — logout. Not `seed(false)`: there is no snapshot to seed.
  /// Also wipes the persisted cache so the next user on this device doesn't
  /// inherit user A's Pro status.
  void clear() {
    _fetchedAt = null;
    state = const Entitlement.free();
    unawaited(_storage.delete());
  }

  /// Read the last persisted entitlement into [state]. Call once from
  /// `main()` after `configureLocator` — before the orchestrator's app-start
  /// subscription check — so PaywallGate reads Pro=true (if that's what the
  /// last server decision was) even before the first `/subscription/status`
  /// round-trip completes.
  ///
  /// A subsequent successful [refresh] / [seed] overrides what was hydrated.
  /// A subsequent failed refresh leaves the hydrated value in place — that
  /// is exactly the "don't revoke on network error" contract.
  Future<void> hydrate() async {
    try {
      final cached = await _storage.read();
      if (cached == null) return;
      state = cached;
    } catch (e, st) {
      debugPrint('[EntitlementNotifier] hydrate failed: $e\n$st');
    }
  }

  Future<void> _persist(Entitlement value) async {
    try {
      await _storage.write(value);
    } catch (e, st) {
      debugPrint('[EntitlementNotifier] persist failed: $e\n$st');
    }
  }
}

final entitlementStateProvider =
    NotifierProvider<EntitlementNotifier, Entitlement>(
  EntitlementNotifier.new,
);

/// The live entitlement flag. `true` == Pro.
///
/// Derived so the ~10 widget/navigation call sites keep reading a plain bool and
/// did not have to change. It re-evaluates whenever the underlying decision
/// does; the deadline check inside [Entitlement.isPro] means a lapsed grant
/// reads false on the next rebuild without anything having to fire.
final entitlementProvider = Provider<bool>(
  (ref) => ref.watch(entitlementStateProvider).isPro,
);
