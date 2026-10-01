import 'package:flutter/material.dart';
import 'package:mobile/features/wallpaper/preview/wallpaper_video_port.dart';

/// Deterministic [WallpaperVideoPort] fake (TAM-70) — lets the reels PageView
/// widget-test the live page (init/play/pause, muted, one active at a time) with
/// no real codec/network. [failInit] simulates an unavailable video so the page
/// falls back to the static still.
class FakeWallpaperVideoPort implements WallpaperVideoPort {
  FakeWallpaperVideoPort({
    this.failInit = false,
    this.position = Duration.zero,
  });

  final bool failInit;

  /// Injected position — tests set this to simulate a live page that has
  /// been playing for N seconds when the user taps Back.
  Duration position;

  bool _initialized = false;
  bool _error = false;
  int playCalls = 0;
  int pauseCalls = 0;
  bool disposed = false;

  @override
  Future<void> initialize(String url) async {
    if (failInit) {
      _error = true;
      return;
    }
    _initialized = true;
  }

  @override
  Future<void> play() async => playCalls++;

  @override
  Future<void> pause() async => pauseCalls++;

  @override
  bool get isInitialized => _initialized;

  @override
  bool get hasError => _error;

  @override
  double get aspectRatio => 0.5625; // 9:16 portrait

  @override
  Size get intrinsicSize => const Size(1080, 1920); // matches 9:16 portrait

  @override
  Duration get currentPosition => position;

  @override
  Widget buildView() => const ColoredBox(
        key: Key('fake-video-view'),
        color: Color(0xFF102030),
      );

  @override
  Future<void> dispose() async => disposed = true;
}
