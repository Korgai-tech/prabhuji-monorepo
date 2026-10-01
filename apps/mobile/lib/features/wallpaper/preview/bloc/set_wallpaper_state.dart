import 'package:meta/meta.dart';

import '../../data/wallpaper_models.dart';

/// The native set state machine (TAM-70 §6.6/§6.12):
/// `idle → [awaitingPaywall] → setting → success | failed | unsupported`, with a
/// `cancelled` branch when a free user dismisses the paywall without buying (the
/// preview + Set CTA stay visible). Modeled explicitly because the paywall gate
/// + tri-state native result is the most error-prone piece (#PATH_DECISION).
enum SetWallpaperStatus {
  idle,
  awaitingPaywall,
  setting,
  success,
  failed,
  unsupported,
  cancelled,
}

@immutable
class SetWallpaperState {
  const SetWallpaperState({
    this.status = SetWallpaperStatus.idle,
    this.message,
    this.setCount,
    this.wallpaperId,
    this.target,
  });

  final SetWallpaperStatus status;

  /// User-facing copy for the [failed]/[unsupported] states.
  final String? message;

  /// Server-authoritative set count after a confirmed success (updates the
  /// preview's "Wallpaper set N TIMES" line).
  final int? setCount;

  /// The wallpaper the success/count applies to.
  final String? wallpaperId;
  final WallpaperTarget? target;

  static const String unsupportedCopy =
      'This device does not support this wallpaper action.';
  static const String failedCopy =
      "Couldn't set wallpaper. Please try again.";
  static const String successCopy = 'Wallpaper set';

  bool get isBusy =>
      status == SetWallpaperStatus.awaitingPaywall ||
      status == SetWallpaperStatus.setting;
}
