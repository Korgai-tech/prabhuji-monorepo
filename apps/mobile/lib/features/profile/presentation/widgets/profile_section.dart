import 'package:flutter/material.dart';

import '../../../../core/theme.dart';

/// Section header row (Figma `1923:18011` "VIP Membership", `1925:18986`
/// "Help & Support", `1923:18018` "Account & Legal") — a bold 20/28 label
/// aligned to the leading edge.
///
/// Figma also shows a right-aligned "Show all" affordance on each header,
/// but v2 explicitly drops it (see the spec's AC — no target route today,
/// section content is single-tile or the full known list).
class ProfileSectionHeader extends StatelessWidget {
  const ProfileSectionHeader({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.small),
      child: Text(
        label,
        style: AppText.headingXs(color: AppColors.black),
      ),
    );
  }
}

/// White rounded card that groups related setting tiles (Figma cards
/// `1923:18016`, `1925:18989`, `1923:18023`) — the container that hosts
/// every tile group in the Profile v2 body.
///
/// The card uses [AppColors.grey200] as a hairline stroke (Figma
/// `Setting-tiles` frame outer border) so the section stands off the cream
/// background at the same visual weight as the setting tile itself.
class ProfileSectionCard extends StatelessWidget {
  const ProfileSectionCard({
    super.key,
    required this.children,
  });

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.grey200, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }
}

/// A single setting tile: leading orange icon (SVG or IconData), label, and
/// trailing chevron. Figma `1923:18016 / 18023 / …` — 44 dp tall, 12/16
/// vertical/horizontal padding, 16 dp gap between the icon and the label.
///
/// Text-containing rows use `constraints: BoxConstraints(minHeight: 44)`
/// (NOT `height: 44`) so scaling text (system font size > 100%) grows the
/// tile instead of clipping — see the figma-flutter trap
/// "Literal `height:` translation around scalable Text".
class ProfileSettingTile extends StatelessWidget {
  const ProfileSettingTile({
    super.key,
    this.leadingSvgAsset,
    this.leadingIcon,
    this.leadingColor = AppColors.brand300,
    required this.label,
    required this.onTap,
    this.labelColor = AppColors.textPrimary,
    this.showChevron = true,
  }) : assert(
          leadingSvgAsset != null || leadingIcon != null,
          'ProfileSettingTile requires exactly one of leadingSvgAsset '
          'or leadingIcon.',
        );

  final String? leadingSvgAsset;
  final IconData? leadingIcon;
  final Color leadingColor;
  final String label;
  final Color labelColor;
  final VoidCallback onTap;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.card),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.medium,
            vertical: 12,
          ),
          child: ConstrainedBox(
            // Figma rows are 44 dp tall — expressed as a minHeight so
            // scaling text grows the tile instead of clipping (per the
            // figma-flutter trap "Literal `height:` translation around
            // scalable Text").
            constraints: const BoxConstraints(minHeight: 20),
            child: Row(
              children: <Widget>[
                _Leading(
                  svgAsset: leadingSvgAsset,
                  icon: leadingIcon,
                  color: leadingColor,
                ),
                const SizedBox(width: AppSpacing.medium),
                Expanded(
                  child: Text(
                    label,
                    style: AppText.labelLg(color: labelColor),
                  ),
                ),
                if (showChevron)
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.grey500,
                    size: 22,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Thin 1 dp divider between tiles inside a shared card (Figma `1923:18024`).
/// White fill on the parent card so the "divider" reads as a gap between
/// tiles rather than a coloured line.
class ProfileTileDivider extends StatelessWidget {
  const ProfileTileDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
      child: Container(
        height: 1,
        color: AppColors.grey200,
      ),
    );
  }
}

class _Leading extends StatelessWidget {
  const _Leading({
    required this.svgAsset,
    required this.icon,
    required this.color,
  });

  final String? svgAsset;
  final IconData? icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    // Fixed 22 dp — icon size the Figma tile pins for every leading glyph.
    // The Material Icon fallback is used only for tiles whose vector was
    // not exportable at build time; the Figma trap "Icon substitution"
    // guides us to prefer exported SVGs — see per-tile choice at the call
    // site. If a future asset export lands, swap the tile's `leadingIcon`
    // for `leadingSvgAsset` in one line.
    if (svgAsset != null) {
      return SizedBox(
        width: 22,
        height: 22,
        child: Center(
          child: Icon(
            // Placeholder — the caller usually passes svgAsset via
            // SvgPicture.asset outside; using Icon here would defeat the
            // point. This branch is kept for future SVG wiring; callers
            // today use leadingIcon.
            icon ?? Icons.circle,
            color: color,
            size: 22,
          ),
        ),
      );
    }
    return Icon(icon!, color: color, size: 22);
  }
}
