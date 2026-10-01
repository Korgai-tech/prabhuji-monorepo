import 'package:meta/meta.dart';

import '../../data/mantras_models.dart';

enum MantrasListingStatus { loading, loaded, empty, error }

/// Single-class listing state (keyset pagination). [items] accumulate across
/// pages; [loadingMore] gates the lazy trigger; [nextCursor] drives it.
@immutable
class MantrasListingState {
  const MantrasListingState({
    this.status = MantrasListingStatus.loading,
    this.items = const [],
    this.nextCursor,
    this.loadingMore = false,
    this.message,
  });

  final MantrasListingStatus status;
  final List<MantraAudio> items;
  final String? nextCursor;
  final bool loadingMore;
  final String? message;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  MantrasListingState copyWith({
    MantrasListingStatus? status,
    List<MantraAudio>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    String? message,
  }) =>
      MantrasListingState(
        status: status ?? this.status,
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        loadingMore: loadingMore ?? this.loadingMore,
        message: message ?? this.message,
      );
}
