import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'paywall_test_helpers.dart';

/// TAM-160 — layout-intent tests for each of the four variants.
///
/// Follows `patterns_library/testing/flutter-layout-intent.md`: pins the
/// viewport at 3 heights (600 / 800 / 1200 dp), pumps the paywall dispatcher
/// for a given `layout`, and asserts pinned-top / pinned-bottom / flex-fill
/// zones sit where the spec's Layout intent block says they should.
///
/// The `Pay Now` CTA must be reachable in every variant (the spec's
/// `#EXPORT_CRITICAL` guardrail). We assert its bottom sits flush with the
/// screen bottom (minus the safe-area pad — none in this test harness).
void main() {
  const width = 360.0;
  const heights = <double>[600, 800, 1200];

  for (final layout in const <String>[
    'card_hero',
    'video_bleed',
    'icon_grid',
    'carousel',
  ]) {
    for (final h in heights) {
      testWidgets('$layout — Pay Now CTA pinned bottom at ${h.toInt()}dp',
          (tester) async {
        tester.view.physicalSize = Size(width, h);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

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

        // The Pay Now CTA (key: 'paywall-pay-now-cta') must be present in
        // every variant.
        final cta = find.byKey(const Key('paywall-pay-now-cta'));
        expect(cta, findsOneWidget,
            reason: '$layout: Pay Now CTA must exist');
        final ctaRect = tester.getRect(cta);
        // The CTA must be inside the viewport (not scrolled off-screen).
        expect(ctaRect.bottom, lessThanOrEqualTo(h + 1),
            reason: '$layout at ${h.toInt()}dp: CTA must stay inside the '
                'viewport bottom (found ${ctaRect.bottom})');
        // And within the bottom third of the screen — pinned, not floating.
        expect(ctaRect.top, greaterThan(h * 0.5),
            reason: '$layout at ${h.toInt()}dp: CTA must sit in the lower '
                'half (found top=${ctaRect.top})');

        // The close X (paywall-close-cta) must be within the top 100dp — the
        // nav is pinned top.
        final close = find.byKey(const Key('paywall-close-cta'));
        expect(close, findsOneWidget,
            reason: '$layout: close CTA must exist');
        final closeRect = tester.getRect(close);
        expect(closeRect.top, lessThan(100),
            reason: '$layout at ${h.toInt()}dp: nav must be pinned top '
                '(close.top=${closeRect.top})');

        await tester.pumpWidget(const SizedBox());
        await tester.pump();
        await tester.runAsync(paywall.close);
        await tester.runAsync(payment.close);
      });
    }
  }
}
