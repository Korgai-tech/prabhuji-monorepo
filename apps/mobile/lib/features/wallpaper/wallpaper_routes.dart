import 'package:meta/meta.dart';

import 'data/wallpaper_models.dart';

/// go_router paths for the Wallpaper module (TAM-70). The module opens
/// full-screen OVER the shell (its own back-nav, no bottom tabs), like
/// `/paywall`, Aarti, Mantras and Ringtone.
class WallpaperRoutes {
  WallpaperRoutes._();

  /// Module entry — the deity filter + CMS rows Home.
  static const String home = '/wallpaper';

  /// Deity/row listing — the [WallpaperListQuery] rides as `extra`.
  static const String list = '/wallpaper/list';

  /// Full-screen reels preview — the [WallpaperPreviewArgs] ride as `extra`.
  static const String preview = '/wallpaper/preview';
}

/// The query that seeds the Listing screen (2-col grid). Exactly one of
/// [deityId] / [rowId] filters the feed; [title] is the dynamic heading
/// (e.g. "Durga Ma Wallpapers" or a row title like "Trending Wallpaper").
@immutable
class WallpaperListQuery {
  const WallpaperListQuery({
    required this.title,
    this.deityId,
    this.rowId,
    this.sourceContext = 'listing',
  });

  final String title;
  final String? deityId;
  final String? rowId;

  /// Analytics `source_context` carried into the preview (deity / row / all).
  final String sourceContext;
}

/// Route extra for the reels Preview. Carries the ORIGINATING list + start index
/// so vertical swipe continues that exact source context (PRD §6.8), plus the
/// pagination cursor + query needed to load more of the same feed.
@immutable
class WallpaperPreviewArgs {
  const WallpaperPreviewArgs({
    required this.items,
    required this.startIndex,
    this.query,
    this.nextCursor,
    this.sourceContext = 'row',
  });

  /// The already-loaded feed the preview opens over (its source context).
  final List<WallpaperCardItem> items;

  /// Index of the tapped card within [items].
  final int startIndex;

  /// The list query that produced [items] — used to paginate the same feed as
  /// the user swipes. `null` == a standalone seed (no further pagination).
  final WallpaperListQuery? query;

  /// The cursor to fetch the next page of [query]; `null` == no more.
  final String? nextCursor;

  /// Analytics `source_context` (row / deity_grid / all_feed).
  final String sourceContext;
}
