import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/paywall_gate.dart';
import 'package:mobile/features/chat/chat_paywall.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';

/// The chat paywall is OFF, and it is turned back on by ONE line in the API
/// (`CHAT_REQUIRES_PRO` in `chat.constants.ts`) which rides to the app as
/// `/users/me → chatConfig.requiresPro`.
///
/// These tests pin the two halves of that contract the app owns:
///
///  1. the wire parser — and specifically that SILENCE MEANS UNGATED, since a
///     paywall raised on a blank or stale payload is the failure that costs a
///     real user money for a product we made free;
///  2. [runChatPaywallGate] — that "off" still RUNS the wrapped action rather
///     than merely skipping the paywall, which is the bug that would otherwise
///     ship as a dead Chat button.
///
/// The three gate call sites are covered where they live: the send-time
/// re-gate in `chat_bloc_send_status_test.dart`, and the shell entry in
/// `chat_screen_layout_intent_test.dart`.

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

Dio _dioReturning(Map<String, dynamic> body) =>
    Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = _StubAdapter(
        (options) => ResponseBody.fromString(
          jsonEncode(body),
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        ),
      );

Map<String, dynamic> _meBody(Map<String, dynamic>? chatConfig) => {
  'success': true,
  'message': 'OK',
  'data': {
    'user': {'id': 'user-1', 'name': 'Asha'},
    'chatConfig': ?chatConfig,
  },
};

Future<MeChatConfig?> _parse(Map<String, dynamic>? chatConfig) async {
  final repo = UsersRepository(
    _dioReturning(_meBody(chatConfig)),
    chatCounters: ChatCounters.inMemory(),
  );
  final me = await repo.getMe();
  return me.user?.chatConfig;
}

Map<String, dynamic> _config(Map<String, dynamic> extra) => {
  'enabled': true,
  'agentId': 'agent-1',
  'chat_type': 'content_chat',
  ...extra,
};

void main() {
  group('chatConfig.requiresPro — the wire parser', () {
    test('true when the server says true', () async {
      final config = await _parse(_config({'requiresPro': true}));
      expect(config?.requiresPro, isTrue);
    });

    test('false when the server says false', () async {
      final config = await _parse(_config({'requiresPro': false}));
      expect(config?.requiresPro, isFalse);
    });

    test('UNGATED when the key is absent — a server that predates it', () async {
      // The rollout case. Every shipped build that reaches a server without
      // the field must read "free", not "gated": the alternative shows a
      // paywall to users for a product product has already turned off, and
      // does it precisely on the environments that are behind.
      final config = await _parse(_config(const {}));
      expect(config?.requiresPro, isFalse);
    });

    test('UNGATED for null and for non-bool junk', () async {
      // Nothing but a literal `true` arms the paywall. A string "true" is the
      // realistic drift here — some serializer stringifying booleans — and it
      // must not be truthy, because a paywall is the expensive direction to be
      // wrong in.
      for (final junk in <Object?>[null, 'true', 1, <String>[], <String, String>{}]) {
        final config = await _parse(_config({'requiresPro': junk}));
        expect(
          config?.requiresPro,
          isFalse,
          reason: 'requiresPro: $junk (${junk.runtimeType}) must read as ungated',
        );
      }
    });

    test('accepts the snake_case spelling too', () async {
      // Defensive only: the wire is camelCase. This exists so a future
      // normalisation toward the `chat_type` / `show_kuldeveta_chat` style
      // cannot silently disarm a paywall that product had turned ON.
      final config = await _parse(_config({'chat_requires_pro': true}));
      expect(config?.requiresPro, isTrue);
    });

    test('defaults to ungated on the model itself', () {
      // The const default backs every construction that does not name the
      // field, including the fixtures across the test suite.
      const config = MeChatConfig(enabled: true, agentId: 'a');
      expect(config.requiresPro, isFalse);
    });
  });

  group('runChatPaywallGate', () {
    PaywallGate gateWith({required bool isPro}) => PaywallGate(
      isPro: () => isPro,
      refreshEntitlement: () async {},
    );

    test('paywall OFF: runs the action and never opens the paywall', () async {
      // The load-bearing half. "Off" must not mean "skip the gate and do
      // nothing" — the wrapped action IS the feature (swap to the chat
      // branch, complete the kuldevta handoff), so dropping it ships a
      // button that does nothing.
      var ran = 0;
      var opened = 0;
      final result = await runChatPaywallGate<String>(
        requiresPro: false,
        gate: gateWith(isPro: false),
        pending: PendingAction<String>(
          action: () async {
            ran++;
            return 'done';
          },
        ),
        openPaywall: () async => opened++,
      );

      expect(ran, 1);
      expect(opened, 0, reason: 'an ungated call must not push /paywall');
      expect(result, 'done');
    });

    test('paywall OFF ignores entitlement entirely', () async {
      // A free user and a Pro user take the identical path — no branch on
      // isPro survives when the flag is off.
      for (final isPro in <bool>[true, false]) {
        var ran = 0;
        await runChatPaywallGate<void>(
          requiresPro: false,
          gate: gateWith(isPro: isPro),
          pending: PendingAction<void>(action: () async => ran++),
          openPaywall: () async =>
              fail('paywall opened with the gate off (isPro: $isPro)'),
        );
        expect(ran, 1);
      }
    });

    test('paywall ON, Pro user: runs the action, no paywall', () async {
      var ran = 0;
      var opened = 0;
      await runChatPaywallGate<void>(
        requiresPro: true,
        gate: gateWith(isPro: true),
        pending: PendingAction<void>(action: () async => ran++),
        openPaywall: () async => opened++,
      );

      expect(ran, 1);
      expect(opened, 0);
    });

    test('paywall ON, free user who cancels: opens it, action never runs', () async {
      var ran = 0;
      var opened = 0;
      final result = await runChatPaywallGate<String>(
        requiresPro: true,
        gate: gateWith(isPro: false),
        pending: PendingAction<String>(
          action: () async {
            ran++;
            return 'done';
          },
        ),
        openPaywall: () async => opened++,
      );

      expect(opened, 1);
      expect(ran, 0);
      expect(result, isNull, reason: 'a cancelled gate returns null');
    });

    test('paywall ON, free user who purchases: action resumes after close', () async {
      // Post-purchase continuation must survive re-arming. Entitlement flips
      // while the paywall is up, exactly as a real purchase does.
      var isPro = false;
      var ran = 0;
      final gate = PaywallGate(
        isPro: () => isPro,
        refreshEntitlement: () async {},
      );

      final result = await runChatPaywallGate<String>(
        requiresPro: true,
        gate: gate,
        pending: PendingAction<String>(
          action: () async {
            ran++;
            return 'done';
          },
        ),
        openPaywall: () async => isPro = true,
      );

      expect(ran, 1);
      expect(result, 'done');
    });
  });
}
