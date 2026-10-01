import 'package:equatable/equatable.dart';

import '../../data/books_models.dart';

enum BooksListingStatus { loading, ready, empty, failure }

/// State of the 2-column listing (Figma 562:5565) — reused for All Books and
/// each of the four category listings. FREE: no lock badges, gate on tap.
class BooksListingState extends Equatable {
  const BooksListingState({
    this.status = BooksListingStatus.loading,
    this.title,
    this.items = const [],
    this.nextCursor,
    this.loadingMore = false,
    this.offline = false,
  });

  final BooksListingStatus status;

  /// The server's heading for this listing (`BookListPage.title`), or `null`
  /// before the first page lands. The screen falls back to the route's
  /// server-sourced hint — never to a hardcoded word.
  final String? title;

  final List<BookCardView> items;

  /// `null`/empty ⇒ every page has been loaded.
  final String? nextCursor;

  /// A page-2+ fetch is in flight — renders the footer spinner, NOT the
  /// full-page skeleton (which would throw away the user's scroll).
  final bool loadingMore;

  final bool offline;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  BooksListingState copyWith({
    BooksListingStatus? status,
    String? title,
    List<BookCardView>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    bool? offline,
  }) {
    return BooksListingState(
      status: status ?? this.status,
      title: title ?? this.title,
      items: items ?? this.items,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      loadingMore: loadingMore ?? this.loadingMore,
      offline: offline ?? this.offline,
    );
  }

  @override
  List<Object?> get props =>
      [status, title, items, nextCursor, loadingMore, offline];
}
