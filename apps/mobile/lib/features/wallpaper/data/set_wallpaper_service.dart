import 'package:flutter/services.dart';

import 'wallpaper_models.dart';

/// Tri-state result of a native set (PRD §6.12):
///  * [success]     — the wallpaper was applied on-device.
///  * [failed]      — a recoverable error (retry offered, no count increment).
///  * [unsupported] — the device/OS can't perform this action (exact message,
///                    no count increment).
///
/// The Dart state machine ([SetWallpaperBloc]) branches on these three; any
/// unknown channel reply is treated as [failed] (input-validation rule).
enum WallpaperSetResult {
  success,
  failed,
  unsupported;

  static WallpaperSetResult fromWire(String? value) => switch (value) {
        'success' => WallpaperSetResult.success,
        'unsupported' => WallpaperSetResult.unsupported,
        _ => WallpaperSetResult.failed,
      };
}

/// The native set-as-wallpaper seam (TAM-70 Native tasks). Interface + real
/// platform-channel impl + a `FakeSetWallpaperService` (test support), per
/// flutter-feed-screen.md ("platform-channel boundaries get an interface + a
/// fake"). The Dart-side state machine drives ONLY this interface, so it is
/// unit-testable with no Android device.
///
/// Two native paths (both return the [WallpaperSetResult] tri-state):
///  * STATIC — `WallpaperManager.setBitmap` with `FLAG_SYSTEM` (home),
///    `FLAG_LOCK` (lock) or both. Lock is API 24+; older OEMs → `unsupported`.
///  * LIVE   — Phase 1 sets a representative still frame as the HOME wallpaper
///    (the "rendered-video-as-wallpaper" fallback, spec q1). A true animated
///    `WallpaperService` is out of Phase-1 scope and deferred (see the Kotlin
///    `WallpaperPlugin` doc + the spec Evidence device-verification note).
abstract interface class SetWallpaperService {
  /// Write [imageUrl] to the chosen [target] via `WallpaperManager.setBitmap`.
  Future<WallpaperSetResult> setStaticWallpaper({
    required String imageUrl,
    required WallpaperTarget target,
  });

  /// Set a live wallpaper (home screen only, Phase-1 still-frame fallback).
  /// [frameImageUrl] is the representative still written to the home screen.
  Future<WallpaperSetResult> setLiveWallpaper({
    required String frameImageUrl,
    String? packageName,
  });
}

/// Real implementation over the `prabhuji/wallpaper` [MethodChannel]. The Kotlin
/// handler (`WallpaperPlugin.kt`) owns the `WallpaperManager` work; this class is
/// a thin, typed boundary. Not device-verified in CI (no Android emulator here)
/// — see the spec Evidence note.
class ChannelSetWallpaperService implements SetWallpaperService {
  const ChannelSetWallpaperService([this._channel = _defaultChannel]);

  static const MethodChannel _defaultChannel = MethodChannel('prabhuji/wallpaper');
  final MethodChannel _channel;

  @override
  Future<WallpaperSetResult> setStaticWallpaper({
    required String imageUrl,
    required WallpaperTarget target,
  }) async {
    final method = switch (target) {
      WallpaperTarget.home => 'setHomeStatic',
      WallpaperTarget.lock => 'setLockStatic',
      WallpaperTarget.both => 'setBoth',
    };
    try {
      final reply = await _channel.invokeMethod<String>(method, {
        'imageUrl': imageUrl,
      });
      return WallpaperSetResult.fromWire(reply);
    } on PlatformException {
      return WallpaperSetResult.failed;
    } on MissingPluginException {
      return WallpaperSetResult.unsupported;
    }
  }

  @override
  Future<WallpaperSetResult> setLiveWallpaper({
    required String frameImageUrl,
    String? packageName,
  }) async {
    try {
      final reply = await _channel.invokeMethod<String>('setLiveWallpaper', {
        'frameImageUrl': frameImageUrl,
        'packageName': packageName,
      });
      return WallpaperSetResult.fromWire(reply);
    } on PlatformException {
      return WallpaperSetResult.failed;
    } on MissingPluginException {
      return WallpaperSetResult.unsupported;
    }
  }
}
