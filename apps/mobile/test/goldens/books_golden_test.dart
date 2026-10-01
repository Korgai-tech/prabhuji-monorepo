@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/books/contents/bloc/book_contents_bloc.dart';
import 'package:mobile/features/books/contents/bloc/book_contents_event.dart';
import 'package:mobile/features/books/contents/presentation/book_contents_screen.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/data/offline_text_cache.dart';
import 'package:mobile/features/books/data/reader_font_prefs.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_bloc.dart';
import 'package:mobile/features/books/listing/bloc/books_listing_event.dart';
import 'package:mobile/features/books/listing/presentation/books_listing_screen.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_bloc.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_event.dart';
import 'package:mobile/features/books/reader/bloc/book_reader_state.dart';
import 'package:mobile/features/books/reader/presentation/book_reader_screen.dart';

import '../support/books_harness.dart';
import '../support/fake_books_services.dart';
import '../support/figma_crosscheck.dart';
import '../support/golden_harness.dart';

/// Component goldens + the render-tree ↔ node-tree cross-check for the Books
/// module (TAM-60 fidelity harness / figma-flutter Phase 6).
///
/// Rendered headlessly at the Figma frame size (360×800) and reviewed
/// side-by-side with the frame exports under
/// `specs/evidence/TAM-76/fidelity/figma-refs/`. Tagged `golden` so the
/// cross-platform gate (`--exclude-tags golden`) skips them; refresh locally
/// with `flutter test --update-goldens test/goldens/books_golden_test.dart`.
///
/// Book covers are intentionally the branded AppNetworkImage fallback (fixtures
/// use empty URLs) — a golden must never touch the network. The Figma refs show
/// real cover art in that slot; everything AROUND it is what these lock,
/// including the MULTIPLY paper texture and the OVERLAY/SOFT_LIGHT gloss, which
/// DO render here.

Future<void> _pump(WidgetTester tester, Widget app, {Size size = const Size(360, 800)}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
  // Asset images (textures, category art) decode via real async I/O — fake-async
  // pumps never finish it, so precache inside runAsync or the goldens go blank.
  await tester.runAsync(() async {
    for (final el in find.byType(Image).evaluate()) {
      await precacheImage((el.widget as Image).image, el);
    }
  });
  await tester.pumpAndSettle();
}

// ---- Figma node → component maps -------------------------------------------

