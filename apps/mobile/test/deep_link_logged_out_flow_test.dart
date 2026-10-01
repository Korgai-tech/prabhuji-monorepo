import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/deep_link_replay.dart';
import 'package:mobile/core/deep_link_service.dart';
import 'package:mobile/core/navigation_stack.dart';
import 'package:mobile/core/pending_intent_store.dart';

import 'support/replay_router_harness.dart';

/// End-to-end for the flow a share recipient without an account actually
/// walks: tap link while logged out → login screen → onboarding → the shared
/// destination. Wires the REAL [DeepLinkService] to the REAL
/// [wireDeepLinkReplayOnHome] over a real [PendingIntentStore], so a break in
/// the seam between them fails here rather than on a device.
class _FakeStorage implements PendingIntentStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String v) async => value = v;
  @override
  Future<void> delete() async => value = null;
}

void main() {
  late _FakeStorage storage;
  late PendingIntentStore store;
  late GoRouter router;
  late List<String> events;
  late VoidCallback disposeReplay;
  var loggedIn = false;
  var pro = false;

  DeepLinkService buildService() => DeepLinkService(
        pendingIntentStore: store,
        isLoggedIn: () => loggedIn,
        isProUser: () => pro,
        // The REAL applier, against a real router — so this exercises the
        // stack build, not a recording fake.
        navigateToStack: (stack) => applyNavigationStack(router, stack),
        pushPaywall: () {
          events.add('paywall');
          router.push('/paywall');
        },
        trackEvent: (name, _) => events.add(name),
      );

  setUp(() {
    storage = _FakeStorage();
    store = PendingIntentStore(storage: storage);
    events = [];
    loggedIn = false;
    pro = false;
  });

  Future<DeepLinkService> boot(WidgetTester tester) async {
    router = buildReplayTestRouter();
    final svc = buildService();
    disposeReplay = wireDeepLinkReplayOnHome(
      router,
      () => loggedIn,
      () => unawaited(svc.consumePendingIntent(persistentOnly: true)),
    );
    addTearDown(() => disposeReplay());
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    return svc;
  }

  String location() =>
      router.routerDelegate.currentConfiguration.uri.toString();

  testWidgets('logged out → login → onboarding → the shared destination',
      (tester) async {
    final svc = await boot(tester);

    // 1. The tap, while logged out. Nothing navigates — landing on the
    //    target with no Bearer would render the destination's error state.
    await svc.handleUri(
      Uri.parse('https://krutyug.ai/app/aarti/a7897e4c'),
      source: 'cold_start',
    );
    await tester.pumpAndSettle();
    expect(storage.value, isNotNull, reason: 'the target must be parked');
    expect(location(), '/splash', reason: 'must not navigate before login');

    // 2. Onboarding. A token exists from OTP-verify onward, but name entry
    //    and the paywall are still ahead — nothing may replay yet.
    loggedIn = true;
    router.go('/phone-input');
    await tester.pumpAndSettle();
    router.go('/paywall');
    await tester.pumpAndSettle();
    expect(storage.value, isNotNull, reason: 'still parked mid-onboarding');

    // 3. The user dismisses the paywall. This is EXACTLY what
    //    `paywall_close.dart` does — `context.go('/home')`, which never
    //    tells the orchestrator, which is why an orchestrator-based trigger
    //    never fired for a free account.
    router.go('/home');
    await tester.pumpAndSettle();

    expect(find.text('aarti-player'), findsOneWidget,
        reason: 'the shared destination');
    expect(router.routerDelegate.canPop(), isTrue,
        reason: 'with Home underneath it');
    expect(storage.value, isNull, reason: 'consumed exactly once');

    router.routerDelegate.pop();
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('the replay cannot fire twice', (tester) async {
    // Landing on home is a signal that repeats constantly in normal use —
    // every tab return, every pop back. The store's consume-once contract is
    // what keeps that from teleporting the user into a stale shared target
    // again and again.
    final svc = await boot(tester);
    await svc.handleUri(Uri.parse('https://krutyug.ai/app/aarti/a1'),
        source: 'cold_start');
    loggedIn = true;

    router.go('/home');
    await tester.pumpAndSettle();
    expect(find.text('aarti-player'), findsOneWidget, reason: 'replayed once');

    // Back to home, the way a user would leave the destination.
    router.routerDelegate.pop();
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget);

    // …and landing on home again must NOT drag them back into the target.
    router.go('/home');
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget,
        reason: 'the intent was consumed; nothing may replay again');
    expect(storage.value, isNull);
  });

  testWidgets("a non-Pro user's paywall interstitial is NOT skipped",
      (tester) async {
    // The gate case: logged in, not Pro. The service parks a SESSION intent
    // and pushes the paywall. The home-landing replay must not touch that
    // intent — it consumes `persistentOnly` — or the user would sail past a
    // gate the replay is designed to bypass only AFTER it has been cleared.
    loggedIn = true;
    pro = false;
    final svc = await boot(tester);
    router.go('/home');
    await tester.pumpAndSettle();

    await svc.handleUri(Uri.parse('https://krutyug.ai/app/aarti/a1'),
        source: 'warm_resume');
    await tester.pumpAndSettle();

    expect(events, contains('paywall'));
    expect(find.text('paywall'), findsOneWidget);
    expect(find.text('aarti-player'), findsNothing,
        reason: 'the interstitial must not be bypassed');
  });

  testWidgets('the same cold-start URL delivered twice is handled once',
      (tester) async {
    // An App Link cold start arrives BOTH through Flutter's route-information
    // provider (→ the router redirect, which hands it to the service) and
    // through app_links.
    loggedIn = true;
    pro = true;
    final svc = await boot(tester);

    final uri = Uri.parse('https://krutyug.ai/app/aarti/a1');
    await svc.handleUri(uri, source: 'router');
    await svc.handleUri(uri, source: 'cold_start');
    await tester.pumpAndSettle();

    expect(events.where((e) => e == 'deep_link_received'), hasLength(1),
        reason: 'the echo must not double-count in analytics either');
    expect(find.text('aarti-player'), findsOneWidget);
    router.routerDelegate.pop();
    await tester.pumpAndSettle();
    expect(find.text('home'), findsOneWidget,
        reason: 'exactly one Home underneath, not two');
  });
}
