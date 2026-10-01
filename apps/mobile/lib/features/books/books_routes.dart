import 'package:meta/meta.dart';

import 'data/books_models.dart';

/// go_router paths for Books & Scriptures (TAM-76).
///
/// Unlike Aarti/Mantras/Ringtone/Wallpaper (which open full-screen OVER the
/// shell), Books **Home lives INSIDE the TAM-58 shell** as branch 4: Figma
/// 534:5061 renders the five-item bottom nav with Books active. Everything
/// downstream (listings, contents, readers) pushes over the shell with its own
/// back-nav and no bottom tabs — same treatment Status/Horoscope use for their
/// detail flows.
class BooksRoutes {
  BooksRoutes._();

  /// Module entry — the shell's Books tab (bottom nav visible).
  static const String home = '/books';

  /// All-books listing. Opened from Home's "Show all".
  static const String all = '/books/all';

  /// Category listing. The [BookCategory] rides in the path so the route is
  /// deep-linkable and the allowlist can reject unknown slugs.
  static const String categoryPattern = '/books/category/:category';
  static String category(BookCategory c) => '/books/category/${c.wire}';

  /// Major-book contents (Pro). [BookReaderArgs] is NOT used here — the id is
  /// enough; the screen fetches its own hierarchy.
  static const String contentsPattern = '/books/:id/contents';
  static String contents(String contentId) => '/books/$contentId/contents';

  /// Major-book reader (Pro). [BookReaderArgs] rides as the route extra.
  static const String readPattern = '/books/:id/read';
  static String read(String contentId) => '/books/$contentId/read';

  /// Direct-scripture reader (Pro). No contents hierarchy, no chapter chrome.
  static const String scripturePattern = '/books/:id/scripture';
  static String scripture(String contentId) => '/books/$contentId/scripture';
}

/// Route extra for the major-book reader.
///
/// Carries the pre-fetched [contents] so the reader can render its Prev/Next
/// end-states and chapter drawer without a second `/contents` round-trip — and,
/// critically, so a post-purchase resume lands on EXACTLY the chapter the user
/// originally tapped (#PATH_DECISION: persisted in the passed extra, never
/// ephemeral widget state).
@immutable
class BookReaderArgs {
  const BookReaderArgs({
    required this.contentId,
    required this.title,
    this.chapterId,
    this.contents,
    this.coverImageUrl = '',
    this.sourceListType = 'contents',
  });

  final String contentId;

  /// The BOOK title (the drawer header renders it; the nav renders the kanda).
  final String title;

  /// Chapter to open on. `null` ⇒ the first chapter of [contents]' reading
  /// order — what "Start Reading" means (q5).
  final String? chapterId;

  /// The book's hierarchy, when the caller already has it (Contents → reader).
  final BookContents? contents;

  final String coverImageUrl;

  /// Analytics `source_list_type` for `book_reader_opened`.
  final String sourceListType;
}
