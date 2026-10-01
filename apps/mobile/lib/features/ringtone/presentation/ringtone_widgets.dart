import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../data/ringtone_models.dart';

/// Back arrow + search field row shared by Home + Search Results (Figma nav
/// 683:4816 + search field 670:4608). The **mic icon is intentionally NOT
/// rendered** — Phase 1 has no voice search and requests no mic permission
/// (spec q3 / figma-links note). The Figma "Openly/Chats/coins" chrome above the
/// header is inherited from another screen and is NOT part of this module.
class RingtoneTopBar extends StatelessWidget {
  const RingtoneTopBar({
    super.key,
    required this.controller,
    required this.onSubmitted,
    this.onBack,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final ValueChanged<String> onSubmitted;
  final VoidCallback? onBack;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xSmall,
          vertical: AppSpacing.xSmall,
        ),
        child: Row(
          children: [
            InkResponse(
              key: const Key('ringtone-nav-back'),
              radius: 24,
              onTap: onBack ?? () => Navigator.of(context).maybePop(),
              child: SizedBox(
                width: AppRingtone.backArrowFrame,
                height: AppRingtone.backArrowFrame,
                child: Center(
                  child: SvgPicture.asset(
                    'assets/ringtone/back.svg',
                    width: AppRingtone.backArrowGlyph,
                    height: AppRingtone.backArrowGlyph,
                    colorFilter: const ColorFilter.mode(
                      AppColors.black,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            Expanded(
              child: _SearchField(
                controller: controller,
                onSubmitted: onSubmitted,
                autofocus: autofocus,
              ),
            ),
            const SizedBox(width: AppSpacing.xSmall),
          ],
        ),
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.onSubmitted,
    required this.autofocus,
  });

  final TextEditingController controller;
  final ValueChanged<String> onSubmitted;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('ringtone-search-field'),
      height: AppRingtone.searchHeight,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.medium),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(AppRingtone.searchRadius),
        border: Border.all(
          color: AppColors.ringtoneSearchBorder,
          width: AppRingtone.searchBorder,
        ),
      ),
      child: Row(
        children: [
          SvgPicture.asset(
            'assets/ringtone/search.svg',
            width: AppRingtone.searchIcon,
            height: AppRingtone.searchIcon,
            colorFilter: const ColorFilter.mode(
              AppColors.ringtoneSearchHint,
              BlendMode.srcIn,
            ),
          ),
          const SizedBox(width: AppRingtone.searchInnerGap),
          Expanded(
            child: TextField(
              controller: controller,
              autofocus: autofocus,
              textInputAction: TextInputAction.search,
              onSubmitted: onSubmitted,
              style: AppText.bodyMd(color: AppColors.ringtoneSearchText),
              cursorColor: AppColors.brand300,
              decoration: InputDecoration(
                isCollapsed: true,
                border: InputBorder.none,
                hintText: 'Search Ringtones',
                hintStyle: AppText.bodyMd(color: AppColors.ringtoneSearchHint),
              ),
            ),
          ),
          // Mic icon deliberately omitted (Phase 1, no voice search).
        ],
      ),
    );
  }
}

/// A single 3-column grid card (Figma 676:4711). Thumbnail with a centre play
/// overlay, title, and the play-count + set-count row. Orange border, r=8, WHOLE
/// card tappable (not just the play glyph). No lock/Pro badge — discovery is
/// free; the tap runs through the PaywallGate.
class RingtoneCard extends StatelessWidget {
  const RingtoneCard({super.key, required this.item, required this.onTap});

  final RingtoneCardItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('ringtone-card-${item.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRingtone.cardRadius),
          border: Border.all(
            color: AppColors.ringtoneCardBorder,
            width: AppRingtone.cardBorder,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Thumbnail(url: item.thumbnailImageUrl),
            // Fill the remaining tile height so the counts row can center
            // vertically in the space that's left. Otherwise the inner
            // Column packed to `min` height and the entire slack sat below
            // the counts row — giving unequal white space above vs. below.
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppRingtone.cardInnerPadding,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: AppRingtone.cardTitleGap),
                    // Reserve two lines of space so single-line and two-line
                    // titles occupy the same vertical footprint — the counts
                    // row below then anchors identically across every card in
                    // the grid ("Gayatri Mantra" vs. "Saraswati Vandana").
                    SizedBox(
                      height: AppRingtone.cardTitleReservedHeight,
                      child: Align(
                        alignment: Alignment.topCenter,
                        child: Text(
                          item.title,
                          key: Key('ringtone-card-title-${item.id}'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: AppText.labelMd(
                            color: AppColors.ringtoneCardTitle,
                          ),
                        ),
                      ),
                    ),
                    // Remaining slack goes here — Center gives the counts row
                    // equal white space above AND below.
                    Expanded(
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.center,
                          child: _CountsRow(
                            playCount: item.playCount,
                            setCount: item.setCount,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(AppRingtone.cardRadius),
      ),
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          fit: StackFit.expand,
          children: [
            AppNetworkImage(url: url),
            const Center(child: _PlayOverlay()),
          ],
        ),
      ),
    );
  }
}

