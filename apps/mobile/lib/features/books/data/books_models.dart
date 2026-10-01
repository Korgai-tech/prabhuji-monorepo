import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';

/// Domain models for Books & Scriptures (TAM-76), mapped from the generated
/// api-client types (TAM-75 contract) — never raw `dynamic`.
///
/// The reading payloads (`/contents`, `/chapters/{id}`, `/scripture`) are
/// Pro-gated SERVER-side: a free caller gets `403` and the client never receives
/// text. Discovery (`/books/home`, `/books`, `/books/categories/{c}`) is free.

/// Content shape discriminator (contract enum `BookCardContentTypeEnum`).
///
/// #PATH_DECISION — the whole module branches on this: a [majorBook] tap opens
/// Book Contents (sub-books/kandas → chapters → reader), a [directScripture] tap
/// opens the reader directly on its `contentBody`.
enum BookContentType {
  majorBook,
  directScripture;

  /// Wire → enum. Unknown strings return `null` (forward-compatible: an unknown
  /// content type is skipped rather than rendered as a broken card).
  static BookContentType? fromWire(String wire) {
    switch (wire) {
      case 'major_book':
        return BookContentType.majorBook;
      case 'direct_scripture':
        return BookContentType.directScripture;
      default:
        return null;
    }
  }

  String get wire => switch (this) {
        BookContentType.majorBook => 'major_book',
        BookContentType.directScripture => 'direct_scripture',
      };
}

/// The four MVP categories (contract enum `BookCardCategoryEnum`). A book may
/// have no category (`null` on the wire) — major books generally do.
enum BookCategory {
  chalisa,
  aarti,
  kavach,
  stotram;

  static BookCategory? fromWire(String? wire) {
    switch (wire) {
      case 'Chalisa':
        return BookCategory.chalisa;
      case 'Aarti':
        return BookCategory.aarti;
      case 'Kavach':
        return BookCategory.kavach;
      case 'Stotram':
        return BookCategory.stotram;
      default:
        return null;
    }
  }

  /// The exact path segment `/books/categories/{category}` expects.
  String get wire => switch (this) {
        BookCategory.chalisa => 'Chalisa',
        BookCategory.aarti => 'Aarti',
        BookCategory.kavach => 'Kavach',
        BookCategory.stotram => 'Stotram',
      };
}

/// A book/scripture as it appears on Home + every listing (contract `BookCard`).
///
/// Discovery is FREE and inviting: this model deliberately carries no "locked"
/// affordance, and the UI renders NO lock badge (#EXPORT_CRITICAL). The gate
/// happens on tap, not on the card.
@immutable
class BookCardView {
  const BookCardView({
    required this.contentId,
    required this.contentType,
    required this.category,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    required this.languages,
    required this.offlineCacheEligible,
  });

  final String contentId;
  final BookContentType contentType;
  final BookCategory? category;
  final String title;
  final String coverImageUrl;
  final String? author;

  /// The languages this book is available in (TAM-108). Empty = all languages;
  /// the card renders no language label, so this is carried but not displayed.
  final List<String> languages;

  /// Server's statement that READING this needs Pro. Never used to decorate the
  /// card — only the tap handler reads it.

  /// Server's statement that this content's TEXT may be cached for offline
  /// reading (r12/q2 — text only, never audio).
  final bool offlineCacheEligible;

  /// Contract → domain. Returns `null` for an unknown `contentType` so the
  /// caller can skip the item forward-compatibly.
  static BookCardView? fromCard(BookCard c) {
    final type = BookContentType.fromWire(c.contentType.value);
    if (type == null) return null;
    return BookCardView(
      contentId: c.contentId,
      contentType: type,
      category: BookCategory.fromWire(c.category?.value),
      title: c.title,
      coverImageUrl: c.coverImageUrl,
      author: c.author,
      languages: c.languages,
      offlineCacheEligible: c.offlineCacheEligible,
    );
  }
}

/// A Browse-Categories card (contract `BookCategoryCard`).
@immutable
class BookCategoryView {
  const BookCategoryView({
    required this.category,
    required this.title,
    required this.itemCount,
  });

  final BookCategory category;
  final String title;
  final int itemCount;

  static BookCategoryView? fromCard(BookCategoryCard c) {
    final category = BookCategory.fromWire(c.category.value);
    if (category == null) return null;
    return BookCategoryView(
      category: category,
      title: c.title,
      itemCount: c.itemCount,
    );
  }
}

/// Stable section identity (contract enum `BooksHomeSectionKeyEnum`).
///
/// #EXPORT_CRITICAL — layout keys off THIS, never off `title`. The title is
/// CMS copy that can be reworded at any time; the key is the contract.
enum BooksSectionKey {
  carousel,
  categories,
  newlyAdded;

  /// Wire → enum. Unknown ⇒ `null`, so a section this build doesn't know is
  /// skipped rather than crashing the tab.
  static BooksSectionKey? fromWire(String? wire) {
    switch (wire) {
      case 'carousel':
        return BooksSectionKey.carousel;
      case 'categories':
        return BooksSectionKey.categories;
      case 'newly_added':
        return BooksSectionKey.newlyAdded;
      default:
        return null;
    }
  }

