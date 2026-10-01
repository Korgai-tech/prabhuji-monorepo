import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_bloc.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_event.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_state.dart';

import '../support/fake_books_services.dart';

Future<void> _ready(BooksListingBloc bloc) => expectLater(
      bloc.stream,
      emitsThrough(predicate<BooksListingState>(
        (s) => s.status == BooksListingStatus.ready,
      )),
    );

void main() {
  group('BooksListingBloc — all books', () {
    test("the heading comes from the response, not the client", () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(allBooksTitle: 'Every Sacred Text'),
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);

      // Nothing to render a title from until the server answers — the client has
      // no 'All Books' constant to fall back on any more.
      expect(bloc.state.title, isNull);

      await _ready(bloc);
      expect(bloc.state.title, 'Every Sacred Text');
    });

    test('loads the first keyset page and keeps the cursor', () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(),
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(bloc.state.items, hasLength(4)); // pageSize
      expect(bloc.state.hasMore, isTrue);
      expect(bloc.state.nextCursor, '4');
    });

    test('next page APPENDS rather than replaces', () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(),
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);
      await _ready(bloc);

      bloc.add(const BooksListingNextPageRequested());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksListingState>(
          (s) => s.items.length == 8 && !s.loadingMore,
        )),
      );
      expect(bloc.state.items.first.contentId, 'major-1'); // page 1 intact
      expect(bloc.state.hasMore, isTrue);
    });

    test('paginates to exhaustion — cursor clears on the last page', () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(),
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);
      await _ready(bloc);

      bloc.add(const BooksListingNextPageRequested());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksListingState>((s) => s.items.length == 8)),
      );
      bloc.add(const BooksListingNextPageRequested());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksListingState>((s) => s.items.length == 10)),
      );

      expect(bloc.state.hasMore, isFalse);
      expect(bloc.state.nextCursor, isNull);
    });

    test('next page is a no-op once the cursor is spent', () async {
      final repo = FakeBooksRepository(pageSize: 20); // everything in page 1
      final bloc = BooksListingBloc(
        repository: repo,
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);
      await _ready(bloc);
      expect(bloc.state.hasMore, isFalse);

      bloc.add(const BooksListingNextPageRequested());
      await Future<void>.delayed(Duration.zero);

      expect(repo.listingCalls, 1); // no second fetch
    });

    test('a failed NEXT page keeps the pages already on screen', () async {
      final bloc = BooksListingBloc(
        repository: _FailOnSecondPage(),
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);
      await _ready(bloc);
      expect(bloc.state.items, hasLength(4));

      bloc.add(const BooksListingNextPageRequested());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksListingState>((s) => !s.loadingMore)),
      );

      expect(bloc.state.items, hasLength(4)); // preserved
      expect(bloc.state.status, BooksListingStatus.ready);
    });

    // The analytics-only test that fired `books_all_listing_viewed` was
    // dropped when Books tracking left the contract (Sheet 1 has zero
    // Books events).
  });

  group('BooksListingBloc — category', () {
    test('fetches only that category and titles from the server response',
        () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(),
        query: const BookListQuery(category: BookCategory.chalisa),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);
      await _ready(bloc);

      expect(
        bloc.state.items.every((b) => b.category == BookCategory.chalisa),
        isTrue,
      );
      // The heading is the SERVER's, not the enum's wire value ('Chalisa') that
      // the client used to paint into the nav bar.
      expect(bloc.state.title, 'Chalisa Collection');
    });

    test('empty category → the empty state', () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(allBooks: const []),
        query: const BookListQuery(category: BookCategory.aarti),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksListingState>(
          (s) => s.status == BooksListingStatus.empty,
        )),
      );
    });

    test('offline failure flags `offline`', () async {
      final bloc = BooksListingBloc(
        repository: FakeBooksRepository(failListingWith: BooksErrorKind.offline),
        query: const BookListQuery(),
      )..add(const BooksListingLoadRequested());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksListingState>(
          (s) => s.status == BooksListingStatus.failure && s.offline,
        )),
      );
    });
  });
}

/// Page 1 succeeds, page 2 throws — the "keep what's on screen" path.
class _FailOnSecondPage extends FakeBooksRepository {
  @override
  Future<BookListPage> fetchAll({String? cursor, int limit = 20}) {
    if (cursor != null) throw const BooksException(BooksErrorKind.unknown);
    return super.fetchAll(cursor: cursor, limit: limit);
  }
}