/// Books Home — node `534:5061`.
const _homeRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '534:5163 "Basic Nav" → title "Books"',
    component: 'books-home-nav',
    notes: 'Nav title rendered. Its leading back arrow is an intentional '
        'divergence — see books-nav-back below.',
  ),
  CrossCheckRow(
    figmaNode: 'I534:5163;5186:10373 "Leading Icon" → back arrow',
    component: 'books-nav-back',
    notes: 'INTENTIONAL: Books Home is the ROOT of shell branch 4 (TAM-58), so '
        'there is nothing to pop and the arrow would be dead UI. Both sibling '
        'in-shell tabs mark this slot visible:false (Status 302:4384, Horoscope '
        '371:3796); this frame left the nav component default on. Spec: TAM-76 '
        'AC "Books routes registered in the app GoRouter (TAM-58 shell)".',
  ),
  CrossCheckRow(
    figmaNode: '534:5063 "Header" → Books carousel section',
    component: 'books-home-carousel-section',
    notes: 'Title + Show all + horizontal row (node 534:5475, itemSpacing 10).',
  ),
  CrossCheckRow(
    figmaNode: '534:5067 "Show all"',
    component: 'books-home-show-all',
    notes: 'Opens /books/all. Visible only on the carousel section — the other '
        'two sections mark their Heading 2 visible:false (534:5109 / 534:5139).',
  ),
  CrossCheckRow(
    figmaNode: '534:5475 "Books" → carousel row',
    component: 'books-home-carousel',
    notes: 'Book cards at the 120 variant (534:5504).',
  ),
  CrossCheckRow(
    figmaNode: '534:5106 "Header" → Browse Categories section',
    component: 'books-home-categories-section',
    notes: 'Title + 2-col grid.',
  ),
  CrossCheckRow(
    figmaNode: '534:5111 "Frame 2147227409" → category grid',
    component: 'books-home-category-grid',
    notes: 'layoutMode GRID, 2 cols, 10/10 gaps.',
  ),
  CrossCheckRow(
    figmaNode: '534:5112 "Frame 2147227414" → Chalisa card',
    component: 'books-category-Chalisa',
    notes: 'Fill #302722 + rotated artwork 534:5114.',
  ),
  CrossCheckRow(
    figmaNode: '534:5116 "Frame 2147227410" → Aarti card',
    component: 'books-category-Aarti',
    notes: 'Fill #C88611 + artwork 534:5118.',
  ),
  CrossCheckRow(
    figmaNode: '534:5120 "Frame 2147227411" → Kavach card',
    component: 'books-category-Kavach',
    notes: 'Fill #505210 + artwork 534:5122.',
  ),
  CrossCheckRow(
    figmaNode: '534:5124 "Frame 2147227413" → Stotram card',
    component: 'books-category-Stotram',
    notes: 'Fill #B13800 + artwork 534:5126.',
  ),
  CrossCheckRow(
    figmaNode: '534:5136 "Header" → Newly Added Books section',
    component: 'books-home-newly-added-section',
    notes: 'Title + horizontal row (562:5536).',
  ),
  CrossCheckRow(
    figmaNode: '562:5536 "Books" → newly-added row',
    component: 'books-home-newly-added',
    notes: 'Book cards at the 120 variant.',
  ),
  CrossCheckRow(
    figmaNode: '683:4936 "Component 26" → bottom nav (Books active)',
    component: 'books-home-bottom-nav',
    notes: 'INTENTIONAL: owned by the TAM-58 shell (AppShellScaffold, node '
        '750:6252) and asserted by test/goldens/nav_shell_golden_test.dart. '
        'Books Home renders INSIDE that shell, so this golden — which pumps the '
        'screen alone — has no nav. Spec: TAM-76 Figma table, "Shell owned by '
        'TAM-58; consume it".',
  ),
];

/// Book Contents — node `639:3947`.
const _contentsRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '663:7564 "Basic Nav" → back arrow (empty title)',
    component: 'books-contents-nav',
    notes: 'Title is "" in Figma; back arrow present.',
  ),
  CrossCheckRow(
    figmaNode: '639:4019 "Book" → cover hero',
    component: 'books-contents-hero',
    notes: '120 variant at y=99 — deliberately overlaps the nav (paints after).',
  ),
  CrossCheckRow(
    figmaNode: '639:4105 "Main Buttons" → Start Reading',
    component: 'books-contents-start-reading',
    notes: '95×29 r8.04 gradient CTA, centred at y=320.',
  ),
  CrossCheckRow(
    figmaNode: '639:4029 "Chapters List" → white panel',
    component: 'books-contents-list',
    notes: 'Full-bleed #FFFFFF from y=393.',
  ),
  CrossCheckRow(
    figmaNode: '639:4045 "Item" → kanda row 1',
    component: 'books-subbook-kanda-1',
    notes: 'Title + "N chapters" (nodes 639:4046 / 639:4080).',
  ),
  CrossCheckRow(
    figmaNode: '639:4081 "Item" → kanda row 2',
    component: 'books-subbook-kanda-2',
    notes: 'Fixture has 2 kandas; Figma mocks 7 rows of the same component.',
  ),
];

/// Book Reader — node `620:3904`.
const _readerRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '620:3917 "Basic Nav" → back + kanda title',
    component: 'books-reader-nav',
    notes: 'Title renders the KANDA (node I620:3917;5186:10376 = "बाल-काण्ड").',
  ),
  CrossCheckRow(
    figmaNode: 'I620:3917;5186:10379 "Trailing Icon 2" → Font-settings',
    component: 'books-reader-font-btn',
    notes: '44 frame / 20 glyph (font-settings.svg, tinted).',
  ),
  CrossCheckRow(
    figmaNode: 'I620:3917;5186:10380 "Trailing Icon 1" → list (chapters)',
    component: 'books-reader-drawer-btn',
    notes: 'chapters-list.svg; turns #FC7304 while the drawer is open.',
  ),
  CrossCheckRow(
    figmaNode: '621:4078 → chapter title',
    component: 'books-reader-title',
    notes: '20/28 w600 #000000.',
  ),
  CrossCheckRow(
    figmaNode: '663:7474 "Book-listen" → Listen Audio',
    component: 'books-reader-listen',
    notes: 'Shown only when the chapter carries audioUrl (PRD §10). The golden '
        'fixture chapter has audio.',
  ),
  CrossCheckRow(
    figmaNode: '620:4076 → Devanagari body',
    component: 'books-reader-body',
    notes: '16/28 w500, verbatim, scrollable, never truncated.',
  ),
  CrossCheckRow(
    figmaNode: '663:4248 "Main Buttons" → Previous',
    component: 'books-reader-previous',
    notes: 'Disabled on the first chapter (q5) — rendered inert at 40% opacity.',
  ),
  CrossCheckRow(
    figmaNode: '663:4298 "Main Buttons" → Next',
    component: 'books-reader-next',
    notes: 'Disabled on the last chapter (q5).',
  ),
];

