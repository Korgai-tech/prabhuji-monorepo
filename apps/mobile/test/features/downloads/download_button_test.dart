import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/core/entitlement.dart';
import 'package:mobile/features/downloads/domain/content_type.dart';
import 'package:mobile/features/downloads/downloads_providers.dart';
import 'package:mobile/features/downloads/presentation/widgets/download_button.dart';
import 'package:mobile/state/providers.dart';

import '../../support/downloads_harness.dart';

/// Play-page Download Button test (spec §Tests §download_button_test).
///
/// - Idle Pro-user tap enqueues via the manager.
/// - Idle free-user tap opens the paywall (we detect the route push).
void main() {
  testWidgets('Pro user tap enqueues via the manager', (tester) async {
    final store = FakeEncryptedStore();
    // Hang the manifest fetch so the download loop never reaches Dio —
    // otherwise the widget-test binding complains about pending timers
    // scheduled by dio's own transformer stack.
    final repo = FakeDownloadsRepository()..hang = true;
    final manager = await buildSeededManager(store: store, repository: repo);
    final router = GoRouter(
      initialLocation: '/host',
      routes: [
        GoRoute(
          path: '/host',
          builder: (_, _) => Scaffold(
            body: Center(
              child: DownloadButton(
                contentId: 'x1',
                contentType: DownloadContentType.aarti,
                title: 'Test',
                sourceScreen: 'aarti_player',
              ),
            ),
          ),
        ),
        GoRoute(
            path: '/paywall',
            builder: (_, _) =>
                const Scaffold(body: Center(child: Text('paywall')))),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          downloadManagerProvider.overrideWithValue(manager),
          analyticsProvider.overrideWith((ref) => null as Analytics?),
          entitlementStateProvider.overrideWith(
            () => _StubEntitlement(true),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    // Tap fires enqueue path — since our FakeDownloadsRepository sits
    // behind the manager and no transport is wired, enqueue immediately
    // transitions the row to `DownloadInProgress` before failing.
    await tester.tap(find.byKey(const Key('download-button-x1')));
    await tester.pump();
    // The manager's snapshot now contains the id (either downloading or
    // failed depending on the async race — both prove enqueue ran).
    expect(manager.snapshot.states.containsKey('x1'), isTrue);
  });

  testWidgets('free user tap opens paywall route', (tester) async {
    final store = FakeEncryptedStore();
    final repo = FakeDownloadsRepository();
    final manager = await buildSeededManager(store: store, repository: repo);
    var paywallOpened = false;
    final router = GoRouter(
      initialLocation: '/host',
      routes: [
        GoRoute(
          path: '/host',
          builder: (_, _) => Scaffold(
            body: Center(
              child: DownloadButton(
                contentId: 'x1',
                contentType: DownloadContentType.aarti,
                title: 'Test',
                sourceScreen: 'aarti_player',
              ),
            ),
          ),
        ),
        GoRoute(
          path: '/paywall',
          builder: (_, _) {
            paywallOpened = true;
            return const Scaffold(body: Center(child: Text('paywall')));
          },
        ),
      ],
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          downloadManagerProvider.overrideWithValue(manager),
          analyticsProvider.overrideWith((ref) => null as Analytics?),
          entitlementStateProvider.overrideWith(
            () => _StubEntitlement(false),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('download-button-x1')));
    await tester.pumpAndSettle();
    expect(paywallOpened, isTrue);
    // enqueue MUST NOT have run for a free user
    expect(manager.snapshot.states.containsKey('x1'), isFalse);
  });
}

class _StubEntitlement extends EntitlementNotifier {
  _StubEntitlement(this._isPro) : super(_NoopStorage());
  final bool _isPro;

  @override
  Entitlement build() =>
      Entitlement(granted: _isPro, until: _isPro ? null : null);
}

class _NoopStorage implements EntitlementStorage {
  @override
  Future<void> delete() async {}
  @override
  Future<Entitlement?> read() async => null;
  @override
  Future<void> write(Entitlement value) async {}
}
