import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/profile/application/subscription_cancel_types.dart';

import '../../support/manage_subscription_harness.dart';

/// Layout-intent test for the Manage Subscription screen (TAM-125, Figma
/// `1939:19854` active / `1939:20420` cancellation-scheduled). Per
/// `patterns_library/testing/flutter-layout-intent.md`: exactly ONE flex-
/// fill zone (the scrollable content region), pinned top bar (44 dp), and
/// a pinned-bottom Cancel row that VANISHES (no phantom space) in the
/// cancellation-scheduled state.
///
/// Fails when:
///   * someone wraps the root in a SingleChildScrollView (two Scrollables)
///   * the Cancel row is rendered "hidden but reserved" (a `Visibility` with
///     `maintainSize: true` would leave phantom space at the bottom)
///   * the app bar drifts off y=0.
void main() {
  const width = 360.0;
  const heights = <double>[600.0, 800.0, 1200.0];

  for (final h in heights) {
    testWidgets('active state — layout intent holds at ${h.toInt()}dp',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        viewSize: Size(width, h),
      );

      // Pinned-top: app bar at y=0.
      final appBar = tester
          .getRect(find.byKey(const Key('manage-subscription-appbar')));
      expect(appBar.top, closeTo(0, 0.5),
          reason: 'app bar must pin to the top (y=${appBar.top} at $h dp)');

      // Flex-fill: scroll region occupies the middle.
      final scrollRegion = tester.getRect(
          find.byKey(const Key('manage-subscription-scroll-region')));
      expect(scrollRegion.top, greaterThan(appBar.bottom - 0.5));

      // Pinned-bottom: Cancel row's bottom edge sits near h (SafeArea inset
      // is ~0 on the test view since we don't inject padding). Some ~1 dp
      // slack for the bottom SafeArea + row padding.
      final cancelRow = tester
          .getRect(find.byKey(const Key('manage-subscription-cancel-row')));
      expect(cancelRow.bottom, lessThanOrEqualTo(h + 0.5));
      expect(cancelRow.bottom, greaterThan(h - 40));

      // Exactly ONE Scrollable in the tree (the sole one inside the flex-
      // fill zone). A root-level SingleChildScrollView would fail here.
      final scrollables = find.byType(Scrollable);
      expect(scrollables, findsOneWidget,
          reason: 'exactly one Scrollable expected — the flex-fill zone');
      expect(
        find.descendant(
          of: find.byKey(const Key('manage-subscription-scroll-region')),
          matching: find.byType(Scrollable),
        ),
        findsOneWidget,
        reason: 'the sole Scrollable must live inside the flex-fill zone',
      );
    });

    testWidgets(
        'cancellation-scheduled state — Cancel row is FULLY hidden at ${h.toInt()}dp',
        (tester) async {
      await pumpManageSubscriptionScreen(
        tester,
        viewSize: Size(width, h),
        latestRequest: cancelRequestFixture(
          status: CancellationRequestStatus.pending,
        ),
      );

      // Cancel row must be gone entirely — no phantom space at the bottom
      // per the spec's Layout intent block ("do NOT reserve space when
      // hidden").
      expect(
        find.byKey(const Key('manage-subscription-cancel-row')),
        findsNothing,
      );

      // The content region should now extend further down (no bottom
      // pinned bar consuming space).
      final scrollRegion = tester.getRect(
          find.byKey(const Key('manage-subscription-scroll-region')));
      expect(scrollRegion.bottom, closeTo(h, 1.0));
    });
  }
}
