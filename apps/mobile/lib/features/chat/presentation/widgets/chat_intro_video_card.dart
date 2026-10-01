import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../../../core/analytics.dart';
import '../../../../core/theme.dart';
import '../../../../shared/widgets/app_network_image.dart';
import '../../../../state/providers.dart';
import '../../chat_analytics.dart';
import '../../chat_providers.dart';
import '../../data/chat_video_port.dart';

/// Route observer for the chat intro video (TAM-177).
///
/// `VisibilityDetector` does NOT fire when a route is pushed OVER the chat —
/// Flutter does not re-layout occluded widgets, so the card's reported
/// visibility stays at whatever it was. This observer is the only thing that
/// notices. Registered in `GoRouter(observers: [...])`; replaces the deleted
/// `kuldevtaEntryHeroRouteObserver`, which existed for exactly this reason.
final RouteObserver<PageRoute<dynamic>> chatVideoRouteObserver =
    RouteObserver<PageRoute<dynamic>>();

/// Lets the composer / chips / "Pata Nahi" tell the video card to stop,
/// without either side knowing about the other.
///
/// The card cannot watch the composer (it has no reference to it) and the
/// composer must not reach into the card's State. A tiny notifier owned by the
/// screen is the seam. The trigger travels with the signal so the analytics
/// event can name a cause rather than guess one.
class ChatVideoPauseSignal extends ChangeNotifier {
  String? _trigger;

  /// Ask the card to pause, attributing it to [trigger] (a
  /// [ChatVideoPauseTrigger] value).
  void requestPause(String trigger) {
    _trigger = trigger;
    notifyListeners();
  }

  /// Consume the pending trigger. Returns null if nothing is pending.
  String? takeTrigger() {
    final t = _trigger;
    _trigger = null;
    return t;
  }
}

/// The portrait intro video card that sits INSIDE a chat bubble
/// (Figma `3934:14677` khoj, `3975:24000` / `3975:24001` content + gita).
///
/// Autoplays audible when the thread opens, tap toggles play/pause, and it
/// pauses on every way of leaving or of starting to answer. It never restarts
/// on its own: nothing here calls `seek()`, and [ChatVideoPort.initialize] is
/// latched, so `pause()` → `play()` always resumes in place.
///
/// The poster is the BASE layer and is never swapped out — a slow or failed
/// init simply leaves the artwork up with its play overlay and duration badge,
/// which is the universal rule across every video surface in this app.
class ChatIntroVideoCard extends ConsumerStatefulWidget {
  const ChatIntroVideoCard({
    super.key,
    required this.videoUrl,
    required this.videoId,
    required this.videoDurationMs,
    required this.agentId,
    required this.pauseSignal,
    this.posterUrl,
  });

  final String videoUrl;
  final String videoId;

  /// Total asset length, from the API — NOT read off the player, so the
  /// duration badge can render before the first frame arrives.
  final int videoDurationMs;

  final String agentId;
  final ChatVideoPauseSignal pauseSignal;
  final String? posterUrl;

  @override
  ConsumerState<ChatIntroVideoCard> createState() => _ChatIntroVideoCardState();
}