  String get wire => switch (this) {
        BooksSectionKey.carousel => 'carousel',
        BooksSectionKey.categories => 'categories',
        BooksSectionKey.newlyAdded => 'newly_added',
      };

  /// Analytics `source_list_type` — the client's own vocabulary, not content.
  String get sourceListType => wire;
}

/// One CMS-authored Books Home section (contract `BooksHomeSection`).
///
/// Its items are kind-discriminated on the wire: a `book` item becomes a
/// [BookCardView], a `category` item a [BookCategoryView]. Both lists are
/// carried because one section is a card carousel and another is a category
/// grid — which one renders is decided by [key], not by which list is populated.
@immutable
class BooksHomeSectionView {
  const BooksHomeSectionView({
    required this.key,
    required this.title,
    required this.sortOrder,
    this.books = const [],
    this.categories = const [],
  });

  final BooksSectionKey key;

  /// CMS-owned heading — rendered VERBATIM. The client hardcoded 'Books' /
  /// 'Newly Added Books' / 'Browse Categories' here; it no longer knows any of
  /// that copy.
  final String title;

  final int sortOrder;

  final List<BookCardView> books;
  final List<BookCategoryView> categories;

  bool get isEmpty => books.isEmpty && categories.isEmpty;
}

/// `GET /books/home` — the CMS-ordered sections.
@immutable
class BooksHome {
  const BooksHome({required this.sections});

  /// Server-authored sections in `sortOrder`. The client renders whatever it is
  /// given: it neither knows how many sections exist nor what they are called,
  /// and a section it doesn't recognise was already dropped upstream.
  final List<BooksHomeSectionView> sections;

  /// Sections worth rendering, in the CMS's `sortOrder` — an individually empty
  /// section hides its own row rather than failing the page (screen-spec
  /// `states.empty`).
  ///
  /// The sort is repeated here (the repository already sorts at the seam) so that
  /// ORDER is guaranteed at the point of RENDER: order is server-owned content
  /// now, and it must not depend on which code path built the list.
  List<BooksHomeSectionView> get visibleSections {
    final visible = sections.where((s) => !s.isEmpty).toList();
    visible.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return List.unmodifiable(visible);
  }

  bool get isEmpty => visibleSections.isEmpty;
}

/// One keyset-paginated page of book cards (`GET /books`, `/books/categories/*`).
@immutable
class BookListPage {
  const BookListPage({
    required this.title,
    required this.items,
    required this.nextCursor,
  });

  /// The server's heading for this listing — the all-books title on `GET /books`,
  /// the category's own title on `GET /books/categories/:category`. The client
  /// used to hardcode 'All Books' and to render the category ENUM WIRE VALUE
  /// ('Chalisa', 'Stotram', …) as a page title; it now renders this.
  final String title;

  final List<BookCardView> items;

  /// `null` == last page.
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// WHICH listing a screen is showing — carried as the route extra so the screen
/// can fetch the right page without a second source of truth.
///
/// This is a QUERY, not content: it no longer owns the screen's title. The title
/// comes from the response ([BookListPage.title]); [titleHint] only exists so a
/// listing opened from a surface that ALREADY has the server's title (the Home
/// category grid) can paint its nav bar during the first fetch instead of
/// flashing an empty bar. It is never invented — a hint is only ever a string the
/// server already sent us.
@immutable
class BookListQuery {
  const BookListQuery({this.titleHint, this.category});

  /// A server-sourced title we happen to know already, or `null`.
  final String? titleHint;

  /// `null` == the all-books listing (`GET /books`).
  final BookCategory? category;

  /// Analytics `source_list_type` — client vocabulary, not content.
  String get sourceListType => category == null ? 'all_books' : 'category';
}

/// A chapter as listed on Contents / in the drawer (contract `BookChapterSummary`).
@immutable
class BookChapterSummaryView {
  const BookChapterSummaryView({
    required this.chapterId,
    required this.title,
    required this.order,
    required this.hasAudio,
  });

  final String chapterId;
  final String title;
  final int order;
  final bool hasAudio;

  static BookChapterSummaryView fromSummary(BookChapterSummary c) =>
      BookChapterSummaryView(
        chapterId: c.chapterId,
        title: c.title,
        order: c.order,
        hasAudio: c.hasAudio,
      );
}

/// A sub-book / kanda with its chapters (contract `BookSubBookSummary`).
@immutable
class BookSubBookView {
  const BookSubBookView({
    required this.subBookId,
    required this.title,
    required this.order,
    required this.chapterCount,
    required this.chapters,
  });

  final String subBookId;
  final String title;
  final int order;

  /// Server-authored count — rendered as "N chapters" (node 639:4080). Trusted
  /// over `chapters.length`, which may be a summary subset.
  final int chapterCount;
  final List<BookChapterSummaryView> chapters;

