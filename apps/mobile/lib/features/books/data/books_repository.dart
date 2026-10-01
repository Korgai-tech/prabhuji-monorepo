import 'dart:io';

import 'package:dio/dio.dart';
import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';
import 'books_models.dart';

/// What went wrong, in the vocabulary the UI branches on. The screens NEVER
/// render a raw error string or a status code (#EXPORT_CRITICAL, PRD §9).
enum BooksErrorKind {
  /// No connectivity. For reading payloads this is the cue to try the offline
  /// text cache before showing anything (r12).
  offline,

  /// `403` — the server's Pro gate. No content was serialized, so the client has
  /// nothing to preview even if it wanted to: route to the paywall.
  proRequired,

  /// `404` — unknown/withdrawn content.
  notFound,

  /// Anything else (5xx, malformed envelope, …) → calm retry state.
  unknown,
}

/// Typed failure for every Books call.
@immutable
class BooksException implements Exception {
  const BooksException(this.kind, [this.message]);

  final BooksErrorKind kind;

  /// The server's `message`, when it sent a well-shaped envelope. Used for
  /// logging/analytics — never rendered verbatim.
  final String? message;

  @override
  String toString() => 'BooksException($kind)${message == null ? '' : ': $message'}';
}

/// Data seam for Books & Scriptures (TAM-76), over the TAM-75 contract mapped
/// through the generated api-client types (no `dynamic`). A deterministic
/// `FakeBooksRepository` (test support) swaps in so every UI + bloc test runs
/// offline.
///
/// Discovery ([fetchHome], [fetchAll], [fetchCategory]) is FREE. The three
/// reading calls are Pro-gated server-side and throw
/// [BooksErrorKind.proRequired] on `403`.
abstract interface class BooksRepository {
  /// `GET /books/home` → the CMS-authored, CMS-ordered sections.
  Future<BooksHome> fetchHome();

  /// `GET /books` → one keyset-paginated page of every book.
  Future<BookListPage> fetchAll({String? cursor, int limit});

  /// `GET /books/categories/{category}` → one keyset-paginated page.
  Future<BookListPage> fetchCategory(
    BookCategory category, {
    String? cursor,
    int limit,
  });

  /// `GET /books/{contentId}/contents` → a major book's kanda/chapter hierarchy.
  Future<BookContents> fetchContents(String contentId);

  /// `GET /books/{contentId}/chapters/{chapterId}` → one chapter's body + audio.
  Future<BookChapterContent> fetchChapter(String contentId, String chapterId);

  /// `GET /books/{contentId}/scripture` → a direct scripture's body.
  Future<BookScriptureContent> fetchScripture(String contentId);
}

/// Dio-backed implementation over the TAM-75 contract.
class DioBooksRepository implements BooksRepository {
  DioBooksRepository(this._dio);
  final Dio _dio;

  /// The contract's own default (`limit` schema default = 20, max 50).
  static const int defaultLimit = 20;

