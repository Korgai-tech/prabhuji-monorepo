import 'package:flutter/material.dart';
import 'package:mobile/features/chat/data/chat_video_port.dart';

/// Deterministic [ChatVideoPort] fake (TAM-177) — lets the in-thread intro
/// video card be widget-tested (autoplay, tap-to-toggle, the four auto-pause
/// triggers, the null-video path) with no real codec or network.
///
/// `MediaKit.ensureInitialized()` only runs in `main()`, so constructing a real
/// `Player()` under `flutter test` throws synchronously. This fake is what
/// makes every intro-card test possible.
///
/// Hand-rolled, not mockito — repo convention (`apps/mobile/CLAUDE.md`).
class FakeChatVideoPort implements ChatVideoPort {
  FakeChatVideoPort({
    this.failInit = false,
    this.position = Duration.zero,
    this.size = const Size(832, 1088), // the real Content_Chat.mp4 dimensions
  });

  /// Simulates an unavailable video so the card must fall back to its poster.
  final bool failInit;

  /// Injected position — tests set this to simulate a video that has been
  /// playing for N ms when a pause trigger fires, and assert `watched_ms`.
  Duration position;

  final Size size;

  bool _initialized = false;
  bool _error = false;
  bool _playing = false;

  /// Every URL [initialize] was called with. Length > 1 means a re-init leaked
  /// through the caller's latch — which would rewind the video and break the
  /// "never restarts after pause" guarantee.
  final List<String> initializeCalls = <String>[];

  int playCalls = 0;
  int pauseCalls = 0;
  bool disposed = false;

  @override
  Future<void> initialize(String url) async {
    initializeCalls.add(url);
    if (failInit) {
      _error = true;
      return;
    }
    _initialized = true;
    // The real port opens with `play: true`.
    _playing = true;
  }

  @override
  Future<void> play() async {
    playCalls++;
    _playing = true;
  }

  @override
  Future<void> pause() async {
    pauseCalls++;
    _playing = false;
  }

  @override
  bool get isInitialized => _initialized;

  @override
  bool get hasError => _error;

  @override
  bool get isPlaying => _playing;

  @override
  Duration get currentPosition => position;

  @override
  Size get intrinsicSize => _initialized ? size : Size.zero;

  @override
  Widget buildView() => const ColoredBox(
    key: Key('fake-chat-video-view'),
    color: Color(0xFF102030),
  );

  @override
  Future<void> dispose() async => disposed = true;
}
