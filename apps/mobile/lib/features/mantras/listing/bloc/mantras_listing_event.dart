import 'package:meta/meta.dart';

@immutable
sealed class MantrasListingEvent {
  const MantrasListingEvent();
}

/// Load the first page for the screen's [MantraListQuery].
class MantrasListingLoadRequested extends MantrasListingEvent {
  const MantrasListingLoadRequested();
}

/// Load the next page via `nextCursor` (lazy pagination). No-op when there is no
/// more or a page is already in flight.
class MantrasListingNextPageRequested extends MantrasListingEvent {
  const MantrasListingNextPageRequested();
}

/// Retry after a first-page failure.
class MantrasListingRetryRequested extends MantrasListingEvent {
  const MantrasListingRetryRequested();
}