  /// `GET /books/home` → the CMS-authored sections, in the server's `sortOrder`.
  ///
  /// The generated `BooksHomeSection`/`BooksHomeSectionItemsInner` models are
  /// UNUSABLE here, exactly like Aarti's (`aarti_models.dart`): openapi-generator
  /// flattens the items' `oneOf` into ONE all-required class that force-unwraps
  /// every field, so a `category` item (which carries no `contentId`/
  /// `coverImageUrl`/…) throws the moment it is parsed — and would take the whole
  /// Books tab with it. So the sections are branched on their `kind`
  /// discriminator here and mapped from the clean per-variant models
  /// (`BookSectionBookItem` / `BookSectionCategoryItem`), which the generator
  /// emits correctly (nullable `category`/`author` and all).
  @override
  Future<BooksHome> fetchHome() async {
    try {
      final res = await _dio.get<dynamic>('/books/home');
      final body = _envelope(res);
      final data = body['data'];
      final raw = data is Map ? data['sections'] : null;

      final sections = <BooksHomeSectionView>[];
      if (raw is List) {
        for (final row in raw) {
          if (row is! Map) continue;
          final map = row.cast<String, dynamic>();
          // Unknown section key — skipped forward-compatibly. Layout keys off
          // the KEY, never the title (#EXPORT_CRITICAL).
          final key = BooksSectionKey.fromWire(map['key']?.toString());
          if (key == null) continue;
          sections.add(_section(key, map));
        }
      }

      // CMS-owned order — `sortOrder` is honoured explicitly rather than trusting
      // array order, because section ORDER is content now.
      sections.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      return BooksHome(sections: List.unmodifiable(sections));
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// Branch one section's polymorphic `items[]` on its `kind` discriminator into
  /// the two typed lists the UI renders. An item whose `kind` — or whose own
  /// enums — this build doesn't know is left out of both, never guessed at.
  BooksHomeSectionView _section(BooksSectionKey key, Map<String, dynamic> map) {
    final items = map['items'];
    final books = <BookCardView>[];
    final categories = <BookCategoryView>[];
    if (items is List) {
      for (final item in items) {
        if (item is! Map) continue;
        switch (item['kind']?.toString()) {
          case 'book':
            // Unknown contentType ⇒ the generated parser would throw on its
            // force-unwrapped enum, so it is screened BEFORE fromJson.
            if (BookContentType.fromWire(item['contentType']?.toString() ?? '') ==
                null) {
              continue;
            }
            final b = BookSectionBookItem.fromJson(item);
            if (b != null) books.add(_bookFromSectionItem(b));
          case 'category':
            if (BookCategory.fromWire(item['category']?.toString()) == null) {
              continue;
            }
            final c = BookSectionCategoryItem.fromJson(item);
            if (c != null) categories.add(_categoryFromSectionItem(c));
        }
      }
    }
    return BooksHomeSectionView(
      key: key,
      // CMS copy, rendered verbatim by the screen.
      title: map['title']?.toString() ?? '',
      sortOrder: (map['sortOrder'] as num?)?.toInt() ?? 0,
      books: books,
      categories: categories,
    );
  }

  static BookCardView _bookFromSectionItem(BookSectionBookItem i) => BookCardView(
        contentId: i.contentId,
        // Screened above, so this cannot be null.
        contentType: BookContentType.fromWire(i.contentType.value)!,
        category: BookCategory.fromWire(i.category?.value),
        title: i.title,
        coverImageUrl: i.coverImageUrl,
        author: i.author,
        languages: i.languages,
        offlineCacheEligible: i.offlineCacheEligible,
      );

  static BookCategoryView _categoryFromSectionItem(BookSectionCategoryItem i) =>
      BookCategoryView(
        category: BookCategory.fromWire(i.category.value)!,
        title: i.title,
        itemCount: i.itemCount,
      );

  @override
  Future<BookListPage> fetchAll({String? cursor, int limit = defaultLimit}) =>
      _page('/books', cursor: cursor, limit: limit);

  @override
  Future<BookListPage> fetchCategory(
    BookCategory category, {
    String? cursor,
    int limit = defaultLimit,
  }) =>
      _page('/books/categories/${category.wire}', cursor: cursor, limit: limit);

  Future<BookListPage> _page(
    String path, {
    required String? cursor,
    required int limit,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        path,
        queryParameters: {'cursor': ?cursor, 'limit': limit},
      );
      final body = _envelope(res);
      final data = body['data'];
      if (data is Map) _pruneUnknownCards(data['items']);
      final response = BookCardPageResponse.fromJson(body);
      if (response == null) {
        throw const BooksException(BooksErrorKind.unknown, 'Malformed response');
      }
      return BookListPage(
        // Server-owned heading ('All Books' / the category's title) — the client
        // used to hardcode one and render the category enum's wire value as the
        // other.
        title: response.data.title,
        items: _cards(response.data.items),
        nextCursor: response.data.nextCursor,
      );
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<BookContents> fetchContents(String contentId) async {
    try {
      final res = await _dio.get<dynamic>('/books/$contentId/contents');
      final response = BookContentsResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const BooksException(BooksErrorKind.unknown, 'Malformed response');
      }
      return BookContents.fromData(response.data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<BookChapterContent> fetchChapter(
    String contentId,
    String chapterId,
  ) async {
    try {
      final res =
          await _dio.get<dynamic>('/books/$contentId/chapters/$chapterId');
      final response = BookChapterContentResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const BooksException(BooksErrorKind.unknown, 'Malformed response');
      }
      return BookChapterContent.fromData(response.data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<BookScriptureContent> fetchScripture(String contentId) async {
    try {
      final res = await _dio.get<dynamic>('/books/$contentId/scripture');
      final response = BookScriptureContentResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const BooksException(BooksErrorKind.unknown, 'Malformed response');
      }
      return BookScriptureContent.fromData(response.data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  static List<BookCardView> _cards(List<BookCard> raw) =>
      raw.map(BookCardView.fromCard).nonNulls.toList(growable: false);

  /// Drop rows whose `contentType` this build doesn't know, BEFORE the generated
  /// parser sees them.
  ///
  /// This has to happen on the raw JSON: `BookCard.fromJson` does
  /// `BookCardContentTypeEnum.fromJson(json['contentType'])!`, so ONE unknown
  /// value throws and takes the entire page down with it — a future contract
  /// adding a third content type would black out the Books tab for every older
  /// client. Pruning here keeps the documented behaviour (unknown item is
  /// skipped, the page still renders — route-allowlist rule,
  /// flutter-feed-screen.md) without hand-editing generated code, which is
  /// forbidden.
  static void _pruneUnknownCards(Object? list) {
    if (list is! List) return;
    list.removeWhere((row) =>
        row is! Map ||
        BookContentType.fromWire(row['contentType']?.toString() ?? '') == null);
  }

  /// Maps transport/status failures onto the typed kinds the UI branches on.
  static BooksException _mapDioError(DioException e) {
    if (e.error is SocketException ||
        e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const BooksException(BooksErrorKind.offline);
    }
    final status = e.response?.statusCode;
    final body = e.response?.data;
    final message =
        body is Map && body['message'] is String ? body['message'] as String : null;
    switch (status) {
      case 403:
        // Server-side Pro gate (TAM-75) — no reading payload was serialized.
        return BooksException(BooksErrorKind.proRequired, message);
      case 404:
        return BooksException(BooksErrorKind.notFound, message);
      default:
        return BooksException(BooksErrorKind.unknown, message);
    }
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw const BooksException(BooksErrorKind.unknown, 'Malformed response');
    }
    if (body['success'] != true) {
      throw BooksException(
        BooksErrorKind.unknown,
        body['message']?.toString() ?? 'Request failed',
      );
    }
    return body;
  }
}