/// Non-Book Reader — node `647:4133`.
const _scriptureRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '647:4139 "Basic Nav" → back + title',
    component: 'books-reader-nav',
    notes: 'Trailing Icon 1 (chapters) is visible:false in this frame.',
  ),
  CrossCheckRow(
    figmaNode: 'I647:4139;5186:10379 "Trailing Icon 2" → Font-settings',
    component: 'books-reader-font-btn',
    notes: 'The ONLY trailing action a direct scripture keeps.',
  ),
  CrossCheckRow(
    figmaNode: '647:4135 → scripture title',
    component: 'books-reader-title',
    notes: '20/28 w600.',
  ),
  CrossCheckRow(
    figmaNode: '647:4136 → contentBody',
    component: 'books-reader-body',
    notes: 'Opens directly; no chapter hierarchy.',
  ),
];

/// Chapters Drawer — node `637:4191`.
const _drawerRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '637:4459 "Rectangle 111141391" → scrim',
    component: 'books-drawer-scrim',
    notes: '#000000 @0.60; tap dismisses.',
  ),
  CrossCheckRow(
    figmaNode: '637:4420 "Book" (sm variant) → cover',
    component: 'books-drawer-cover',
    notes: '100-wide variant (637:4299), title hidden per its Frame 34100.',
  ),
  CrossCheckRow(
    figmaNode: '637:4424 → book title',
    component: 'books-drawer-title',
    notes: '16/20 w700.',
  ),
  CrossCheckRow(
    figmaNode: '637:4427 → kanda metadata',
    component: 'books-drawer-subbook',
    notes: 'The active chapter\'s kanda name.',
  ),
  CrossCheckRow(
    figmaNode: '637:4431 → "Total Chapters: N"',
    component: 'books-drawer-total',
    notes: 'From totalChapterCount.',
  ),
  CrossCheckRow(
    figmaNode: '637:4368 "List" → chapter list',
    component: 'books-drawer-list',
    notes: 'Walks the flat reading order.',
  ),
  CrossCheckRow(
    figmaNode: '637:4369 "Item - Active Chapter"',
    component: 'books-drawer-chapter-ch-1',
    notes: 'Active row: #B8B8B8@0.20 fill + #000000 text.',
  ),
  CrossCheckRow(
    figmaNode: '637:4371 "Item" → idle chapter',
    component: 'books-drawer-chapter-ch-2',
    notes: 'Idle row: #3F3F3F text, no fill.',
  ),
  CrossCheckRow(
    figmaNode: '637:4433 "Total Pages: 247"',
    component: 'books-drawer-total-pages',
    notes: 'INTENTIONAL: node 637:4432 is visible:false in Figma AND the TAM-75 '
        'contract exposes no page count. Correctly not rendered.',
  ),
];

/// Font Size Adjust — node `637:4463`.
const _fontRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '620:3844 "Settings Overlay Panel"',
    component: 'books-font-overlay',
    notes: 'Full-width, 64 tall, bottom corners r16, drops below the nav.',
  ),
  CrossCheckRow(
    figmaNode: '620:3857 "Input" → text-size slider',
    component: 'books-font-slider',
    notes: 'Track 212×4 r2 #EAEBEE, fill #FE8A02, thumb 24 r12 #FFFFFF.',
  ),
  CrossCheckRow(
    figmaNode: '620:3861 "Border" → value box',
    component: 'books-font-value',
    notes: '51×32 r4, "18px" 14/20 #767676.',
  ),
  CrossCheckRow(
    figmaNode: '620:3845 "Brightness Setting"',
    component: 'books-font-brightness',
    notes: 'INTENTIONAL: visible:false in Figma, and brightness is out of scope '
        'for TAM-76 (the AC covers text size only). Correctly not rendered.',
  ),
];

