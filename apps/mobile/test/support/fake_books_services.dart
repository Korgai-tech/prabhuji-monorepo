import 'package:dio/dio.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/books/reader/bloc/reader_audio_port.dart';

/// Deterministic Books data double (TAM-76).
///
/// Seeds home/listing/contents/chapter/scripture; `fail*` flags exercise the
/// error paths — notably [failReadingWith], which simulates the server-side Pro
/// gate (`403`) and the offline path without any network.
class FakeBooksRepository implements BooksRepository {
  FakeBooksRepository({
    BooksHome? home,
    List<BookCardView>? allBooks,
    BookContents? contents,
    Map<String, BookChapterContent>? chapters,
    BookScriptureContent? scripture,
    this.pageSize = 4,
    this.allBooksTitle = 'Every Sacred Text',
    String Function(BookCategory)? categoryTitle,
    this.failHomeWith,
    this.failListingWith,
    this.failReadingWith,
  })  : _categoryTitle = categoryTitle ?? _defaultCategoryTitle,
        _home = home ?? fakeBooksHome(),
        _allBooks = allBooks ?? fakeBookList(),
        _contents = contents ?? fakeBookContents(),
        _chapters = chapters ?? fakeChapters(),
        _scripture = scripture ?? fakeScripture();

  final BooksHome _home;
  final List<BookCardView> _allBooks;
  final BookContents _contents;
  final Map<String, BookChapterContent> _chapters;
  final BookScriptureContent _scripture;

  /// Keyset page size — drives multi-page pagination in listing tests.
  final int pageSize;

  /// `GET /books` `data.title`. Deliberately NOT 'All Books' — that was the
  /// string the client hardcoded, so a test asserting THIS renders proves the
  /// heading came from the server.
  final String allBooksTitle;

  /// `GET /books/categories/:category` `data.title`. Defaults to a string the
  /// enum's wire value is NOT, so a test can catch the old
  /// "render `category.wire` as the page title" bug. The GOLDENS override this
  /// with the real server's `CATEGORY_TITLE` so they stay a picture of the design.
  final String Function(BookCategory) _categoryTitle;

  static String _defaultCategoryTitle(BookCategory c) => '${c.wire} Collection';

  final BooksErrorKind? failHomeWith;
  final BooksErrorKind? failListingWith;

  /// Applied to fetchContents/fetchChapter/fetchScripture — the three Pro-gated
  /// reading calls.
  final BooksErrorKind? failReadingWith;

  int homeCalls = 0;
  int listingCalls = 0;
  int contentsCalls = 0;
  int chapterCalls = 0;
  int scriptureCalls = 0;

  @override
  Future<BooksHome> fetchHome() async {
    homeCalls++;
    if (failHomeWith != null) throw BooksException(failHomeWith!);
    return _home;
  }

  @override
  Future<BookListPage> fetchAll({String? cursor, int limit = 20}) async {
    listingCalls++;
    if (failListingWith != null) throw BooksException(failListingWith!);
    return _paginate(_allBooks, cursor, title: allBooksTitle);
  }

  @override
  Future<BookListPage> fetchCategory(
    BookCategory category, {
    String? cursor,
    int limit = 20,
  }) async {
    listingCalls++;
    if (failListingWith != null) throw BooksException(failListingWith!);
    final filtered =
        _allBooks.where((b) => b.category == category).toList(growable: false);
    // The server's own heading for the category — by default deliberately NOT
    // the enum's wire value, which is what the client used to render.
    return _paginate(filtered, cursor, title: _categoryTitle(category));
  }

  /// Cursor = the index of the next item, exactly like a keyset cursor.
  BookListPage _paginate(
    List<BookCardView> source,
    String? cursor, {
    required String title,
  }) {
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, source.length);
    return BookListPage(
      title: title,
      items: source.sublist(start, end),
      nextCursor: end >= source.length ? null : end.toString(),
    );
  }

  @override
  Future<BookContents> fetchContents(String contentId) async {
    contentsCalls++;
    if (failReadingWith != null) throw BooksException(failReadingWith!);
    return _contents;
  }

  @override
  Future<BookChapterContent> fetchChapter(
    String contentId,
    String chapterId,
  ) async {
    chapterCalls++;
    if (failReadingWith != null) throw BooksException(failReadingWith!);
    final chapter = _chapters[chapterId];
    if (chapter == null) throw const BooksException(BooksErrorKind.notFound);
    return chapter;
  }

  @override
  Future<BookScriptureContent> fetchScripture(String contentId) async {
    scriptureCalls++;
    if (failReadingWith != null) throw BooksException(failReadingWith!);
    return _scripture;
  }
}

/// Records what the reader asked the shared audio engine to do, without any
/// `just_audio` / platform channel.
class FakeBookReaderAudioPort implements BookReaderAudioPort {
  final List<AudioItem> played = [];
  int pauseCalls = 0;
  int resumeCalls = 0;
  int stopCalls = 0;

  /// Seeded answer for [isPlaying] — lets a test drive the resume-vs-play branch.
  String? activeItemId;

