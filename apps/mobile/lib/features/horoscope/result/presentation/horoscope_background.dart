import 'dart:async';

import 'package:flutter/material.dart';

import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../data/horoscope_video_port.dart';

/// The result's silent looping video backdrop, with its fallback chain
/// (Figma nodes 387:2572 video/still + 387:2573 scrim).
///
/// The design's backdrop is 450×800 on a 360-wide frame — i.e. full-bleed
/// COVER, never letterboxed.
///
/// ## Fallback chain (PRD §6.4 — the flow NEVER blocks on video)
/// 1. `media.backgroundVideoUrl` via [HoroscopeVideoPort] (muted + looping).
/// 2. On any video failure → `media.backgroundStaticFallbackUrl`, the
///    CMS-configured still, through [AppNetworkImage].
/// 3. If that network still also fails (offline / empty URL) → the **bundled
///    Figma still**, so the starfield behind the text is never a blank void.
///
/// Released on exit: the port is disposed with this widget.
class HoroscopeBackground extends StatefulWidget {
  const HoroscopeBackground({
    super.key,
    required this.videoUrl,
    required this.fallbackUrl,
    required this.portFactory,
    required this.onVideoFailed,
  });

  final String videoUrl;
  final String fallbackUrl;
  final HoroscopeVideoPortFactory portFactory;

  /// Fired once when the video can't play — the bloc logs
  /// `horoscope_video_fallback_used` and records it on subsequent step events.
  final VoidCallback onVideoFailed;

  @override
  State<HoroscopeBackground> createState() => _HoroscopeBackgroundState();
}

class _HoroscopeBackgroundState extends State<HoroscopeBackground> {
  HoroscopeVideoPort? _port;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    final port = widget.portFactory();
    _port = port;
    await port.initialize(widget.videoUrl);
    if (!mounted) return;
    if (port.hasError || !port.isInitialized) {
      setState(() => _failed = true);
      widget.onVideoFailed();
      return;
    }
    await port.play();
    if (!mounted) return;
    setState(() {});
  }

  @override
  void dispose() {
    // Release the codec when the flow exits (AC).
    unawaited(_port?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final port = _port;
    final showVideo = !_failed && (port?.isInitialized ?? false);

    return Positioned.fill(
      key: const ValueKey('horoscope-result-background'),
      child: ColoredBox(
        color: AppColors.horoscopeVideoBackdrop,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (showVideo)
              // COVER: size the video to its native pixel resolution, then
              // let FittedBox overflow-crop it to the screen — matching the
              // design's 450×800 backdrop on a 360 frame.
              //
              // MUST use `intrinsicSize`, NOT `aspectRatio × 1`. See
              // horoscope_video_port.dart's `intrinsicSize` docs — a
              // 1-pixel logical layout causes Skia to downsample the
              // full-res frame into a 1×1 intermediate raster before
              // FittedBox scales back up, producing distorted playback.
              FittedBox(
                key: const ValueKey('horoscope-result-video'),
                fit: BoxFit.cover,
                clipBehavior: Clip.hardEdge,
                child: SizedBox(
                  width: port!.intrinsicSize.width,
                  height: port.intrinsicSize.height,
                  child: port.buildView(),
                ),
              )
            else
              _StaticFallback(url: widget.fallbackUrl),
            // Flat 50% black scrim over the whole screen (node 387:2573) — this
            // is what makes the cream body text readable on any frame.
            const ColoredBox(color: AppColors.horoscopeResultScrim),
          ],
        ),
      ),
    );
  }
}

/// The CMS still, with the bundled Figma still as the last resort.
class _StaticFallback extends StatelessWidget {
  const _StaticFallback({required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    return AppNetworkImage(
      key: const ValueKey('horoscope-result-fallback'),
      url: url,
      fit: BoxFit.cover,
      // AppNetworkImage short-circuits an empty URL straight to this, and uses
      // it on load error too — so offline still gets the starfield.
      fallback: const _BundledStill(),
    );
  }
}

class _BundledStill extends StatelessWidget {
  const _BundledStill();

  @override
  Widget build(BuildContext context) {
    return const Image(
      key: ValueKey('horoscope-result-bundled-still'),
      image: AssetImage('assets/horoscope/video_fallback.jpg'),
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
    );
  }
}
