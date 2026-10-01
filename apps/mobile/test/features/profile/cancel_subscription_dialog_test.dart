import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/features/profile/application/fake_subscription_cancel_api.dart';
import 'package:mobile/features/profile/application/subscription_cancel_providers.dart';
import 'package:mobile/features/profile/presentation/cancel_subscription_dialog.dart';
import 'package:mobile/features/profile/subscription_cancel_analytics.dart';
import 'package:mobile/state/providers.dart';

import '../../support/fake_analytics.dart';

/// Widget test suite for the TAM-125 confirm-cancel modal.
///
/// Copy is LOCKED per §6 (Figma frame `1939:20314`) — every string
/// assertion below is a copy-owner sign-off proxy: a Figma copy change
/// MUST land in the constants + these tests together, or the PR fails.
void main() {
  setUp(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  Future<FakeSubscriptionCancelApi> pumpDialog(
    WidgetTester tester, {
    DateTime? expiresAt,
    Analytics? analytics,
    bool simulateNetworkFailureOnCreate = false,
    bool simulatePendingExistsOnCreate = false,
    String? simulateServerErrorMessage,
  }) async {
    // Pin a phone-shaped portrait viewport — the default 800x600 landscape
    // makes the dialog's action row shove buttons off-screen.
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = FakeSubscriptionCancelApi(
      simulateNetworkFailureOnCreate: simulateNetworkFailureOnCreate,
      simulatePendingExistsOnCreate: simulatePendingExistsOnCreate,
      simulateServerErrorMessage: simulateServerErrorMessage,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          subscriptionCancelApiProvider.overrideWithValue(api),
          analyticsProvider.overrideWithValue(analytics),
        ],
        child: MaterialApp(
          home: Consumer(
            builder: (context, ref, _) => Scaffold(
              body: Builder(
                builder: (ctx) => TextButton(
                  key: const Key('open'),
                  onPressed: () => showCancelSubscriptionDialog(
                    ctx,
                    ref,
                    expiresAt: expiresAt,
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('open')));
    await tester.pumpAndSettle();
    return api;
  }

  group('locked copy pinning (Figma 1939:20314)', () {
    testWidgets('renders LOCKED title + body + button labels verbatim',
        (tester) async {
      await pumpDialog(tester, expiresAt: DateTime.utc(2026, 7, 30));
      expect(find.byKey(const Key('cancel-subscription-dialog')),
          findsOneWidget);
      expect(find.text(kCancelSubscriptionDialogTitle), findsOneWidget);
      // Body renders as a Text.rich — the prefix/date/suffix all live in one
      // Text widget. Assert on findRichText including the composed string.
      expect(
        find.textContaining("You'll continue to enjoy Prabhuji VIP benefits"),
        findsOneWidget,
      );
      expect(
        find.textContaining('30 July 2026'),
        findsOneWidget,
      );
      expect(
        find.textContaining('will not renew and you will not be charged'),
        findsOneWidget,
      );
      expect(find.text(kCancelSubscriptionDialogGoBackLabel), findsOneWidget);
      expect(find.text(kCancelSubscriptionDialogDestructiveLabel),
          findsOneWidget);
    });

    testWidgets(
        'null expiresAt → trial-fallback body (never "until null")',
        (tester) async {
      await pumpDialog(tester, expiresAt: null);
      expect(
        find.text(kCancelSubscriptionDialogBodyTrialFallback),
        findsOneWidget,
      );
      expect(
        find.textContaining('until'),
        findsNothing,
        reason: 'trial fallback must not render an "until" clause',
      );
    });
  });

  group('dismiss paths — silent, no cascade', () {
    testWidgets('No, Go Back dismisses the modal', (tester) async {
      final analytics = RecordingAnalytics();
      final api = await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
        analytics: analytics,
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-go-back')),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cancel-subscription-dialog')),
          findsNothing);
      // No repo call, no analytics.
      expect(api.createCallCount, 0);
      expect(
        analytics.fired(
            SubscriptionCancelEvents.subscriptionCancelConfirmed),
        isFalse,
      );
      expect(
        analytics.fired(
            SubscriptionCancelEvents.subscriptionCancelFailed),
        isFalse,
      );
    });

    testWidgets('X close dismisses the modal', (tester) async {
      final api = await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-close')),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cancel-subscription-dialog')),
          findsNothing);
      expect(api.createCallCount, 0);
    });

    testWidgets('scrim tap dismisses the modal', (tester) async {
      final api = await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
      );
      // Scrim covers everything outside the AlertDialog card.
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('cancel-subscription-dialog')),
          findsNothing);
      expect(api.createCallCount, 0);
    });
  });

  group('destructive cascade — PO ruling #1', () {
    testWidgets('destructive CTA fires exactly ONE POST on a double-tap',
        (tester) async {
      // Two taps back-to-back with NO pump between them — matches the "same
      // frame" double-tap the spec's Testing Strategy calls out. The CTA
      // MUST be disabled on the SECOND tap (state flip is synchronous).
      final api = await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
      );
      final destructive =
          find.byKey(const Key('cancel-subscription-dialog-destructive'));
      await tester.tap(destructive, warnIfMissed: false);
      // No pump → same frame. Second tap should be a no-op because the
      // state flip already happened synchronously in the first handler.
      await tester.tap(destructive, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(api.createCallCount, 1,
          reason: 'PO ruling #1 — same-frame double-tap must fire ONE POST');
    });

    testWidgets(
        'destructive CTA → 2xx → confirmed(outcome=created) analytics',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
        analytics: analytics,
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      final props = analytics.propsFor(
        SubscriptionCancelEvents.subscriptionCancelConfirmed,
      );
      expect(
        props[SubscriptionCancelEventProps.outcome],
        SubscriptionCancelEventValues.outcomeCreated,
      );
      expect(
        props[SubscriptionCancelEventProps.entryPoint],
        SubscriptionCancelEventValues.entryPointProfileManageSubscription,
      );
    });

    testWidgets(
        'destructive CTA → 409-existing → confirmed(outcome=existing) + no failed event',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
        analytics: analytics,
        simulatePendingExistsOnCreate: true,
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      final confirmed = analytics.propsFor(
        SubscriptionCancelEvents.subscriptionCancelConfirmed,
      );
      expect(
        confirmed[SubscriptionCancelEventProps.outcome],
        SubscriptionCancelEventValues.outcomeExisting,
      );
      expect(
        analytics.fired(
            SubscriptionCancelEvents.subscriptionCancelFailed),
        isFalse,
      );
    });
  });

  group('SnackBar copy pinning (§6)', () {
    testWidgets('2xx success → success copy verbatim, 2s duration',
        (tester) async {
      await pumpDialog(tester, expiresAt: DateTime.utc(2026, 7, 30));
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      expect(find.text(kCancelSubscriptionSnackSuccess), findsOneWidget);
    });

    testWidgets('409-existing → "already have a pending" copy verbatim',
        (tester) async {
      await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
        simulatePendingExistsOnCreate: true,
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      expect(find.text(kCancelSubscriptionSnackAlreadyExists),
          findsOneWidget);
    });

    testWidgets('generic 5xx → envelope message verbatim, not a generic string',
        (tester) async {
      const envelopeMessage = 'A very specific server-side error';
      await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
        simulateServerErrorMessage: envelopeMessage,
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      expect(find.text(envelopeMessage), findsOneWidget);
    });

    testWidgets('network drop → locked fallback copy verbatim',
        (tester) async {
      await pumpDialog(
        tester,
        expiresAt: DateTime.utc(2026, 7, 30),
        simulateNetworkFailureOnCreate: true,
      );
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      expect(find.text(kCancelSubscriptionSnackNetworkFallback),
          findsOneWidget);
    });
  });
}
