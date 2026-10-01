import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:media_kit_video/media_kit_video.dart';

import '../../../../core/theme.dart';
import '../../bloc/paywall_bloc.dart';
import '../../bloc/paywall_event.dart';
import 'paywall_video_controller.dart';

/// Hero video widget shared across all layout variants that render a video
/// (`card_hero`, `video_bleed`, `icon_grid`). Not mounted by `carousel`.
///
/// Extracted out of `paywall_screen.dart`'s `_HeaderVideo` (TAM-160) so the
/// three video-mounting variants share ONE display widget — the
/// [PaywallVideoController] lifecycle + watch-time accumulator + failure
/// reporting still live in `_PaywallScreenState` above; this widget only
/// paints the frame with the given `BoxFit`, optional rounded corners, and
/// an optional overlay stack.
///
/// The underlying player is `media_kit` (libmpv + FFmpeg, software decode) —
/// the paywall swapped off `video_player` for the same reason status did
/// (broken Xiaomi/MIUI hardware decoders on CMS-uploaded H.264 High / HEVC).
///
/// `BoxFit` param:
///  * `card_hero` + `icon_grid` → `BoxFit.cover` inside a fixed-height 196
///    box, rounded via [borderRadius]. Original behaviour: `FittedBox(cover)`
///    lets the video crop the axis that doesn't match rather than letterbox.
///  * `video_bleed` → `BoxFit.cover` inside a `Positioned.fill` (see
///    `variants/video_bleed_body.dart`) so the video fills the whole screen
///    behind a dark gradient overlay.
class PaywallHeroVideoPlayer extends StatelessWidget {
  const PaywallHeroVideoPlayer({
    super.key,
    required this.controller,
    required this.thumbnailUrl,
    required this.failed,
    this.borderRadius,
    this.fit = BoxFit.cover,
    this.height,
    this.overlay,
  });

  final PaywallVideoController? controller;
  final String? thumbnailUrl;
  final bool failed;

  /// Rounded-corner clip. `null` → no rounding (used by `video_bleed`).
  final BorderRadius? borderRadius;

  /// How the video frame is fit into the parent box. `cover` for all three
  /// variants; kept parameterised for future flexibility.
  final BoxFit fit;

  /// Fixed height when non-null. `card_hero` + `icon_grid` pass 196 (the
  /// Figma 328×176 hero with a 20px cushion — see the historical comment in
  /// paywall_screen.dart). `video_bleed` leaves it null and relies on the
  /// parent `Positioned.fill` for sizing.
  final double? height;

  /// Optional overlay painted above the video (gradient darkeners for
  /// `video_bleed`). Not used by the rounded variants.
  final Widget? overlay;

  @override
  Widget build(BuildContext context) {
    // RepaintBoundary isolates the video/thumbnail from parent repaints —
    // when a plan-tab tap rebuilds the parent body, this subtree keeps its
    // last painted layer instead of flashing white/orange for a frame.
    Widget content = SizedBox(
      height: height,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          _layer(context),
          ?overlay,
        ],
      ),
    );
    if (borderRadius != null) {
      content = ClipRRect(borderRadius: borderRadius!, child: content);
    }
    return RepaintBoundary(child: content);
  }

  Widget _layer(BuildContext context) {
    final ctrl = controller;
    final videoController = ctrl?.videoController;
    if (ctrl != null && ctrl.isInitialized && videoController != null) {
      // Video is ready — paint the video frame with the fallback backdrop
      // beneath so any 1-frame gap during the parent rebuild shows the
      // brand color instead of white. `FittedBox(cover)` scales the video's
      // raster to fit the box without letterboxing.
      return Stack(
        fit: StackFit.expand,
        children: <Widget>[
          _fallback(),
          GestureDetector(
            key: const Key('paywall-video-surface'),
            onTap: () => context.read<PaywallBloc>().add(const VideoTapped()),
            child: FittedBox(
              fit: fit,
              alignment: Alignment.center,
              clipBehavior: Clip.hardEdge,
              child: SizedBox(
                width: ctrl.size.width,
                height: ctrl.size.height,
                // `controls: NoVideoControls` = no built-in play/pause
                // overlay; the paywall draws its own chrome. `fill:
                // Colors.transparent` because the surrounding FittedBox
                // expects just the texture with no letterbox band.
                child: Video(
                  controller: videoController,
                  controls: NoVideoControls,
                  fill: Colors.transparent,
                ),
              ),
            ),
          ),
        ],
      );
    }
    if (thumbnailUrl != null && thumbnailUrl!.isNotEmpty && !failed) {
      // Stack the fallback BEHIND the network image so:
      //   1. The loading state shows the orange play-icon backdrop — the
      //      `CachedNetworkImage` renders a transparent placeholder while
      //      downloading, letting the fallback beneath show through.
      //   2. `CachedNetworkImage` uses an `ImageProvider` internally, so the
      //      previously-loaded frame is retained across widget rebuilds
      //      (same effect as `Image.network`'s `gaplessPlayback: true`).
      //   3. `cached_network_image` persists to disk via `flutter_cache_manager`,
      //      so the second visit doesn't re-download the thumbnail.
      //   4. On network error the errorWidget is a transparent shim, again
      //      letting the fallback beneath show through.
      return Stack(
        fit: StackFit.expand,
        children: <Widget>[
          _fallback(),
          CachedNetworkImage(
            imageUrl: thumbnailUrl!,
            fit: fit,
            fadeInDuration: Duration.zero,
            fadeOutDuration: Duration.zero,
            placeholder: (context, _) => const SizedBox.shrink(),
            errorWidget: (context, _, _) => const SizedBox.shrink(),
          ),
        ],
      );
    }
    return _fallback();
  }

  Widget _fallback() => Container(
        color: AppColors.brand300,
        alignment: Alignment.center,
        child: const Icon(
          Icons.play_circle_outline,
          size: 64,
          color: AppColors.white,
        ),
      );
}
