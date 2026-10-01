import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/books/home/bloc/books_home_bloc.dart';
import 'package:mobile/features/books/home/bloc/books_home_event.dart';
import 'package:mobile/features/books/home/bloc/books_home_state.dart';

import '../support/fake_books_services.dart';

void main() {
  group('BooksHomeBloc', () {
    test('carries the server sections, in the server sortOrder, with the '
        "server's own titles", () async {
      final bloc = BooksHomeBloc(repository: FakeBooksRepository())
        ..add(const BooksHomeLoadRequested());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksHomeState>(
          (s) => s.status == BooksHomeStatus.ready,
        )),
      );

      // The fixture returns the sections SHUFFLED (newly_added first) — the
      // client must order them by `sortOrder`, never by array position.
      expect(
        bloc.state.sections.map((s) => s.key),
        [
          BooksSectionKey.carousel,
          BooksSectionKey.categories,
          BooksSectionKey.newlyAdded,
        ],
      );
      // Headings are the fake SERVER's copy — none of these is a string the app
      // ever hardcoded ('Books' / 'Browse Categories' / 'Newly Added Books').
      expect(
        bloc.state.sections.map((s) => s.title),
        ['Sacred Library', 'Explore by Type', 'Fresh Additions'],
      );

      final carousel = bloc.state.sections.first;
      final categories = bloc.state.sections[1];
      expect(carousel.books, hasLength(2));
      expect(categories.categories, hasLength(4));
      expect(bloc.state.sections.last.books, hasLength(1));
      expect(categories.categories.map((c) => c.category), [
        BookCategory.chalisa,
        BookCategory.aarti,
        BookCategory.kavach,
        BookCategory.stotram,
      ]);
    });

    test('sections render independently — an empty section hides its own row, '
        'the page still shows', () async {
      final all = fakeBooksSections();
      final bloc = BooksHomeBloc(
        repository: FakeBooksRepository(
          // Only the categories section has content.
          home: fakeBooksHome(
            sections: [
              BooksHomeSectionView(
                key: BooksSectionKey.carousel,
                title: 'Sacred Library',
                sortOrder: 0,
              ),
              all.firstWhere((s) => s.key == BooksSectionKey.categories),
              BooksHomeSectionView(
                key: BooksSectionKey.newlyAdded,
                title: 'Fresh Additions',
                sortOrder: 2,
              ),
            ],
          ),
        ),
      )..add(const BooksHomeLoadRequested());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksHomeState>(
          (s) => s.status == BooksHomeStatus.ready,
        )),
      );

      // The two empty sections dropped out; the page still renders the third.
      expect(
        bloc.state.sections.map((s) => s.key),
        [BooksSectionKey.categories],
      );
    });

    test('every section empty → the empty state, not a failure', () async {
      final bloc = BooksHomeBloc(
        repository: FakeBooksRepository(
          home: fakeBooksHome(sections: const []),
        ),
      )..add(const BooksHomeLoadRequested());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksHomeState>(
          (s) => s.status == BooksHomeStatus.empty,
        )),
      );
    });

    test('offline failure flags `offline` so the copy can differ', () async {
      final bloc = BooksHomeBloc(
        repository: FakeBooksRepository(failHomeWith: BooksErrorKind.offline),
      )..add(const BooksHomeLoadRequested());
      addTearDown(bloc.close);

      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksHomeState>(
          (s) => s.status == BooksHomeStatus.failure && s.offline,
        )),
      );
    });

    test('retry re-fetches (Books analytics is out of scope; only repo calls asserted)', () async {
      final repo = FakeBooksRepository();
      final bloc = BooksHomeBloc(repository: repo)
        ..add(const BooksHomeLoadRequested());
      addTearDown(bloc.close);
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksHomeState>(
          (s) => s.status == BooksHomeStatus.ready,
        )),
      );

      bloc.add(const BooksHomeRetried());
      await expectLater(
        bloc.stream,
        emitsThrough(predicate<BooksHomeState>(
          (s) => s.status == BooksHomeStatus.ready,
        )),
      );

      expect(repo.homeCalls, 2);
    });

    // Books analytics coverage was dropped when Books tracking was removed
    // from the analytics contract (Sheet 1 has zero Books events). The bloc
    // no longer emits any events; asserting event order/absence would just
    // be asserting the fake analytics is quiet.
  });
}
