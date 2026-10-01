import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';

/// "ॐ VIP BENEFITS ॐ" heading — centred row of an orange Om glyph, the
/// letter-spaced title, and a second orange Om glyph.
///
/// Renders the bundled `assets/paywall/om.svg` and `assets/paywall/om-right.svg`
/// (both are `fill="black"` in source, so a `ColorFilter.mode(...srcIn)` is
/// applied to tint them the requested [omColor]). Replaces the previous
/// emoji-based render (`🕉  VIP BENEFITS  🕉`) which fell back to the OS'
/// glyph — on the debug emulator that painted as a purple square badge.
///
/// [textColor] parameterised so `icon_grid` (v3, brand orange text on peach)
/// and `carousel` (v4, black text on orange background) can share a single
/// widget without a fork. [omColor] defaults to brand orange so both variants
/// keep the Om glyphs visually consistent even when the label colour differs.
class PaywallVipBenefitsHeading extends StatelessWidget {
  const PaywallVipBenefitsHeading({
    super.key,
    required this.textColor,
    this.omColor = AppColors.black,
    this.glyphSize = 22,
  });

  final Color textColor;
  final Color omColor;
  final double glyphSize;

  @override
  Widget build(BuildContext context) {
    final tint = ColorFilter.mode(omColor, BlendMode.srcIn);
    // FittedBox wraps the whole heading so at large accessibility text
    // scales (textScale 2.0) the row scales DOWN to fit instead of
    // overflowing. Without this, the Om SVGs + spaced-out "VIP BENEFITS"
    // at 32pt won't fit inside 320dp and produces a RenderFlex overflow
    // (caught by `multi_size_smoke_test`).
    return Center(
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            SvgPicture.asset(
              'assets/paywall/om.svg',
              width: glyphSize,
              height: glyphSize,
              colorFilter: tint,
            ),
            const SizedBox(width: 10),
            Text(
              'VIP BENEFITS',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: textColor,
                // Figma node text style: letter-spacing 3.52. Distinct wide
                // tracking is what makes "VIP BENEFITS" read as the section
                // heading; anything tighter (we shipped 2) looks off.
                letterSpacing: 3.52,
                height: 18 / 16,
              ),
            ),
            const SizedBox(width: 10),
            SvgPicture.asset(
              'assets/paywall/om-right.svg',
              width: glyphSize,
              height: glyphSize,
              colorFilter: tint,
            ),
          ],
        ),
      ),
    );
  }
}
