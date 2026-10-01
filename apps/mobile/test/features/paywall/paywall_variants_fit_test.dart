import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'paywall_test_helpers.dart';

/// TAM-XXX — "no scroll" fit test for the three refactored paywall
/// variants (card_hero, icon_grid, carousel).
///
/// Follows `patterns_library/testing/flutter-layout-intent.md`: pumps each
/// variant at 3 device heights (640 / 720 / 900 dp) at the Android baseline
/// width (360dp) and asserts:
///
///   1. No `FlutterError` is captured during pump — i.e. no `RenderFlex
///      overflowed` or "children lack an Expanded" errors fire.
///   2. `SingleChildScrollView` is NOT mounted anywhere in the variant's
///      middle band (the whole "no scroll" contract). It's allowed inside
///      widgets we don't own (e.g. `CoverflowCarousel`'s PageView is a
///      Scrollable but not a SingleChildScrollView).
///   3. The key structural widgets (nav + Pay Now + variant-specific
///      landmarks) are all mounted and visible.
///
/// `video_bleed` is deliberately excluded — it was already Stack-based and
/// isn't touched by the refactor.
void main() {
  const width = 360.0;
  // Cover the "low screen size" phones the user's requirement calls out:
  // 640dp is the Android minimum we target, 720dp is a typical 6"+ phone
  // (Pixel-class), 900dp is a large-phone / small-tablet upper bound.
  const heights = <double>[640, 720, 900];

  Future<void> pumpAndAssertClean(
    WidgetTester tester,
    String layout, {
    required double height,
  }) async {
    final errors = <FlutterErrorDetails>[];
    final originalOnError = FlutterError.onError;
    FlutterError.onError = errors.add;

    try {
      tester.view.physicalSize = Size(width, height);
      tester.view.devicePixelRatio = 1.0;

      final config = layout == 'carousel'
          ? buildConfig(
              layout: layout,
              heroMedia: [
                PaywallHeroMediaDisplayFake.image('img-1'),
                PaywallHeroMediaDisplayFake.image('img-2'),
              ],
            )
          : buildConfig(layout: layout);
      final paywall = await buildReadyBloc(config: config);
      final payment = newPaymentBloc();

      await tester
          .pumpWidget(paywallHarness(paywall: paywall, payment: payment));
      await tester.pump();

      // (3) Landmark widgets present on every variant.
      expect(
        find.byKey(const Key('paywall-close-cta')),
        findsOneWidget,
        reason: '$layout at ${height.toInt()}dp: close CTA must exist',
      );
      expect(
        find.byKey(const Key('paywall-pay-now-cta')),
        findsOneWidget,
        reason: '$layout at ${height.toInt()}dp: Pay Now CTA must exist',
      );

      // Variant-specific landmarks — proves the middle band renders even
      // when scaled down (widgets stay in the tree, they just paint smaller).
      switch (layout) {
        case 'card_hero':
          // Single-plan fixture — plan card is present with the seeded
          // plan-weekly key.
          expect(
            find.byKey(const Key('paywall-plan-card-plan-weekly')),
            findsOneWidget,
            reason:
                'card_hero at ${height.toInt()}dp: plan card must exist',
          );
          break;
        case 'icon_grid':
          expect(
            find.byKey(const Key('paywall-icon-grid-title')),
            findsOneWidget,
            reason:
                'icon_grid at ${height.toInt()}dp: VIP heading must exist',
          );
          expect(
            find.byKey(const Key('paywall-icon-grid-card')),
            findsOneWidget,
            reason:
                'icon_grid at ${height.toInt()}dp: benefit grid must exist',
          );
          expect(
            find.byKey(const Key('paywall-icon-grid-trial-section')),
            findsOneWidget,
            reason:
                'icon_grid at ${height.toInt()}dp: trial section must exist',
          );
          break;
        case 'carousel':
          expect(
            find.byKey(const Key('paywall-carousel-coverflow')),
            findsOneWidget,
            reason:
                'carousel at ${height.toInt()}dp: coverflow must exist',
          );
          expect(
            find.byKey(const Key('paywall-carousel-features')),
            findsOneWidget,
            reason:
                'carousel at ${height.toInt()}dp: named-feature grid must '
                'exist',
          );
          expect(
            find.byKey(const Key('paywall-carousel-trial-section')),
            findsOneWidget,
            reason:
                'carousel at ${height.toInt()}dp: trial section must exist',
          );
          break;
      }

      // (2) No SingleChildScrollView anywhere in the variant's middle band.
      // This is the whole "no scroll" contract: the CTA can never be
      // scrolled off-screen because the whole screen never scrolls.
      final singleChildScrolls = find.byType(SingleChildScrollView);
      expect(
        singleChildScrolls,
        findsNothing,
        reason:
            '$layout at ${height.toInt()}dp: no SingleChildScrollView '
            'may be mounted in the paywall tree — the screen must never '
            'scroll (${singleChildScrolls.evaluate().length} found)',
      );

      // Tear down BEFORE restoring the error handler so any dispose-time
      // errors (Timer.periodic in carousel, video controller in card_hero)
      // are still captured under the same window.
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      await tester.runAsync(paywall.close);
      await tester.runAsync(payment.close);
    } finally {
      FlutterError.onError = originalOnError;
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    }

    // (1) No FlutterError captured during pump / interactions / tear-down.
    // A RenderFlex overflow surfaces here as an `assertion` error detail —
    // this is the single strongest signal that the "no scroll" refactor
    // hasn't traded a scrollbar for a red-stripe overflow banner.
    expect(
      errors,
      isEmpty,
      reason: '$layout at ${width.toInt()}×${height.toInt()}: '
          '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
    );
  }

  for (final layout in const <String>['card_hero', 'icon_grid', 'carousel']) {
    for (final h in heights) {
      testWidgets(
          '$layout: fits at ${h.toInt()}dp with no scroll and no overflow',
          (tester) async {
        await pumpAndAssertClean(tester, layout, height: h);
      });
    }
  }
}
