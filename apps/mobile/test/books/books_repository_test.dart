import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/books/data/books_models.dart';
import 'package:mobile/features/books/data/books_repository.dart';

import '../support/fake_books_services.dart';

/// A dio double that returns a canned response or throws a canned error, so the
/// repository's contract mapping is tested without a server.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? stream,
          Future<void>? cancelFuture) =>
      handler(options);

  @override
  void close({bool force = false}) {}
}

Dio _dioReturning(Map<String, dynamic> body, {int status = 200}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = _StubAdapter((options) async => ResponseBody.fromString(
        _json(body),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ));
  return dio;
}

String _json(Object body) => const JsonEncoderShim().convert(body);

/// Tiny shim so the test file doesn't need dart:convert's import name clash.
class JsonEncoderShim {
  const JsonEncoderShim();
  String convert(Object o) => _encode(o);
  static String _encode(Object? o) {
    if (o is Map) {
      return '{${o.entries.map((e) => '"${e.key}":${_encode(e.value)}').join(',')}}';
    }
    if (o is List) return '[${o.map(_encode).join(',')}]';
    if (o is String) return '"${o.replaceAll(r'\', r'\\').replaceAll('"', r'\"')}"';
    return '$o';
  }
}

Dio _dioThrowing(DioException error) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = _StubAdapter((options) async => throw error);
  return dio;
}

Map<String, dynamic> _card(String id, String type, String? category) => {
      'contentId': id,
      'contentType': type,
      'category': category,
      'title': 'Title $id',
      'coverImageUrl': 'https://cdn.test/$id.jpg',
      'author': 'Author',
      'languages': ['hi'],
      'offlineCacheEligible': true,
    };

/// A `kind: book` section item — the card shape plus its discriminator.
Map<String, dynamic> _bookItem(String id, String type, String? category) => {
      'kind': 'book',
      ..._card(id, type, category),
    };

/// A `kind: category` section item. Note it carries NONE of the book fields —
/// which is exactly what the generated flattened-union model chokes on.
Map<String, dynamic> _categoryItem(
  String category, {
  String? title,
  int itemCount = 5,
}) =>
    {
      'kind': 'category',
      'category': category,
      'title': title ?? category,
      'itemCount': itemCount,
    };

Map<String, dynamic> _section(
  String key,
  String title,
  int sortOrder,
  List<Map<String, dynamic>> items,
) =>
    {'key': key, 'title': title, 'sortOrder': sortOrder, 'items': items};

