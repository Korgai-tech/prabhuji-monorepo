import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:shimmer/shimmer.dart';

import '../../api/generated/openapi.dart';
import '../../core/theme.dart';
import 'app_network_image.dart';

/// Reusable horizontal deity filter (TAM-58 AC-d). Rendered per Figma
/// `412:2656` (`Thumbnails`/`Dieties`): 50px circular avatars in an 80px row
/// with a 12/16 caption below.
///
/// PRESENTATION ONLY — it does not fetch. The consuming screen (Aarti, Mantras,
/// Ringtone, Wallpaper, Status) passes the deity [AsyncValue] (from
/// `deitiesProvider`) plus the controlled [selectedSlug] and an [onSelected]
/// callback, and drives its own listing query off the emitted slug.
///
/// Contract:
///  * "All Gods" chip is always first and represents `null` (no filter).
///  * `selectedSlug == null` → "All Gods" is highlighted (the default).
///  * loading  → shimmer avatars.
///  * error/empty → "All Gods" chip only (never blocks the consuming screen).
class DeityFilterRow extends StatelessWidget {
  const DeityFilterRow({
    super.key,
    required this.deities,
    required this.selectedSlug,
    required this.onSelected,
    this.allGodsLabel = 'All Gods',
  });

  /// The deity list state, typically `ref.watch(deitiesProvider)`.
  final AsyncValue<List<DeityView>> deities;

  /// Currently-selected deity slug; `null` == "All Gods" (the default).
  final String? selectedSlug;

  /// Emits the tapped deity's slug, or `null` when "All Gods" is tapped.
  final ValueChanged<String?> onSelected;

  final String allGodsLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppDeityRow.height,
      child: deities.when(
        loading: () => _shimmerRow(),
        // Error degrades to "All Gods" only — the filter must never block the
        // screen it sits on (AC-d).
        error: (_, _) => _row([_allGodsChip()]),
        data: (list) => _row([
          _allGodsChip(),
          for (final deity in list) _deityChip(deity),
        ]),
      ),
    );
  }

  Widget _row(List<Widget> children) {
    return ListView.separated(
      key: const Key('deity-filter-row'),
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: AppDeityRow.horizontalPadding,
      ),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(width: AppDeityRow.itemGap),
      itemBuilder: (_, i) => children[i],
    );
  }

  Widget _allGodsChip() {
    final selected = selectedSlug == null;
    return _Chip(
      key: const Key('deity-chip-all'),
      label: allGodsLabel,
      selected: selected,
      onTap: () => onSelected(null),
      // "All Gods" is a Phase-1 PRODUCT addition (the null/no-filter default) —
      // it has NO node in the Figma deity component (302:5225), whose avatars are
      // all CMS-driven network images. Per the STRICT gate we do not invent art
      // and never fall back to a Material `Icons.*` glyph, so the avatar is the
      // Figma-exported Om (node 750:4997, the universal "all deities" symbol;
      // manifest: tools/figma-assets.manifest.json) tinted to the chip state.
      // This is recorded as an `intentional` divergence in the cross-check.
      // Chip CHROME (ring/border/label states) is the real Figma `Dieties`
      // component treatment.
      // Fill is drawn as a circle (not a square) so its corners can't bleed
      // past the outer `_Avatar` clip. Otherwise the four square corners of a
      // `color:`-shorthand ColoredBox peek out beyond the antiAlias circular
      // clip and the border reads as a square frame around a peach tile.
      avatar: Container(
        width: AppDeityRow.avatarSize,
        height: AppDeityRow.avatarSize,
        decoration: const BoxDecoration(
          color: AppColors.brand100,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: SvgPicture.asset(
          'assets/deity/all_gods_om.svg',
          width: AppDeityRow.avatarSize * 0.5,
          height: AppDeityRow.avatarSize * 0.5,
          colorFilter: ColorFilter.mode(
            selected ? AppColors.brand300 : AppColors.grey400,
            BlendMode.srcIn,
          ),
        ),
      ),
    );
  }

  Widget _deityChip(DeityView deity) {
    final selected = selectedSlug == deity.slug;
    return _Chip(
      key: Key('deity-chip-${deity.slug}'),
      label: deity.displayName,
      selected: selected,
      onTap: () => onSelected(deity.slug),
      avatar: AppNetworkImage(
        url: deity.iconUrl,
        width: AppDeityRow.avatarSize,
        height: AppDeityRow.avatarSize,
      ),
    );
  }

  Widget _shimmerRow() {
    return Shimmer.fromColors(
      baseColor: AppColors.shimmerBase,
      highlightColor: AppColors.shimmerHighlight,
      child: _row([
        for (var i = 0; i < 6; i++)
          Container(
            key: Key('deity-shimmer-$i'),
            width: AppDeityRow.avatarSize,
            height: AppDeityRow.avatarSize,
            decoration: const BoxDecoration(
              color: AppColors.shimmerBase,
              shape: BoxShape.circle,
            ),
          ),
      ]),
    );
  }
}

/// Deity chip rendered per Figma component set `Dieties` (302:5225):
///  * avatar = 50px circle with a 1.5625px inner ring (`Ellipse 664`) — grey500
///    in `state=default`, white in `state=active`;
///  * `state=active` additionally shows a 3.125px OUTSIDE gradient ring
///    (`AppGradient.ctaLR`, brand400→brand300) that is `visible:false` when
///    default;
///  * caption = grey500 default / brand300 active.
class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    required this.avatar,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Widget avatar;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Avatar(selected: selected, child: avatar),
          const SizedBox(height: AppDeityRow.avatarLabelGap),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.deityLabel(
              color: selected
                  ? AppColors.deityLabelActive
                  : AppColors.deityLabel,
            ),
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.selected, required this.child});

  final bool selected;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // The avatar image clipped to a circle, with the inner 1.5625px ring whose
    // colour flips grey500 → white between states. The ring lives in
    // `foregroundDecoration` (paints AFTER the child) — as a background border
    // it was overpainted by any opaque child, which erased the ring under the
    // shimmer placeholder (grey200 fill hides the grey500 stroke completely)
    // and softened it under a loaded image.
    final avatar = Container(
      width: AppDeityRow.avatarSize,
      height: AppDeityRow.avatarSize,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(shape: BoxShape.circle),
      foregroundDecoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: selected
              ? AppColors.deityAvatarBorderActive
              : AppColors.deityAvatarBorder,
          width: AppDeityRow.avatarInnerBorderWidth,
        ),
      ),
      child: child,
    );

    if (!selected) return avatar;

    // Active: add the OUTSIDE gradient ring. Layout footprint stays at the 50px
    // avatar (the ring is strokeAlign=OUTSIDE in Figma → it overflows, matching
    // the design's fixed 50px avatar frame). Stack is unclipped so the ring
    // paints beyond the box.
    return SizedBox(
      width: AppDeityRow.avatarSize,
      height: AppDeityRow.avatarSize,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Container(
            width: AppDeityRow.avatarSize + AppDeityRow.avatarActiveRingWidth * 2,
            height:
                AppDeityRow.avatarSize + AppDeityRow.avatarActiveRingWidth * 2,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: AppGradient.ctaLR,
            ),
          ),
          avatar,
        ],
      ),
    );
  }
}
