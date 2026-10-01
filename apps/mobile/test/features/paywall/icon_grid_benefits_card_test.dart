import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/paywall/presentation/widgets/icon_grid_benefits_card.dart';

/// TAM-160 — `_IconGlyph` per-benefit icon lookup (QA N1).
///
/// The `icon_grid` variant's cell used to render a hardcoded
/// `assets/paywall/benefit-check.svg` for every benefit, ignoring the CMS's
/// `PaywallBenefitDisplay.icon` filename. This test locks the fix: two
/// benefits with different `icon` fields must produce two distinct asset
/// references in the rendered subtree.
void main() {
  testWidgets(
      '_IconGlyph resolves benefit.icon to per-benefit asset paths',
      (tester) async {
    final benefits = <PaywallBenefitDisplay>[
      PaywallBenefitDisplay(
        benefitId: 'b-mandir',
        localizedName: 'Daily Mandir',
        icon: 'benefit-mandir.png',
        sortOrder: 1,
      ),
      PaywallBenefitDisplay(
        benefitId: 'b-wallpaper',
        localizedName: 'Custom Wallpapers',
        icon: 'benefit-wallpaper.png',
        sortOrder: 2,
      ),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 360,
            height: 203,
            child: PaywallIconGridBenefitsCard(benefits: benefits),
          ),
        ),
      ),
    );
    await tester.pump();

    // Grab every Image in the card's subtree — each `_IconGlyph` for a PNG
    // icon renders `Image.asset(...)`, whose ImageProvider is an AssetImage
    // whose `assetName` is the exact path passed to `Image.asset`.
    final images = tester
        .widgetList<Image>(find.descendant(
          of: find.byKey(const Key('paywall-icon-grid-card')),
          matching: find.byType(Image),
        ))
        .toList();

    final assetNames = images
        .map((img) => img.image)
        .whereType<AssetImage>()
        .map((a) => a.assetName)
        .toSet();

    expect(
      assetNames.contains('assets/paywall/benefit-mandir.png'),
      isTrue,
      reason: 'expected the mandir cell to render `benefit-mandir.png` — '
          'got: $assetNames',
    );
    expect(
      assetNames.contains('assets/paywall/benefit-wallpaper.png'),
      isTrue,
      reason: 'expected the wallpaper cell to render `benefit-wallpaper.png` '
          '— got: $assetNames',
    );
    expect(
      assetNames.length,
      greaterThanOrEqualTo(2),
      reason: 'two distinct benefit icons must yield two distinct asset '
          'paths — this would fail if `_IconGlyph` ignored `icon` and '
          'painted the same check-mark for every cell (QA N1).',
    );
  });
}
