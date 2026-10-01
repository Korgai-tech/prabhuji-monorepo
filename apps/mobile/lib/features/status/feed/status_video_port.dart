import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// The muted-loop video seam for the status feed (TAM-72). Interface + real
/// `media_kit` impl + a fake (test support), so the vertical feed — and the
/// "only the ACTIVE card plays, muted, one at a time" rule (PRD §6.9) — is
/// widget-testable with no real codec/network.
///
/// Status videos autoplay MUTED — the user opts into sound via the
/// Instagram-style speaker toggle in the top-right of the card (state lives in
/// `statusMutedProvider`). [initialize] always starts muted; the widget calls
/// [setMuted] right after init to reflect the sticky per-session preference.
///
/// **Why media_kit and not video_player?** User-generated / CMS-uploaded status
/// videos hit broken hardware decoders on Xiaomi/MIUI (and other) devices:
/// H.264 High profile / HEVC frames come out with green diagonal tearing and
/// blocky corruption because the silicon-level decoder misreads YUV chroma
/// planes. media_kit ships libmpv + FFmpeg and decodes in software, bypassing
/// the broken hardware path entirely. The horoscope, wallpaper and paywall
/// ports now use media_kit for the same reason — `video_player` is no longer
/// in the dependency graph.
abstract interface class StatusVideoPort {
  /// Prepare [url] for playback (muted, looping). Resolves once the first frame
  /// is ready, or rejects/stays uninitialized on error (the card then falls
  /// back to its thumbnail — media failure must never break the feed, PRD §7).
  Future<void> initialize(String url);

  Future<void> play();
  Future<void> pause();

  /// Toggle audio. `true` → volume 0, `false` → volume 1.0. Safe to call
  /// before or after [initialize]; a pre-init call is applied on the next
  /// successful initialize.
  Future<void> setMuted(bool muted);

  bool get isInitialized;
  bool get hasError;

  /// Intrinsic aspect ratio once initialized (1.0 before).
  double get aspectRatio;

  /// Intrinsic pixel size of the decoded video (native resolution the
  /// codec/decoder reports — e.g. 1920×1080). `Size.zero` before initialize.
  ///
  /// Callers rendering with `FittedBox(fit: BoxFit.cover, child: SizedBox(...))`
  /// MUST size that inner `SizedBox` to this value, NOT `aspectRatio × 1` —
  /// the latter constrains the underlying `Texture` layer to ~1 logical
  /// pixel and Skia can end up sampling the full-res video frame into a
  /// 1-pixel intermediate raster before `FittedBox` scales back up,
  /// producing blocking/blur that looks nothing like the source. See the
  /// paywall-screen video pattern for the reference implementation.
  Size get intrinsicSize;

  /// The render widget (a media_kit `Video`, or `SizedBox.shrink()` before
  /// ready).
  Widget buildView();

  Future<void> dispose();
}

/// Factory injected via a provider so tests can swap in a [StatusVideoPort]
/// fake per card.
typedef StatusVideoPortFactory = StatusVideoPort Function();

/// Real `media_kit` implementation. Muted + looping by construction. Software
/// decode (libmpv + FFmpeg) bypasses broken device hardware decoders.
///
/// Requires `MediaKit.ensureInitialized()` to have run in `main()` before ANY
/// instance is constructed.
class MediaKitStatusVideoPort implements StatusVideoPort {
  Player? _player;
  VideoController? _controller;
  bool _error = false;
  // Latched mute preference. A pre-init [setMuted] is honoured on the next
  // successful [initialize] — default is muted (Instagram autoplay pattern).
  bool _muted = true;

  @override
  Future<void> initialize(String url) async {
    try {
      final player = Player();
      _player = player;
      final controller = VideoController(player);
      _controller = controller;
      // `play: false` so playback only starts when the widget's `play()` call
      // fires (the feed only plays the ACTIVE card).
      await player.open(Media(url), play: false);
      // Two-step wait, both required to avoid the "audio plays, video blank"
      // failure mode observed on Android:
      //   (a) waitUntilFirstFrameRendered → the Flutter Texture is paintable.
      //   (b) state.width/height populated → the SizedBox wrapper (see
      //       status_widgets.dart) has non-zero dimensions to hand to the
      //       FittedBox. `waitUntilFirstFrameRendered` does NOT guarantee
      //       this; the VideoOutput.Resize events fire earlier via a
      //       separate pipeline, so state.width can still be null when the
      //       first frame is rendered. If we return without waiting for it,
      //       intrinsicSize is 0x0, SizedBox is 0x0, FittedBox has nothing
      //       to render → black card with audio.
      // Bail after 15 s so a broken source can never stall the port forever
      // (the card then falls back to its thumbnail, per §7).
      await controller.waitUntilFirstFrameRendered
          .timeout(const Duration(seconds: 15));
      if ((player.state.width ?? 0) == 0 || (player.state.height ?? 0) == 0) {
        await Future.wait([
          player.stream.width.firstWhere((w) => w != null && w > 0),
          player.stream.height.firstWhere((h) => h != null && h > 0),
        ]).timeout(const Duration(seconds: 5));
      }
      await player.setPlaylistMode(PlaylistMode.loop);
      // Honour any pre-init mute preference; the widget re-syncs after
      // initialize() returns, so this is the belt-and-braces default.
      await player.setVolume(_muted ? 0 : 100);
      final s = intrinsicSize;
      debugPrint(
        '[status-video] OK url=$url '
        'size=${s.width.toInt()}x${s.height.toInt()}',
      );
    } catch (e, st) {
      _error = true;
      // Was silently swallowed before the media_kit swap. Log the URL + full
      // error so a failing card is diagnosable from `adb logcat`.
      debugPrint('[status-video] FAILED url=$url error=$e');
      debugPrint('[status-video] stack=$st');
    }
  }

  @override
  Future<void> play() async {
    if (_error) return;
    await _player?.play();
  }

  @override
  Future<void> pause() async {
    await _player?.pause();
  }

  @override
  Future<void> setMuted(bool muted) async {
    _muted = muted;
    // media_kit's setVolume takes 0–100 (percent), not 0.0–1.0.
    await _player?.setVolume(muted ? 0 : 100);
  }

  @override
  bool get isInitialized {
    final p = _player;
    if (p == null || _error) return false;
    // Read state.width/height — the top-level PlayerState fields the resize
    // pipeline populates. `state.videoParams.dw/dh` is NOT reliable on
    // Android: it stays null even after the first frame renders, which made
    // this port report size=0x0 and every card show a zero-sized SizedBox
    // (audio played, no video visible).
    final w = p.state.width ?? 0;
    final h = p.state.height ?? 0;
    return w > 0 && h > 0;
  }

  @override
  bool get hasError => _error;

  @override
  double get aspectRatio {
    final s = intrinsicSize;
    if (s.width <= 0 || s.height <= 0) return 1.0;
    return s.width / s.height;
  }

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
    final c = _controller;
    if (c == null || !isInitialized) return const SizedBox.shrink();
    // `controls: NoVideoControls` = no built-in play/pause overlay; the
    // status card draws its own chrome. `fill: Colors.transparent` because
    // this widget sits inside a FittedBox that expects to render just the
    // texture with no letterbox band.
    return Video(
      controller: c,
      controls: NoVideoControls,
      fill: Colors.transparent,
    );
  }

  @override
  Future<void> dispose() async {
    // VideoController is torn down implicitly when its Player is disposed;
    // disposing the player is the only teardown required.
    await _player?.dispose();
    _player = null;
    _controller = null;
  }
}
