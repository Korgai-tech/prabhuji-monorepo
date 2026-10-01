import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../data/aarti_models.dart';

/// Top nav shared by all three Aarti screens (Figma "Basic Nav" 5186:10372):
/// Figma-exported back arrow + dynamic title. NO top-right trailing actions
/// (PRD §6.1, note 8 — present in the Figma JSON but not rendered).
class AartiTopNav extends StatelessWidget implements PreferredSizeWidget {
  const AartiTopNav({super.key, required this.title, this.onBack});

  final String title;
  final VoidCallback? onBack;

  @override
  Size get preferredSize => const Size.fromHeight(AppNav.height);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: SizedBox(
        height: AppNav.height,
        child: Row(
          children: [
            const SizedBox(width: AppSpacing.xSmall),
            InkResponse(
              key: const Key('aarti-nav-back'),
              radius: 24,
              onTap: onBack ?? () => Navigator.of(context).maybePop(),
              child: SizedBox(
                width: AppAarti.backArrowFrame,
                height: AppAarti.backArrowFrame,
                child: Center(
                  child: SvgPicture.asset(
                    'assets/aarti/back-arrow.svg',
                    width: AppAarti.backArrowGlyph,
                    height: AppAarti.backArrowGlyph,
                    colorFilter: const ColorFilter.mode(
                      AppColors.aartiBackArrow,
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.xSmall),
            Expanded(
              child: Text(
                title,
                key: const Key('aarti-nav-title'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.headingXs(color: AppColors.aartiSectionTitle),
              ),
            ),
            const SizedBox(width: AppSpacing.medium),
          ],
        ),
      ),
    );
  }
}

/// Section header row (Figma "1. Header Metadata Row"): title + optional
/// "Show all" link (§6.6/6.7). Show all is grey, calm — no lock/Pro chrome.
class AartiSectionHeader extends StatelessWidget {
  const AartiSectionHeader({
    super.key,
    required this.title,
    this.showAllKey,
    this.onShowAll,
  });

  final String title;
  final Key? showAllKey;
  final VoidCallback? onShowAll;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: AppAarti.sectionHeaderHeight,
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.headingXs(color: AppColors.aartiSectionTitle),
            ),
          ),
          if (onShowAll != null)
            GestureDetector(
              key: showAllKey,
              behavior: HitTestBehavior.opaque,
              onTap: onShowAll,
              child: Text(
                'Show all',
                style: AppText.labelMd(color: AppColors.aartiShowAll),
              ),
            ),
        ],
      ),
    );
  }
}

/// Horizontal audio card (Figma 412:2912) — 100px art (r=12) + title + subtitle.
/// Discovery card: NO lock badge / Pro label (§5, §10).
class AartiAudioCard extends StatelessWidget {
  const AartiAudioCard({super.key, required this.audio, required this.onTap});

  final AartiAudio audio;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('aarti-audio-card-${audio.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: AppAarti.hCardWidth,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            AppNetworkImage(
              url: audio.coverImageUrl,
              width: AppAarti.hCardArt,
              height: AppAarti.hCardArt,
              borderRadius: BorderRadius.circular(AppAarti.cardArtRadius),
            ),
            const SizedBox(height: AppAarti.hCardInnerGap),
            // The compact Figma card (100×127) fits one line — title only. The
            // singer subtitle appears on the taller 2-col listing card.
            Flexible(
              child: Text(
                audio.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.labelMd(color: AppColors.aartiCardTitle),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Browse-category card (Figma 412:3001) — orange rounded card, thumbnail +
/// white name. CMS-driven; tapping opens the filtered listing (§6.5).
class AartiCategoryTile extends StatelessWidget {
  const AartiCategoryTile({super.key, required this.category, required this.onTap});

  final AartiCategory category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('aarti-category-${category.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppAarti.categoryCardRadius),
        child: Container(
          height: AppAarti.categoryCardHeight,
          // Each category's colour + art come from the CMS `imageUrl` (the Figma
          // cards are individually-coloured tiles — a per-card colour is NOT a
          // contract field, so we drive the look from the image, never a single
          // invented colour). A warm brand tile backs it until the image loads.
          color: AppColors.aartiCategoryCardFill,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AppNetworkImage(url: category.imageUrl ?? ''),
              // Left→right scrim so the white title stays legible over the art.
              const DecoratedBox(
                decoration: BoxDecoration(gradient: AppGradient.categoryCardScrim),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.small),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    category.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style:
                        AppText.labelLg(color: AppColors.aartiCategoryCardLabel),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 2-column listing grid card (Figma 420:3103) — 159px square art (r=12) +
/// title + subtitle. Un-badged discovery card (§5, §10).
class AartiGridCard extends StatelessWidget {
  const AartiGridCard({super.key, required this.audio, required this.onTap});

  final AartiAudio audio;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('aarti-grid-card-${audio.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Square art takes the remaining cell height above the text (robust —
          // never overflows the fixed grid cell).
          Expanded(
            child: AspectRatio(
              aspectRatio: 1,
              child: AppNetworkImage(
                url: audio.coverImageUrl,
                borderRadius: BorderRadius.circular(AppAarti.cardArtRadius),
              ),
            ),
          ),
          const SizedBox(height: AppAarti.listCardInnerGap),
          Text(
            audio.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppText.labelMd(color: AppColors.aartiCardTitle),
          ),
          if ((audio.singerName ?? '').isNotEmpty)
            Text(
              audio.singerName!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.aartiCardSubtitle(),
            ),
        ],
      ),
    );
  }
}
