import 'package:meta/meta.dart';

@immutable
sealed class RingtoneSearchEvent {
  const RingtoneSearchEvent();
}

/// Submit a new [query] (`GET /ringtones/search?q=`). An empty query yields the
/// empty-query state (the caller keeps the unfiltered home list).
class RingtoneSearchSubmitted extends RingtoneSearchEvent {
  const RingtoneSearchSubmitted(this.query);
  final String query;
}

/// Load the next results page via `nextCursor` (lazy pagination).
class RingtoneSearchNextPageRequested extends RingtoneSearchEvent {
  const RingtoneSearchNextPageRequested();
}

/// Retry after a search failure (re-runs the current query).
class RingtoneSearchRetryRequested extends RingtoneSearchEvent {
  const RingtoneSearchRetryRequested();
}