/// Listing — node `562:5565`.
const _listingRows = <CrossCheckRow>[
  CrossCheckRow(
    figmaNode: '562:5565 "Categories" → nav',
    component: 'books-listing-nav',
    notes: 'Back + the listing title.',
  ),
  CrossCheckRow(
    figmaNode: '562:5566 "Frame 2147227417" → 2-col grid',
    component: 'books-listing-grid',
    notes: 'layoutMode GRID, 16 padding, 10/10 gaps.',
  ),
  CrossCheckRow(
    figmaNode: '562:5676 "Book" (Book-lg variant) → card',
    component: 'books-card-chalisa-1',
    notes: '159-wide variant (562:5674): cover 159×233 r11.925, title 15.9/21.2.',
  ),
];

void main() {
  group('goldens + cross-check', () {
    testWidgets('books home (534:5061)', (tester) async {
      // FIDELITY: a golden's job is to compare the RENDER against the Figma
      // frame, so the fake must serve the copy the real server serves — which is
      // the design's copy (`books.service.ts` DEFAULT_SECTION_TITLE: "Books" /
      // "Browse Categories" / "Newly Added Books"). The behavioural tests
      // deliberately serve DIFFERENT strings to prove the screen has no bundled
      // copy of its own; using those here would make this golden a picture of a
      // fixture instead of a picture of the design.
      final repo = FakeBooksRepository(
        home: fakeBooksHome(
          sections: fakeBooksSections(
            carouselTitle: 'Books',
            categoriesTitle: 'Browse Categories',
            newlyAddedTitle: 'Newly Added Books',
          ),
        ),
      );
      await _pump(
        tester,
        booksRouterApp(
          repository: repo,
          router: buildBooksTestRouter(repository: repo),
        ),
      );

      await expectLater(
        find.byKey(const ValueKey('books-home-scroll')),
        matchesGoldenFile('books_home.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '534:5061',
        screen: 'books_home',
        rows: _homeRows,
        renderedComponents: renderedKeys(tester, 'books-'),
        intentional: const [
          'books-nav-back',
          'books-home-bottom-nav',
        ],
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-books-home.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });

    testWidgets('listing (562:5565)', (tester) async {
      // As above: the category listing's heading is `CATEGORY_TITLE[Chalisa]` =
      // "Chalisa" on the real server, which is what the frame shows. (The screen
      // used to print the enum's WIRE VALUE here, which happened to be the same
      // string — the golden is unchanged, but it is now the server's title.)
      final repo = FakeBooksRepository(categoryTitle: (c) => c.wire);
      await _pump(
        tester,
        booksTestApp(
          repository: repo,
          child: BlocProvider<BooksListingBloc>(
            create: (_) => BooksListingBloc(
              repository: repo,
              query: const BookListQuery(category: BookCategory.chalisa),
            )..add(const BooksListingLoadRequested()),
            child: const BooksListingScreen(
              query: BookListQuery(category: BookCategory.chalisa),
            ),
          ),
        ),
      );

      await expectLater(
        find.byType(BooksListingScreen),
        matchesGoldenFile('books_listing.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '562:5565',
        screen: 'category_listing (= all_books_listing, same frame reused)',
        rows: _listingRows,
        renderedComponents: renderedKeys(tester, 'books-'),
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-listing.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });

    testWidgets('book contents (639:3947)', (tester) async {
      final repo = FakeBooksRepository();
      await _pump(
        tester,
        booksTestApp(
          repository: repo,
          child: BlocProvider<BookContentsBloc>(
            create: (_) => BookContentsBloc(
              repository: repo,
              contentId: 'major-1',
            )..add(const BookContentsLoadRequested()),
            child: const BookContentsScreen(card: null),
          ),
        ),
      );

      await expectLater(
        find.byType(BookContentsScreen),
        matchesGoldenFile('books_contents.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '639:3947',
        screen: 'book_contents',
        rows: _contentsRows,
        renderedComponents: renderedKeys(tester, 'books-'),
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-contents.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });

    testWidgets('book reader (620:3904)', (tester) async {
      final repo = FakeBooksRepository();
      final bloc = BookReaderBloc(
        repository: repo,
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'major-1',
        mode: BookReaderMode.majorBook,
        audio: FakeBookReaderAudioPort(),
        contents: fakeBookContents(),
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await _pump(
        tester,
        booksTestApp(
          repository: repo,
          child: BlocProvider<BookReaderBloc>.value(
            value: bloc,
            child: const BookReaderScreen(bookTitle: 'Valmiki Ramayan'),
          ),
        ),
      );

      await expectLater(
        find.byType(BookReaderScreen),
        matchesGoldenFile('books_reader.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '620:3904',
        screen: 'book_reader',
        rows: _readerRows,
        renderedComponents: renderedKeys(tester, 'books-'),
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-reader.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });

    testWidgets('non-book reader (647:4133)', (tester) async {
      final repo = FakeBooksRepository();
      final bloc = BookReaderBloc(
        repository: repo,
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'chalisa-1',
        mode: BookReaderMode.directScripture,
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await _pump(
        tester,
        booksTestApp(
          repository: repo,
          child: BlocProvider<BookReaderBloc>.value(
            value: bloc,
            child: const BookReaderScreen(bookTitle: 'Shri Hanuman Chalisa'),
          ),
        ),
      );

      await expectLater(
        find.byType(BookReaderScreen),
        matchesGoldenFile('books_scripture_reader.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '647:4133',
        screen: 'non_book_reader',
        rows: _scriptureRows,
        renderedComponents: renderedKeys(tester, 'books-'),
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-scripture-reader.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });

    testWidgets('chapters drawer (637:4191)', (tester) async {
      final repo = FakeBooksRepository();
      final bloc = BookReaderBloc(
        repository: repo,
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'major-1',
        mode: BookReaderMode.majorBook,
        audio: FakeBookReaderAudioPort(),
        contents: fakeBookContents(),
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await _pump(
        tester,
        booksTestApp(
          repository: repo,
          child: BlocProvider<BookReaderBloc>.value(
            value: bloc,
            child: const BookReaderScreen(bookTitle: 'Valmiki Ramayan'),
          ),
        ),
      );
      bloc.add(const BookReaderDrawerToggled(open: true));
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(BookReaderScreen),
        matchesGoldenFile('books_chapters_drawer.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '637:4191',
        screen: 'chapters_drawer',
        rows: _drawerRows,
        renderedComponents: renderedKeys(tester, 'books-'),
        intentional: const ['books-drawer-total-pages'],
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-chapters-drawer.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });

    testWidgets('font size adjust (637:4463)', (tester) async {
      final repo = FakeBooksRepository();
      final bloc = BookReaderBloc(
        repository: repo,
        cache: InMemoryOfflineTextCache(),
        fontPrefs: InMemoryReaderFontPrefs(),
        contentId: 'major-1',
        mode: BookReaderMode.majorBook,
        audio: FakeBookReaderAudioPort(),
        contents: fakeBookContents(),
      )..add(const BookReaderStarted());
      addTearDown(bloc.close);

      await _pump(
        tester,
        booksTestApp(
          repository: repo,
          child: BlocProvider<BookReaderBloc>.value(
            value: bloc,
            child: const BookReaderScreen(bookTitle: 'Valmiki Ramayan'),
          ),
        ),
      );
      bloc.add(const BookReaderFontOverlayToggled(open: true));
      await tester.pumpAndSettle();

      await expectLater(
        find.byType(BookReaderScreen),
        matchesGoldenFile('books_font_overlay.png'),
      );

      final md = renderCrossCheckMarkdown(
        ticket: 'TAM-76',
        figmaNode: '637:4463',
        screen: 'font_size_adjust',
        rows: _fontRows,
        renderedComponents: renderedKeys(tester, 'books-'),
        intentional: const ['books-font-brightness'],
      );
      writeEvidence('TAM-76', 'render-tree/cross-check-font-overlay.md', md);
      expect(md, contains('**Verdict**: PASS'));
    });
  });
}
