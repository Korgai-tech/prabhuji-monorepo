import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// The looping-muted-video seam for the result background (TAM-74).
///
/// Same shape as TAM-70's `WallpaperVideoPort` (interface + real impl + a fake
/// in test support) so the "video fails → static fallback, text + TTS keep
/// working" rule is widget-testable with no real codec/network.
///
/// The horoscope backdrop is ALWAYS silent + looping (PRD §6.4) — narration
/// owns the audio channel, so [initialize] mutes unconditionally.
///
/// **Why media_kit?** Same reason the status feed swapped (TAM-72):
/// CMS-uploaded / user-generated H.264-High / HEVC clips hit broken Xiaomi/
/// MIUI hardware decoders (green diagonal tearing / blocky YUV corruption).
/// media_kit ships libmpv + FFmpeg and decodes in software, bypassing the
/// broken hardware path entirely. Requires `MediaKit.ensureInitialized()` to
/// have run in `main()` before any instance is constructed.
abstract interface class HoroscopeVideoPort {
  /// Prepare [url] for playback (muted, looping). Resolves once the first frame
  /// is ready; on ANY failure it resolves with [hasError] true rather than
  /// throwing — the background is decorative and must never break the screen.
  Future<void> initialize(String url);

  Future<void> play();
  Future<void> pause();

  bool get isInitialized;
  bool get hasError;

  /// Intrinsic aspect ratio once initialized (1.0 before).
  double get aspectRatio;

  /// Intrinsic pixel size of the decoded video (native resolution the
  /// codec/decoder reports — e.g. 1920×1080). `Size.zero` before initialize.
  /// See [StatusVideoPort.intrinsicSize] for the render-quality rationale.
  Size get intrinsicSize;

  /// The render widget (a media_kit `Video`, or `SizedBox.shrink()` before
  /// ready).
  Widget buildView();

  Future<void> dispose();
}

/// Factory injected via a provider so tests can swap in a fake.
typedef HoroscopeVideoPortFactory = HoroscopeVideoPort Function();

/// Real `media_kit` implementation. Muted + looping by construction. Software
/// decode (libmpv + FFmpeg) bypasses broken device hardware decoders.
class MediaKitHoroscopeVideoPort implements HoroscopeVideoPort {
  Player? _player;
  VideoController? _controller;
  bool _error = false;

  @override
  Future<void> initialize(String url) async {
    if (url.trim().isEmpty) {
      _error = true;
      return;
    }
    try {
      final player = Player();
      _player = player;
      final controller = VideoController(player);
      _controller = controller;
      // `play: false` so the widget owns explicit play/pause.
      await player.open(Media(url), play: false);
      // Two-step wait, both required to avoid the "audio plays, video blank"
      // failure mode observed on Android. See status_video_port.dart for the
      // full rationale — the horoscope port renders via
      // `FittedBox(cover, SizedBox(intrinsicSize, buildView()))` too, so a
      // 0×0 intrinsic size produces a black backdrop even after the first
      // frame renders.
      await controller.waitUntilFirstFrameRendered
          .timeout(const Duration(seconds: 15));
      if ((player.state.width ?? 0) == 0 || (player.state.height ?? 0) == 0) {
        await Future.wait([
          player.stream.width.firstWhere((w) => w != null && w > 0),
          player.stream.height.firstWhere((h) => h != null && h > 0),
        ]).timeout(const Duration(seconds: 5));
      }
      await player.setPlaylistMode(PlaylistMode.loop);
      // The backdrop is silent — TTS owns the audio channel.
      await player.setVolume(0);
    } catch (e, st) {
      _error = true;
      // Was silently swallowed on `video_player`. Log so a failing source is
      // diagnosable from `adb logcat`.
      debugPrint('[horoscope-video] FAILED url=$url error=$e');
      debugPrint('[horoscope-video] stack=$st');
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
  bool get isInitialized {
    final p = _player;
    if (p == null || _error) return false;
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
    return Video(
      controller: c,
      controls: NoVideoControls,
      fill: Colors.transparent,
    );
  }

  @override
  Future<void> dispose() async {
    // VideoController is torn down implicitly when its Player is disposed.
    await _player?.dispose();
    _player = null;
    _controller = null;
  }
}
