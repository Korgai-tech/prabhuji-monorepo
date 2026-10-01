import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// The looping-muted-video seam for the live wallpaper preview (TAM-70).
/// Interface + real impl + a fake (test support) so the reels PageView — and
/// the "only the active page plays, muted" rule — is widget-testable with no
/// real codec/network (spec: "preview swipe static+live w/ a fake video").
///
/// Wallpapers have NO sound (PRD §6.7): [initialize] always mutes and loops.
///
/// **Why media_kit?** Same reason the status feed swapped (TAM-72):
/// CMS-uploaded H.264-High / HEVC clips hit broken Xiaomi/MIUI hardware
/// decoders (green diagonal tearing / blocky YUV corruption). media_kit ships
/// libmpv + FFmpeg and decodes in software, bypassing the broken hardware
/// path entirely. Requires `MediaKit.ensureInitialized()` to have run in
/// `main()` before any instance is constructed.
abstract interface class WallpaperVideoPort {
  /// Prepare [url] for playback (muted, looping). Resolves once the first frame
  /// is ready, or rejects/stays uninitialized on error (the live page then
  /// falls back to the static thumbnail).
  Future<void> initialize(String url);

  Future<void> play();
  Future<void> pause();

  bool get isInitialized;
  bool get hasError;

  /// Intrinsic aspect ratio once initialized (1.0 before).
  double get aspectRatio;

  /// Intrinsic pixel size of the decoded video (native resolution the
  /// codec/decoder reports — e.g. 1080×1920). `Size.zero` before initialize.
  /// See [StatusVideoPort.intrinsicSize] for the render-quality rationale.
  Size get intrinsicSize;

  /// Current playhead position. Needed by the analytics wiring for
  /// `wallpaper_back_clicked` (Sheet 1 row 133) which carries
  /// `playback_time_seconds`. Returns [Duration.zero] before initialize or
  /// on error (static pages that never mount a port report 0 too).
  Duration get currentPosition;

  /// The render widget (a media_kit `Video`, or `SizedBox.shrink()` before
  /// ready).
  Widget buildView();

  Future<void> dispose();
}

/// Factory injected via a provider so tests can swap in a [WallpaperVideoPort]
/// fake per live page.
typedef WallpaperVideoPortFactory = WallpaperVideoPort Function();

/// Real `media_kit` implementation. Muted + looping by construction. Software
/// decode (libmpv + FFmpeg) bypasses broken device hardware decoders.
class MediaKitWallpaperVideoPort implements WallpaperVideoPort {
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
      // `play: false` so the reels PageView owns explicit play (only the
      // active page runs at a time — PRD §6.7).
      await player.open(Media(url), play: false);
      // Two-step wait, both required to avoid the "audio plays, video blank"
      // failure mode observed on Android — see status_video_port.dart for
      // the full rationale.
      await controller.waitUntilFirstFrameRendered
          .timeout(const Duration(seconds: 15));
      if ((player.state.width ?? 0) == 0 || (player.state.height ?? 0) == 0) {
        await Future.wait([
          player.stream.width.firstWhere((w) => w != null && w > 0),
          player.stream.height.firstWhere((h) => h != null && h > 0),
        ]).timeout(const Duration(seconds: 5));
      }
      await player.setPlaylistMode(PlaylistMode.loop);
      // Wallpapers have no sound.
      await player.setVolume(0);
    } catch (e, st) {
      _error = true;
      debugPrint('[wallpaper-video] FAILED url=$url error=$e');
      debugPrint('[wallpaper-video] stack=$st');
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
  Duration get currentPosition =>
      isInitialized ? (_player?.state.position ?? Duration.zero) : Duration.zero;

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
