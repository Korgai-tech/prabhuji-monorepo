import 'package:meta/meta.dart';

@immutable
sealed class WallpaperHomeEvent {
  const WallpaperHomeEvent();
}

/// Load the home rows (All Gods, no filter). Fired on module entry.
class WallpaperHomeLoadRequested extends WallpaperHomeEvent {
  const WallpaperHomeLoadRequested();
}

/// A deity chip was tapped — re-fetch the home rows filtered by [deityId]
/// (`null` for All Gods). Filters IN-PLACE (the home endpoint accepts deityId);
/// never leaves the screen, never triggers the paywall.
class WallpaperHomeDeitySelected extends WallpaperHomeEvent {
  const WallpaperHomeDeitySelected({this.deityId, this.deityName});
  final String? deityId;
  final String? deityName;
}

/// Retry after a total home-load failure.
class WallpaperHomeRetryRequested extends WallpaperHomeEvent {
  const WallpaperHomeRetryRequested();
}

/// A CMS row crossed the visibility threshold (≥50% on screen). Raised by the
/// row widget's `VisibilityDetector`; the bloc dedups per load so a row
/// scrolled away and back never re-counts (the widget is rebuilt when it leaves
/// the ListView cache extent, so a widget-local guard would not hold).
///
/// [rowName] + [positionIndex] + [itemCount] feed Sheet 1 row 129's
/// `wallpaper_row_viewed` — they live on the event (not derived here) so the
/// widget hands the bloc the snapshot it saw at threshold-cross time.
class WallpaperHomeRowViewed extends WallpaperHomeEvent {
  const WallpaperHomeRowViewed({
    required this.rowId,
    required this.rowType,
    required this.rowName,
    required this.positionIndex,
    required this.itemCount,
  });
  final String rowId;
  final String rowType;
  final String rowName;
  final int positionIndex;
  final int itemCount;
}
