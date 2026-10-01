import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../features/home/home_routes.dart';

/// Wires the deep-link pending-intent replay to the LOGIN milestone
/// (TAM-124 flow 2: "user taps a share URL logged out → onboarding → replay
/// after onboarding lands on `/home`" — see `pending_intent_store.dart`).
///
/// The trigger is the router ACTUALLY LANDING ON `/home`. That sounds
/// roundabout, and two more obvious signals were tried first. Both were
/// wrong, and the reasons are worth keeping:
///
///   * **`AuthStore.changes` (a token appeared).** A token exists from the
///     moment OTP verification succeeds — the START of onboarding, not the
///     end. It raced the OTP screen's own `context.go(...)`, so a returning
///     user's shared target was routinely overwritten by the default `/home`
///     landing; and for a new user it won the race outright and dropped them
///     into the shared content, skipping name entry AND the onboarding
///     paywall. Since the replay deliberately bypasses the paywall gate,
///     that handed a free account direct entry to Pro content.
///
///   * **The orchestrator settling on `RouteTarget.home`.** Reads correctly,
///     but that decision is only ever emitted when `subscription.isPro`. The
///     other branch that would emit it, `OnboardingStep.paywallDismissed`,
///     is dead code — nothing in the app dispatches that step, because
///     `paywall_close.dart` calls `context.go('/home')` directly and never
///     tells the orchestrator. So the trigger silently never fired for a
///     FREE user, which is most of them.
///
/// Landing on `/home` is the one thing that is true in every one of those
/// paths — Pro or free, brand-new or returning, paywall shown or skipped —
/// because it is the literal destination onboarding ends at.
///
/// Only fires when `/home` is the TOP of the stack. With the paywall pushed
/// over it the location is `/paywall`, so the interstitial can't be skipped
/// by this. The replay itself must also be `persistentOnly` (see
/// [PendingIntentStore.consumeOnce]) so it can only ever take the
/// logged-out/install-referrer intent, never the paywall's own.
///
/// Returns a disposer; `main()` holds it for the life of the process.
VoidCallback wireDeepLinkReplayOnHome(
  GoRouter router,
  bool Function() isLoggedIn,
  void Function() replay,
) {
  final delegate = router.routerDelegate;

  /// True only when `/home` is what the user is actually looking at.
  ///
  /// Both halves are required. `uri.path` alone is NOT enough: go_router
  /// keeps the location at the BASE when a route is pushed imperatively, so
  /// pushing the paywall over home leaves `uri.path == '/home'` with the
  /// paywall on screen (verified — the delegate reports `uri=/home` with two
  /// matches). `canPop()` is what distinguishes "home, nothing above it"
  /// from "home with something pushed on top".
  bool isOnHome() {
    final config = delegate.currentConfiguration;
    if (config.matches.isEmpty) return false;
    if (config.uri.path != HomeRoutes.home) return false;
    return !delegate.canPop();
  }

  // One pending check at a time. A single navigation can notify more than
  // once (observed on device: every check logged twice in the same
  // millisecond), and each notification would otherwise queue its own
  // callback.
  var checkScheduled = false;

  void onRouteChanged() {
    // The ONLY check that is safe to make here. Everything about the route
    // is still mid-transition at notification time — `canPop()` in
    // particular reports the PREVIOUS state (verified: a push notifies with
    // `canPop=false`, a pop with `canPop=true`, and both settle to the
    // opposite once the frame completes). Gating the scheduling on a stale
    // read is how the paywall-dismiss case gets silently dropped, so the
    // real decision happens entirely in the callback below.
    if (!isLoggedIn()) return;

    // Post-frame so the navigation that brought us here has finished before
    // the replay navigates away from it; `ensureVisualUpdate` because
    // `addPostFrameCallback` does NOT itself schedule a frame, and an idle
    // moment would otherwise strand the callback unrun.
    if (checkScheduled) return;
    checkScheduled = true;
    final binding = WidgetsBinding.instance;
    binding.addPostFrameCallback((_) {
      checkScheduled = false;
      final onHome = isOnHome();
      if (kDebugMode) {
        debugPrint('[DEEPLINK] home-trigger check: loggedIn=${isLoggedIn()} '
            'onHome=$onHome uri=${delegate.currentConfiguration.uri} '
            'canPop=${delegate.canPop()}');
      }
      if (!isLoggedIn() || !onHome) return;
      replay();
    });
    binding.ensureVisualUpdate();
  }

  delegate.addListener(onRouteChanged);
  return () => delegate.removeListener(onRouteChanged);
}
