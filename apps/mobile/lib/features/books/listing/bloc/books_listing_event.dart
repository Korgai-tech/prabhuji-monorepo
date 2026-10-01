import 'package:equatable/equatable.dart';

sealed class BooksListingEvent extends Equatable {
  const BooksListingEvent();

  @override
  List<Object?> get props => const [];
}

/// First page — fires `books_all_listing_viewed` / `books_category_viewed`.
class BooksListingLoadRequested extends BooksListingEvent {
  const BooksListingLoadRequested();
}

/// Next keyset page. A no-op when already loading or when the cursor is spent,
/// so an over-eager scroll listener can't double-fetch.
class BooksListingNextPageRequested extends BooksListingEvent {
  const BooksListingNextPageRequested();
}

/// Error-state retry.
class BooksListingRetried extends BooksListingEvent {
  const BooksListingRetried();
}
