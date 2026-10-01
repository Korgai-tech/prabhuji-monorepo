import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../core/theme.dart';

/// The ONE network-image entry point for every content surface (TAM-58 AC-b).
///
/// Wraps [CachedNetworkImage] with:
///  * a [Shimmer] placeholder while loading, and
///  * a calm, branded fallback on error or empty URL — **never** the default
///    broken-image glyph (PRD rule; flutter-feed-screen.md decision 2
///    "drop-item, never a broken-image placeholder").
///
/// Module screens must not call `Image.network` directly for content imagery —
/// route it through here so caching + the no-broken-placeholder rule stay
/// uniform.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
    this.borderRadius,
    this.fallback,
    this.memCacheWidth,
    this.memCacheHeight,
  });

  /// Content image URL. An empty/blank URL short-circuits straight to the
  /// branded [fallback] (the deterministic media-failure path in tests).
  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;

  /// How to align the image within its box. Only meaningful for [fit] values
  /// that can leave slack in one axis (e.g. `BoxFit.fitWidth` / `.contain`
  /// / `.scaleDown`) or overflow it (e.g. `BoxFit.fitWidth` when the image
  /// is taller than the box); [BoxFit.cover] fills both axes and ignores
  /// alignment. Defaults to [Alignment.center].
  final Alignment alignment;

  /// Optional rounding applied uniformly to the image, shimmer, and fallback.
  final BorderRadius? borderRadius;

  /// Optional custom fallback; defaults to [_BrandedFallback].
  final Widget? fallback;

  /// Bound the DECODED bitmap to this pixel width. `cached_network_image`
  /// still downloads the full asset (disk cache stays byte-identical), but
  /// decodes it to at most this size — dropping RAM use and speeding up the
  /// decode itself when the source is a large CMS JPEG rendered into a small
  /// slot (e.g. the paywall coverflow's 120×240 dp tiles).
  ///
  /// Units are RAW pixels, not logical dp — multiply the layout box by the
  /// device pixel ratio before passing (or pick a comfortable ceiling for
  /// 3× DPR devices, e.g. `120 * 3 = 360`).
  final int? memCacheWidth;

  /// Bound the DECODED bitmap to this pixel height. See [memCacheWidth].
  final int? memCacheHeight;

  @override
  Widget build(BuildContext context) {
    final Widget child = url.trim().isEmpty
        ? _fallback()
        : CachedNetworkImage(
            imageUrl: url,
            width: width,
            height: height,
            fit: fit,
            alignment: alignment,
            memCacheWidth: memCacheWidth,
            memCacheHeight: memCacheHeight,
            placeholder: (context, _) => _shimmer(),
            errorWidget: (context, _, _) => _fallback(),
          );

    if (borderRadius == null) return child;
    return ClipRRect(borderRadius: borderRadius!, child: child);
  }

  Widget _shimmer() => Shimmer.fromColors(
        baseColor: AppColors.shimmerBase,
        highlightColor: AppColors.shimmerHighlight,
        child: Container(
          width: width,
          height: height,
          color: AppColors.shimmerBase,
        ),
      );

  Widget _fallback() =>
      fallback ??
      _BrandedFallback(width: width, height: height);
}

/// Calm branded placeholder shown instead of a broken-image glyph. A soft warm
/// tile with a low-emphasis lotus mark — reads as intentional empty state, not
/// an error.
class _BrandedFallback extends StatelessWidget {
  const _BrandedFallback({this.width, this.height});

  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('app-network-image-fallback'),
      width: width,
      height: height,
      color: AppColors.brand100,
      alignment: Alignment.center,
      child: Icon(
        Icons.spa_outlined,
        color: AppColors.brand300,
        size: _glyphSize,
      ),
    );
  }

  double get _glyphSize {
    final bound = [width, height].whereType<double>();
    if (bound.isEmpty) return 24;
    final smallest = bound.reduce((a, b) => a < b ? a : b);
    return (smallest * 0.4).clamp(16, 48);
  }
}
