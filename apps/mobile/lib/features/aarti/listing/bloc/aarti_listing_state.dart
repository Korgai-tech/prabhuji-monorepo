import 'package:meta/meta.dart';

import '../../data/aarti_models.dart';

enum AartiListingStatus { loading, loaded, empty, error }

/// Single-class listing state (keyset pagination). [items] accumulate across
/// pages; [loadingMore] gates the lazy trigger; [nextCursor] drives it.
@immutable
class AartiListingState {
  const AartiListingState({
    this.status = AartiListingStatus.loading,
    this.items = const [],
    this.nextCursor,
    this.loadingMore = false,
    this.message,
  });

  final AartiListingStatus status;
  final List<AartiAudio> items;
  final String? nextCursor;
  final bool loadingMore;
  final String? message;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  AartiListingState copyWith({
    AartiListingStatus? status,
    List<AartiAudio>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    String? message,
  }) =>
      AartiListingState(
        status: status ?? this.status,
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loadingMore: loadingMore ?? this.loadingMore,
        message: message ?? this.message,
      );
}