class _ChatIntroVideoCardState extends ConsumerState<ChatIntroVideoCard>
    with WidgetsBindingObserver, RouteAware {
  ChatVideoPort? _port;

  /// One-shot init guard. Without it a rebuild would re-`initialize()`, which
  /// re-opens the media and rewinds to 0:00 — the single failure mode that
  /// breaks "does not restart on its own after being paused".
  bool _initStarted = false;
  bool _ready = false;

  /// The user's explicit intent, independent of the automatic gates. A card
  /// the user paused by tapping must NOT resume just because it scrolled back
  /// into view.
  bool _userPaused = false;

  bool _visible = true;
  bool _appForeground = true;
  bool _tickerEnabled = true;

  /// Accumulated watch time across play segments. Position alone would be
  /// enough today (no seek, no loop), but accumulating is honest if either
  /// ever changes.
  int _watchedMs = 0;
  Duration _segmentStart = Duration.zero;
  bool _playing = false;

  /// The analytics seam, captured up front.
  ///
  /// [dispose] fires the `screen_exit` pause event, and by then `ref` is
  /// unusable — Riverpod throws "Using ref when a widget is about to or has
  /// been unmounted is unsafe", which in debug crashes the frame and in
  /// release silently loses the event on EVERY chat exit. Holding the
  /// provider's value in a field is the documented way to read provider state
  /// from `dispose`.
  Analytics? _analytics;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.pauseSignal.addListener(_onPauseRequested);
    // Captured here, while `ref` is still safe, so `dispose` can fire the
    // screen_exit event without touching it.
    _analytics = ref.read(analyticsProvider);
    unawaited(_sync());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // TickerMode is the ONLY signal that covers a bottom-nav tab switch over
    // an IndexedStack — VisibilityDetector stays silent there because nothing
    // re-lays-out. The home banner carousel calls this overkill for a muted
    // banner and warranted for audible playback; this video IS audible (D1),
    // so it is warranted.
    final enabled = TickerMode.valuesOf(context).enabled;
    if (enabled != _tickerEnabled) {
      _tickerEnabled = enabled;
      unawaited(_sync(pauseTrigger: ChatVideoPauseTrigger.screenExit));
    }
    final route = ModalRoute.of(context);
    if (route is PageRoute) {
      chatVideoRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    chatVideoRouteObserver.unsubscribe(this);
    widget.pauseSignal.removeListener(_onPauseRequested);
    WidgetsBinding.instance.removeObserver(this);
    // Fire the exit event before tearing the player down, while the position
    // is still readable.
    if (_playing) _firePaused(ChatVideoPauseTrigger.screenExit);
    unawaited(_port?.dispose());
    super.dispose();
  }

  // --- gates ---------------------------------------------------------------

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;
    if (foreground == _appForeground) return;
    _appForeground = foreground;
    unawaited(_sync(pauseTrigger: ChatVideoPauseTrigger.screenExit));
  }

  /// A route was pushed OVER the chat.
  @override
  void didPushNext() {
    unawaited(_sync(pauseTrigger: ChatVideoPauseTrigger.screenExit));
  }

  /// That route popped and the chat is frontmost again. Deliberately does NOT
  /// clear [_userPaused] — returning to the screen resumes only a video the
  /// user had not deliberately stopped.
  @override
  void didPopNext() {
    unawaited(_sync());
  }

  void _onPauseRequested() {
    final trigger = widget.pauseSignal.takeTrigger();
    if (trigger == null) return;
    // Starting to answer is an explicit intent, same as tapping the card: the
    // video must not spring back to life when the keyboard closes.
    _userPaused = true;
    unawaited(_sync(pauseTrigger: trigger));
  }

  void _onVisibilityChanged(VisibilityInfo info) {
    // VisibilityDetector fires a final 0-fraction callback AFTER dispose —
    // guard before touching state.
    if (!mounted) return;
    final visible = info.visibleFraction >= 0.5;
    if (visible == _visible) return;
    _visible = visible;
    unawaited(_sync(pauseTrigger: ChatVideoPauseTrigger.scrolledAway));
  }

  bool get _shouldPlay =>
      !_userPaused && _visible && _appForeground && _tickerEnabled;

  // --- the one place play/pause is decided ---------------------------------

  Future<void> _sync({String? pauseTrigger}) async {
    if (!_initStarted) {
      _initStarted = true;
      final port = ref.read(chatVideoPortFactoryProvider)();
      _port = port;
      // The real port opens with `play: true`, so playback has already begun
      // by the time this returns.
      await port.initialize(widget.videoUrl);
      if (!mounted) return;
      setState(() => _ready = port.isInitialized && !port.hasError);
      if (_ready) {
        _markStarted(ChatVideoStartTrigger.autoplay);
        // Re-check the gates: they may have changed while initialize() awaited
        // (the user can scroll or background the app during a 15s open).
        if (!_shouldPlay) {
          await port.pause();
          _firePaused(pauseTrigger ?? ChatVideoPauseTrigger.scrolledAway);
        }
      }
      return;
    }

    final port = _port;
    if (port == null || !port.isInitialized || port.hasError) return;

    if (_shouldPlay) {
      if (_playing) return;
      await port.play();
      if (!mounted) return;
      _markStarted(ChatVideoStartTrigger.userTap);
    } else {
      if (!_playing) return;
      await port.pause();
      if (!mounted) return;
      _firePaused(pauseTrigger ?? ChatVideoPauseTrigger.screenExit);
    }
    if (mounted) setState(() {});
  }

  void _onCardTapped() {
    if (!_ready) return;
    _userPaused = !_userPaused;
    unawaited(_sync(pauseTrigger: ChatVideoPauseTrigger.userTap));
  }

  // --- analytics -----------------------------------------------------------

  void _markStarted(String trigger) {
    final position = _port?.currentPosition ?? Duration.zero;
    _segmentStart = position;
    _playing = true;
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatVideoStarted,
        properties: <String, Object?>{
          ChatEventProps.agentId: widget.agentId,
          ChatEventProps.videoId: widget.videoId,
          ChatEventProps.trigger: trigger,
          ChatEventProps.positionMs: position.inMilliseconds,
          ChatEventProps.videoDurationMs: widget.videoDurationMs,
          // NO chat_type — AnalyticsEnricher stamps it globally and a
          // call-site value would override it. TAM-177 #EXPORT_CRITICAL 1.
        },
      ),
    );
  }

  void _firePaused(String trigger) {
    final position = _port?.currentPosition ?? Duration.zero;
    final delta = position - _segmentStart;
    if (delta > Duration.zero) _watchedMs += delta.inMilliseconds;
    _playing = false;
    unawaited(
      _analytics?.trackEvent(
        ChatEvents.chatVideoPaused,
        properties: <String, Object?>{
          ChatEventProps.agentId: widget.agentId,
          ChatEventProps.videoId: widget.videoId,
          ChatEventProps.trigger: trigger,
          ChatEventProps.watchedMs: _watchedMs,
          ChatEventProps.videoDurationMs: widget.videoDurationMs,
        },
      ),
    );
  }

  // --- render --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final port = _port;
    final showVideo = _ready && port != null && port.intrinsicSize.width > 0;

    return VisibilityDetector(
      key: Key('chat-intro-video-visibility-${widget.videoId}'),
      onVisibilityChanged: _onVisibilityChanged,
      child: GestureDetector(
        key: const Key('chat-intro-video-surface'),
        onTap: _onCardTapped,
        child: RepaintBoundary(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppChat.introVideoRadius),
            child: AspectRatio(
              aspectRatio: AppChat.introVideoAspectRatio,
              child: Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  // BASE LAYER — always painted, never swapped out.
                  _poster(),
                  if (showVideo)
                    // FittedBox + SizedBox(intrinsicSize): sizing the inner box
                    // to `aspectRatio × 1` would constrain the Texture to ~1
                    // logical pixel and Skia would downsample the frame into a
                    // 1×1 raster before scaling it back up.
                    FittedBox(
                      fit: BoxFit.cover,
                      child: SizedBox(
                        width: port.intrinsicSize.width,
                        height: port.intrinsicSize.height,
                        child: port.buildView(),
                      ),
                    ),
                  if (!_playing) const _PlayOverlay(),
                  _DurationBadge(durationMs: widget.videoDurationMs),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _poster() {
    final url = widget.posterUrl;
    if (url == null || url.isEmpty) {
      return const ColoredBox(color: AppColors.chatBotBubbleFill);
    }
    return AppNetworkImage(url: url, fit: BoxFit.cover);
  }
}

class _PlayOverlay extends StatelessWidget {
  const _PlayOverlay();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        key: const Key('chat-intro-video-play'),
        width: AppChat.introVideoPlayOverlay,
        height: AppChat.introVideoPlayOverlay,
        decoration: const BoxDecoration(
          color: AppColors.chatVideoPlayOverlayFill,
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.play_arrow_rounded,
          size: 32,
          color: AppColors.chatVideoPlayOverlayGlyph,
        ),
      ),
    );
  }
}

