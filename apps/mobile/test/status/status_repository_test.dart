// Focused wire test for `DioStatusRepository` — covers the pieces of the
// contract not exercised by the bloc/screen tests (which use a fake repo).
// Kept minimal on purpose: only the query-string shape of `fetchFeed` is
// asserted here (TAM-166 — `pinnedId` must reach the wire on the first-page
// request and MUST NOT be sent on cursor pages).

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_profile_flags_store.dart';
import 'package:mobile/features/status/data/status_repository.dart';

/// A dio double that captures the last request and returns a canned response.
class _CapturingAdapter implements HttpClientAdapter {
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? stream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    return ResponseBody.fromString(
      jsonEncode(<String, Object?>{
        'success': true,
        'message': 'ok',
        'data': <String, Object?>{
          'items': <Object?>[],
          'nextCursor': null,
        },
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWithAdapter(_CapturingAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}


/// A dio double that returns a canned `/status/profile` record.
class _ProfileAdapter implements HttpClientAdapter {
  _ProfileAdapter({this.personalDisplayName, this.avatarImageUrl});
  final String? personalDisplayName;
  final String? avatarImageUrl;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? stream,
    Future<void>? cancelFuture,
  ) async {
    return ResponseBody.fromString(
      jsonEncode(<String, Object?>{
        'success': true,
        'message': 'ok',
        // The generated parser asserts every contract key is PRESENT (null is
        // fine, missing is not), so all seven ride even when unset.
        'data': <String, Object?>{
          'activeProfileType': 'personal',
          'personalDisplayName': personalDisplayName,
          'businessName': null,
          'businessDetails': null,
          'businessMobileNumber': null,
          'avatarImageUrl': avatarImageUrl,
          'updatedAt': null,
        },
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWithProfileAdapter(_ProfileAdapter adapter) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'));
  dio.httpClientAdapter = adapter;
  return dio;
}


/// A dio double for `POST /reports` that captures the request body and returns
/// either the success envelope or a server error.
class _ReportAdapter implements HttpClientAdapter {
  _ReportAdapter({this.failMessage});

  final String? failMessage;
  RequestOptions? lastRequest;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? stream,
    Future<void>? cancelFuture,
  ) async {
    lastRequest = options;
    if (failMessage != null) {
      return ResponseBody.fromString(
        jsonEncode(<String, Object?>{
          'success': false,
          'message': failMessage,
          'data': null,
          'errorCode': 'STATUS_NOT_FOUND',
        }),
        404,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode(<String, Object?>{
        'success': true,
        'message': 'Reported successfully',
        'data': <String, Object?>{'id': 'report-1'},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Dio _dioWithReportAdapter(_ReportAdapter adapter) {
  final dio = Dio(BaseOptions(
    baseUrl: 'http://test',
    // The 404 case must reach `_envelope`, not be thrown by dio first.
    validateStatus: (_) => true,
  ));
  dio.httpClientAdapter = adapter;
  return dio;
}


/// The body as it actually goes over the wire: dio's default transformer runs
/// `jsonEncode` over `options.data`, which invokes `toJson()` on the generated
/// model objects inside it.
Map<String, Object?> _wireBody(_ReportAdapter adapter) =>
    jsonDecode(jsonEncode(adapter.lastRequest?.data)) as Map<String, Object?>;

void main() {
  group('DioStatusRepository.fetchFeed — TAM-166 pinnedId wire shape', () {
    test('sends pinnedId=<uuid> on the first-page request', () async {
      final adapter = _CapturingAdapter();
      final repo = DioStatusRepository(_dioWithAdapter(adapter));

      await repo.fetchFeed(pinnedId: 'pin-xyz');

      expect(adapter.lastRequest?.path, '/status/feed');
      expect(adapter.lastRequest?.queryParameters['pinnedId'], 'pin-xyz');
      // Absent when the caller didn't pass them.
      expect(adapter.lastRequest?.queryParameters.containsKey('cursor'),
          isFalse);
      expect(adapter.lastRequest?.queryParameters.containsKey('deityId'),
          isFalse);
    });

    test('omits pinnedId when not provided (existing tab-branch entry)',
        () async {
      final adapter = _CapturingAdapter();
      final repo = DioStatusRepository(_dioWithAdapter(adapter));

      await repo.fetchFeed();

      expect(adapter.lastRequest?.queryParameters.containsKey('pinnedId'),
          isFalse);
    });

    test('omits pinnedId when the caller passes an empty string', () async {
      // The bloc never sends an empty string, but the repo hardens against
      // callers that accidentally pass `''` (e.g. a missing path param
      // resolving to '') so we don't POST a `pinnedId=` query pair.
      final adapter = _CapturingAdapter();
      final repo = DioStatusRepository(_dioWithAdapter(adapter));

      await repo.fetchFeed(pinnedId: '');

      expect(adapter.lastRequest?.queryParameters.containsKey('pinnedId'),
          isFalse);
    });

    test('pinnedId rides alongside deityId + cursor when all are set',
        () async {
      final adapter = _CapturingAdapter();
      final repo = DioStatusRepository(_dioWithAdapter(adapter));

      await repo.fetchFeed(
        deityId: 'hanuman',
        cursor: 'c-1',
        pinnedId: 'pin-xyz',
      );

      final params = adapter.lastRequest?.queryParameters ?? const {};
      expect(params['deityId'], 'hanuman');
      expect(params['cursor'], 'c-1');
      expect(params['pinnedId'], 'pin-xyz');
    });
  });

  // The write-through that makes `has_name` / `has_photo` global: every
  // StatusProfileData in the app comes out of one of these two methods, so
  // mirroring here is what stops a call site from forgetting.
  group('DioStatusRepository — profile flags write-through', () {
    test('fetchProfile mirrors the fetched record into the store', () async {
      final store = StatusProfileFlagsStore.inMemory();
      final repo = DioStatusRepository(
        _dioWithProfileAdapter(
          _ProfileAdapter(personalDisplayName: 'Aditya Nath'),
        ),
        flagsStore: store,
      );

      await repo.fetchProfile();

      expect(store.hasName(), isTrue);
      expect(store.hasPhoto(), isFalse);
    });

    test('saveProfile mirrors the SERVER echo, not the sent payload', () async {
      final store = StatusProfileFlagsStore.inMemory();
      // The server echoes a record with no avatar, even though the client
      // sent one — the flags must follow what actually persisted.
      final repo = DioStatusRepository(
        _dioWithProfileAdapter(
          _ProfileAdapter(personalDisplayName: 'Aditya Nath'),
        ),
        flagsStore: store,
      );

      await repo.saveProfile(const StatusProfileData(
        activeProfileType: StatusProfileType.personal,
        personalDisplayName: 'Aditya Nath',
        avatarImageUrl: 'https://cdn.test.invalid/a.png',
      ));

      expect(store.hasName(), isTrue);
      expect(store.hasPhoto(), isFalse,
          reason: 'the server echo had no avatar — mirroring the optimistic '
              'local payload would claim a photo that never persisted');
    });

    test('a photo-only record mirrors has_photo, not has_name', () async {
      final store = StatusProfileFlagsStore.inMemory();
      final repo = DioStatusRepository(
        _dioWithProfileAdapter(
          _ProfileAdapter(avatarImageUrl: 'https://cdn.test.invalid/a.png'),
        ),
        flagsStore: store,
      );

      await repo.fetchProfile();

      expect(store.hasName(), isFalse);
      expect(store.hasPhoto(), isTrue);
    });

    test('a null store is a no-op, never a throw', () async {
      final repo = DioStatusRepository(
        _dioWithProfileAdapter(
          _ProfileAdapter(personalDisplayName: 'Aditya Nath'),
        ),
      );

      // Widget tests and a degraded boot construct the repository without a
      // store; analytics must never break a data call.
      final profile = await repo.fetchProfile();
      expect(profile.hasName, isTrue);
    });
  });

  group('DioStatusRepository.submitReport — TAM-N wire shape', () {
    test('POSTs to /reports with exactly the four contract fields', () async {
      final adapter = _ReportAdapter();
      final repo = DioStatusRepository(_dioWithReportAdapter(adapter));

      await repo.submitReport(
        statusId: 'status-1',
        type: 'content',
        reporterEmail: 'someone@example.com',
        reason: 'Offensive imagery',
      );

      expect(adapter.lastRequest?.path, '/reports');
      expect(adapter.lastRequest?.method, 'POST');
      // Assert the ENCODED payload, not the pre-transform map. `type` is a
      // generated `ReportType` object in the map and only becomes the string
      // `"content"` through its `toJson()` during encoding — which is exactly
      // what dio's default transformer does, so this is the real wire shape.
      expect(_wireBody(adapter), <String, Object?>{
        'type': 'content',
        'statusId': 'status-1',
        'reporterEmail': 'someone@example.com',
        'reason': 'Offensive imagery',
      });
    });

    test('NEVER sends the reported account — the server resolves it', () async {
      // The client-side half of the endpoint's security property: a report
      // names the STATUS, never the victim. If a `reportedUserId` ever appears
      // in this body, someone has reintroduced the ability to report an
      // arbitrary user id from the app.
      final adapter = _ReportAdapter();
      final repo = DioStatusRepository(_dioWithReportAdapter(adapter));

      await repo.submitReport(
        statusId: 'status-1',
        type: 'user',
        reporterEmail: 'someone@example.com',
        reason: 'Abuse',
      );

      final body = _wireBody(adapter);
      expect(body.containsKey('reportedUserId'), isFalse);
      expect(body.containsKey('reporterUserId'), isFalse);
    });

    test('both report types reach the wire as their contract strings',
        () async {
      for (final type in ['user', 'content']) {
        final adapter = _ReportAdapter();
        final repo = DioStatusRepository(_dioWithReportAdapter(adapter));

        await repo.submitReport(
          statusId: 's',
          type: type,
          reporterEmail: 'a@b.co',
          reason: 'r',
        );

        // The enum must serialize to its bare contract string — the server's
        // Zod `z.enum(["user","content"])` rejects anything else with a 400.
        expect(_wireBody(adapter)['type'], type);
      }
    });

    test('a server rejection surfaces its message, it does not swallow it',
        () async {
      final repo = DioStatusRepository(
        _dioWithReportAdapter(_ReportAdapter(failMessage: 'Status not found')),
      );

      // A failed report must never look like a successful one.
      await expectLater(
        repo.submitReport(
          statusId: 'ghost',
          type: 'content',
          reporterEmail: 'a@b.co',
          reason: 'r',
        ),
        throwsA(
          isA<ApiException>().having(
            (e) => e.message,
            'message',
            'Status not found',
          ),
        ),
      );
    });
  });
}
