import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme.dart';
import '../paywall_close.dart';

/// Top nav (44 tall). Figma node `493:3351` "Basic Nav" — a 20×20 close (X)
/// icon in a hit target + "Prabhuji VIP Membership" Inter Medium 16/24 in
/// Neutral/Black.
///
/// Extracted out of `paywall_screen.dart` (TAM-160) so every layout variant
/// mounts an identical top nav — a bug fix in one place lands in all four
/// variants at once.
class PaywallTopNav extends StatelessWidget {
  const PaywallTopNav({
    super.key,
    this.iconColor = AppColors.black,
    this.titleColor = AppColors.black,
    this.transparentBackground = false,
  });

  /// Tint of the close (X) glyph. Default black; `video_bleed` overrides to
  /// white so the icon reads on the darkened video overlay.
  final Color iconColor;

  /// Tint of the "Prabhuji VIP Membership" title.
  final Color titleColor;

  /// When true, the row has no fill (used by `video_bleed` where the nav
  /// stacks over the full-bleed video). Otherwise the default parent
  /// scaffold surface shows through — matches the original card_hero shape.
  final bool transparentBackground;

  @override
  Widget build(BuildContext context) {
    final row = SizedBox(
      height: 44,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xSmall),
        child: Row(
          children: <Widget>[
            InkWell(
              key: const Key('paywall-close-cta'),
              // The mode is inherited rather than a parameter, so all four
              // variant bodies mount this nav unchanged — see
              // [PaywallDismissScope].
              onTap: () => dismissPaywall(
                context,
                trigger: PaywallCloseTrigger.userClose,
                mode: PaywallDismissScope.of(context),
              ),
              borderRadius: BorderRadius.circular(AppRadius.button),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xSmall),
                child: SvgPicture.asset(
                  'assets/paywall/cross.svg',
                  width: 20,
                  height: 20,
                  colorFilter: ColorFilter.mode(
                    iconColor,
                    BlendMode.srcIn,
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            // Flexible so the title never causes a RenderFlex overflow at
            // narrow widths (360dp phones + tester's wider fallback font).
            // The Text still finds by key; wrapping in Flexible preserves
            // the byte-compat with the existing widget test.
            Flexible(
              child: Text(
                'Prabhuji VIP Membership',
                key: const Key('paywall-title'),
                style: AppText.labelLg(color: titleColor),
                overflow: TextOverflow.ellipsis,
                maxLines: 1,
              ),
            ),
          ],
        ),
      ),
    );
    if (transparentBackground) return row;
    return row;
  }
}
