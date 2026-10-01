import 'package:meta/meta.dart';

@immutable
sealed class WallpaperListEvent {
  const WallpaperListEvent();
}

/// Load the first listing page for the bloc's query.
class WallpaperListLoadRequested extends WallpaperListEvent {
  const WallpaperListLoadRequested();
}

/// Load the next page via the cursor (infinite scroll).
class WallpaperListNextPageRequested extends WallpaperListEvent {
  const WallpaperListNextPageRequested();
}

/// Retry after a first-page failure.
class WallpaperListRetryRequested extends WallpaperListEvent {
  const WallpaperListRetryRequested();
}
