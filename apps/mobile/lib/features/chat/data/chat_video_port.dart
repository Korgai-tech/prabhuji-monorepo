import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

/// The in-thread intro-video seam for Chat (TAM-177). Interface + real
/// `media_kit` impl + a fake (`test/support/fake_chat_video_port.dart`), so the
/// intro card — autoplay, tap-to-toggle, and the four auto-pause triggers — is
/// widget-testable with no real codec or network.
///
/// This is the SEVENTH per-feature video port (status, home banner, horoscope,
/// wallpaper, paywall, kuldevta-entry being the others). A single shared port
/// would be a worthwhile enabler, but unifying seven lifecycles with genuinely
/// different needs (loop vs one-shot, muted vs audible, lazy vs eager) is not
/// this ticket — doing it here would put six unrelated surfaces in the blast
/// radius of a chat feature. See TAM-177 #PATH_DECISION.
///
/// **How this port differs from [StatusVideoPort], and why:**
///
/// * **Audible.** The intro video is a spoken pitch — muting it removes the
///   entire point. [initialize] sets volume to 100 (media_kit's scale is
///   0–100, NOT 0.0–1.0). Locked decision D1.
/// * **Opens with `play: true`.** Some libmpv builds do not decode while
///   paused, so `waitUntilFirstFrameRendered` times out and the card is stuck
///   on its poster forever. The home-banner and paywall ports hit exactly this
///   and open eagerly for the same reason. Autoplay-on-open is the required
///   behaviour anyway.
/// * **Does NOT loop** (`PlaylistMode.none`). A one-shot pitch, not a banner.
/// * **Exposes [currentPosition].** `chat_video_started.position_ms` and
///   `chat_video_paused.watched_ms` are both read off it.
///
/// **There is deliberately no `seek()` on this interface.** "The video does not
/// restart on its own after being paused" is satisfied *by construction* as
/// long as nothing rewinds it and nothing re-opens the media: `pause()` then
/// `play()` resumes from the current position. The real trap is re-`initialize`
/// on rebuild — guard every call site with a one-shot latch. Adding a `seek()`
/// here would hand a future caller the one tool that can break the guarantee.
///
/// Requires `MediaKit.ensureInitialized()` (called in `main()`) before ANY
/// [MediaKitChatVideoPort] is constructed. That never runs under
/// `flutter test`, which is precisely why this seam exists.
abstract interface class ChatVideoPort {
  /// Prepare [url] and begin playing, audible. Resolves once the first frame
  /// is ready; on any failure it sets [hasError] and returns normally, leaving
  /// the caller's poster in place. A media failure must never break the thread.
  Future<void> initialize(String url);

  Future<void> play();
  Future<void> pause();

  bool get isInitialized;
  bool get hasError;

  /// Whether the player is currently playing. Used to reconcile the card's
  /// tap-to-toggle state against the real player.
  bool get isPlaying;

  /// Playback position. `Duration.zero` before initialize. Feeds
  /// `position_ms` / `watched_ms` on the two video analytics events.
  Duration get currentPosition;

  /// Intrinsic pixel size of the decoded video. `Size.zero` before initialize.
  ///
  /// A caller rendering with `FittedBox(fit: BoxFit.cover, child: SizedBox(...))`
  /// MUST size that inner `SizedBox` to this value, NOT to `aspectRatio × 1` —
  /// the latter constrains the underlying `Texture` to ~1 logical pixel and
  /// Skia samples the full-res frame into a 1×1 intermediate raster before
  /// scaling it back up, which renders as blocky garbage.
  Size get intrinsicSize;

  /// The render widget (a media_kit `Video`, or `SizedBox.shrink()` before
  /// ready).
  Widget buildView();

  Future<void> dispose();
}

/// Factory injected via [chatVideoPortFactoryProvider] so tests can swap in a
/// `FakeChatVideoPort`.
typedef ChatVideoPortFactory = ChatVideoPort Function();