  static BookSubBookView fromSummary(BookSubBookSummary s) => BookSubBookView(
        subBookId: s.subBookId,
        title: s.title,
        order: s.order,
        chapterCount: s.chapterCount,
        chapters:
            s.chapters.map(BookChapterSummaryView.fromSummary).toList(growable: false),
      );
}

/// `GET /books/{id}/contents` — a major book's hierarchy (Pro-gated server-side).
@immutable
class BookContents {
  const BookContents({
    required this.contentId,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    required this.languages,
    required this.offlineCacheEligible,
    required this.subBooks,
    required this.chapters,
    required this.totalChapterCount,
  });

  final String contentId;
  final String title;
  final String coverImageUrl;
  final String? author;

  /// Languages this book is available in (TAM-108). Empty = all languages.
  final List<String> languages;
  final bool offlineCacheEligible;

  /// Sub-books/kandas. MAY be empty — a major book can carry loose [chapters]
  /// with no kanda level at all, which Contents must render just as happily.
  final List<BookSubBookView> subBooks;

  /// Top-level chapters that belong to no sub-book.
  final List<BookChapterSummaryView> chapters;

  final int totalChapterCount;

  /// The flat reading order the reader's Prev/Next walk: every sub-book's
  /// chapters in `order`, then the loose top-level chapters. This single list is
  /// why Prev/Next never needs to know about the kanda level.
  List<BookChapterSummaryView> get readingOrder {
    final sorted = [...subBooks]..sort((a, b) => a.order.compareTo(b.order));
    return <BookChapterSummaryView>[
      for (final s in sorted)
        ...([...s.chapters]..sort((a, b) => a.order.compareTo(b.order))),
      ...([...chapters]..sort((a, b) => a.order.compareTo(b.order))),
    ];
  }

  /// The chapter "Start Reading" opens (q5: the first of the reading order).
  BookChapterSummaryView? get firstChapter =>
      readingOrder.isEmpty ? null : readingOrder.first;

  /// The sub-book a chapter belongs to — the reader nav's title (node
  /// I620:3917;5186:10376 renders the KANDA name, not the book name).
  BookSubBookView? subBookOf(String chapterId) {
    for (final s in subBooks) {
      if (s.chapters.any((c) => c.chapterId == chapterId)) return s;
    }
    return null;
  }

  static BookContents fromData(BookContentsResponseData d) => BookContents(
        contentId: d.contentId,
        title: d.title,
        coverImageUrl: d.coverImageUrl,
        author: d.author,
        languages: d.languages,
        offlineCacheEligible: d.offlineCacheEligible,
        subBooks: d.subBooks.map(BookSubBookView.fromSummary).toList(growable: false),
        chapters:
            d.chapters.map(BookChapterSummaryView.fromSummary).toList(growable: false),
        totalChapterCount: d.totalChapterCount,
      );
}

/// `GET /books/{id}/chapters/{chapterId}` — one chapter's body (Pro-gated).
@immutable
class BookChapterContent {
  const BookChapterContent({
    required this.contentId,
    required this.chapterId,
    required this.title,
    required this.order,
    required this.bodyText,
    required this.audioUrl,
    required this.hasAudio,
    required this.offlineCacheEligible,
  });

  final String contentId;
  final String chapterId;
  final String title;
  final int order;

  /// Devanagari body — rendered VERBATIM (line breaks preserved, never
  /// truncated, PRD §15).
  final String bodyText;

  /// Narration URL. `null`/blank ⇒ the Listen Audio button is HIDDEN, never
  /// disabled (PRD §10, screen-spec `unavailable_behavior.preferred`).
  final String? audioUrl;
  final bool hasAudio;
  final bool offlineCacheEligible;

  /// Data-driven Listen Audio visibility. Both flags must agree: `hasAudio`
  /// alone is not enough if the server withheld the URL.
  bool get canListen => hasAudio && (audioUrl ?? '').trim().isNotEmpty;

  static BookChapterContent fromData(BookChapterContentResponseData d) =>
      BookChapterContent(
        contentId: d.contentId,
        chapterId: d.chapterId,
        title: d.title,
        order: d.order,
        bodyText: d.bodyText,
        audioUrl: d.audioUrl,
        hasAudio: d.hasAudio,
        offlineCacheEligible: d.offlineCacheEligible,
      );
}

/// `GET /books/{id}/scripture` — a direct scripture's body (Pro-gated).
/// Never carries audio: direct scriptures have no narration in MVP (PRD §10).
@immutable
class BookScriptureContent {
  const BookScriptureContent({
    required this.contentId,
    required this.category,
    required this.title,
    required this.coverImageUrl,
    required this.author,
    required this.languages,
    required this.contentBody,
    required this.offlineCacheEligible,
  });

  final String contentId;
  final BookCategory? category;
  final String title;
  final String coverImageUrl;
  final String? author;

  /// Languages this scripture is available in (TAM-108). Empty = all languages.
  final List<String> languages;
  final String contentBody;
  final bool offlineCacheEligible;

  static BookScriptureContent fromData(BookScriptureContentResponseData d) =>
      BookScriptureContent(
        contentId: d.contentId,
        category: BookCategory.fromWire(d.category?.value),
        title: d.title,
        coverImageUrl: d.coverImageUrl,
        author: d.author,
        languages: d.languages,
        contentBody: d.contentBody,
        offlineCacheEligible: d.offlineCacheEligible,
      );
}
