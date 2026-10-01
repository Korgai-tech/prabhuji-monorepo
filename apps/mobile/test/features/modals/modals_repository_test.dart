import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/modals/data/modals_repository.dart';

/// [DioModalsRepository] tests (TAM-174), driven through a stubbed dio
/// adapter — mirrors `test/home/home_repository_test.dart`'s `_StubAdapter`.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);
  final ResponseBody Function(RequestOptions options) handler;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => handler(options);
}

Dio _dioReturning(Map<String, dynamic> body, {int status = 200}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))
    ..httpClientAdapter = _StubAdapter(
      (options) => ResponseBody.fromString(
        jsonEncode(body),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    );
  return dio;
}

Map<String, dynamic> _wireModal({
  String key = 'modal-1',
  String triggerSource = 'first_time',
  int showNumber = 1,
  String? lastOutcomeModule,
}) => {
  'key': key,
  'triggerSource': triggerSource,
  'showNumber': showNumber,
  'lastOutcomeModule': lastOutcomeModule,
  'localeServed': 'hi',
  'content': {
    'title': 'अपनी फोटो और नाम जोड़ें',
    'body': null,
    'imageUrl': 'https://cdn.example.com/sample.png',
    'ctaText': 'फोटो जोड़ें',
    'ctaDeeplink': 'prabhuji://status/personal-details',
  },
};