/// `0:27` plate, bottom-left (Figma `3934:14677`). The app's first video
/// duration badge — audio durations elsewhere use the same unpadded-minutes
/// shape (`download_row.dart`).
class _DurationBadge extends StatelessWidget {
  const _DurationBadge({required this.durationMs});

  final int durationMs;

  static String format(int ms) {
    final total = ms < 0 ? 0 : ms ~/ 1000;
    final m = total ~/ 60;
    final s = total % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: AppChat.introVideoBadgeInset,
      bottom: AppChat.introVideoBadgeInset,
      child: Container(
        key: const Key('chat-intro-video-duration'),
        padding: const EdgeInsets.symmetric(
          horizontal: AppChat.introVideoBadgePaddingH,
          vertical: AppChat.introVideoBadgePaddingV,
        ),
        decoration: BoxDecoration(
          color: AppColors.chatVideoBadgeFill,
          borderRadius: BorderRadius.circular(AppChat.introVideoBadgeRadius),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(
              Icons.videocam_rounded,
              size: AppChat.introVideoBadgeGlyph,
              color: AppColors.chatVideoBadgeText,
            ),
            const SizedBox(width: 4),
            Text(format(durationMs), style: AppText.chatVideoBadge()),
          ],
        ),
      ),
    );
  }
}
