import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/modals/data/modals_repository.dart';
import 'package:mobile/features/modals/modals_analytics.dart';
import 'package:mobile/features/modals/modals_providers.dart';
import 'package:mobile/features/modals/presentation/modal_host.dart';
import 'package:mobile/features/modals/presentation/status_intro_modal.dart';
import 'package:mobile/features/status/status_analytics.dart';
import 'package:mobile/features/status/status_routes.dart';
import 'package:mobile/state/providers.dart';

import '../../support/fake_analytics.dart';
import '../../support/fake_modals_repository.dart';

/// [ModalHost] orchestration tests (TAM-174) — the fetch/show/report/analytics
/// wiring. `StatusIntroModal`'s own rendering is covered by
/// `status_intro_modal_test.dart`.
Widget _harness({
  required FakeModalsRepository repo,
  RecordingAnalytics? analytics,
}) {
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const ModalHost(
          child: Scaffold(key: Key('home-body'), body: SizedBox.shrink()),
        ),
      ),
      GoRoute(
        path: StatusRoutes.details,
        builder: (context, state) {
          final args = state.extra as StatusDetailsArgs?;
          return Scaffold(
            key: const Key('details-screen'),
            body: Text('DETAILS:${args?.entrySource}'),
          );
        },
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      modalsRepositoryProvider.overrideWithValue(repo),
      analyticsProvider.overrideWithValue(analytics),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

Future<void> _settleModal(WidgetTester tester) async {
  // Frame 1: `initState`'s `addPostFrameCallback` runs, kicking off the
  // (fake, synchronous-ish) fetch.
  await tester.pump();
  // Let the fetch's Future and the subsequent `showDialog` land.
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    // The check-once-per-launch latch is a STATIC — reset it so every test
    // gets a clean slate regardless of run order.
    ModalHost.debugResetLatch();
  });

  testWidgets('fires viewed exactly once, on first paint', (tester) async {
    final repo = FakeModalsRepository(
      nextModal: statusIntroModalFixture(showNumber: 1, imageUrl: null),
    );
    final analytics = RecordingAnalytics();

    await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
    await _settleModal(tester);

    expect(find.byType(StatusIntroModal), findsOneWidget);
    final viewed = repo.impressions.where((i) => i.action == 'viewed').toList();
    expect(viewed, hasLength(1));
    expect(viewed.single.showNumber, 1);
    expect(analytics.allProps(ModalEvents.viewed), hasLength(1));
    expect(
      analytics.propsFor(ModalEvents.viewed)[ModalEventProps.triggerSource],
      'first_time',
    );
    expect(
      analytics.propsFor(ModalEvents.viewed)[ModalEventProps.showNumber],
      1,
    );

    // A later, unrelated rebuild of the SAME process must not re-check —
    // this is the process-lifetime latch, not the dialog's own paint guard.
    await tester.pump();
    expect(repo.fetchCalls, 1);
    expect(repo.impressions.where((i) => i.action == 'viewed'), hasLength(1));
  });

  testWidgets('modal == null renders Home unchanged and reports nothing', (
    tester,
  ) async {
    final repo = FakeModalsRepository(nextModal: null);
    final analytics = RecordingAnalytics();

    await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
    await _settleModal(tester);

    expect(find.byKey(const Key('home-body')), findsOneWidget);
    expect(find.byType(StatusIntroModal), findsNothing);
    expect(repo.impressions, isEmpty);
    expect(analytics.events, isEmpty);
  });

  testWidgets(
    'a repository throw on fetch renders Home unchanged and fires nothing',
    (tester) async {
      final repo = FakeModalsRepository(
        fetchError: const ModalsException(ModalsErrorKind.unknown, 'boom'),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      expect(find.byKey(const Key('home-body')), findsOneWidget);
      expect(find.byType(StatusIntroModal), findsNothing);
      expect(repo.impressions, isEmpty);
      expect(analytics.events, isEmpty);
      // No crash / error surfaced — `tester.takeException()` returns null.
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'CTA reports cta_clicked, fires analytics, closes the dialog and navigates '
    'with the introModal entrySource',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(showNumber: 5, imageUrl: null),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      await tester.tap(find.byKey(const Key('status-intro-modal-cta')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      final ctaImpressions = repo.impressions
          .where((i) => i.action == 'cta_clicked')
          .toList();
      expect(ctaImpressions, hasLength(1));
      expect(ctaImpressions.single.showNumber, 5);
      expect(analytics.fired(ModalEvents.ctaClicked), isTrue);

      expect(find.byType(StatusIntroModal), findsNothing);
      expect(
        find.text('DETAILS:${StatusEntrySources.introModal}'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'an unresolvable ctaDeeplink still fires cta_clicked and reports the '
    'impression, but never navigates and never throws — Home stays intact',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(
          showNumber: 3,
          imageUrl: null,
          ctaDeeplink: 'prabhuji://not/allowlisted',
        ),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      await tester.tap(find.byKey(const Key('status-intro-modal-cta')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // The tap genuinely happened — both the impression and the analytics
      // event still fire for an unresolvable target.
      final ctaImpressions = repo.impressions
          .where((i) => i.action == 'cta_clicked')
          .toList();
      expect(ctaImpressions, hasLength(1));
      expect(ctaImpressions.single.showNumber, 3);
      expect(analytics.fired(ModalEvents.ctaClicked), isTrue);

      // But no navigation happened, and nothing threw.
      expect(find.byKey(const Key('details-screen')), findsNothing);
      expect(find.byKey(const Key('home-body')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  group('the three dismiss paths report their OWN dismissMethod', () {
    testWidgets('the close cross → cross', (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(showNumber: 2, imageUrl: null),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      await tester.tap(find.byKey(const Key('status-intro-modal-close')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(StatusIntroModal), findsNothing);
      final dismissed = repo.impressions
          .where((i) => i.action == 'dismissed')
          .toList();
      expect(dismissed, hasLength(1));
      expect(dismissed.single.dismissMethod, 'cross');
      expect(dismissed.single.showNumber, 2);
      expect(
        analytics.propsFor(
          ModalEvents.dismissed,
        )[ModalEventProps.dismissMethod],
        'cross',
      );
    });

    testWidgets('a tap outside the card → outside_tap', (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(imageUrl: null),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      // Far from the centred card — lands on the full-screen scrim catcher.
      await tester.tapAt(const Offset(10, 10));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(StatusIntroModal), findsNothing);
      final dismissed = repo.impressions
          .where((i) => i.action == 'dismissed')
          .toList();
      expect(dismissed, hasLength(1));
      expect(dismissed.single.dismissMethod, 'outside_tap');
      expect(
        analytics.propsFor(
          ModalEvents.dismissed,
        )[ModalEventProps.dismissMethod],
        'outside_tap',
      );
    });

    testWidgets('the system back button → back', (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(imageUrl: null),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      // `Navigator.maybePop` is exactly the call the framework's system
      // back-button handling resolves to (see `Router.popRoute`) — this
      // exercises the SAME `canPop:false` / `onPopInvokedWithResult` path a
      // real hardware back press would, without needing a platform channel.
      final dialogElement = tester.element(find.byType(StatusIntroModal));
      await Navigator.maybePop(dialogElement);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(StatusIntroModal), findsNothing);
      final dismissed = repo.impressions
          .where((i) => i.action == 'dismissed')
          .toList();
      expect(dismissed, hasLength(1));
      expect(dismissed.single.dismissMethod, 'back');
      expect(
        analytics.propsFor(
          ModalEvents.dismissed,
        )[ModalEventProps.dismissMethod],
        'back',
      );
    });
  });

  testWidgets(
    'lastOutcomeModule rides on viewed and cta_clicked when the server '
    'supplies it',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(
          showNumber: 1,
          imageUrl: null,
          lastOutcomeModule: 'status_shared',
        ),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      expect(
        analytics.propsFor(
          ModalEvents.viewed,
        )[ModalEventProps.lastOutcomeModule],
        'status_shared',
      );

      await tester.tap(find.byKey(const Key('status-intro-modal-cta')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        analytics.propsFor(
          ModalEvents.ctaClicked,
        )[ModalEventProps.lastOutcomeModule],
        'status_shared',
      );
    },
  );

  testWidgets(
    'lastOutcomeModule rides on dismissed when the server supplies it',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(
          imageUrl: null,
          lastOutcomeModule: 'status_shared',
        ),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      await tester.tap(find.byKey(const Key('status-intro-modal-close')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        analytics.propsFor(
          ModalEvents.dismissed,
        )[ModalEventProps.lastOutcomeModule],
        'status_shared',
      );
    },
  );

  testWidgets(
    'modalKey rides on viewed and cta_clicked, sourced from the fetched '
    'modal — not a hardcoded constant',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(
          key: 'winter-promo-modal',
          showNumber: 1,
          imageUrl: null,
        ),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      expect(
        analytics.propsFor(ModalEvents.viewed)[ModalEventProps.modalKey],
        'winter-promo-modal',
      );

      await tester.tap(find.byKey(const Key('status-intro-modal-cta')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        analytics.propsFor(
          ModalEvents.ctaClicked,
        )[ModalEventProps.modalKey],
        'winter-promo-modal',
      );
    },
  );

  testWidgets(
    'modalKey rides on dismissed, sourced from the fetched modal — a '
    'DIFFERENT modal than the viewed/cta_clicked test above proves it is '
    'never a constant',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(
          key: 'diwali-promo-modal',
          imageUrl: null,
        ),
      );
      final analytics = RecordingAnalytics();

      await tester.pumpWidget(_harness(repo: repo, analytics: analytics));
      await _settleModal(tester);

      await tester.tap(find.byKey(const Key('status-intro-modal-close')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(
        analytics.propsFor(ModalEvents.dismissed)[ModalEventProps.modalKey],
        'diwali-promo-modal',
      );
    },
  );

  testWidgets(
    'a null analytics provider is a silent no-op (never blocks reporting)',
    (tester) async {
      final repo = FakeModalsRepository(
        nextModal: statusIntroModalFixture(imageUrl: null),
      );

      await tester.pumpWidget(_harness(repo: repo, analytics: null));
      await _settleModal(tester);

      // No crash from the null analytics; the impression report still landed.
      expect(tester.takeException(), isNull);
      expect(repo.impressions.where((i) => i.action == 'viewed'), hasLength(1));
    },
  );
}
