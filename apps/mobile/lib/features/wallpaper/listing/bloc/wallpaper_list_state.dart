import 'package:meta/meta.dart';

import '../../data/wallpaper_models.dart';

enum WallpaperListStatus { loading, loaded, empty, error }

/// Single-class listing state with cursor pagination. [items] accumulate across
/// pages for the bloc's fixed query.
@immutable
class WallpaperListState {
  const WallpaperListState({
    this.status = WallpaperListStatus.loading,
    this.items = const [],
    this.nextCursor,
    this.loadingMore = false,
    this.message,
  });

  final WallpaperListStatus status;
  final List<WallpaperCardItem> items;
  final String? nextCursor;
  final bool loadingMore;
  final String? message;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  WallpaperListState copyWith({
    WallpaperListStatus? status,
    List<WallpaperCardItem>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    String? message,
  }) =>
      WallpaperListState(
        status: status ?? this.status,
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loadingMore: loadingMore ?? this.loadingMore,
        message: message ?? this.message,
      );
}
