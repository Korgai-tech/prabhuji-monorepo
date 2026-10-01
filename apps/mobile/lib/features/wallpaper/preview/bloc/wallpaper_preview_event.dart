import 'package:meta/meta.dart';

import '../../wallpaper_routes.dart';

@immutable
sealed class WallpaperPreviewEvent {
  const WallpaperPreviewEvent();
}

/// Seed the preview feed from the originating list + start index (PRD §6.8) and
/// resolve the first page's detail.
class WallpaperPreviewStarted extends WallpaperPreviewEvent {
  const WallpaperPreviewStarted(this.args);
  final WallpaperPreviewArgs args;
}

/// The active reels page changed to [index] — resolve its detail, paginate the
/// source feed when nearing the end, and fire the swipe event.
class WallpaperPreviewIndexChanged extends WallpaperPreviewEvent {
  const WallpaperPreviewIndexChanged(this.index);
  final int index;
}

/// Toggle like on the active wallpaper (optimistic; revert on failure).
class WallpaperPreviewLikeToggled extends WallpaperPreviewEvent {
  const WallpaperPreviewLikeToggled();
}

/// Share the active wallpaper (deep link + thumbnail; increments share count).
class WallpaperPreviewShareRequested extends WallpaperPreviewEvent {
  const WallpaperPreviewShareRequested();
}

/// A confirmed native set updated the server set count for [wallpaperId].
class WallpaperPreviewSetCountUpdated extends WallpaperPreviewEvent {
  const WallpaperPreviewSetCountUpdated({
    required this.wallpaperId,
    required this.setCount,
  });
  final String wallpaperId;
  final int setCount;
}

/// Clear a transient like/share error banner.
class WallpaperPreviewErrorCleared extends WallpaperPreviewEvent {
  const WallpaperPreviewErrorCleared();
}
