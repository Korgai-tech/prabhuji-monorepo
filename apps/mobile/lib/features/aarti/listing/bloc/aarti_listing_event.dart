import 'package:meta/meta.dart';

@immutable
sealed class AartiListingEvent {
  const AartiListingEvent();
}

/// Load the first page for the screen's [AartiListQuery].
class AartiListingLoadRequested extends AartiListingEvent {
  const AartiListingLoadRequested();
}

/// Load the next page via `nextCursor` (lazy pagination). No-op when there is no
/// more or a page is already in flight.
class AartiListingNextPageRequested extends AartiListingEvent {
  const AartiListingNextPageRequested();
}

/// Retry after a first-page failure.
class AartiListingRetryRequested extends AartiListingEvent {
  const AartiListingRetryRequested();
}
