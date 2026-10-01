import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/application/chat_state.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';

import '../../support/chat_harness.dart';
import '../../support/fake_analytics.dart';

/// TAM-165 — the API now publishes the content agent's own analytics envelope
/// plus a server-computed distress flag. These tests lock the CLIENT contract:
/// which property lands on which event, and which events fire together.
///
/// The distress rules in particular are product decisions, not incidental
/// behaviour (2026-09-09):
///
///  * `chat_distress_shown` fires IN ADDITION to `chat_reply_received`, never
///    instead of it — suppressing the reply event would put a hole in the
///    sent→received funnel exactly where the conversation mattered most.
///  * No `trigger_reason` yet. The server classifies every crisis turn
///    (`CrisisReason`) but doesn't put it on the wire, and `decline_category`
///    — the only exposed candidate — is null on 100% of distress turns by
///    construction. A structurally-empty property is worse than an absent one.
ChatContentGroups _emptyContent() => ChatContentGroups(
  aarti: const <ChatContentItem>[],
  bhajan: const <ChatContentItem>[],
  mantra: const <ChatContentItem>[],
  ringtone: const <ChatContentItem>[],
  status: const <ChatContentItem>[],
  wallpaper: const <ChatContentItem>[],
);

/// A reply carrying whichever TAM-165 fields the case under test needs.
/// Defaults model a PROSE arm (gita / kuldevta): every agent-reported field
/// null, `distressDetected` false.
SendMessageResult _reply({
  String userText = 'Namaste',
  String botText = 'Jai Shri Ram',
  List<String> matchedTags = const <String>[],
  String? intentType,
  String? recommendedDeity,
  num? jaapCount,
  String? declineCategory,
  bool? distressDetected = false,
}) {
  ChatMessage msg(String id, ChatMessageRoleEnum role, String body) =>
      ChatMessage(
        id: id,
        sessionId: 'sess-1',
        role: role,
        message: body,
        confidence: null,
        content: _emptyContent(),
        matchedTags: matchedTags,
        intentType: intentType,
        recommendedDeity: recommendedDeity,
        jaapCount: jaapCount,
        declineCategory: declineCategory,
        distressDetected: distressDetected,
        createdAt: DateTime(2026, 9, 9),
      );
  return SendMessageResult(
    sessionId: 'sess-1',
    agentId: 'test-agent-id',
    // The user turn never carries analytics of its own.
    userMessage: ChatMessage(
      id: 'u1',
      sessionId: 'sess-1',
      role: ChatMessageRoleEnum.user,
      message: userText,
      confidence: null,
      content: _emptyContent(),
      createdAt: DateTime(2026, 9, 9),
    ),
    botMessage: msg('b1', ChatMessageRoleEnum.bot, botText),
  );
}

