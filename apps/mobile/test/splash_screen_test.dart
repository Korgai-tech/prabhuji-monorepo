import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/onboarding/splash/presentation/splash_screen.dart';

import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

/// Wraps [SplashScreen] in a MaterialApp + BlocProvider so widget tests have a
/// full render context.
Future<void> _pumpSplash(
  WidgetTester tester, {
  required OnboardingOrchestratorBloc bloc,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: BlocProvider<OnboardingOrchestratorBloc>.value(
        value: bloc,
        child: const SplashScreen(),
      ),
    ),
  );
}

/// Forces widget disposal so the "still working" [Timer] scheduled in
/// [SplashScreen]'s initState is cancelled before the test ends — pending
/// timers are treated as leaks by flutter_test.
Future<void> _dispose(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
}

/// Closes [bloc] from OUTSIDE flutter_test's fake async zone.
///
/// [Bloc.close] awaits internal stream + emitter subscriptions whose cleanup
/// steps depend on real async scheduling. Running it inside the fake zone
/// hangs testWidgets indefinitely — [WidgetTester.runAsync] hops back to real
/// time, which is what the bloc's shutdown expects.
Future<void> _closeBloc(WidgetTester tester, Bloc<dynamic, dynamic> bloc) {
  return tester.runAsync(() async {
    await bloc.close();
  });
}

OnboardingOrchestratorBloc _blocForLoggedOut() {
  return OnboardingOrchestratorBloc(
    authStore: FakeAuthStore(token: null),
    usersRepository: FakeUsersRepository(result: const MeResult()),
    subscriptionRepository: FakeSubscriptionRepository(),
  );
}

void main() {
  testWidgets('renders the Prabhuji wordmark + trust text', (tester) async {
    final bloc = _blocForLoggedOut();
    await _pumpSplash(tester, bloc: bloc);
    // One pump runs initState's post-frame callback; the orchestrator's
    // `authStore.read()` is a Future so we don't need to await it here.
    await tester.pump();

    expect(find.byKey(const Key('splash-wordmark')), findsOneWidget);
    expect(find.text('Prabhuji'), findsOneWidget);
    expect(find.byKey(const Key('splash-trust-text')), findsOneWidget);
    expect(find.text('100% Secure'), findsOneWidget);

    await _dispose(tester);
    await _closeBloc(tester, bloc);
  });

  testWidgets(
    'the "Still working…" affordance appears once ~1500 ms have elapsed',
    (tester) async {
      // A Completer that we never complete = a Future that never resolves.
      // (`Future<MeResult>.delayed(...)` without a computation completes with a
      // TypeError because Null can't cast to non-nullable MeResult — the bloc
      // would land on OrchestratorError instantly and the still-working timer
      // wouldn't matter.)
      final neverCompletes = Completer<MeResult>();
      final bloc = OnboardingOrchestratorBloc(
        authStore: FakeAuthStore(token: 'tok'),
        // Never resolves — hangs so the still-working timer wins.
        usersRepository: FakeUsersRepository(
          onGetMe: () => neverCompletes.future,
        ),
        subscriptionRepository: FakeSubscriptionRepository(),
      );
      await _pumpSplash(tester, bloc: bloc);
      await tester.pump();

      expect(
        find.byKey(const Key('splash-still-working')),
        findsNothing,
        reason: '0 ms in: the affordance should not be visible yet',
      );
      // Advance past the 1500 ms threshold. `pump(Duration)` fires pending
      // timers scheduled inside that window; a subsequent zero-duration pump
      // flushes the `setState()` triggered from the timer callback so the
      // rebuild actually lands before we assert.
      await tester.pump(const Duration(milliseconds: 1600));
      await tester.pump();
      expect(find.byKey(const Key('splash-still-working')), findsOneWidget);

      // Unblock the bloc handler so `bloc.close()` can drain — otherwise the
      // never-completing Future stalls close indefinitely.
      neverCompletes.completeError(StateError('test tear-down'));
      await tester.pump();
      await _dispose(tester);
      await _closeBloc(tester, bloc);
    },
  );

  testWidgets(
    'orchestrator error → offline retry affordance is visible',
    (tester) async {
      // Seed the bloc so its first emit is OrchestratorError (no cache).
      final bloc = OnboardingOrchestratorBloc(
        authStore: FakeAuthStore(token: 'tok'),
        usersRepository: FakeUsersRepository(onGetMe: () async {
          throw fakeServerError();
        }),
        subscriptionRepository: FakeSubscriptionRepository(),
      );
      await _pumpSplash(tester, bloc: bloc);
      // Pump twice so postFrame → AppStarted → resolve → error can settle.
      await tester.pump();
      await tester.pump();
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const Key('splash-retry-button')), findsOneWidget);
      expect(find.byKey(const Key('splash-offline-text')), findsOneWidget);

      await _dispose(tester);
      await _closeBloc(tester, bloc);
    },
  );
}
