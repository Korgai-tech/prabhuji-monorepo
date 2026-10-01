import 'package:flutter/widgets.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// Thin wrapper around a `media_kit` [Player] + [VideoController] pair for the
/// paywall's hero video. Same shape the paywall previously read off
/// `VideoPlayerController.value` (`.isInitialized`, `.isPlaying`, `.size`), so
/// the four render sites (screen + three variant bodies + the hero widget)
/// keep a single `?.` recipient instead of juggling the pair everywhere.
///
/// **Why media_kit for the paywall?** Same reason status swapped (TAM-72):
/// the CMS-uploaded hero clips hit broken Xiaomi/MIUI hardware decoders —
/// green tearing / blocky YUV corruption on H.264 High / HEVC. media_kit's
/// libmpv + FFmpeg backend software-decodes and bypasses the broken silicon.
///
/// Requires `MediaKit.ensureInitialized()` to have run in `main()` before any
/// instance is constructed.
class PaywallVideoController {
  Player? _player;
  VideoController? _videoController;
  bool _hasError = false;

  /// True once the first frame has rendered AND the player reports non-zero
  /// intrinsic dimensions. See the status port for the two-step wait
  /// rationale — `waitUntilFirstFrameRendered` alone can return before
  /// `state.width/height` populate on Android, which produces a zero-sized
  /// SizedBox and a black card with audio.
  bool get isInitialized {
    final p = _player;
    if (p == null || _hasError) return false;
    final w = p.state.width ?? 0;
    final h = p.state.height ?? 0;
    return w > 0 && h > 0;
  }

  bool get isPlaying => _player?.state.playing ?? false;

  bool get hasError => _hasError;

  /// Intrinsic pixel size of the decoded video. `Size.zero` before init.
  /// The paywall's hero renders via
  /// `FittedBox(cover, child: SizedBox(width, height, child: buildView()))`,
  /// so this MUST be the native pixel size, not `aspectRatio × 1` — see the
  /// status port's `intrinsicSize` docs for the Skia downsampling trap.
  Size get size {
    final p = _player;
    if (p == null) return Size.zero;
    final w = (p.state.width ?? 0).toDouble();
    final h = (p.state.height ?? 0).toDouble();
    if (w <= 0 || h <= 0) return Size.zero;
    return Size(w, h);
  }

  /// The underlying media_kit [VideoController] — the hero widget hands this
  /// to a `Video` widget for actual rendering.
  VideoController? get videoController => _videoController;

  /// Open [uri] and prepare it for playback. Returns once the first frame is
  /// rendered AND the intrinsic size is known. Throws on failure — callers
  /// track that as a paywall video failure and flip to the thumbnail fallback.
  ///
  /// [volume] is the fractional level the callers already speak in (0.0–1.0).
  /// media_kit itself takes 0–100; the wrapper converts.
  Future<void> initialize(
    Uri uri, {
    double volume = 1.0,
    bool loop = true,
    bool autoplay = true,
  }) async {
    try {
      final player = Player();
      _player = player;
      final controller = VideoController(player);
      _videoController = controller;

      // Configure volume + loop BEFORE opening so they apply from the very
      // first decoded frame. media_kit's setVolume takes 0–100 (percent),
      // not 0.0–1.0 — the wrapper converts.
      await player.setVolume(volume.clamp(0.0, 1.0) * 100);
      if (loop) await player.setPlaylistMode(PlaylistMode.loop);

      // Autoplay is done via `open(..., play: autoplay)`, NOT via
      // open-paused + explicit `.play()` after the first-frame wait.
      // On some libmpv builds the paused player doesn't decode a frame
      // until playback starts, which makes `waitUntilFirstFrameRendered`
      // hit its 15 s timeout — the wrapper then throws, `_hasError`
      // flips true, and the manual play() at the bottom never runs, so
      // the hero shows the thumbnail forever. Kicking playback off at
      // open() time keeps the decode pipeline flowing while we wait.
      await player.open(Media(uri.toString()), play: autoplay);

      // Two-step wait, both required to avoid the "audio plays, video
      // blank" failure mode observed on Android:
      //   (a) waitUntilFirstFrameRendered → the Flutter Texture is
      //       paintable.
      //   (b) state.width/height populated → the SizedBox wrapper (see
      //       hero_video_player.dart) has non-zero dimensions to hand
      //       to its FittedBox. The resize pipeline fires on a
      //       different stream from the first-frame signal, so
      //       waitUntilFirstFrameRendered can return before width /
      //       height are known.
      await controller.waitUntilFirstFrameRendered
          .timeout(const Duration(seconds: 15));
      if ((player.state.width ?? 0) == 0 || (player.state.height ?? 0) == 0) {
        await Future.wait([
          player.stream.width.firstWhere((w) => w != null && w > 0),
          player.stream.height.firstWhere((h) => h != null && h > 0),
        ]).timeout(const Duration(seconds: 5));
      }

      // Belt-and-braces: if autoplay was requested but the player
      // somehow ended up paused (a platform that discarded the
      // open-time `play` hint, or a preceding pause event racing the
      // open call), start it explicitly now that the frame is up.
      if (autoplay && !player.state.playing) {
        await player.play();
      }
    } catch (e, st) {
      _hasError = true;
      debugPrint('[paywall-video] FAILED url=$uri error=$e');
      debugPrint('[paywall-video] stack=$st');
      rethrow;
    }
  }

  Future<void> play() async {
    if (_hasError) return;
    await _player?.play();
  }

  Future<void> pause() async {
    await _player?.pause();
  }

  Future<void> setVolume(double volume) async {
    await _player?.setVolume(volume.clamp(0.0, 1.0) * 100);
  }

  Future<void> dispose() async {
    // VideoController is torn down implicitly when its Player is disposed.
    await _player?.dispose();
    _player = null;
    _videoController = null;
  }
}
