import 'package:meta/meta.dart';

import '../../data/wallpaper_models.dart';

@immutable
sealed class SetWallpaperEvent {
  const SetWallpaperEvent();
}

/// The user tapped a Set action. Static wallpapers offer home / lock / both via
/// [target]; live wallpapers are home-screen only (PRD §6.7). [imageUrl] is the
/// full-res apply asset (static); [liveFrameUrl] the representative frame (live).
class SetWallpaperRequested extends SetWallpaperEvent {
  const SetWallpaperRequested({
    required this.wallpaperId,
    required this.mediaType,
    required this.target,
    required this.imageUrl,
    this.deitySlug,
    this.liveFrameUrl,
    this.livePackage,
  });

  final String wallpaperId;
  final WallpaperMediaType mediaType;
  final WallpaperTarget target;

  /// The slug of the deity this wallpaper belongs to (`deities.slug`), carried
  /// so `set_wallpaper_result` can be grouped by deity. `null` when the entry
  /// point has no deity on hand (e.g. the Home feed row, whose contract is
  /// module-agnostic).
  final String? deitySlug;

  /// The image written for a STATIC set (full-res apply asset).
  final String imageUrl;

  /// The still frame written for a LIVE set (Phase-1 fallback).
  final String? liveFrameUrl;
  final String? livePackage;
}
