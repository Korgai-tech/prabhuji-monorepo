import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// The muted-loop video seam for the Home hero carousel.
///
/// Same shape as the status feed's `StatusVideoPort` (interface + real
/// `media_kit` impl + a fake in test support) so the banner's "plays ONLY while
/// it is the banner on screen" rule is widget-testable with no real codec and
/// no network.
///
/// Two deliberate differences from status:
///  * there is NO [setMuted] — a home banner is muted by contract, forever.
///    The requirement is "muted, on a loop, no play or pause controls", so the
///    app never exposes a way to un-mute one and the port never offers one.
///  * a failed [initialize] is NOT an error the caller has to catch: it flips
///    [hasError] and the carousel simply keeps painting the thumbnail. A banner
///    must never look broken.
///
/// **Why media_kit and not video_player?** Identical reason to status (TAM-72)
/// and the paywall hero: CMS-uploaded H.264 High / HEVC clips come back green-
/// torn and blocky on Xiaomi/MIUI hardware decoders. media_kit ships libmpv +
/// FFmpeg and decodes in software, bypassing the broken silicon. `video_player`
/// is not in the dependency graph.
abstract interface class HomeBannerVideoPort {
  /// Prepare [url] for muted, looping playback. Resolves once the first frame
  /// is ready and the intrinsic size is known, or — on any failure — resolves
  /// with [hasError] true and [isInitialized] false. Never throws.
  Future<void> initialize(String url);

  Future<void> play();
  Future<void> pause();

  bool get isInitialized;
  bool get hasError;

  /// Intrinsic pixel size of the decoded video (the native resolution the
  /// decoder reports — e.g. 1920×1080). `Size.zero` before initialize.
  ///
  /// Callers rendering with `FittedBox(fit: BoxFit.cover, child: SizedBox(...))`
  /// MUST size that inner `SizedBox` to this value, NOT `aspectRatio × 1` — the
  /// latter constrains the underlying `Texture` to ~1 logical pixel and Skia
  /// samples the full-res frame into a 1×1 intermediate raster before the
  /// FittedBox scales it back up. See `status_video_port.dart` for the full
  /// write-up of that trap.
  Size get intrinsicSize;

  /// The render widget (a media_kit `Video`, or `SizedBox.shrink()` before
  /// ready).
  Widget buildView();

  Future<void> dispose();
}

/// Factory injected via a provider so tests swap in a fake per banner.
typedef HomeBannerVideoPortFactory = HomeBannerVideoPort Function();

/// Real `media_kit` implementation. Muted + looping by construction, with no
/// controls surface of any kind (`NoVideoControls`).
///
/// Requires `MediaKit.ensureInitialized()` to have run in `main()` before ANY
/// instance is constructed.
class MediaKitHomeBannerVideoPort implements HomeBannerVideoPort {
  Player? _player;
  VideoController? _controller;
  bool _error = false;

  @override
  Future<void> initialize(String url) async {
    try {
      final player = Player();
      _player = player;
      final controller = VideoController(player);
      _controller = controller;

      // Volume + loop are configured BEFORE open() so they apply from the very
      // first decoded frame — a banner must never emit a single audible sample.
      await player.setVolume(0);
      await player.setPlaylistMode(PlaylistMode.loop);

      // Open with `play: true` rather than open-paused + an explicit play()
      // after the first-frame wait: on some libmpv builds a paused player
      // doesn't decode at all, so `waitUntilFirstFrameRendered` hits its
      // timeout and the banner is stuck on its thumbnail forever. Kicking
      // playback off at open() keeps the decode pipeline flowing; the carousel
      // pauses immediately afterwards if the banner is no longer on screen.
      await player.open(Media(url), play: true);

      // Two-step wait, both required (see the paywall controller's write-up):
      //   (a) the Flutter Texture is paintable;
      //   (b) width/height are populated — they arrive on a DIFFERENT stream
      //       from the first-frame signal, so (a) can return before (b).
      await controller.waitUntilFirstFrameRendered
          .timeout(const Duration(seconds: 15));
      if ((player.state.width ?? 0) == 0 || (player.state.height ?? 0) == 0) {
        await Future.wait([
          player.stream.width.firstWhere((w) => w != null && w > 0),
          player.stream.height.firstWhere((h) => h != null && h > 0),
        ]).timeout(const Duration(seconds: 5));
      }
    } catch (e) {
      // SWALLOWED BY DESIGN: the carousel's contract is "if the video fails to
      // load, the thumbnail stays up". Surfacing this as a throw would make
      // every call site write the same empty catch.
      _error = true;
      debugPrint('[home-banner-video] FAILED url=$url error=$e');
    }
  }

  @override
  Future<void> play() async {
    if (_error) return;
    await _player?.play();
  }

  @override
  Future<void> pause() async => _player?.pause();

  @override
  bool get isInitialized {
    final p = _player;
    if (p == null || _error) return false;
    return (p.state.width ?? 0) > 0 && (p.state.height ?? 0) > 0;
  }

  @override
  bool get hasError => _error;

  @override
  Size get intrinsicSize {
    final p = _player;
    if (p == null) return Size.zero;
    final w = (p.state.width ?? 0).toDouble();
    final h = (p.state.height ?? 0).toDouble();
    if (w <= 0 || h <= 0) return Size.zero;
    return Size(w, h);
  }

  @override
  Widget buildView() {
    final controller = _controller;
    if (controller == null || !isInitialized) return const SizedBox.shrink();
    // `controls: NoVideoControls` — the requirement is explicitly "no play or
    // pause controls". `fill: transparent` because the caller wraps this in a
    // FittedBox that expects the bare texture with no letterbox band.
    return Video(
      controller: controller,
      controls: NoVideoControls,
      fill: Colors.transparent,
    );
  }

  @override
  Future<void> dispose() async {
    // VideoController is torn down implicitly with its Player.
    await _player?.dispose();
    _player = null;
    _controller = null;
  }
}
