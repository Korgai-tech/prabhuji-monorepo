import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../data/mantras_models.dart';

/// Top nav shared by all three Mantras screens (Figma "Basic Nav"): the
/// Figma-exported back arrow + dynamic title. NO top-right trailing actions
/// (present in the Figma JSON but not rendered for this module).
class MantrasTopNav extends StatelessWidget implements PreferredSizeWidget {
  const MantrasTopNav({super.key, required this.title, this.onBack});

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
              key: const Key('mantras-nav-back'),
              radius: 24,
              onTap: onBack ?? () => Navigator.of(context).maybePop(),
              child: SizedBox(
                width: AppMantras.backArrowFrame,
                height: AppMantras.backArrowFrame,
                child: Center(
                  child: SvgPicture.asset(
                    'assets/mantras/back-arrow.svg',
                    width: AppMantras.backArrowGlyph,
                    height: AppMantras.backArrowGlyph,
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
                key: const Key('mantras-nav-title'),
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

/// Section header row: title + optional "Show all" link. Show all is grey, calm
/// — no lock/Pro chrome (discovery is free, §5/§10).
class MantrasSectionHeader extends StatelessWidget {
  const MantrasSectionHeader({
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
      height: AppMantras.sectionHeaderHeight,
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

/// Horizontal audio card (Figma 425:4951) — 100px art (r=12) + title + singer.
/// Discovery card: NO lock badge / Pro label (§5, §10).
class MantrasAudioCard extends StatelessWidget {
  const MantrasAudioCard({super.key, required this.audio, required this.onTap});

  final MantraAudio audio;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('mantras-audio-card-${audio.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: AppMantras.hCardWidth,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            AppNetworkImage(
              url: audio.artworkUrl,
              width: AppMantras.hCardArt,
              height: AppMantras.hCardArt,
              borderRadius: BorderRadius.circular(AppMantras.cardArtRadius),
            ),
            const SizedBox(height: AppMantras.hCardInnerGap),
            Flexible(
              child: Text(
                audio.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.labelMd(color: AppColors.aartiCardTitle),
              ),
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
      ),
    );
  }
}

/// Browse-category card (Figma 425:4995) — CMS artwork tile + white name.
/// Tapping runs through the broad Pro gate (§5).
class MantrasCategoryTile extends StatelessWidget {
  const MantrasCategoryTile({super.key, required this.category, required this.onTap});

  final MantraCategory category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('mantras-category-${category.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppMantras.categoryCardRadius),
        child: Container(
          height: AppMantras.categoryCardHeight,
          color: AppColors.aartiCategoryCardFill,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AppNetworkImage(url: category.imageUrl ?? ''),
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

/// 2-column Show-all grid card (Figma 1066:3358) — square art (r=12) + title +
/// singer. Un-badged discovery card (§5, §10).
class MantrasGridCard extends StatelessWidget {
  const MantrasGridCard({super.key, required this.audio, required this.onTap});

  final MantraAudio audio;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('mantras-grid-card-${audio.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: AspectRatio(
              aspectRatio: 1,
              child: AppNetworkImage(
                url: audio.artworkUrl,
                borderRadius: BorderRadius.circular(AppMantras.cardArtRadius),
              ),
            ),
          ),
          const SizedBox(height: AppMantras.listCardInnerGap),
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
