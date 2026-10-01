import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/theme.dart';
import '../data/home_models.dart';

/// Shared Home chrome (TAM-62): the badge pill, the `Main Buttons` CTA, and the
/// engagement footer. Every colour/size below comes from `AppColors.home*` /
/// `AppHome` — there is not one literal here (STRICT gate).
///
/// All glyphs are Figma exports under `assets/home/` (provenance:
/// `tools/figma-assets.manifest.json`). No `Icons.*` — a design icon degrading
/// to a Material glyph is a hard reject (docs/FIDELITY-CROSSCHECK.md).

/// Trending/Suggested pill (nodes 285:3551–3554 / 285:3651–3654).
///
/// This is merchandising, NOT entitlement: the badge enum is closed to
/// `trending | suggested`, so this widget structurally cannot render a lock or
/// Pro label (#EXPORT_CRITICAL, PRD §5).
///
/// [label] is the server's CMS-owned `badgeLabel`, rendered VERBATIM. The client
/// used to derive the copy from the enum (`'TRENDING'`/`'SUGGESTED'` baked in);
/// it no longer knows any badge copy, and a badge with no authored label is not
/// rendered at all (`HomeFeedItemView.hasBadge`) rather than captioned by us.
///
/// The flame glyph stays a bundled Figma export — icons are the sanctioned
/// static exception.
class HomeBadgePill extends StatelessWidget {
  const HomeBadgePill({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: AppHome.badgeGap,
      children: [
        SvgPicture.asset(
          'assets/home/badge-flame.svg',
          width: AppHome.badgeGlyph,
          height: AppHome.badgeGlyph,
          colorFilter: const ColorFilter.mode(
            AppColors.homeBadgeGlyph,
            BlendMode.srcIn,
          ),
        ),
        Text(label, style: AppText.labelSm(color: AppColors.homeBadgeLabel)),
      ],
    );
  }
}

/// The shared `Main Buttons` CTA instance — the hero variant (node 285:3557,
/// 36 tall / 14-20 label) and the audio variant (node 285:3672, 28 tall / 12-16
/// label) are the same component at two sizes.
///
/// #EXPORT_CRITICAL — this button NEVER direct-applies a wallpaper/ringtone/
/// status. It only navigates (see `HomeDestinations.feedCta`); the owning module
/// runs its own confirmation + Pro gate on arrival (§12).
class HomeCtaButton extends StatelessWidget {
  const HomeCtaButton({
    super.key,
    required this.label,
    required this.onTap,
    this.compact = false,
  });

  final String label;
  final VoidCallback? onTap;

  /// `true` → the audio-card variant (node 285:3672).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.homeCtaFill,
      borderRadius: BorderRadius.circular(AppHome.ctaRadius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppHome.ctaRadius),
        child: Container(
          height: compact ? AppHome.ctaAudioHeight : AppHome.ctaHeight,
          padding: EdgeInsets.symmetric(
            horizontal:
                compact ? AppHome.ctaAudioPaddingH : AppHome.ctaPaddingH,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppHome.ctaRadius),
            border: Border.all(
              color: AppColors.homeCtaBorder,
              width: AppHome.ctaBorder,
            ),
          ),
          // `Center(widthFactor: 1)`, NOT `Container(alignment:)`: the latter
          // expands to fill whenever the parent hands down bounded constraints,
          // which stretched the hero CTA across the full 360 card (Figma has it
          // hug its label — 112×36 on node 285:3557, 98×28 on 285:3672).
          child: Center(
            widthFactor: 1,
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: compact
                  ? AppText.labelSm(color: AppColors.homeCtaLabel)
                  : AppText.labelMd(color: AppColors.homeCtaLabel),
            ),
          ),
        ),
      ),
    );
  }
}

/// Engagement footer (nodes 285:3558/3559): like · view · share, SPACE_BETWEEN.
///
/// The view slot is a COUNT, not a button — a view is earned by dwelling 2s on
/// the card (pattern §5), never by tapping. That is why only like/share take a
/// callback.
class HomeEngagementFooter extends StatelessWidget {
  const HomeEngagementFooter({
    super.key,
    required this.item,
    required this.onLike,
    required this.onShare,
  });

  final HomeFeedItemView item;
  final VoidCallback onLike;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppHome.actionsPaddingH,
        AppHome.actionsPaddingTop,
        AppHome.actionsPaddingH,
        AppHome.actionsPaddingBottom,
      ),
      child: Padding(
        padding: const EdgeInsets.only(
          left: AppHome.footerPaddingH,
          right: AppHome.footerPaddingH,
          top: AppHome.footerPaddingTop,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _FooterAction(
              key: Key('home-feed-like-${item.id}'),
              asset: 'assets/home/engagement-like.svg',
              width: AppHome.likeGlyphWidth,
              height: AppHome.likeGlyphHeight,
              // The frame ships no liked state; the tint follows every sibling
              // module's liked heart (AppColors.homeLikeActive).
              tint: item.likedByMe
                  ? AppColors.homeLikeActive
                  : AppColors.homeEngagementIcon,
              label: _compact(item.likeCount),
              onTap: onLike,
            ),
            _FooterAction(
              key: Key('home-feed-view-${item.id}'),
              asset: 'assets/home/engagement-view.svg',
              width: AppHome.viewGlyphWidth,
              height: AppHome.viewGlyphHeight,
              tint: AppColors.homeEngagementIcon,
              label: _compact(item.viewCount),
              onTap: null, // a view is dwelled, never tapped
            ),
            _FooterAction(
              key: Key('home-feed-share-${item.id}'),
              asset: 'assets/home/engagement-share.svg',
              width: AppHome.shareGlyphWidth,
              height: AppHome.shareGlyphHeight,
              tint: AppColors.homeEngagementIcon,
              // The design labels this slot "Share", not a count (node 285:3573).
              label: 'Share',
              onTap: onShare,
            ),
          ],
        ),
      ),
    );
  }

  /// Indian-numbering compaction, exactly as the design mocks it: "24K"
  /// (node 285:3564) and "1.4L" (node 285:3569) — lakh, not "100K".
  static String _compact(int n) {
    if (n < 0) return '0';
    if (n < 1000) return '$n';
    if (n < 100000) {
      final k = n / 1000;
      return '${_trim(k)}K';
    }
    if (n < 10000000) {
      final l = n / 100000;
      return '${_trim(l)}L';
    }
    return '${_trim(n / 10000000)}Cr';
  }

  /// 24.0 → "24"; 1.43 → "1.4" (one decimal, no trailing ".0").
  static String _trim(double v) {
    final one = v.toStringAsFixed(1);
    return one.endsWith('.0') ? one.substring(0, one.length - 2) : one;
  }
}

class _FooterAction extends StatelessWidget {
  const _FooterAction({
    super.key,
    required this.asset,
    required this.width,
    required this.height,
    required this.tint,
    required this.label,
    required this.onTap,
  });

  final String asset;
  final double width;
  final double height;
  final Color tint;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      spacing: AppHome.footerItemGap,
      children: [
        SvgPicture.asset(
          asset,
          width: width,
          height: height,
          colorFilter: ColorFilter.mode(tint, BlendMode.srcIn),
        ),
        Text(
          label,
          style: AppText.labelMd(color: AppColors.homeEngagementCount),
        ),
      ],
    );
    if (onTap == null) return content;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: content,
    );
  }
}
