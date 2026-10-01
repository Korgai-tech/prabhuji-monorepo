// Named ctor params kept explicit (public API) — see the equivalent note on
// OnboardingOrchestratorBloc.
// ignore_for_file: prefer_initializing_formals

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'entitlement.dart';

/// A deferred, gated action a module wants to run — e.g. "open the player for
/// `audioId`", "set ringtone `id`", "apply wallpaper `id`". The gate treats it
/// as an opaque closure so it never imports module code (TAM-58 AC-e).
class PendingAction<T> {
  const PendingAction({required this.action, this.label});

  /// The work to perform once entitlement is satisfied. Runs immediately for a
  /// Pro user, or is resumed verbatim after a successful purchase.
  final Future<T> Function() action;

  /// Optional human/analytics label (e.g. `open_player`) — the gate never
  /// branches on it; modules use it for their own event props.
  final String? label;
}

/// Cross-cutting run-vs-gate-then-resume helper (TAM-58 AC-e).
///
/// One correct implementation of post-purchase continuation for every module:
///  * Pro  → run [PendingAction.action] immediately, return its result.
///  * Free → open the unified paywall; on a successful purchase (detected by
///    re-reading the LIVE entitlement after the paywall closes) resume the same
///    action and return its result; on cancel/close return `null`.
///
/// Stateless w.r.t. which module called it and context-free (navigation is
/// injected per call), which keeps it trivially unit-testable and free of any
/// go_router / BuildContext import.
class PaywallGate {
  PaywallGate({
    required bool Function() isPro,
    required Future<void> Function() refreshEntitlement,
  })  : _isPro = isPro,
        _refreshEntitlement = refreshEntitlement;

  final bool Function() _isPro;
  final Future<void> Function() _refreshEntitlement;

  /// Runs or gates [pending].
  ///
  /// [openPaywall] is supplied by the caller (e.g.
  /// `() => context.push('/paywall')`) so the gate never depends on a
  /// navigator; it is awaited until the paywall route is dismissed, after which
  /// entitlement is re-read to decide whether the purchase succeeded.
  Future<T?> run<T>({
    required PendingAction<T> pending,
    required Future<void> Function() openPaywall,
  }) async {
    if (_isPro()) {
      return pending.action();
    }

    await openPaywall();

    // The paywall has closed — re-read the LIVE entitlement. If the user is now
    // Pro (they purchased), resume the ORIGINAL action; otherwise they
    // cancelled and we return null.
    await _refreshEntitlement();
    if (_isPro()) {
      return pending.action();
    }
    return null;
  }
}

/// Riverpod-exposed gate bound to the live [entitlementProvider].
final paywallGateProvider = Provider<PaywallGate>((ref) {
  return PaywallGate(
    isPro: () => ref.read(entitlementProvider),
    refreshEntitlement: () => ref.read(entitlementStateProvider.notifier).refresh(),
  );
});