  @override
  Future<void> play(AudioItem item) async {
    played.add(item);
    activeItemId = item.id;
  }

  @override
  Future<void> pause() async => pauseCalls++;

  @override
  Future<void> resume() async => resumeCalls++;

  @override
  Future<void> stop() async {
    stopCalls++;
    activeItemId = null;
  }

  @override
  bool isPlaying(String itemId) => activeItemId == itemId;
}

// ---- Fixtures ---------------------------------------------------------------

/// A single book-card fixture. Cover URLs are EMPTY on purpose: that
/// short-circuits `AppNetworkImage` to its branded fallback, so no test ever
/// touches the network.
BookCardView fakeBookCard(
  String id, {
  String? title,
  BookContentType contentType = BookContentType.majorBook,
  BookCategory? category,
  bool offlineCacheEligible = true,
}) =>
    BookCardView(
      contentId: id,
      contentType: contentType,
      category: category,
      title: title ?? 'Book $id',
      coverImageUrl: '',
      author: 'Valmiki',
      languages: const ['hi'],
      offlineCacheEligible: offlineCacheEligible,
    );

/// Ten mixed items (major + direct across categories) — drives pagination across
/// multiple pages at the default page size of 4.
List<BookCardView> fakeBookList() => [
      fakeBookCard('major-1', title: 'Valmiki Ramayan'),
      fakeBookCard('major-2', title: 'Bhagavad Gita'),
      fakeBookCard('chalisa-1',
          title: 'Shri Hanuman Chalisa',
          contentType: BookContentType.directScripture,
          category: BookCategory.chalisa),
      fakeBookCard('chalisa-2',
          title: 'Kali Chalisa',
          contentType: BookContentType.directScripture,
          category: BookCategory.chalisa),
      fakeBookCard('chalisa-3',
          title: 'Vishnu Chalisa',
          contentType: BookContentType.directScripture,
          category: BookCategory.chalisa),
      fakeBookCard('chalisa-4',
          title: 'Shiv Chalisa',
          contentType: BookContentType.directScripture,
          category: BookCategory.chalisa),
      fakeBookCard('chalisa-5',
          title: 'Durga Chalisa',
          contentType: BookContentType.directScripture,
          category: BookCategory.chalisa),
      fakeBookCard('aarti-1',
          title: 'Om Jai Jagdish',
          contentType: BookContentType.directScripture,
          category: BookCategory.aarti),
      fakeBookCard('kavach-1',
          title: 'Ram Raksha Kavach',
          contentType: BookContentType.directScripture,
          category: BookCategory.kavach),
      fakeBookCard('stotram-1',
          title: 'Vishnu Sahasranama',
          contentType: BookContentType.directScripture,
          category: BookCategory.stotram),
    ];

/// Books Home as `GET /books/home` now serves it: CMS `sections[]`.
///
/// The section HEADINGS live here, in a fake, because the app must not know them.
/// They are deliberately NOT the strings the client used to hardcode ('Books' /
/// 'Browse Categories' / 'Newly Added Books') — a test asserting these titles
/// render proves the copy came down the wire and wasn't baked in.
///
/// [sections] are returned in a deliberately SHUFFLED order relative to their
/// `sortOrder`, so a test can prove the client sorts on `sortOrder` rather than
/// trusting array order.
BooksHome fakeBooksHome({List<BooksHomeSectionView>? sections}) =>
    BooksHome(sections: sections ?? fakeBooksSections());

List<BooksHomeSectionView> fakeBooksSections({
  String carouselTitle = 'Sacred Library',
  String categoriesTitle = 'Explore by Type',
  String newlyAddedTitle = 'Fresh Additions',
}) =>
    [
      // Out of order on purpose (sortOrder 2 first).
      BooksHomeSectionView(
        key: BooksSectionKey.newlyAdded,
        title: newlyAddedTitle,
        sortOrder: 2,
        books: [
          fakeBookCard('chalisa-1',
              title: 'Shri Hanuman Chalisa',
              contentType: BookContentType.directScripture,
              category: BookCategory.chalisa),
        ],
      ),
      BooksHomeSectionView(
        key: BooksSectionKey.carousel,
        title: carouselTitle,
        sortOrder: 0,
        books: [
          fakeBookCard('major-1', title: 'Valmiki Ramayan'),
          fakeBookCard('major-2', title: 'Bhagavad Gita'),
        ],
      ),
      BooksHomeSectionView(
        key: BooksSectionKey.categories,
        title: categoriesTitle,
        sortOrder: 1,
        categories: const [
          BookCategoryView(
              category: BookCategory.chalisa, title: 'Chalisa', itemCount: 5),
          BookCategoryView(
              category: BookCategory.aarti, title: 'Aarti', itemCount: 1),
          BookCategoryView(
              category: BookCategory.kavach, title: 'Kavach', itemCount: 1),
          BookCategoryView(
              category: BookCategory.stotram, title: 'Stotram', itemCount: 1),
        ],
      ),
    ];

