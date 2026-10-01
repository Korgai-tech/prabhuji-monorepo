import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/deep_link_replay.dart';

import 'support/replay_router_harness.dart';

/// The trigger for the logged-out share replay (TAM-124 flow 2).
///
/// Two earlier triggers were wrong and are pinned here as regressions:
///   * a token arriving (`AuthStore.changes`) — fires at OTP-verify, the
///     START of onboarding, so it skipped name entry + the paywall;
///   * the orchestrator settling on `RouteTarget.home` — only ever emitted
///     for a PRO user, since `OnboardingStep.paywallDismissed` is dead code
///     (`paywall_close.dart` calls `context.go('/home')` directly).
void main() {
  late GoRouter router;
  late List<String> replays;
  late VoidCallback dispose;
  var loggedIn = true;

  Future<void> pump(WidgetTester tester) async {
    replays = [];
    router = buildReplayTestRouter();
    dispose = wireDeepLinkReplayOnHome(
      router,
      () => loggedIn,
      () => replays.add('fired'),
    );
    addTearDown(() => dispose());
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
  }

  setUp(() => loggedIn = true);

  testWidgets('fires when the router lands on /home', (tester) async {
    await pump(tester);

    router.go('/home');
    await tester.pumpAndSettle();

    expect(replays, ['fired']);
  });

  testWidgets('does NOT fire on the screens onboarding passes through',
      (tester) async {
    await pump(tester);

    for (final path in ['/phone-input', '/paywall']) {
      router.go(path);
      await tester.pumpAndSettle();
    }
    expect(replays, isEmpty,
        reason: 'replaying mid-onboarding skips name entry and the paywall');

    // …and it DOES fire once that user finally lands on home, so the shared
    // target is deferred, never dropped. This is the FREE-user path the
    // orchestrator-based trigger missed entirely.
    router.go('/home');
    await tester.pumpAndSettle();
    expect(replays, ['fired']);
  });

  testWidgets('does not fire while logged out', (tester) async {
    loggedIn = false;
    await pump(tester);

    router.go('/home');
    await tester.pumpAndSettle();

    expect(replays, isEmpty);
  });

  testWidgets('does not fire when the paywall is pushed OVER home',
      (tester) async {
    // The paywall interstitial sits on top of home. If the replay fired
    // here it would navigate past a gate the user has not cleared — and
    // the replay deliberately bypasses that gate.
    await pump(tester);

    router.go('/home');
    await tester.pumpAndSettle();
    replays.clear();

    router.push('/paywall');
    await tester.pumpAndSettle();

    expect(replays, isEmpty);
  });

  testWidgets('fires again when the paywall pops back to home',
      (tester) async {
    await pump(tester);

    router.go('/home');
    await tester.pumpAndSettle();
    router.push('/paywall');
    await tester.pumpAndSettle();
    replays.clear();

    router.routerDelegate.pop();
    await tester.pumpAndSettle();

    expect(replays, ['fired'],
        reason: 'the paywall-dismiss path must still replay');
  });

  testWidgets('two route changes in one frame replay once', (tester) async {
    // Observed on device during login: two notifications landed in the same
    // frame, both queued callbacks ran after it settled on /home, and the
    // target was navigated to twice (checks logged 1ms apart, two
    // `deep_link_replayed` events).
    await pump(tester);

    router.go('/phone-input');
    router.go('/home');
    await tester.pumpAndSettle();

    expect(replays, ['fired']);
  });

  testWidgets('the disposer detaches the listener', (tester) async {
    await pump(tester);
    dispose();

    router.go('/home');
    await tester.pumpAndSettle();

    expect(replays, isEmpty);
  });
}
