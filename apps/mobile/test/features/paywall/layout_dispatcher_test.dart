import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/paywall/presentation/variants/card_hero_body.dart';
import 'package:mobile/features/paywall/presentation/variants/carousel_body.dart';
import 'package:mobile/features/paywall/presentation/variants/icon_grid_body.dart';
import 'package:mobile/features/paywall/presentation/variants/video_bleed_body.dart';

import 'paywall_test_helpers.dart';

/// TAM-160 — dispatcher test.
///
/// Asserts `PaywallScreen` mounts exactly ONE of the four variant bodies
/// based on `state.config.layout`, and that `null` / unknown layouts fall
/// back to [CardHeroPaywallBody] — spec `#PATH_DECISION` +
/// `#EXPORT_CRITICAL` ("never blank, never error").
void main() {
  Future<void> pumpAndAssert(
    WidgetTester tester, {
    required String? layout,
    required Type expectedBody,
  }) async {
    final paywall = await buildReadyBloc(config: buildConfig(layout: layout));
    final payment = newPaymentBloc();
    await tester.pumpWidget(paywallHarness(paywall: paywall, payment: payment));
    await tester.pump();

    expect(find.byType(expectedBody), findsOneWidget,
        reason: 'layout=$layout should mount $expectedBody');
    // Only the expected body is mounted — the three others must NOT be
    // present in the tree at the same time.
    for (final t in const <Type>[
      CardHeroPaywallBody,
      VideoBleedPaywallBody,
      IconGridPaywallBody,
      CarouselPaywallBody,
    ]) {
      if (t != expectedBody) {
        expect(find.byType(t), findsNothing,
            reason: 'layout=$layout must not mount sibling body $t');
      }
    }

    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  }

  testWidgets('card_hero -> CardHeroPaywallBody', (tester) async {
    await pumpAndAssert(
      tester,
      layout: 'card_hero',
      expectedBody: CardHeroPaywallBody,
    );
  });

  testWidgets('video_bleed -> VideoBleedPaywallBody', (tester) async {
    await pumpAndAssert(
      tester,
      layout: 'video_bleed',
      expectedBody: VideoBleedPaywallBody,
    );
  });

  testWidgets('icon_grid -> IconGridPaywallBody', (tester) async {
    await pumpAndAssert(
      tester,
      layout: 'icon_grid',
      expectedBody: IconGridPaywallBody,
    );
  });

  testWidgets('carousel -> CarouselPaywallBody', (tester) async {
    // Carousel needs at least one image in heroMedia; the body still mounts
    // when heroMedia is empty (it just paints the fallback background).
    final config = buildConfig(
      layout: 'carousel',
      heroMedia: [
        PaywallHeroMediaDisplayFake.image('img-1'),
        PaywallHeroMediaDisplayFake.image('img-2'),
      ],
    );
    final paywall = await buildReadyBloc(config: config);
    final payment = newPaymentBloc();
    await tester.pumpWidget(paywallHarness(paywall: paywall, payment: payment));
    await tester.pump();
    expect(find.byType(CarouselPaywallBody), findsOneWidget);
    expect(find.byType(CardHeroPaywallBody), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  testWidgets('null layout falls back to CardHeroPaywallBody', (tester) async {
    await pumpAndAssert(
      tester,
      layout: null,
      expectedBody: CardHeroPaywallBody,
    );
  });

  testWidgets('unknown future layout falls back to CardHeroPaywallBody',
      (tester) async {
    await pumpAndAssert(
      tester,
      layout: 'future_unknown_layout',
      expectedBody: CardHeroPaywallBody,
    );
  });

  // Spec §363 fallback: `carousel` demands at least one image hero — an
  // empty `heroMedia` (or one containing only videos) must fall back to
  // `card_hero` rather than mounting a blank carousel. Guards against the
  // N4 regression where `CoverflowCarousel` degrades to `SizedBox.shrink()`.
  testWidgets(
      'carousel with empty heroMedia falls back to CardHeroPaywallBody',
      (tester) async {
    final config = buildConfig(
      layout: 'carousel',
      heroMedia: const [],
    );
    final paywall = await buildReadyBloc(config: config);
    final payment = newPaymentBloc();
    await tester
        .pumpWidget(paywallHarness(paywall: paywall, payment: payment));
    await tester.pump();
    expect(find.byType(CardHeroPaywallBody), findsOneWidget);
    expect(find.byType(CarouselPaywallBody), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });

  testWidgets(
      'carousel with only video heroMedia falls back to CardHeroPaywallBody',
      (tester) async {
    final config = buildConfig(
      layout: 'carousel',
      heroMedia: [
        PaywallHeroMediaDisplayFake.video('vid-1'),
      ],
    );
    final paywall = await buildReadyBloc(config: config);
    final payment = newPaymentBloc();
    await tester
        .pumpWidget(paywallHarness(paywall: paywall, payment: payment));
    await tester.pump();
    expect(find.byType(CardHeroPaywallBody), findsOneWidget);
    expect(find.byType(CarouselPaywallBody), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await tester.runAsync(paywall.close);
    await tester.runAsync(payment.close);
  });
}