BookChapterSummaryView fakeChapterSummary(
  String id, {
  required int order,
  String? title,
  bool hasAudio = false,
}) =>
    BookChapterSummaryView(
      chapterId: id,
      title: title ?? 'अध्याय $order',
      order: order,
      hasAudio: hasAudio,
    );

/// A major book WITH kandas: 2 sub-books × 2 chapters ⇒ a 4-chapter reading
/// order (`ch-1`…`ch-4`).
BookContents fakeBookContents() => BookContents(
      contentId: 'major-1',
      title: 'Valmiki Ramayan',
      coverImageUrl: '',
      author: 'Valmiki',
      languages: const ['hi'],
      offlineCacheEligible: true,
      subBooks: [
        BookSubBookView(
          subBookId: 'kanda-1',
          title: 'बाल-काण्ड',
          order: 1,
          chapterCount: 2,
          chapters: [
            fakeChapterSummary('ch-1', order: 1, hasAudio: true),
            fakeChapterSummary('ch-2', order: 2),
          ],
        ),
        BookSubBookView(
          subBookId: 'kanda-2',
          title: 'अयोध्या-काण्ड',
          order: 2,
          chapterCount: 2,
          chapters: [
            fakeChapterSummary('ch-3', order: 1),
            fakeChapterSummary('ch-4', order: 2),
          ],
        ),
      ],
      chapters: const [],
      totalChapterCount: 4,
    );

/// A major book with NO sub-books — loose chapters only. The contract allows it
/// and Contents must render the chapter list directly.
BookContents fakeLooseChapterContents() => BookContents(
      contentId: 'major-2',
      title: 'Bhagavad Gita',
      coverImageUrl: '',
      author: 'Vyasa',
      languages: const ['hi'],
      offlineCacheEligible: true,
      subBooks: const [],
      chapters: [
        fakeChapterSummary('loose-1', order: 1, title: 'अध्याय 1'),
        fakeChapterSummary('loose-2', order: 2, title: 'अध्याय 2'),
      ],
      totalChapterCount: 2,
    );

/// Chapter bodies for [fakeBookContents]. `ch-1` carries audio; the rest do not,
/// which is what drives the Listen-Audio visibility tests.
Map<String, BookChapterContent> fakeChapters() => {
      'ch-1': const BookChapterContent(
        contentId: 'major-1',
        chapterId: 'ch-1',
        title: 'अध्याय 1',
        order: 1,
        bodyText: 'पहला अध्याय\n\nदूसरा पैराग्राफ।',
        audioUrl: 'https://cdn.test/ch-1.mp3',
        hasAudio: true,
        offlineCacheEligible: true,
      ),
      'ch-2': const BookChapterContent(
        contentId: 'major-1',
        chapterId: 'ch-2',
        title: 'अध्याय 2',
        order: 2,
        bodyText: 'दूसरा अध्याय।',
        audioUrl: null,
        hasAudio: false,
        offlineCacheEligible: true,
      ),
      'ch-3': const BookChapterContent(
        contentId: 'major-1',
        chapterId: 'ch-3',
        title: 'अध्याय 3',
        order: 1,
        bodyText: 'तीसरा अध्याय।',
        audioUrl: null,
        hasAudio: false,
        offlineCacheEligible: true,
      ),
      'ch-4': const BookChapterContent(
        contentId: 'major-1',
        chapterId: 'ch-4',
        title: 'अध्याय 4',
        order: 2,
        bodyText: 'चौथा अध्याय।',
        audioUrl: null,
        hasAudio: false,
        offlineCacheEligible: true,
      ),
      'loose-1': const BookChapterContent(
        contentId: 'major-2',
        chapterId: 'loose-1',
        title: 'अध्याय 1',
        order: 1,
        bodyText: 'गीता का पहला अध्याय।',
        audioUrl: null,
        hasAudio: false,
        offlineCacheEligible: true,
      ),
      'loose-2': const BookChapterContent(
        contentId: 'major-2',
        chapterId: 'loose-2',
        title: 'अध्याय 2',
        order: 2,
        bodyText: 'गीता का दूसरा अध्याय।',
        audioUrl: null,
        hasAudio: false,
        offlineCacheEligible: true,
      ),
    };

BookScriptureContent fakeScripture({bool offlineCacheEligible = true}) =>
    BookScriptureContent(
      contentId: 'chalisa-1',
      category: BookCategory.chalisa,
      title: 'Shri Hanuman Chalisa',
      coverImageUrl: '',
      author: 'Tulsidas',
      languages: const ['hi'],
      contentBody: 'जय हनुमान ज्ञान गुन सागर।\nजय कपीस तिहुँ लोक उजागर।',
      offlineCacheEligible: offlineCacheEligible,
    );

/// Builds a matching-shape network error the way dio would surface a status.
DioException fakeBooksDioError(int statusCode, {String? message}) {
  final request = RequestOptions(path: '/books');
  return DioException(
    requestOptions: request,
    type: DioExceptionType.badResponse,
    response: Response<dynamic>(
      requestOptions: request,
      statusCode: statusCode,
      data: {'success': false, 'message': message ?? 'error', 'data': null},
    ),
  );
}
