import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/app_config.dart';
import 'package:mobile/core/deep_link_parser.dart';
import 'package:mobile/core/dio_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fake_auth_store.dart';

/// Regression pins for the two defects found on device (TAM-124): a
/// logged-out user tapping `https://krutyug.ai/app/aarti/<id>` landed on
/// Home and the parked target was wiped. Inputs below are copied from that
/// device log, not invented.
///
///   18:04:38 router redirect /app/* uri=https://krutyug.ai/app/aarti/… loggedIn=false
///   18:04:39 GET /home/feed token=NONE          ← Home mounted while logged out
///   18:04:39 PARKED for login (persistent)
///   18:04:39 auth-reject (UNAUTHORIZED) on GET /home/feed — clearing AuthStore
const _deviceStateUri =
    'https://krutyug.ai/app/aarti/a7897e4c-e293-4fc2-b570-dee7db5935fe';

/// Answers every request with the auth middleware's 401 body.
class _Unauthorized implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({
        'success': false,
        'message': 'Missing bearer token',
        'errorCode': 'UNAUTHORIZED',
      }),
      401,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  // Chucker's dio interceptor (in `buildDio`) reads SharedPreferences.
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  setUpAll(() {
    // `buildDio` reads the API base URL from AppConfig.
    AppConfig.debugSetInstance(AppConfig.forTest());
  });

  group('defect A — the /app/* redirect misread an absolute state.uri', () {
    test('the old reconstruction turned the device URI into garbage', () {
      // What router.dart used to do: prefix the host onto a URI that already
      // had one. The parser rejects the result, and the redirect's
      // UnknownDeepLink fallback sent EVERYONE to /home.
      final broken = Uri.parse('https://krutyug.ai$_deviceStateUri');
      expect(parseDeepLink(broken), isA<UnknownDeepLink>());
    });

    test('absoluteAppLink keeps an absolute URI as-is', () {
      final uri = absoluteAppLink(
        Uri.parse(_deviceStateUri),
        shareHost: 'https://krutyug.ai',
      );
      expect(uri.toString(), _deviceStateUri);
      final target = parseDeepLink(uri);
      expect(target, isA<AartiDeepLink>());
      expect((target as AartiDeepLink).audioId,
          'a7897e4c-e293-4fc2-b570-dee7db5935fe');
    });

    test('absoluteAppLink still completes a relative location', () {
      final uri = absoluteAppLink(
        Uri.parse('/app/aarti/a1?ref=u1'),
        shareHost: 'https://krutyug.ai',
      );
      expect(uri.toString(), 'https://krutyug.ai/app/aarti/a1?ref=u1');
      expect(parseDeepLink(uri), isA<AartiDeepLink>());
      expect(parseDeepLink(uri).attribution, {'ref': 'u1'});
    });
  });

  group('defect B — a 401 on an unauthenticated request cleared the store',
      () {
    test('no token sent → nothing is cleared, no logout is broadcast',
        () async {
      final store = FakeAuthStore(token: null);
      final broadcasts = <String?>[];
      final sub = store.changes.listen(broadcasts.add);
      addTearDown(sub.cancel);

      final dio = buildDio(store)..httpClientAdapter = _Unauthorized();
      await expectLater(
        dio.get<dynamic>('/home/feed'),
        throwsA(isA<DioException>()),
      );
      await Future<void>.delayed(Duration.zero);

      expect(store.clears, 0,
          reason: 'there was no token for the server to reject');
      expect(broadcasts, isEmpty,
          reason: 'a null broadcast reads as a logout to every listener — '
              'including the one that wipes the parked deep link');
    });

    test('a token that WAS sent and rejected is still cleared', () async {
      // The interceptor's real job must survive the fix.
      final store = FakeAuthStore(token: 'expired.jwt.token');
      final adapter = _Unauthorized();
      final dio = buildDio(store)..httpClientAdapter = adapter;

      await expectLater(
        dio.get<dynamic>('/users/me'),
        throwsA(isA<DioException>()),
      );

      expect(adapter.requests.single.headers['Authorization'],
          'Bearer expired.jwt.token');
      expect(store.clears, 1);
    });
  });
}