/// Centre play overlay (Figma group 676:4763 — 52px ellipse + play glyph). The
/// ellipse fill is toggled off in the Figma instance, so a subtle scrim circle
/// backs the exported cream play glyph for legibility on any thumbnail (§DP;
/// recorded in TOKENS.md — no invented art, the glyph is the Figma export).
class _PlayOverlay extends StatelessWidget {
  const _PlayOverlay();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('ringtone-card-play-overlay'),
      width: AppRingtone.cardPlayOverlay,
      height: AppRingtone.cardPlayOverlay,
      decoration: const BoxDecoration(
        color: AppColors.ringtonePlayOverlayScrim,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: SvgPicture.asset(
          'assets/ringtone/play.svg',
          width: AppRingtone.cardPlayGlyph,
          height: AppRingtone.cardPlayGlyph,
          colorFilter: const ColorFilter.mode(
            AppColors.ringtonePlayOverlayGlyph,
            BlendMode.srcIn,
          ),
        ),
      ),
    );
  }
}

/// Play-count (headphones) | divider | set-count (ringtone) row (Figma
/// 676:4698). Counts in Indian compact format (`k`/`L`).
class _CountsRow extends StatelessWidget {
  const _CountsRow({required this.playCount, required this.setCount});
  final int playCount;
  final int setCount;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CountChip(
          asset: 'assets/ringtone/headphones.svg',
          tint: AppColors.ringtonePlayCountIcon,
          value: playCount,
        ),
        Container(
          width: AppRingtone.cardCountDividerWidth,
          height: AppRingtone.cardCountDividerHeight,
          margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xSmall),
          color: AppColors.ringtoneCountDivider,
        ),
        _CountChip(
          asset: 'assets/ringtone/ringtone.svg',
          tint: AppColors.ringtoneSetCountIcon,
          value: setCount,
        ),
      ],
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({
    required this.asset,
    required this.tint,
    required this.value,
  });

  final String asset;
  final Color tint;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SvgPicture.asset(
          asset,
          width: AppRingtone.cardCountIcon,
          height: AppRingtone.cardCountIcon,
          colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
        ),
        const SizedBox(width: AppRingtone.cardCountGap),
        Text(
          formatIndianCompactCount(value),
          style: AppText.labelSm(color: AppColors.ringtoneCountText),
        ),
      ],
    );
  }
}

/// The 3-column ringtone grid shared by Home + Search Results. Presentation
/// only — the caller supplies the items + the per-card tap. Keyed
/// `ringtone-grid` for the render-tree cross-check.
class RingtoneGrid extends StatelessWidget {
  const RingtoneGrid({
    super.key,
    required this.items,
    required this.onCardTap,
    this.controller,
    this.padding,
  });

  final List<RingtoneCardItem> items;
  final void Function(RingtoneCardItem item, int index) onCardTap;
  final ScrollController? controller;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      key: const Key('ringtone-grid'),
      controller: controller,
      padding: padding ??
          const EdgeInsets.symmetric(
            horizontal: AppRingtone.screenPadding,
            vertical: AppRingtone.screenPadding,
          ),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: AppRingtone.gridColumns,
        mainAxisSpacing: AppRingtone.gridGap,
        crossAxisSpacing: AppRingtone.gridGap,
        // 103×179 card → ~0.575 aspect ratio.
        childAspectRatio: AppRingtone.cardWidth / 179,
      ),
      itemCount: items.length,
      itemBuilder: (context, i) => RingtoneCard(
        item: items[i],
        onTap: () => onCardTap(items[i], i),
      ),
    );
  }
}

/// Calm centered state (empty grid / no search results / CMS error) shared by
/// Home + Search. [retryKey]/[onRetry] add a Retry affordance for the error case.
class RingtoneMessageState extends StatelessWidget {
  const RingtoneMessageState({
    super.key,
    required this.stateKey,
    required this.message,
    this.onRetry,
    this.retryKey,
  });

  final Key stateKey;
  final String message;
  final VoidCallback? onRetry;
  final Key? retryKey;

  @override
  Widget build(BuildContext context) {
    return Center(
      key: stateKey,
      child: Padding(
        padding: const EdgeInsets.all(AppRingtone.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppText.bodyMd(color: AppColors.textSecondary),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: AppSpacing.medium),
              TextButton(
                key: retryKey,
                onPressed: onRetry,
                child: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
