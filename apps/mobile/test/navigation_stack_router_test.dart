import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/navigation_stack.dart';

/// Behavioural proof for [applyNavigationStack] against a router with the
/// SAME SHAPE as `router.dart`: a `StatefulShellRoute.indexedStack` for the
/// bottom-nav branches plus FLAT top-level module routes (that flatness is
/// exactly why a bare `go` produced no stack — `/mantras/audio/:id` is not a
/// child of `/mantras`).
///
/// A synthetic router rather than the app's: `routerProvider` needs the full
/// DI graph and its screens fire real repository calls on mount, neither of
/// which this behaviour depends on.
GoRouter _buildRouter() => GoRouter(
      initialLocation: '/home',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => Scaffold(body: shell),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(path: '/home', builder: (c, s) => const Text('home')),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/status', builder: (c, s) => const Text('status')),
            ]),
          ],
        ),
        GoRoute(
          path: '/mantras/audio/:id',
          builder: (c, s) => const Text('mantra-player'),
        ),
        GoRoute(path: '/paywall', builder: (c, s) => const Text('paywall')),
      ],
    );

void main() {
  late GoRouter router;

  Future<void> pump(WidgetTester tester) async {
    router = _buildRouter();
    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
  }

  int depth() => router.routerDelegate.currentConfiguration.matches.length;
  String location() =>
      router.routerDelegate.currentConfiguration.uri.toString();

  testWidgets('THE BUG: a bare go leaves nothing to pop back to',
      (tester) async {
    await pump(tester);

    router.go('/mantras/audio/m7');
    await tester.pumpAndSettle();

    expect(find.text('mantra-player'), findsOneWidget);
    expect(depth(), 1);
    expect(router.routerDelegate.canPop(), isFalse,
        reason: 'this is what made the system back button exit the app');
  });

  testWidgets('applyNavigationStack lands on the target WITH Home under it',
      (tester) async {
    await pump(tester);

    applyNavigationStack(router, navigationStackFor('/mantras/audio/m7'));
    await tester.pumpAndSettle();

    expect(find.text('mantra-player'), findsOneWidget);
    expect(depth(), 2);
    expect(router.routerDelegate.canPop(), isTrue);

    router.routerDelegate.pop();
    await tester.pumpAndSettle();

    expect(location(), '/home');
    expect(find.text('home'), findsOneWidget);
  });

  testWidgets('the same holds for the paywall target', (tester) async {
    await pump(tester);

    applyNavigationStack(router, navigationStackFor('/paywall'));
    await tester.pumpAndSettle();
    expect(find.text('paywall'), findsOneWidget);

    router.routerDelegate.pop();
    await tester.pumpAndSettle();
    expect(location(), '/home');
  });

  testWidgets('a shell branch switches tabs instead of stacking',
      (tester) async {
    await pump(tester);

    applyNavigationStack(router, navigationStackFor('/status'));
    await tester.pumpAndSettle();

    expect(find.text('status'), findsOneWidget);
    expect(depth(), 1,
        reason: 'pushing a branch route would stack a second shell; the '
            "shell's own PopScope owns back-from-a-tab");
  });

  testWidgets('re-arriving on the same link does not pile up duplicates',
      (tester) async {
    await pump(tester);

    for (var i = 0; i < 3; i++) {
      applyNavigationStack(router, navigationStackFor('/mantras/audio/m7'));
      await tester.pumpAndSettle();
    }

    expect(depth(), 2, reason: 'go() resets the stack before each push');
    router.routerDelegate.pop();
    await tester.pumpAndSettle();
    expect(location(), '/home');
  });

  testWidgets('topLocationOf reads the pushed top, not the base',
      (tester) async {
    await pump(tester);
    expect(topLocationOf(router), '/home');

    applyNavigationStack(router, navigationStackFor('/mantras/audio/m7'));
    await tester.pumpAndSettle();

    expect(location(), '/home', reason: 'the base is what uri reports');
    expect(topLocationOf(router), '/mantras/audio/m7');

    router.go('/status');
    await tester.pumpAndSettle();
    expect(topLocationOf(router), '/status');
  });

  testWidgets('untilTopLeaves completes when the paywall is replaced by go',
      (tester) async {
    await pump(tester);
    unawaited(router.push<void>('/paywall'));
    var left = false;
    unawaited(untilTopLeaves(router, '/paywall').then((_) => left = true));
    await tester.pumpAndSettle();
    expect(left, isFalse);

    router.go('/home');
    await tester.pumpAndSettle();
    expect(left, isTrue);
  });

  testWidgets('untilTopLeaves completes when the paywall is popped',
      (tester) async {
    await pump(tester);
    unawaited(router.push<void>('/paywall'));
    var left = false;
    unawaited(untilTopLeaves(router, '/paywall').then((_) => left = true));
    await tester.pumpAndSettle();

    router.pop();
    await tester.pumpAndSettle();
    expect(left, isTrue);
  });
}
