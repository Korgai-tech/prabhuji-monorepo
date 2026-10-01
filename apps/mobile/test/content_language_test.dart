import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/locale_interceptor.dart';
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/data/aarti_repository.dart';
import 'package:mobile/features/books/data/books_repository.dart';
import 'package:mobile/features/home/data/home_repository.dart';
import 'package:mobile/features/mantras/data/mantras_repository.dart';
import 'package:mobile/features/status/data/status_repository.dart';

/// A dio double that records the outgoing request and returns a canned envelope,
/// so we can assert exactly which query params reached the wire (TAM-108 — the
/// selected content language must reach the feed calls).
///
/// The repositories no longer take a `language` callback: `localeInterceptor`
/// (`core/locale_interceptor.dart`) puts `locale` on every GET from ONE place,
/// which is what closed the six endpoints that silently omitted it. So these
/// tests install the interceptor on the test dio exactly as `buildDio` does.
class _CapturingAdapter implements HttpClientAdapter {
  _CapturingAdapter(this.body);
  final Map<String, dynamic> body;
  RequestOptions? lastRequest;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }
}

/// A dio wired like `buildDio`: the locale interceptor resolving [language].
Dio _dio(_CapturingAdapter adapter, {String? language}) =>
    Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(localeInterceptor(() => language));

const _emptyPage = {
  'success': true,
  'message': 'ok',
  'data': {'items': <dynamic>[], 'nextCursor': null},
};
const _emptySections = {
  'success': true,
  'message': 'ok',
  'data': {'sections': <dynamic>[]},
};
const _emptyList = {'success': true, 'message': 'ok', 'data': <dynamic>[]};

const _aartiQuery = AartiListQuery(title: 'Aarti', sourceListType: 'newly_added');

void main() {
  group('content language reaches the feed query (TAM-108)', () {
    test('aarti /aarti/audios sends the selected language as `locale`', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      final repo = DioAartiRepository(_dio(adapter, language: 'mr'));

      await repo.fetchAudios(_aartiQuery);

      expect(adapter.lastRequest!.uri.path, '/aarti/audios');
      expect(adapter.lastRequest!.uri.queryParameters['locale'], 'mr');
    });

    test('aarti omits `locale` when no language is selected', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      // Null resolver → param absent. ABSENCE IS MEANINGFUL: the server reads it
      // as "no language filter" and returns every language, so this must not be
      // defaulted to `hi`.
      final repo = DioAartiRepository(_dio(adapter));

      await repo.fetchAudios(_aartiQuery);

      expect(adapter.lastRequest!.uri.queryParameters.containsKey('locale'), isFalse);
    });

    test('status /status/feed sends the selected language as `locale`', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      final repo = DioStatusRepository(_dio(adapter, language: 'hi'));

      await repo.fetchFeed();

      expect(adapter.lastRequest!.uri.path, '/status/feed');
      // Was `language` until the platform-wide `locale` standardization.
      expect(adapter.lastRequest!.uri.queryParameters['locale'], 'hi');
      expect(adapter.lastRequest!.uri.queryParameters.containsKey('language'), isFalse);
    });

    test('status omits `locale` when the resolver yields null', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      final repo = DioStatusRepository(_dio(adapter));

      await repo.fetchFeed();

      expect(adapter.lastRequest!.uri.queryParameters.containsKey('locale'), isFalse);
    });
  });

  /// These six endpoints all accepted `locale` server-side and the app never
  /// sent it, so their labels were stuck on the English base column regardless
  /// of what the user picked. They are the reason injection moved into an
  /// interceptor rather than staying a per-call-site parameter.
  group('endpoints that previously never sent a locale', () {
    test('mantras /mantras/sections sends `locale`', () async {
      final adapter = _CapturingAdapter(_emptySections);
      final repo = DioMantrasRepository(_dio(adapter, language: 'hi'));

      await repo.fetchSections();

      expect(adapter.lastRequest!.uri.path, '/mantras/sections');
      expect(adapter.lastRequest!.uri.queryParameters['locale'], 'hi');
    });

    test('books /books/home sends `locale`', () async {
      final adapter = _CapturingAdapter(_emptySections);
      final repo = DioBooksRepository(_dio(adapter, language: 'bn'));

      // We assert on the REQUEST; the canned envelope is not a full fixture, so
      // response parsing is expected to fail and is deliberately ignored.
      try {
        await repo.fetchHome();
      } catch (_) {}

      expect(adapter.lastRequest!.uri.path, '/books/home');
      expect(adapter.lastRequest!.uri.queryParameters['locale'], 'bn');
    });

    test('home /home/banners sends `locale`', () async {
      final adapter = _CapturingAdapter(_emptyList);
      final repo = DioHomeRepository(_dio(adapter, language: 'ta'));

      try {
        await repo.fetchBanners();
      } catch (_) {}

      expect(adapter.lastRequest!.uri.path, '/home/banners');
      expect(adapter.lastRequest!.uri.queryParameters['locale'], 'ta');
    });
  });

  group('localeInterceptor rules', () {
    test('never overwrites a locale the caller already set', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      final dio = _dio(adapter, language: 'hi');

      await dio.get<dynamic>('/anything', queryParameters: {'locale': 'te'});

      expect(adapter.lastRequest!.uri.queryParameters['locale'], 'te');
    });

    test('skipLocale opts a request out entirely', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      final dio = _dio(adapter, language: 'hi');

      await dio.get<dynamic>(
        '/horoscope/daily',
        options: Options(extra: const {kSkipLocale: true}),
      );

      expect(adapter.lastRequest!.uri.queryParameters.containsKey('locale'), isFalse);
    });

    test('does not touch non-GET requests', () async {
      final adapter = _CapturingAdapter(_emptyPage);
      final dio = _dio(adapter, language: 'hi');

      await dio.post<dynamic>('/mantras/items/x/like');

      expect(adapter.lastRequest!.uri.queryParameters.containsKey('locale'), isFalse);
    });
  });
}