void main() {
  group('fetchNext', () {
    test('a null modal parses as "no modal" — NOT an error', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {'modal': null},
      });

      final modal = await DioModalsRepository(dio).fetchNext(surface: 'home');

      expect(modal, isNull);
    });

    test(
      'maps the wire modal onto the view model, including showNumber',
      () async {
        final dio = _dioReturning({
          'success': true,
          'message': 'ok',
          'data': {'modal': _wireModal(showNumber: 3)},
        });

        final modal = await DioModalsRepository(dio).fetchNext(surface: 'home');

        expect(modal, isNotNull);
        expect(modal!.key, 'modal-1');
        expect(modal.triggerSource, 'first_time');
        // The idempotency key — must survive the wire round trip UNCHANGED.
        expect(modal.showNumber, 3);
        expect(modal.title, 'अपनी फोटो और नाम जोड़ें');
        expect(modal.ctaText, 'फोटो जोड़ें');
        expect(modal.ctaDeeplink, 'prabhuji://status/personal-details');
        expect(modal.imageUrl, 'https://cdn.example.com/sample.png');
        expect(modal.body, isNull);
      },
    );

    test(
      'a non-null lastOutcomeModule survives the wire round trip',
      () async {
        final dio = _dioReturning({
          'success': true,
          'message': 'ok',
          'data': {
            'modal': _wireModal(lastOutcomeModule: 'status_shared'),
          },
        });

        final modal = await DioModalsRepository(dio).fetchNext(surface: 'home');

        expect(modal, isNotNull);
        expect(modal!.lastOutcomeModule, 'status_shared');
      },
    );

    test(
      'sends the surface + an explicit locale override as query params',
      () async {
        RequestOptions? captured;
        final dio = Dio(BaseOptions(baseUrl: 'http://test'))
          ..httpClientAdapter = _StubAdapter((options) {
            captured = options;
            return ResponseBody.fromString(
              jsonEncode({
                'success': true,
                'message': 'ok',
                'data': {'modal': null},
              }),
              200,
              headers: {
                Headers.contentTypeHeader: [Headers.jsonContentType],
              },
            );
          });

        await DioModalsRepository(dio).fetchNext(surface: 'home', locale: 'hi');

        expect(captured!.path, '/modals/next');
        expect(captured!.queryParameters['surface'], 'home');
        expect(captured!.queryParameters['locale'], 'hi');
      },
    );

    test('omits `locale` from query params when not explicitly overridden — '
        'the locale interceptor stamps it instead', () async {
      RequestOptions? captured;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _StubAdapter((options) {
          captured = options;
          return ResponseBody.fromString(
            jsonEncode({
              'success': true,
              'message': 'ok',
              'data': {'modal': null},
            }),
            200,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        });

      await DioModalsRepository(dio).fetchNext(surface: 'home');

      expect(captured!.queryParameters.containsKey('locale'), isFalse);
    });
  });

  group('errors', () {
    test('401 → unauthorized', () async {
      final dio = _dioReturning({
        'success': false,
        'message': 'Unauthorized',
        'data': null,
      }, status: 401);

      expect(
        () => DioModalsRepository(dio).fetchNext(surface: 'home'),
        throwsA(
          isA<ModalsException>().having(
            (e) => e.kind,
            'kind',
            ModalsErrorKind.unauthorized,
          ),
        ),
      );
    });

    test('a malformed envelope (non-map body) → unknown', () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _StubAdapter(
          (options) => ResponseBody.fromString(
            jsonEncode(<dynamic>[1, 2, 3]), // a List, not a Map
            200,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
          ),
        );

      expect(
        () => DioModalsRepository(dio).fetchNext(surface: 'home'),
        throwsA(
          isA<ModalsException>().having(
            (e) => e.kind,
            'kind',
            ModalsErrorKind.unknown,
          ),
        ),
      );
    });

    test('500 → unknown', () async {
      final dio = _dioReturning({
        'success': false,
        'message': 'Boom',
        'data': null,
      }, status: 500);

      expect(
        () => DioModalsRepository(dio).fetchNext(surface: 'home'),
        throwsA(
          isA<ModalsException>().having(
            (e) => e.kind,
            'kind',
            ModalsErrorKind.unknown,
          ),
        ),
      );
    });

    test('a success:false envelope on a 200 is still a failure', () async {
      final dio = _dioReturning({
        'success': false,
        'message': 'Nope',
        'data': null,
      });

      expect(
        () => DioModalsRepository(dio).fetchNext(surface: 'home'),
        throwsA(isA<ModalsException>()),
      );
    });
  });

  group('reportImpression', () {
    test(
      'sends the EXACT showNumber it was given — never recomputed',
      () async {
        RequestOptions? captured;
        final dio = Dio(BaseOptions(baseUrl: 'http://test'))
          ..httpClientAdapter = _StubAdapter((options) {
            captured = options;
            return ResponseBody.fromString(
              jsonEncode({
                'success': true,
                'message': 'ok',
                'data': {'counted': true},
              }),
              200,
              headers: {
                Headers.contentTypeHeader: [Headers.jsonContentType],
              },
            );
          });

        final counted = await DioModalsRepository(dio).reportImpression(
          modalKey: 'modal-1',
          triggerSource: 'first_time',
          action: 'viewed',
          showNumber: 2,
        );

        expect(counted, isTrue);
        expect(captured!.path, '/modals/impressions');
        final body = captured!.data as Map<String, dynamic>;
        expect(body['showNumber'], 2);
        expect(body['modalKey'], 'modal-1');
        expect(body['triggerSource'], 'first_time');
        // `body['action']` is still the generated `ModalImpressionBodyActionEnum`
        // here (dio's own JSON transformer — which calls `.toJson()` on it —
        // runs AFTER this stub adapter sees the request); `.toString()`
        // matches its wire value.
        expect(body['action'].toString(), 'viewed');
        expect(body['dismissMethod'], isNull);
      },
    );

    test(
      'carries dismissMethod on the wire when action is dismissed',
      () async {
        RequestOptions? captured;
        final dio = Dio(BaseOptions(baseUrl: 'http://test'))
          ..httpClientAdapter = _StubAdapter((options) {
            captured = options;
            return ResponseBody.fromString(
              jsonEncode({
                'success': true,
                'message': 'ok',
                'data': {'counted': true},
              }),
              200,
              headers: {
                Headers.contentTypeHeader: [Headers.jsonContentType],
              },
            );
          });

        await DioModalsRepository(dio).reportImpression(
          modalKey: 'modal-1',
          triggerSource: 'first_time',
          action: 'dismissed',
          showNumber: 1,
          dismissMethod: 'outside_tap',
        );

        final body = captured!.data as Map<String, dynamic>;
        expect(body['dismissMethod'].toString(), 'outside_tap');
      },
    );

    test(
      'a duplicate report the server refuses still round-trips (counted: false) '
      '— this is the showNumber compare-and-swap in action',
      () async {
        final dio = _dioReturning({
          'success': true,
          'message': 'ok',
          'data': {'counted': false},
        });

        final counted = await DioModalsRepository(dio).reportImpression(
          modalKey: 'modal-1',
          triggerSource: 'first_time',
          action: 'dismissed',
          showNumber: 1,
          dismissMethod: 'cross',
        );

        expect(counted, isFalse);
      },
    );

    test('401 → unauthorized', () async {
      final dio = _dioReturning({
        'success': false,
        'message': 'Unauthorized',
        'data': null,
      }, status: 401);

      expect(
        () => DioModalsRepository(dio).reportImpression(
          modalKey: 'modal-1',
          triggerSource: 'first_time',
          action: 'viewed',
          showNumber: 1,
        ),
        throwsA(
          isA<ModalsException>().having(
            (e) => e.kind,
            'kind',
            ModalsErrorKind.unauthorized,
          ),
        ),
      );
    });
  });
}
