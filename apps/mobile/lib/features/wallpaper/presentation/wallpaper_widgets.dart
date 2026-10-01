import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../../../shared/widgets/app_network_image.dart';
import '../data/wallpaper_models.dart';

/// Back arrow + "Wallpapers"/dynamic title (Figma Basic Nav 704:5786). The
/// inherited trailing gear/phone/pencil actions are NOT rendered (another
/// screen's chrome — recorded as intentional in the cross-check).
class WallpaperTopBar extends StatelessWidget {
  const WallpaperTopBar({super.key, required this.title, this.onBack});

  final String title;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: SizedBox(
        height: AppWallpaper.navHeight,
        child: Row(
          children: [
            const SizedBox(width: AppSpacing.xSmall),
            InkResponse(
              key: const Key('wallpaper-nav-back'),
              radius: 24,
              onTap: onBack ?? () => Navigator.of(context).maybePop(),
              child: SizedBox(
                width: AppWallpaper.backArrowFrame,
                height: AppWallpaper.backArrowFrame,
                child: Center(
                  child: SvgPicture.asset(
                    'assets/wallpaper/back.svg',
                    width: AppWallpaper.backArrowGlyph,
                    height: AppWallpaper.backArrowGlyph,
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
              child: Text(
                title,
                key: const Key('wallpaper-nav-title'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.headingXs(color: AppColors.wallpaperNavTitle),
              ),
            ),
            const SizedBox(width: AppSpacing.medium),
          ],
        ),
      ),
    );
  }
}

/// The translucent "LIVE" badge on live/video cards (Figma 712:6808) — a frosted
/// white pill (white @10%) with the Figma broadcast glyph + "LIVE" text, both
/// white. Not separately tappable (the whole card is one tap target).
class WallpaperLiveBadge extends StatelessWidget {
  const WallpaperLiveBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('wallpaper-live-badge'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppWallpaper.liveBadgePaddingH,
        vertical: AppWallpaper.liveBadgePaddingV,
      ),
      decoration: BoxDecoration(
        color: AppColors.wallpaperLiveBadgeFill,
        borderRadius: BorderRadius.circular(AppWallpaper.liveBadgeRadius),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SvgPicture.asset(
            'assets/wallpaper/live_glyph.svg',
            width: AppWallpaper.liveBadgeGlyph,
            height: AppWallpaper.liveBadgeGlyph,
            colorFilter: const ColorFilter.mode(
              AppColors.wallpaperLiveBadgeText,
              BlendMode.srcIn,
            ),
          ),
          const SizedBox(width: AppWallpaper.liveBadgeGap),
          Text(
            'LIVE',
            style: AppText.labelSm(color: AppColors.wallpaperLiveBadgeText)
                .copyWith(fontSize: 8, height: 13.85 / 8),
          ),
        ],
      ),
    );
  }
}

/// A vertical-ratio home-row card (Figma 707:6173, 111×198, r=8). Image only —
/// the home cards carry NO LIVE badge in Figma (the badge lives on the listing
/// grid cards). No lock/Pro badge — discovery is free.
class WallpaperRowCard extends StatelessWidget {
  const WallpaperRowCard({
    super.key,
    required this.item,
    required this.onTap,
    this.width = AppWallpaper.homeCardWidth,
    this.height = AppWallpaper.homeCardHeight,
  });

  final WallpaperCardItem item;
  final VoidCallback onTap;
  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('wallpaper-card-${item.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: SizedBox(
        width: width,
        height: height,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppWallpaper.homeCardRadius),
          child: AppNetworkImage(url: item.thumbnailUrl),
        ),
      ),
    );
  }
}

/// A 2-column listing grid card (Figma 707:6452, 159×284, r=8). Image + a
/// top-RIGHT LIVE badge on live cards (Figma 712:6808).
class WallpaperGridCard extends StatelessWidget {
  const WallpaperGridCard({super.key, required this.item, required this.onTap});

  final WallpaperCardItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: Key('wallpaper-grid-card-${item.id}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppWallpaper.listCardRadius),
        child: Stack(
          fit: StackFit.expand,
          children: [
            AppNetworkImage(url: item.thumbnailUrl),
            if (item.isLive)
              const Positioned(
                top: AppWallpaper.liveBadgeInset,
                right: AppWallpaper.liveBadgeInset,
                child: WallpaperLiveBadge(),
              ),
          ],
        ),
      ),
    );
  }
}

/// A CMS row header (Figma 707:6138) — an optional leading icon + title +
/// Bundled Figma art per row `iconKey` — the sanctioned static exception (a key
/// resolves to bytes we ship; it is never an image URL).
///
/// The API serves an `iconKey` on all five rows (`live|trending|new|festival|
/// heart`), but the DESIGN only draws a glyph on Top Live: the per-row
/// `fi_1687795` icon is `visible: true` on 707:6140 and `visible: false` for
/// New/Trending/Liked, and `live` is the SAME glyph as the LIVE badge's broadcast
/// mark. So `live` is the only key with exported art, and the other four resolve
/// to `null` ⇒ no icon — exactly the rendering the design specifies, now DRIVEN
/// BY THE SERVER's key instead of by a hardcoded `rowType == 'top_live'` test.
///
/// No invented art: a key with no bundled export (including one this build has
/// never heard of) draws nothing rather than a Material stand-in.
const Map<String, String> _kRowIconArt = <String, String>{
  'live': 'assets/wallpaper/live_glyph.svg',
};

/// "Show all". The leading glyph is resolved from the row's server [iconKey]
/// through [_kRowIconArt]; an unknown/unshipped key renders no icon.
class WallpaperRowHeader extends StatelessWidget {
  const WallpaperRowHeader({
    super.key,
    required this.rowId,
    required this.title,
    required this.onShowAll,
    this.iconKey,
  });

  final String rowId;
  final String title;
  final VoidCallback onShowAll;

  /// The server's stable icon key. `null`/unknown ⇒ no leading glyph.
  final String? iconKey;

  String? get _iconAsset => _kRowIconArt[iconKey?.trim().toLowerCase()];

  @override
  Widget build(BuildContext context) {
    final asset = _iconAsset;
    return SizedBox(
      height: AppWallpaper.rowHeaderHeight,
      child: Row(
        children: [
          if (asset != null) ...[
            SvgPicture.asset(
              asset,
              key: Key('wallpaper-row-icon-$rowId'),
              width: AppWallpaper.rowHeaderIcon,
              height: AppWallpaper.rowHeaderIcon,
              colorFilter: const ColorFilter.mode(
                AppColors.wallpaperRowTitle,
                BlendMode.srcIn,
              ),
            ),
            const SizedBox(width: AppSpacing.xSmall),
          ],
          Expanded(
            child: Text(
              title,
              key: Key('wallpaper-row-title-$rowId'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppText.headingXs(color: AppColors.wallpaperRowTitle),
            ),
          ),
          GestureDetector(
            key: Key('wallpaper-row-showall-$rowId'),
            behavior: HitTestBehavior.opaque,
            onTap: onShowAll,
            child: Text(
              'Show all',
              style: AppText.labelMd(color: AppColors.wallpaperShowAll),
            ),
          ),
        ],
      ),
    );
  }
}

/// Calm centered state (empty listing / total CMS failure). [onRetry] adds a
/// Retry affordance.
class WallpaperMessageState extends StatelessWidget {
  const WallpaperMessageState({
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
        padding: const EdgeInsets.all(AppWallpaper.screenPadding),
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
