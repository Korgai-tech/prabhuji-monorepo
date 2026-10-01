import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/books/data/offline_text_cache.dart';
import 'package:mobile/features/books/data/reader_font_prefs.dart';
import 'package:mobile/features/books/contents/bloc/book_contents_bloc.dart';
import 'package:mobile/features/books/contents/bloc/book_contents_event.dart';
import 'package:mobile/features/books/contents/presentation/book_contents_screen.dart';
import 'package:mobile/features/books/presentation/books_widgets.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_bloc.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_event.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_state.dart';
import 'package:mobile/features/books/reader/presentation/book_reader_screen.dart';

import '../support/books_harness.dart';
import '../support/fake_books_services.dart';

Future<void> _pumpReader(
  WidgetTester tester, {
  required BookReaderMode mode,
  FakeBooksRepository? repository,
  OfflineTextCache? cache,
  ReaderFontPrefs? fontPrefs,
  FakeBookReaderAudioPort? audio,
  String? initialChapterId,
  bool seedContents = true,
}) async {
  booksViewport(tester);
  final repo = repository ?? FakeBooksRepository();
  final bloc = BookReaderBloc(
    repository: repo,
    cache: cache ?? InMemoryOfflineTextCache(),
    fontPrefs: fontPrefs ?? InMemoryReaderFontPrefs(),
    contentId: mode == BookReaderMode.majorBook ? 'major-1' : 'chalisa-1',
    mode: mode,
    audio: mode == BookReaderMode.majorBook
        ? (audio ?? FakeBookReaderAudioPort())
        : null,
    contents: mode == BookReaderMode.majorBook && seedContents
        ? fakeBookContents()
        : null,
    initialChapterId: initialChapterId,
  )..add(const BookReaderStarted());
  addTearDown(bloc.close);

  await tester.pumpWidget(booksTestApp(
    repository: repo,
    child: BlocProvider<BookReaderBloc>.value(
      value: bloc,
      child: const BookReaderScreen(bookTitle: 'Valmiki Ramayan'),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  group('Books Home (534:5061)', () {
    testWidgets('renders the server sections with the server headings',
        (tester) async {
      booksViewport(tester);
      await tester.pumpWidget(booksRouterApp(
        repository: FakeBooksRepository(),
        router: buildBooksTestRouter(repository: FakeBooksRepository()),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('books-home-carousel-section')),
          findsOneWidget);
      expect(find.byKey(const ValueKey('books-home-categories-section')),
          findsOneWidget);
      expect(find.byKey(const ValueKey('books-home-newly-added-section')),
          findsOneWidget);

      // The fake server's headings — none of these is a string the app has ever
      // contained, so finding them proves the copy came off the wire.
      expect(find.text('Sacred Library'), findsWidgets);
      expect(find.text('Explore by Type'), findsOneWidget);
      expect(find.text('Fresh Additions'), findsOneWidget);

      // …and the copy the client used to hardcode is nowhere on screen.
      expect(find.text('Browse Categories'), findsNothing);
      expect(find.text('Newly Added Books'), findsNothing);
    });

    testWidgets('a CMS reword changes the headings with no app change',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository(
        home: fakeBooksHome(
          sections: fakeBooksSections(
            carouselTitle: 'Granth Sangrah',
            categoriesTitle: 'Shreniyan',
            newlyAddedTitle: 'Naye Granth',
          ),
        ),
      );
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Shreniyan'), findsOneWidget);
      expect(find.text('Naye Granth'), findsOneWidget);
      expect(find.text('Granth Sangrah'), findsWidgets);
    });

    testWidgets('sections render in the server sortOrder, not wire order',
        (tester) async {
      booksViewport(tester);
      await tester.pumpWidget(booksRouterApp(
        repository: FakeBooksRepository(),
        router: buildBooksTestRouter(repository: FakeBooksRepository()),
      ));
      await tester.pumpAndSettle();

      // The fixture hands over newly_added FIRST; sortOrder must win.
      final carouselY = tester
          .getTopLeft(find.byKey(const ValueKey('books-home-carousel-section')))
          .dy;
      final categoriesY = tester
          .getTopLeft(
              find.byKey(const ValueKey('books-home-categories-section')))
          .dy;
      final newlyY = tester
          .getTopLeft(
              find.byKey(const ValueKey('books-home-newly-added-section')))
          .dy;

      expect(carouselY, lessThan(categoriesY));
      expect(categoriesY, lessThan(newlyY));
    });

    testWidgets('renders the four category cards', (tester) async {
      booksViewport(tester);
      await tester.pumpWidget(booksRouterApp(
        repository: FakeBooksRepository(),
        router: buildBooksTestRouter(repository: FakeBooksRepository()),
      ));
      await tester.pumpAndSettle();

      for (final slug in ['Chalisa', 'Aarti', 'Kavach', 'Stotram']) {
        expect(find.byKey(ValueKey('books-category-$slug')), findsOneWidget);
      }
    });

    testWidgets('the nav renders NO back arrow — Books Home is a root tab '
        '(documented intentional divergence)', (tester) async {
      booksViewport(tester);
      await tester.pumpWidget(booksRouterApp(
        repository: FakeBooksRepository(),
        router: buildBooksTestRouter(repository: FakeBooksRepository()),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('books-home-nav')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-nav-back')), findsNothing);
    });

    testWidgets('error state offers Retry', (tester) async {
      booksViewport(tester);
      await tester.pumpWidget(booksRouterApp(
        repository: FakeBooksRepository(failHomeWith: BooksErrorKind.unknown),
        router: buildBooksTestRouter(
          repository: FakeBooksRepository(failHomeWith: BooksErrorKind.unknown),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('books-home-error')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-home-retry')), findsOneWidget);
    });
  });

  group('Listings (562:5565)', () {
    testWidgets('All Books renders a 2-COLUMN grid', (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-home-show-all')));
      await tester.pumpAndSettle();

      final grid = tester.widget<GridView>(
        find.byKey(const ValueKey('books-listing-grid')),
      );
      final delegate =
          grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
      expect(delegate.crossAxisCount, 2);
      // The heading is the fake SERVER's `data.title`; 'All Books' was the
      // client's own string and must not appear anywhere.
      expect(find.text('Every Sacred Text'), findsOneWidget);
      expect(find.text('All Books'), findsNothing);
    });

    testWidgets('a category card opens that category listing', (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-category-Chalisa')));
      await tester.pumpAndSettle();

      final grid = tester.widget<GridView>(
        find.byKey(const ValueKey('books-listing-grid')),
      );
      expect(
        (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
            .crossAxisCount,
        2,
      );
      // Chalisa fixtures = 5 items, page size 4 → page 1 shows 4.
      expect(find.byKey(const ValueKey('books-card-chalisa-1')), findsOneWidget);
      // The nav shows the SERVER's heading for the category, not the enum's wire
      // value ('Chalisa') that the client used to render as a title.
      expect(find.text('Chalisa Collection'), findsOneWidget);
    });

    testWidgets('scrolling to the end loads the next cursor page',
        (tester) async {
      // Short viewport so page 1 (2 rows ≈ 560px) actually overflows and can be
      // scrolled — on a tall surface there is nothing to scroll and the
      // prefetch listener never fires.
      booksViewport(tester, height: 500);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('books-home-show-all')));
      await tester.pumpAndSettle();
      expect(repo.listingCalls, 1);

      await tester.drag(
        find.byKey(const ValueKey('books-listing-grid')),
        const Offset(0, -1200),
      );
      await tester.pumpAndSettle();

      expect(repo.listingCalls, greaterThan(1));
    });
  });

  group('Pro gating (r3/r4: unified paywall directly)', () {
    testWidgets('FREE user tapping a major book lands on the paywall',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
        isPro: false,
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-card-major-1')));
      await tester.pumpAndSettle();

      expect(find.text('stub-paywall'), findsOneWidget);
      expect(find.text('stub-contents'), findsNothing);
    });

    testWidgets('FREE user tapping a direct scripture ALSO gets the paywall',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
        isPro: false,
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-card-chalisa-1')));
      await tester.pumpAndSettle();

      expect(find.text('stub-paywall'), findsOneWidget);
      expect(find.text('stub-scripture'), findsNothing);
    });

    testWidgets('PRO user tapping a major book goes straight to Contents',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-card-major-1')));
      await tester.pumpAndSettle();

      expect(find.text('stub-contents'), findsOneWidget);
      expect(find.text('stub-paywall'), findsNothing);
    });

    testWidgets('PRO user tapping a direct scripture opens the reader',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-card-chalisa-1')));
      await tester.pumpAndSettle();

      expect(find.text('stub-scripture'), findsOneWidget);
    });

    testWidgets('post-purchase RESUME opens the originally-tapped book',
        (tester) async {
      booksViewport(tester);
      SeededBooksEntitlement.nextRefreshGrantsPro = true;
      addTearDown(() => SeededBooksEntitlement.nextRefreshGrantsPro = false);

      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
        isPro: false,
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const ValueKey('books-card-major-1')));
      await tester.pumpAndSettle();
      expect(find.text('stub-paywall'), findsOneWidget);

      // Dismiss the paywall — the purchase flipped the live entitlement, so the
      // gate resumes into the tapped book's Contents.
      Navigator.of(tester.element(find.text('stub-paywall'))).pop();
      await tester.pumpAndSettle();

      expect(find.text('stub-contents'), findsOneWidget);
    });

    testWidgets('discovery shows NO lock badges for a free user',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      await tester.pumpWidget(booksRouterApp(
        repository: repo,
        router: buildBooksTestRouter(repository: repo),
        isPro: false,
      ));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.lock), findsNothing);
      expect(find.byIcon(Icons.lock_outline), findsNothing);
      expect(find.textContaining('Pro'), findsNothing);
      expect(find.byKey(const ValueKey('books-card-major-1')), findsOneWidget);
    });
  });

  group('Book Contents (639:3947)', () {
    testWidgets('renders the kanda list with chapter counts', (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository();
      final bloc = BookContentsBloc(repository: repo, contentId: 'major-1')
        ..add(const BookContentsLoadRequested());
      addTearDown(bloc.close);

      await tester.pumpWidget(booksTestApp(
        repository: repo,
        child: BlocProvider<BookContentsBloc>.value(
          value: bloc,
          child: const BookContentsScreen(card: null),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('books-subbook-kanda-1')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-subbook-kanda-2')), findsOneWidget);
      expect(find.text('1. बाल-काण्ड'), findsOneWidget);
      expect(find.text('2 chapters'), findsNWidgets(2));
      expect(find.byKey(const ValueKey('books-contents-start-reading')),
          findsOneWidget);
    });

    testWidgets('a book with NO sub-books renders its loose chapters',
        (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository(contents: fakeLooseChapterContents());
      final bloc = BookContentsBloc(repository: repo, contentId: 'major-2')
        ..add(const BookContentsLoadRequested());
      addTearDown(bloc.close);

      await tester.pumpWidget(booksTestApp(
        repository: repo,
        child: BlocProvider<BookContentsBloc>.value(
          value: bloc,
          child: const BookContentsScreen(card: null),
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('books-chapter-loose-1')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-chapter-loose-2')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-subbook-kanda-1')), findsNothing);
    });

    testWidgets('403 renders NO contents (never a preview)', (tester) async {
      booksViewport(tester);
      final repo = FakeBooksRepository(failReadingWith: BooksErrorKind.proRequired);
      final bloc = BookContentsBloc(repository: repo, contentId: 'major-1')
        ..add(const BookContentsLoadRequested());
      addTearDown(bloc.close);

      await tester.pumpWidget(booksTestApp(
        repository: repo,
        child: BlocProvider<BookContentsBloc>.value(
          value: bloc,
          child: const BookContentsScreen(card: null),
        ),
      ));
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const ValueKey('books-contents-list')), findsNothing);
      expect(find.text('1. बाल-काण्ड'), findsNothing);
    });
  });

  group('Book Reader (620:3904)', () {
    testWidgets('renders the warm surface + Devanagari body', (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.majorBook);

      expect(find.byKey(const ValueKey('books-reader-body')), findsOneWidget);
      final body = tester.widget<Text>(
        find.byKey(const ValueKey('books-reader-body')),
      );
      // Verbatim — the paragraph break survives.
      expect(body.data, 'पहला अध्याय\n\nदूसरा पैराग्राफ।');
      expect(body.overflow, isNot(TextOverflow.ellipsis));
    });

    testWidgets('Listen Audio shows when the chapter has audio', (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.majorBook);

      expect(find.byKey(const ValueKey('books-reader-listen')), findsOneWidget);
      expect(find.text('Listen Audio'), findsOneWidget);
    });

    testWidgets('Listen Audio is HIDDEN when the chapter has none',
        (tester) async {
      await _pumpReader(
        tester,
        mode: BookReaderMode.majorBook,
        initialChapterId: 'ch-2',
      );

      expect(find.byKey(const ValueKey('books-reader-listen')), findsNothing);
    });

    testWidgets('tapping Listen plays via the shared engine and flips to Pause',
        (tester) async {
      final audio = FakeBookReaderAudioPort();
      await _pumpReader(tester, mode: BookReaderMode.majorBook, audio: audio);

      await tester.tap(find.byKey(const ValueKey('books-reader-listen')));
      await tester.pumpAndSettle();

      expect(audio.played, hasLength(1));
      expect(find.text('Pause'), findsOneWidget);
      expect(find.text('Listen Audio'), findsNothing);
    });

    testWidgets('Previous is inert on the first chapter, Next works',
        (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.majorBook);

      final prev = tester.widget<BooksGradientButton>(
        find.byKey(const ValueKey('books-reader-previous')),
      );
      final next = tester.widget<BooksGradientButton>(
        find.byKey(const ValueKey('books-reader-next')),
      );
      expect(prev.enabled, isFalse);
      expect(next.enabled, isTrue);
    });

    testWidgets('Next is inert on the last chapter', (tester) async {
      await _pumpReader(
        tester,
        mode: BookReaderMode.majorBook,
        initialChapterId: 'ch-4',
      );

      expect(
        tester
            .widget<BooksGradientButton>(
                find.byKey(const ValueKey('books-reader-next')))
            .enabled,
        isFalse,
      );
      expect(
        tester
            .widget<BooksGradientButton>(
                find.byKey(const ValueKey('books-reader-previous')))
            .enabled,
        isTrue,
      );
    });

    testWidgets('the chapters drawer lists chapters and switches the body',
        (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.majorBook);

      await tester.tap(find.byKey(const ValueKey('books-reader-drawer-btn')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('books-chapters-drawer')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-drawer-total')), findsOneWidget);
      expect(find.text('Total Chapters: 4'), findsOneWidget);
      expect(find.byKey(const ValueKey('books-drawer-chapter-ch-3')),
          findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('books-drawer-chapter-ch-3')));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('books-chapters-drawer')), findsNothing);
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('books-reader-body')))
            .data,
        'तीसरा अध्याय।',
      );
    });

    testWidgets('the Aa overlay changes the body font size', (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.majorBook);
      final before = tester
          .widget<Text>(find.byKey(const ValueKey('books-reader-body')))
          .style!
          .fontSize;

      await tester.tap(find.byKey(const ValueKey('books-reader-font-btn')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('books-font-overlay')), findsOneWidget);

      // Drag the slider to its maximum.
      await tester.drag(
        find.byKey(const ValueKey('books-font-slider')),
        const Offset(500, 0),
      );
      await tester.pumpAndSettle();

      final after = tester
          .widget<Text>(find.byKey(const ValueKey('books-reader-body')))
          .style!
          .fontSize;
      expect(after, greaterThan(before!));
    });

    testWidgets('offline + uncached shows the offline state with Retry',
        (tester) async {
      await _pumpReader(
        tester,
        mode: BookReaderMode.majorBook,
        repository: FakeBooksRepository(failReadingWith: BooksErrorKind.offline),
      );

      expect(find.byKey(const ValueKey('books-reader-offline')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-reader-offline-retry')),
          findsOneWidget);
      expect(find.textContaining('not available offline'), findsOneWidget);
      // Never a blank reader.
      expect(find.byKey(const ValueKey('books-reader-body')), findsNothing);
    });

    testWidgets('403 renders no body (the paywall takes over)', (tester) async {
      await _pumpReader(
        tester,
        mode: BookReaderMode.majorBook,
        repository:
            FakeBooksRepository(failReadingWith: BooksErrorKind.proRequired),
      );

      expect(find.byKey(const ValueKey('books-reader-body')), findsNothing);
      expect(find.byKey(const ValueKey('books-reader-pro')), findsOneWidget);
    });
  });

  group('Non-Book Reader (647:4133)', () {
    testWidgets('has NO Listen Audio, NO Prev/Next and NO drawer button',
        (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.directScripture);

      expect(find.byKey(const ValueKey('books-reader-body')), findsOneWidget);
      expect(find.byKey(const ValueKey('books-reader-listen')), findsNothing);
      expect(find.byKey(const ValueKey('books-reader-previous')), findsNothing);
      expect(find.byKey(const ValueKey('books-reader-next')), findsNothing);
      expect(find.byKey(const ValueKey('books-reader-drawer-btn')), findsNothing);
    });

    testWidgets('keeps the font control (the frame shows it)', (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.directScripture);

      expect(find.byKey(const ValueKey('books-reader-font-btn')), findsOneWidget);
    });

    testWidgets('renders the scripture body verbatim', (tester) async {
      await _pumpReader(tester, mode: BookReaderMode.directScripture);

      expect(
        tester.widget<Text>(find.byKey(const ValueKey('books-reader-body'))).data,
        fakeScripture().contentBody,
      );
    });
  });

  // The `Analytics — reader funnel` group (book_reader_opened /
  // book_audio_listen_tapped / book_next_tapped assertions) was dropped
  // when Books tracking left the analytics contract (Sheet 1 has zero
  // Books events). Behaviour tests above cover the Listen / Next
  // interactions themselves.
}