void main() {
  Future<ChatBloc> seedReady({
    required RecordingAnalytics analytics,
    required FakeChatRepository repo,
  }) async {
    final bloc = ChatBloc(
      repository: repo,
      counters: ChatCounters.inMemory(),
      isPro: () => true,
      analytics: analytics,
    );
    bloc.add(const ChatStarted());
    await bloc.stream.firstWhere((s) => s is ChatReady);
    await Future<void>.delayed(Duration.zero);
    return bloc;
  }

  Future<RecordingAnalytics> send(SendMessageResult result) async {
    final analytics = RecordingAnalytics();
    final repo = FakeChatRepository()..nextSendResult = result;
    final bloc = await seedReady(analytics: analytics, repo: repo);
    addTearDown(bloc.close);
    bloc.add(
      const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
    );
    await Future<void>.delayed(const Duration(milliseconds: 40));
    return analytics;
  }

  group('chat_reply_received — agent envelope pass-through', () {
    test('content arm: the agent\'s own fields land on the event', () async {
      final analytics = await send(
        _reply(
          matchedTags: const ['art_0011'],
          intentType: 'direct_request',
          recommendedDeity: 'hanuman',
          jaapCount: 108,
        ),
      );

      final props = analytics.propsFor(ChatEvents.chatReplyReceived);
      expect(props[ChatEventProps.matchedTags], const ['art_0011']);
      expect(props[ChatEventProps.recommendedDeity], 'hanuman');
      expect(props[ChatEventProps.jaapCount], 108);
      expect(props[ChatEventProps.intentType], 'direct_request');
      expect(props[ChatEventProps.distressDetected], isFalse);
      // The agent's envelope carries no model identifier, so this stays
      // empty on purpose (TAM-165) — not an oversight to "fix".
      expect(props[ChatEventProps.modelId], '');
    });

    test('prose arm (gita / kuldevta): every agent field degrades to the '
        'empty-string convention, never null', () async {
      final analytics = await send(_reply());

      final props = analytics.propsFor(ChatEvents.chatReplyReceived);
      expect(props[ChatEventProps.matchedTags], isEmpty);
      expect(props[ChatEventProps.recommendedDeity], '');
      expect(props[ChatEventProps.jaapCount], '');
      expect(props[ChatEventProps.intentType], '');
    });
  });

  group('chat_distress_shown', () {
    test('a crisis reply fires it with agent_id + chat_session_id', () async {
      final analytics = await send(_reply(distressDetected: true));

      expect(analytics.fired(ChatEvents.chatDistressShown), isTrue);
      final props = analytics.propsFor(ChatEvents.chatDistressShown);
      expect(props[ChatEventProps.agentId], 'test-agent-id');
      expect(props[ChatEventProps.chatSessionId], 'sess-1');
      // Deliberately absent until the server exposes `CrisisReason` — see
      // the file header. Asserted so nobody "fills" it with a field that is
      // structurally always empty here.
      expect(props.containsKey('trigger_reason'), isFalse);
    });

    test('it fires ALONGSIDE chat_reply_received, not instead of it — and the '
        'reply event is filterable on distress_detected', () async {
      final analytics = await send(_reply(distressDetected: true));

      expect(
        analytics.fired(ChatEvents.chatReplyReceived),
        isTrue,
        reason: 'a distress turn is still a reply — product call',
      );
      expect(analytics.fired(ChatEvents.chatDistressShown), isTrue);
      expect(
        analytics.propsFor(
          ChatEvents.chatReplyReceived,
        )[ChatEventProps.distressDetected],
        isTrue,
      );
    });

    test('an ordinary reply does NOT fire it', () async {
      final analytics = await send(_reply());
      expect(analytics.fired(ChatEvents.chatDistressShown), isFalse);
    });

    test('a null flag (a server that omits the field) does NOT fire it — '
        'absent is not distress', () async {
      final analytics = await send(_reply(distressDetected: null));
      expect(analytics.fired(ChatEvents.chatDistressShown), isFalse);
      expect(
        analytics.propsFor(
          ChatEvents.chatReplyReceived,
        )[ChatEventProps.distressDetected],
        isFalse,
        reason: 'null coalesces to false on the reply event',
      );
    });
  });

  group('chat_no_match / chat_out_of_scope (unblocked by intent_type)', () {
    test(
      'intent_type=no_match fires chat_no_match with the question',
      () async {
        final analytics = await send(
          _reply(userText: 'asdfgh', intentType: ChatIntentType.noMatch),
        );

        expect(analytics.fired(ChatEvents.chatNoMatch), isTrue);
        expect(analytics.fired(ChatEvents.chatOutOfScope), isFalse);
        final props = analytics.propsFor(ChatEvents.chatNoMatch);
        expect(props[ChatEventProps.questionText], 'asdfgh');
        expect(props[ChatEventProps.agentId], 'test-agent-id');
      },
    );

    test('intent_type=out_of_scope fires chat_out_of_scope, and THIS is where '
        'decline_category is the real reason', () async {
      final analytics = await send(
        _reply(
          userText: 'stock tips do',
          intentType: ChatIntentType.outOfScope,
          declineCategory: 'financial',
        ),
      );

      expect(analytics.fired(ChatEvents.chatOutOfScope), isTrue);
      expect(analytics.fired(ChatEvents.chatNoMatch), isFalse);
      final props = analytics.propsFor(ChatEvents.chatOutOfScope);
      expect(props[ChatEventProps.reason], 'financial');
      expect(props[ChatEventProps.questionText], 'stock tips do');
    });

    test('an ordinary intent fires neither', () async {
      final analytics = await send(_reply(intentType: 'direct_request'));
      expect(analytics.fired(ChatEvents.chatNoMatch), isFalse);
      expect(analytics.fired(ChatEvents.chatOutOfScope), isFalse);
    });

    test('a prose arm (null intent) fires neither', () async {
      final analytics = await send(_reply());
      expect(analytics.fired(ChatEvents.chatNoMatch), isFalse);
      expect(analytics.fired(ChatEvents.chatOutOfScope), isFalse);
    });
  });

  group('chat_page_viewed — suggestion_set_id', () {
    test('carries the served opener set', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository(
        seedHistory: ChatHistoryResponseData(
          sessionId: null,
          previousChat: const <ChatMessage>[],
          nextCursor: null,
          chatConfig: ChatScreenConfig(
            // TAM-177: nullable-but-required on the generated model. Two of the
            // three agents genuinely ship null, so null is the default fixture.
            introVideo: null,
            enabled: true,
            agentId: 'test-agent-id',
            title: 'Namaste',
            subtitle: '',
            suggestionSetId: 'general_v1',
            recommendedMessages: const <ChatRecommendedMessage>[],
          ),
        ),
      );
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);

      expect(
        analytics.propsFor(
          ChatEvents.chatPageViewed,
        )[ChatEventProps.suggestionSetId],
        'general_v1',
      );
    });

    test('a server that omits it reports empty string, not null', () async {
      final analytics = RecordingAnalytics();
      final bloc = await seedReady(
        analytics: analytics,
        repo: FakeChatRepository(),
      );
      addTearDown(bloc.close);

      expect(
        analytics.propsFor(
          ChatEvents.chatPageViewed,
        )[ChatEventProps.suggestionSetId],
        '',
      );
    });
  });
}
