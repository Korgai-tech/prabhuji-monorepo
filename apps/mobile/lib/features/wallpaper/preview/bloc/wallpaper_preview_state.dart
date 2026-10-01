import 'package:meta/meta.dart';

import '../../data/wallpaper_models.dart';

/// The reels-preview state (TAM-70). Holds the source-context feed, the active
/// index, and a per-id detail cache (detail carries the apply/live asset URLs
/// the native set needs but the list card lacks). Optimistic like/share updates
/// mutate the [items] entry in place.
@immutable
class WallpaperPreviewState {
  const WallpaperPreviewState({
    required this.items,
    required this.activeIndex,
    this.details = const {},
    this.nextCursor,
    this.loadingMore = false,
    this.errorMessage,
  });

  const WallpaperPreviewState.initial()
      : items = const [],
        activeIndex = 0,
        details = const {},
        nextCursor = null,
        loadingMore = false,
        errorMessage = null;

  final List<WallpaperCardItem> items;
  final int activeIndex;
  final Map<String, WallpaperDetailData> details;
  final String? nextCursor;
  final bool loadingMore;

  /// Transient like/share failure copy (shown then cleared).
  final String? errorMessage;

  bool get isEmpty => items.isEmpty;
  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  WallpaperCardItem? get activeItem =>
      (activeIndex >= 0 && activeIndex < items.length)
          ? items[activeIndex]
          : null;

  WallpaperDetailData? get activeDetail {
    final item = activeItem;
    return item == null ? null : details[item.id];
  }

  WallpaperPreviewState copyWith({
    List<WallpaperCardItem>? items,
    int? activeIndex,
    Map<String, WallpaperDetailData>? details,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    String? errorMessage,
    bool clearError = false,
  }) =>
      WallpaperPreviewState(
        items: items ?? this.items,
        activeIndex: activeIndex ?? this.activeIndex,
        details: details ?? this.details,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loadingMore: loadingMore ?? this.loadingMore,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );
}