void main() {
  group('DioBooksRepository — contract mapping', () {
    test('parses /books/home sections: server titles, server sortOrder, '
        'kind-discriminated items', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          // Deliberately out of order on the wire.
          'sections': [
            _section('newly_added', 'Fresh Additions', 2, [
              _bookItem('chalisa-1', 'direct_scripture', 'Chalisa'),
            ]),
            _section('carousel', 'Sacred Library', 0, [
              _bookItem('major-1', 'major_book', null),
            ]),
            _section('categories', 'Explore by Type', 1, [
              _categoryItem('Chalisa'),
            ]),
          ],
        },
      });

      final home = await DioBooksRepository(dio).fetchHome();

      // Ordered by sortOrder, NOT by array position.
      expect(
        home.sections.map((s) => s.key),
        [
          BooksSectionKey.carousel,
          BooksSectionKey.categories,
          BooksSectionKey.newlyAdded,
        ],
      );
      // Titles come off the wire verbatim.
      expect(
        home.sections.map((s) => s.title),
        ['Sacred Library', 'Explore by Type', 'Fresh Additions'],
      );

      final carousel = home.sections.first;
      expect(carousel.books.single.contentType, BookContentType.majorBook);
      expect(carousel.books.single.category, isNull);

      final categories = home.sections[1];
      expect(categories.categories.single.category, BookCategory.chalisa);
      expect(categories.categories.single.itemCount, 5);

      final newly = home.sections.last;
      expect(newly.books.single.contentType, BookContentType.directScripture);
      expect(newly.books.single.category, BookCategory.chalisa);
    });

    test('drops a section whose key this build does not know, keeping the rest',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            _section('carousel', 'Sacred Library', 0, [
              _bookItem('major-1', 'major_book', null),
            ]),
            _section('editors_picks_v2', 'Editors Picks', 1, [
              _bookItem('major-9', 'major_book', null),
            ]),
          ],
        },
      });

      final home = await DioBooksRepository(dio).fetchHome();

      expect(home.sections.map((s) => s.key), [BooksSectionKey.carousel]);
    });

    test('drops section items with an unknown contentType (forward-compatible)',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            _section('carousel', 'Sacred Library', 0, [
              _bookItem('major-1', 'major_book', null),
              _bookItem('weird-1', 'audio_book_v2', null),
            ]),
          ],
        },
      });

      final home = await DioBooksRepository(dio).fetchHome();

      expect(home.sections.single.books, hasLength(1));
      expect(home.sections.single.books.single.contentId, 'major-1');
    });

    test('drops category items with an unknown slug (forward-compatible)',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            _section('categories', 'Explore by Type', 0, [
              _categoryItem('Chalisa'),
              _categoryItem('Sahasranama', title: 'New!', itemCount: 2),
            ]),
          ],
        },
      });

      final home = await DioBooksRepository(dio).fetchHome();

      expect(home.sections.single.categories, hasLength(1));
      expect(
        home.sections.single.categories.single.category,
        BookCategory.chalisa,
      );
    });

    test('drops an item whose kind this build does not know', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            _section('carousel', 'Sacred Library', 0, [
              _bookItem('major-1', 'major_book', null),
              {'kind': 'playlist_v2', 'contentId': 'p-1', 'title': 'Mix'},
            ]),
          ],
        },
      });

      final home = await DioBooksRepository(dio).fetchHome();

      expect(home.sections.single.books, hasLength(1));
    });

    test('a mixed section parses BOTH kinds — the flattened union model would '
        'have thrown here', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'sections': [
            _section('carousel', 'Sacred Library', 0, [
              _bookItem('major-1', 'major_book', null),
              _categoryItem('Aarti', itemCount: 3),
            ]),
          ],
        },
      });

      final home = await DioBooksRepository(dio).fetchHome();

      expect(home.sections.single.books.single.contentId, 'major-1');
      expect(home.sections.single.categories.single.itemCount, 3);
    });

    test('an unknown contentType inside a LISTING page drops just that card',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'title': 'Every Sacred Text',
          'items': [
            _card('major-1', 'major_book', null),
            _card('weird-1', 'audio_book_v2', null),
            _card('chalisa-1', 'direct_scripture', 'Chalisa'),
          ],
          'nextCursor': null,
        },
      });

      final page = await DioBooksRepository(dio).fetchAll();

      expect(page.items.map((b) => b.contentId), ['major-1', 'chalisa-1']);
    });

    test("a listing page carries the SERVER's title, for both endpoints",
        () async {
      final all = await DioBooksRepository(_dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'title': 'Every Sacred Text',
          'items': [_card('major-1', 'major_book', null)],
          'nextCursor': null,
        },
      })).fetchAll();
      // Not 'All Books' — that string was the client's, and is gone.
      expect(all.title, 'Every Sacred Text');

      final category = await DioBooksRepository(_dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'title': 'Chalisa Collection',
          'items': [_card('chalisa-1', 'direct_scripture', 'Chalisa')],
          'nextCursor': null,
        },
      })).fetchCategory(BookCategory.chalisa);
      // Not 'Chalisa' — the enum's wire value is a path segment, not a heading.
      expect(category.title, 'Chalisa Collection');
    });

    test('parses a keyset page + its cursor', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'title': 'Every Sacred Text',
          'items': [_card('major-1', 'major_book', null)],
          'nextCursor': 'abc',
        },
      });

      final page = await DioBooksRepository(dio).fetchAll();

      expect(page.items, hasLength(1));
      expect(page.nextCursor, 'abc');
      expect(page.hasMore, isTrue);
    });

    test('a null cursor means the last page', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'title': 'Every Sacred Text',
          'items': <Object>[],
          'nextCursor': null,
        },
      });

      final page = await DioBooksRepository(dio).fetchAll();

      expect(page.hasMore, isFalse);
    });
  });

  group('DioBooksRepository — error mapping', () {
    test('403 on a reading call → proRequired (the server Pro gate)', () async {
      final dio = _dioThrowing(fakeBooksDioError(403, message: 'Pro required'));

      await expectLater(
        DioBooksRepository(dio).fetchContents('major-1'),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.proRequired)
            .having((e) => e.message, 'message', 'Pro required')),
      );
    });

    test('403 on a chapter and a scripture map the same way', () async {
      final dio = _dioThrowing(fakeBooksDioError(403));

      await expectLater(
        DioBooksRepository(dio).fetchChapter('major-1', 'ch-1'),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.proRequired)),
      );
      await expectLater(
        DioBooksRepository(dio).fetchScripture('chalisa-1'),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.proRequired)),
      );
    });

    test('404 → notFound', () async {
      final dio = _dioThrowing(fakeBooksDioError(404));

      await expectLater(
        DioBooksRepository(dio).fetchContents('nope'),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.notFound)),
      );
    });

    test('500 → unknown', () async {
      final dio = _dioThrowing(fakeBooksDioError(500));

      await expectLater(
        DioBooksRepository(dio).fetchHome(),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.unknown)),
      );
    });

    test('a socket failure → offline (drives the cache fallback)', () async {
      final request = RequestOptions(path: '/books/home');
      final dio = _dioThrowing(DioException(
        requestOptions: request,
        type: DioExceptionType.unknown,
        error: const SocketException('no route'),
      ));

      await expectLater(
        DioBooksRepository(dio).fetchHome(),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.offline)),
      );
    });

    test('a connection timeout → offline', () async {
      final request = RequestOptions(path: '/books/home');
      final dio = _dioThrowing(DioException(
        requestOptions: request,
        type: DioExceptionType.connectionTimeout,
      ));

      await expectLater(
        DioBooksRepository(dio).fetchHome(),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.offline)),
      );
    });

    test('success:false envelope → unknown, never a silent empty page',
        () async {
      final dio = _dioReturning({
        'success': false,
        'message': 'boom',
        'data': null,
      });

      await expectLater(
        DioBooksRepository(dio).fetchHome(),
        throwsA(isA<BooksException>()
            .having((e) => e.kind, 'kind', BooksErrorKind.unknown)),
      );
    });
  });

  group('BookContents — reading order', () {
    test('flattens sub-book chapters in order, then loose chapters', () {
      expect(
        fakeBookContents().readingOrder.map((c) => c.chapterId),
        ['ch-1', 'ch-2', 'ch-3', 'ch-4'],
      );
    });

    test('a book with no sub-books yields its loose chapters', () {
      expect(
        fakeLooseChapterContents().readingOrder.map((c) => c.chapterId),
        ['loose-1', 'loose-2'],
      );
    });

    test('subBookOf resolves the kanda a chapter belongs to', () {
      final contents = fakeBookContents();
      expect(contents.subBookOf('ch-3')?.title, 'अयोध्या-काण्ड');
      expect(contents.subBookOf('nope'), isNull);
    });

    test('firstChapter is what Start Reading opens', () {
      expect(fakeBookContents().firstChapter?.chapterId, 'ch-1');
    });
  });
}
