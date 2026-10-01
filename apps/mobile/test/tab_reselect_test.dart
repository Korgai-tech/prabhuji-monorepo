import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/features/home/presentation/home_screen.dart';
import 'package:mobile/features/shell/application/tab_reselect.dart';
import 'package:mobile/features/shell/presentation/app_shell_scaffold.dart';
import 'package:mobile/features/status/feed/bloc/status_feed_state.dart';
import 'package:mobile/features/status/feed/presentation/status_home_screen.dart';

import 'support/fake_home_services.dart';
import 'support/fake_repositories.dart';
import 'support/fake_status_services.dart';
import 'support/home_harness.dart';
import 'support/status_harness.dart';

/// Re-tapping the active bottom-nav tab scrolls Home / Status to the top and
/// refreshes the list. The shell only emits [tabReselectProvider]; each screen
/// reacts to its own branch index.
void main() {
  group('shell emits the re-tap signal', () {
    GoRouter router() => GoRouter(
          initialLocation: '/home',
          routes: [
            StatefulShellRoute.indexedStack(
              builder: (context, state, shell) =>
                  AppShellScaffold(navigationShell: shell),
              branches: [
                for (final path in [
                  '/home',
                  '/chat',
                  '/status',
                  '/downloads',
                  '/rashifal',
                ])
                  StatefulShellBranch(
                    routes: [
                      GoRoute(
                        path: path,
                        builder: (_, _) => Scaffold(body: Text(path)),
                      ),
                    ],
                  ),
              ],
            ),
          ],
        );

    testWidgets('only for a tap on the ALREADY-active tab', (tester) async {
      await tester.pumpWidget(
        ProviderScope(child: MaterialApp.router(routerConfig: router())),
      );
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AppShellScaffold)),
      );
      final seen = <int>[];
      container.listen<TabReselect?>(
        tabReselectProvider,
        (_, next) => seen.add(next!.branchIndex),
      );

      // Home is active: a re-tap signals, twice in a row.
      await tester.tap(find.byKey(const Key('nav-tab-home')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('nav-tab-home')));
      await tester.pumpAndSettle();
      expect(seen, [ShellBranch.home, ShellBranch.home]);

      // Switching tabs is not a re-tap…
      await tester.tap(find.byKey(const Key('nav-tab-status')));
      await tester.pumpAndSettle();
      expect(seen, hasLength(2));

      // …but tapping Status again is.
      await tester.tap(find.byKey(const Key('nav-tab-status')));
      await tester.pumpAndSettle();
      expect(seen.last, ShellBranch.status);
    });
  });

  group('Home', () {
    testWidgets('re-tap scrolls to the top and refreshes every section',
        (tester) async {
      final repo = FakeHomeRepository(pageSize: 10);
      await pumpHome(tester, repository: repo, viewportHeight: 900);
      await tester.drag(
          find.byKey(const Key('home-scroll')), const Offset(0, -1500));
      await homeSettle(tester);
      final scrollable = tester.state<ScrollableState>(find.descendant(
        of: find.byKey(const Key('home-scroll')),
        matching: find.byType(Scrollable),
      ));
      expect(scrollable.position.pixels, greaterThan(0));
      final bannersBefore = repo.bannerCalls;
      final feedBefore = repo.feedCursors.length;

      ProviderScope.containerOf(tester.element(find.byType(HomeScreen)))
          .read(tabReselectProvider.notifier)
          .reselect(ShellBranch.home);
      for (var i = 0; i < 4; i++) {
        await homeSettle(tester);
      }

      expect(scrollable.position.pixels, 0);
      expect(repo.bannerCalls, bannersBefore + 1);
      expect(repo.feedCursors.length, greaterThan(feedBefore));
      expect(repo.feedCursors.last, isNull, reason: 'refresh reloads page 1');
    });

    testWidgets('a re-tap on another tab leaves Home alone', (tester) async {
      final repo = FakeHomeRepository(pageSize: 10);
      await pumpHome(tester, repository: repo, viewportHeight: 900);
      final bannersBefore = repo.bannerCalls;

      ProviderScope.containerOf(tester.element(find.byType(HomeScreen)))
          .read(tabReselectProvider.notifier)
          .reselect(ShellBranch.status);
      await homeSettle(tester);

      expect(repo.bannerCalls, bannersBefore);
    });
  });

  group('Status', () {
    setUpAll(() {
      AppConfig.debugSetInstance(
        AppConfig.forTest(shareHost: 'https://share.test.invalid'),
      );
    });
    setUp(FakeStatusVideoPort.resetCounters);

    testWidgets('re-tap returns to the first card and reloads the feed',
        (tester) async {
      final repo = FakeStatusRepository();
      final bloc = await pumpStatusHome(tester, repository: repo);
      final pageView = find.byKey(const Key('status-feed-pageview'));
      await tester.fling(pageView, const Offset(0, -600), 2000);
      await tester.pumpAndSettle();
      expect(bloc.state.activeIndex, greaterThan(0));
      final callsBefore = repo.fetchFeedCalls;

      ProviderScope.containerOf(tester.element(find.byType(StatusHomeScreen)))
          .read(tabReselectProvider.notifier)
          .reselect(ShellBranch.status);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pumpAndSettle();

      expect(repo.fetchFeedCalls, greaterThan(callsBefore));
      expect(bloc.state.status, StatusFeedStatus.ready);
      expect(bloc.state.activeIndex, 0);
      final controller = tester.widget<PageView>(pageView).controller!;
      expect(controller.page, 0);
    });
  });
}
