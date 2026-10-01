import 'package:meta/meta.dart';

import '../../data/ringtone_models.dart';

enum RingtoneSearchStatus { idle, loading, loaded, empty, error }

/// Single-class search state. [query] echoes into the field + heading;
/// [resultCount] is server-authoritative; [empty] → "No results found".
@immutable
class RingtoneSearchState {
  const RingtoneSearchState({
    this.status = RingtoneSearchStatus.idle,
    this.query = '',
    this.items = const [],
    this.nextCursor,
    this.resultCount = 0,
    this.loadingMore = false,
  });

  final RingtoneSearchStatus status;
  final String query;
  final List<RingtoneCardItem> items;
  final String? nextCursor;
  final int resultCount;
  final bool loadingMore;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  RingtoneSearchState copyWith({
    RingtoneSearchStatus? status,
    String? query,
    List<RingtoneCardItem>? items,
    String? nextCursor,
    bool clearCursor = false,
    int? resultCount,
    bool? loadingMore,
  }) =>
      RingtoneSearchState(
        status: status ?? this.status,
        query: query ?? this.query,
        items: items ?? this.items,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        resultCount: resultCount ?? this.resultCount,
        loadingMore: loadingMore ?? this.loadingMore,
      );
}
