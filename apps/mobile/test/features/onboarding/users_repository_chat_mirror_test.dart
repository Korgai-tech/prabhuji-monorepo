import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';

/// `UsersRepository.getMe` is the ONE place the app learns the user's chat
/// experiment arm, so it is also where `chat_type` is mirrored into
/// `ChatCounters` — the store `AnalyticsEnricher` reads synchronously on
/// EVERY event. These tests pin that contract: the mirror happens on the
/// success path, it clears when the server retires an arm, and it does NOT
/// run on a 401 (where a wipe would mis-bucket the events that follow).
///
/// Driven through a stubbed dio adapter — mirrors
/// `test/features/modals/modals_repository_test.dart`'s `_StubAdapter`.
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

Dio _dioReturning(Map<String, dynamic> body, {int status = 200}) =>
    Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = _StubAdapter(
        (options) => ResponseBody.fromString(
          jsonEncode(body),
          status,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );

Map<String, dynamic> _meBody({Map<String, dynamic>? chatConfig}) => {
  'success': true,
  'message': 'OK',
  'data': {
    'user': {'id': 'user-1', 'name': 'Asha'},
    'chatConfig': ?chatConfig,
  },
};

void main() {
  group('getMe mirrors chatConfig into ChatCounters', () {
    test('persists chat_type + agent_id from a successful fetch', () async {
      final counters = ChatCounters.inMemory();
      final repo = UsersRepository(
        _dioReturning(_meBody(chatConfig: {
          'enabled': true,
          'agentId': 'agent-7',
          'chat_type': 'bhagwat_gita',
        })),
        chatCounters: counters,
      );

      final result = await repo.getMe();

      expect(result.user?.chatConfig?.chatType, 'bhagwat_gita');
      // The point of the whole change: the arm is readable by the enricher
      // WITHOUT the chat screen ever having been built.
      expect(counters.savedChatType(), 'bhagwat_gita');
      expect(counters.savedAgentId(), 'agent-7');
    });

    test('mirrors the arm even when chat itself is disabled', () async {
      // The server deliberately carries a non-null variant on a disabled arm
      // (`chat.service.ts` — "an unmapped-but-non-null variant is still a real
      // bucket"). These users can never reach the chat screen, so the old
      // build-site mirror reported them as `control` forever.
      final counters = ChatCounters.inMemory();
      final repo = UsersRepository(
        _dioReturning(_meBody(chatConfig: {
          'enabled': false,
          'agentId': null,
          'chat_type': 'content_v2',
        })),
        chatCounters: counters,
      );

      await repo.getMe();

      expect(counters.savedChatType(), 'content_v2');
      expect(counters.savedAgentId(), isNull);
    });

    test('clears a stale arm when the server returns no bucket', () async {
      final counters = ChatCounters.inMemory()
        ..saveChatType('kuldevta')
        ..saveAgentId('agent-old');
      final repo = UsersRepository(
        _dioReturning(_meBody(chatConfig: {
          'enabled': false,
          'agentId': null,
          'chat_type': null,
        })),
        chatCounters: counters,
      );

      await repo.getMe();

      expect(counters.savedChatType(), isNull);
      expect(counters.savedAgentId(), isNull);
    });

    test('does not touch the store on a 401', () async {
      final counters = ChatCounters.inMemory()..saveChatType('kuldevta');
      final repo = UsersRepository(
        _dioReturning({'success': false, 'message': 'Unauthorized'},
            status: 401),
        chatCounters: counters,
      );

      final result = await repo.getMe();

      expect(result.authFailed, isTrue);
      // A rejected token is not a statement about the user's arm — logout owns
      // the wipe (`ChatCounters.clearIdentity`), not a failed read.
      expect(counters.savedChatType(), 'kuldevta');
    });

    test('works without a counters store (degraded boot)', () async {
      final repo = UsersRepository(
        _dioReturning(_meBody(chatConfig: {
          'enabled': true,
          'agentId': 'agent-7',
          'chat_type': 'kuldevta',
        })),
      );

      final result = await repo.getMe();

      expect(result.user?.id, 'user-1');
    });
  });

  group('ChatCounters.clearIdentity', () {
    test('wipes the per-account mirrors, keeps the install counters', () {
      final counters = ChatCounters.inMemory()
        ..saveChatType('kuldevta')
        ..saveAgentId('agent-7')
        ..saveKuldevtaName('Nagnechi Mata')
        ..markFreeChatConsumed()
        ..incrementOpenCount();

      counters.clearIdentity();

      expect(counters.savedChatType(), isNull);
      expect(counters.savedAgentId(), isNull);
      expect(counters.savedKuldevtaName(), isNull);
      // Install-scoped by design: clearing these would make logout a way to
      // mint another free chat and would reset a lifetime funnel counter.
      expect(counters.isFreeChatConsumed(), isTrue);
      expect(counters.openCount(), 1);
    });
  });
}
