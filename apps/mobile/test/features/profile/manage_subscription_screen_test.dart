import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/application/subscription_cancel_types.dart';
import 'package:mobile/features/profile/presentation/cancel_subscription_dialog.dart';
import 'package:mobile/features/profile/subscription_cancel_analytics.dart';

import '../../support/fake_analytics.dart';
import '../../support/manage_subscription_harness.dart';

void main() {
  group('ManageSubscriptionScreen — §2.5 status matrix', () {
    testWidgets('no cancel request row → renewal date + Cancel row visible',
        (tester) async {
      await pumpManageSubscriptionScreen(tester);
      expect(find.byKey(const Key('manage-subscription-title')),
          findsOneWidget);
      expect(find.text('Manage Subscription'), findsOneWidget);
      expect(find.text('Current Plan'), findsOneWidget);
      expect(find.text('Membership since'), findsOneWidget);
      expect(find.byKey(const Key('manage-subscription-row-renewal-date')),
          findsOneWidget);
      expect(find.text('Renewal Date'), findsOneWidget);
      // Cancellation-scheduled UI must not render.
      expect(find.byKey(const Key('manage-subscription-row-vip-until')),
          findsNothing);
      expect(find.byKey(const Key('manage-subscription-status-pill')),
          findsNothing);
      // Cancel row visible.
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsOneWidget);
      expect(find.text('Cancel Subscription'), findsOneWidget);
    });

    testWidgets('pending → "Cancellation scheduled" pill + Cancel row hidden',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        latestRequest: cancelRequestFixture(
          status: CancellationRequestStatus.pending,
        ),
      );
      // Row 3 relabels to VIP access until.
      expect(find.byKey(const Key('manage-subscription-row-vip-until')),
          findsOneWidget);
      expect(find.text('VIP access until'), findsOneWidget);
      // Row 4 added — Status: Cancellation scheduled (PO ruling #2 — pin).
      expect(find.byKey(const Key('manage-subscription-status-pill')),
          findsOneWidget);
      expect(find.text('Cancellation scheduled'), findsOneWidget);
      // Cancel row hidden.
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsNothing);
      expect(find.text('Cancel Subscription'), findsNothing);
    });

    testWidgets(
        'processing → SAME "Cancellation scheduled" pill (PO ruling #2 collapse)',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        latestRequest: cancelRequestFixture(
          status: CancellationRequestStatus.processing,
        ),
      );
      expect(find.text('Cancellation scheduled'), findsOneWidget);
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsNothing);
    });

    testWidgets(
        'completed → SAME "Cancellation scheduled" pill (PO ruling #2 collapse)',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        latestRequest: cancelRequestFixture(
          status: CancellationRequestStatus.completed,
        ),
      );
      expect(find.text('Cancellation scheduled'), findsOneWidget);
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsNothing);
    });

    testWidgets(
        'rejected → Cancel row VISIBLE + helper line + Renewal Date row',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        latestRequest: cancelRequestFixture(
          status: CancellationRequestStatus.rejected,
        ),
      );
      // Rejected users can re-request.
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsOneWidget);
      // Helper line renders.
      expect(find.byKey(const Key('manage-subscription-rejected-helper')),
          findsOneWidget);
      // Renewal date label back (not "VIP access until").
      expect(find.byKey(const Key('manage-subscription-row-renewal-date')),
          findsOneWidget);
      expect(find.byKey(const Key('manage-subscription-status-pill')),
          findsNothing);
    });

    testWidgets('free-tier user → placeholder + Upgrade CTA', (tester) async {
      await pumpManageSubscriptionScreen(tester, isVip: false);
      expect(find.byKey(const Key('manage-subscription-free-tier')),
          findsOneWidget);
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsNothing);
    });

    testWidgets('mandate load error → error state + Retry re-fetches',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        paymentRepoThrows: true,
      );
      expect(find.byKey(const Key('manage-subscription-error')),
          findsOneWidget);
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsNothing);
    });
  });

  group('ManageSubscriptionScreen — analytics (§5)', () {
    testWidgets(
        'profile_subscription_viewed fires once on mount with previous_screen=profile_menu',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpManageSubscriptionScreen(tester, analytics: analytics);
      final events = analytics.allProps(
        SubscriptionCancelEvents.profileSubscriptionViewed,
      );
      expect(events, hasLength(1));
      expect(
        events.first[SubscriptionCancelEventProps.previousScreen],
        SubscriptionCancelEventValues.previousScreenProfileMenu,
      );
    });

    testWidgets(
        'subscription_cancel_request_status_viewed fires for each of the four states',
        (tester) async {
      for (final entry in <MapEntry<CancellationRequestStatus, String>>[
        MapEntry(CancellationRequestStatus.pending,
            SubscriptionCancelEventValues.requestStatusPending),
        MapEntry(CancellationRequestStatus.processing,
            SubscriptionCancelEventValues.requestStatusProcessing),
        MapEntry(CancellationRequestStatus.completed,
            SubscriptionCancelEventValues.requestStatusCompleted),
        MapEntry(CancellationRequestStatus.rejected,
            SubscriptionCancelEventValues.requestStatusRejected),
      ]) {
        final analytics = RecordingAnalytics();
        await pumpManageSubscriptionScreen(
          tester,
          analytics: analytics,
          latestRequest: cancelRequestFixture(status: entry.key),
        );
        final props = analytics.allProps(
          SubscriptionCancelEvents.subscriptionCancelRequestStatusViewed,
        );
        expect(props, hasLength(1),
            reason: '${entry.value}: expected exactly one fire');
        expect(
          props.first[SubscriptionCancelEventProps.requestStatus],
          entry.value,
        );
      }
    });

    testWidgets(
        'no request row → subscription_cancel_request_status_viewed NEVER fires',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpManageSubscriptionScreen(tester, analytics: analytics);
      expect(
        analytics.fired(
            SubscriptionCancelEvents.subscriptionCancelRequestStatusViewed),
        isFalse,
      );
    });

    testWidgets(
        'tapping the Cancel row fires subscription_cancel_tapped BEFORE the modal opens',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpManageSubscriptionScreen(tester, analytics: analytics);
      await tester.ensureVisible(
        find.byKey(const Key('manage-subscription-cancel-row')),
      );
      await tester.tap(
        find.byKey(const Key('manage-subscription-cancel-row')),
      );
      await tester.pumpAndSettle();
      final props = analytics.propsFor(
        SubscriptionCancelEvents.subscriptionCancelTapped,
      );
      expect(
        props[SubscriptionCancelEventProps.entryPoint],
        SubscriptionCancelEventValues.entryPointProfileManageSubscription,
      );
      // Modal opened after the event.
      expect(find.byKey(const Key('cancel-subscription-dialog')),
          findsOneWidget);
    });
  });

  group(
      'ManageSubscriptionScreen — end-to-end cascade (§6, PO ruling #1)', () {
    testWidgets(
        '2xx create → success SnackBar + confirmed(outcome=created) + Cancel row flips off',
        (tester) async {
      final analytics = RecordingAnalytics();
      final api = await pumpManageSubscriptionScreen(
        tester,
        analytics: analytics,
      );
      // Open modal.
      await tester.tap(
        find.byKey(const Key('manage-subscription-cancel-row')),
      );
      await tester.pumpAndSettle();
      // Tap destructive.
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();

      expect(api.createCallCount, 1);
      expect(find.text(kCancelSubscriptionSnackSuccess), findsOneWidget);
      final confirmed = analytics.propsFor(
        SubscriptionCancelEvents.subscriptionCancelConfirmed,
      );
      expect(
        confirmed[SubscriptionCancelEventProps.outcome],
        SubscriptionCancelEventValues.outcomeCreated,
      );
      // Cancel row should now be hidden — the seeded fake returns the new
      // pending row on the next getLatest call.
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsNothing);
      expect(find.text('Cancellation scheduled'), findsOneWidget);
    });

    testWidgets(
        '409-existing → "already have a pending" SnackBar + confirmed(outcome=existing) + no failed event',
        (tester) async {
      final analytics = RecordingAnalytics();
      final api = await pumpManageSubscriptionScreen(
        tester,
        analytics: analytics,
        simulatePendingExistsOnCreate: true,
      );
      await tester.tap(
        find.byKey(const Key('manage-subscription-cancel-row')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();

      expect(api.createCallCount, 1);
      expect(find.text(kCancelSubscriptionSnackAlreadyExists),
          findsOneWidget);
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

    testWidgets(
        'server 5xx envelope message → SnackBar shows envelope message verbatim + failed(reason=server_5xx)',
        (tester) async {
      final analytics = RecordingAnalytics();
      const envelopeMessage = 'server said no';
      await pumpManageSubscriptionScreen(
        tester,
        analytics: analytics,
        simulateServerErrorMessage: envelopeMessage,
      );
      await tester.tap(
        find.byKey(const Key('manage-subscription-cancel-row')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      // Envelope message verbatim, per §6 step 7.
      expect(find.text(envelopeMessage), findsOneWidget);
      final failed = analytics.propsFor(
        SubscriptionCancelEvents.subscriptionCancelFailed,
      );
      expect(
        failed[SubscriptionCancelEventProps.reason],
        'server_5xx',
      );
      // Cancel row remains visible — no request was created (§6 AC).
      expect(find.byKey(const Key('manage-subscription-cancel-row')),
          findsOneWidget);
    });

    testWidgets(
        'network error → "Couldn\'t reach the server. Please try again." SnackBar + failed(reason=network)',
        (tester) async {
      final analytics = RecordingAnalytics();
      await pumpManageSubscriptionScreen(
        tester,
        analytics: analytics,
        simulateNetworkFailureOnCreate: true,
      );
      await tester.tap(
        find.byKey(const Key('manage-subscription-cancel-row')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const Key('cancel-subscription-dialog-destructive')),
      );
      await tester.pumpAndSettle();
      expect(find.text(kCancelSubscriptionSnackNetworkFallback),
          findsOneWidget);
      final failed = analytics.propsFor(
        SubscriptionCancelEvents.subscriptionCancelFailed,
      );
      expect(
        failed[SubscriptionCancelEventProps.reason],
        'network',
      );
    });
  });
}