/// Real `media_kit` implementation — audible, one-shot, autoplaying.
///
/// Software decode (libmpv + FFmpeg) bypasses the broken hardware decoders on
/// Xiaomi/MIUI and similar devices that corrupt H.264 High / HEVC frames. That
/// is why `video_player` is not in the dependency graph at all.
class MediaKitChatVideoPort implements ChatVideoPort {
  Player? _player;
  VideoController? _controller;
  bool _error = false;

  /// One-shot guard. [initialize] is idempotent even if a caller's own latch
  /// fails, because a second `open()` would rewind the video to 0:00 — the
  /// exact regression the "never restarts after pause" requirement forbids.
  bool _initStarted = false;

  @override
  Future<void> initialize(String url) async {
    if (_initStarted) return;
    _initStarted = true;
    try {
      final player = Player();
      _player = player;
      final controller = VideoController(player);
      _controller = controller;

      // Volume BEFORE open, so the very first decoded sample is already at the
      // intended level — the home-banner port sets volume pre-open for the
      // mirror-image reason (a banner must never emit an audible sample).
      // Here the intent is the opposite but the timing argument is the same.
      await player.setVolume(100);
      // One-shot: the pitch ends and stays ended. Never `PlaylistMode.loop`.
      await player.setPlaylistMode(PlaylistMode.none);

      // `play: true` — NOT the status port's `play: false`. Some libmpv builds
      // do not decode while paused, so `waitUntilFirstFrameRendered` below
      // would time out and leave the card on its poster forever. Autoplay is
      // the required behaviour regardless (D1).
      await player.open(Media(url), play: true);

      // Two-step wait, both required to avoid the "audio plays, video blank"
      // failure mode on Android:
      //   (a) waitUntilFirstFrameRendered → the Flutter Texture is paintable.
      //   (b) state.width/height populated → `intrinsicSize` has something to
      //       hand the FittedBox. These arrive on a SEPARATE pipeline
      //       (VideoOutput.Resize) and are frequently still null when the
      //       first frame renders. Returning early here yields a 0×0 SizedBox
      //       → a black card with audio.
      // Bail after 15 s so a broken source can never stall the thread; the
      // poster simply stays up.
      await controller.waitUntilFirstFrameRendered.timeout(
        const Duration(seconds: 15),
      );
      if ((player.state.width ?? 0) == 0 || (player.state.height ?? 0) == 0) {
        await Future.wait([
          player.stream.width.firstWhere((w) => w != null && w > 0),
          player.stream.height.firstWhere((h) => h != null && h > 0),
        ]).timeout(const Duration(seconds: 5));
      }

      final s = intrinsicSize;
      debugPrint(
        '[chat-video] OK url=$url size=${s.width.toInt()}x${s.height.toInt()}',
      );
    } catch (e, st) {
      _error = true;
      debugPrint('[chat-video] FAILED url=$url error=$e');
      debugPrint('[chat-video] stack=$st');
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
    // Read state.width/height, never `state.videoParams.dw/dh` — the latter
    // stays null on Android even after the first frame renders.
    final w = p.state.width ?? 0;
    final h = p.state.height ?? 0;
    return w > 0 && h > 0;
  }

  @override
  bool get hasError => _error;

  @override
  bool get isPlaying => _player?.state.playing ?? false;

  @override
  Duration get currentPosition => isInitialized
      ? (_player?.state.position ?? Duration.zero)
      : Duration.zero;

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
    // `NoVideoControls` — the card draws its own play overlay and duration
    // badge. `fill: transparent` because this sits inside a FittedBox that
    // expects the bare texture with no letterbox band.
    return Video(
      controller: c,
      controls: NoVideoControls,
      fill: Colors.transparent,
    );
  }

  @override
  Future<void> dispose() async {
    // Disposing the Player tears the VideoController down implicitly.
    await _player?.dispose();
    _player = null;
    _controller = null;
  }
}
