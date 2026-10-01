import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/application/chat_state.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';

import '../../support/chat_harness.dart';
import '../../support/fake_analytics.dart';

/// Bug 1 + Bug 4 — buffered `chat_message_sent` with `send_status`. The
/// old fire path (a) stamped `chat_session_id: ''` on the first message
/// of every conversation and (b) silently swallowed sends the bloc
/// dropped on any of its four early-return gates. This suite locks the
/// new semantics: every intent fires exactly one `chat_message_sent`
/// tagged with the outcome, and accepted sends fire with the server-
/// authoritative session id.
void main() {
  Future<ChatBloc> seedReady({
    required RecordingAnalytics analytics,
    required FakeChatRepository repo,
    bool isPro = true,
    // Defaults to the bloc's own default — paywall ARMED — so every test
    // written before the switch existed keeps asserting the gated behaviour
    // it was written for. Only the group at the bottom opts out.
    bool requiresPro = true,
  }) async {
    final bloc = ChatBloc(
      repository: repo,
      counters: ChatCounters.inMemory(),
      isPro: () => isPro,
      requiresPro: () => requiresPro,
      analytics: analytics,
    );
    bloc.add(const ChatStarted());
    await bloc.stream.firstWhere((s) => s is ChatReady);
    await Future<void>.delayed(Duration.zero);
    return bloc;
  }

  group('buffered chat_message_sent (Bug 4)', () {
    test('first message fires chat_message_sent AFTER POST with the '
        'server-authoritative session_id (was empty string before)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      repo.nextSendResult = SendMessageResult(
        sessionId: 'server-session-xyz',
        agentId: 'test-agent-id',
        userMessage: ChatMessage(
          id: 'u1',
          sessionId: 'server-session-xyz',
          role: ChatMessageRoleEnum.user,
          message: 'Namaste',
          confidence: null,
          content: ChatContentGroups(
            aarti: const <ChatContentItem>[],
            bhajan: const <ChatContentItem>[],
            mantra: const <ChatContentItem>[],
            ringtone: const <ChatContentItem>[],
            status: const <ChatContentItem>[],
            wallpaper: const <ChatContentItem>[],
          ),
          createdAt: DateTime(2026, 9, 8),
        ),
        botMessage: ChatMessage(
          id: 'b1',
          sessionId: 'server-session-xyz',
          role: ChatMessageRoleEnum.bot,
          message: 'Jai Shri Krishna',
          confidence: null,
          content: ChatContentGroups(
            aarti: const <ChatContentItem>[],
            bhajan: const <ChatContentItem>[],
            mantra: const <ChatContentItem>[],
            ringtone: const <ChatContentItem>[],
            status: const <ChatContentItem>[],
            wallpaper: const <ChatContentItem>[],
          ),
          createdAt: DateTime(2026, 9, 8),
        ),
      );
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 40));

      final sends = analytics.allProps(ChatEvents.chatMessageSent);
      expect(sends, hasLength(1), reason: 'exactly one fire per intent');
      final sent = sends.single;
      expect(
        sent[ChatEventProps.chatSessionId],
        'server-session-xyz',
        reason: 'server session id, not empty-string placeholder',
      );
      expect(sent[ChatEventProps.sendStatus], ChatSendStatus.sent);
    });

    test('POST failure fires chat_message_sent with send_status=failed '
        '(and empty session id)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      repo.nextSendError = DioException(
        requestOptions: RequestOptions(path: '/chat/messages'),
        response: Response(
          requestOptions: RequestOptions(path: '/chat/messages'),
          statusCode: 500,
        ),
        type: DioExceptionType.badResponse,
      );
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 40));

      final sends = analytics.allProps(ChatEvents.chatMessageSent);
      expect(sends, hasLength(1));
      expect(sends.single[ChatEventProps.sendStatus], ChatSendStatus.failed);
    });
  });

  group('silent-drop visibility (Bug 1)', () {
    test('send while state is ChatReadOnly fires chat_message_sent with '
        'send_status=dropped_not_ready (used to swallow silently — the '
        'reason voice notes never reached the funnel)', () async {
      final analytics = RecordingAnalytics();
      final bloc = ChatBloc(
        repository: FakeChatRepository(),
        counters: ChatCounters.inMemory(),
        isPro: () => true,
        analytics: analytics,
      );
      addTearDown(bloc.close);
      // Force ChatReadOnly directly (mirrors a mid-session 403 CHAT_DISABLED
      // or a not-yet-hydrated history).
      bloc.emit(
        ChatReadOnly(
          transcript: const <ChatMessage>[],
          chatConfig: ChatScreenConfig(
            // TAM-177: nullable-but-required on the generated model. Two of the
            // three agents genuinely ship null, so null is the default fixture.
            introVideo: null,
            enabled: false,
            agentId: null,
            title: 'Namaste',
            subtitle: '',
            recommendedMessages: const <ChatRecommendedMessage>[],
          ),
          sessionId: 'existing-session',
        ),
      );

      bloc.add(
        const ChatMessageSubmitted(
          message: 'transcribed voice text',
          promptSource: 'voice',
          voiceNoteId: 'voice-note-99',
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final sends = analytics.allProps(ChatEvents.chatMessageSent);
      expect(
        sends,
        hasLength(1),
        reason: 'drop path must fire chat_message_sent, not swallow it',
      );
      final sent = sends.single;
      expect(sent[ChatEventProps.sendStatus], ChatSendStatus.droppedNotReady);
      expect(
        sent[ChatEventProps.inputMethod],
        ChatInputMethod.voice,
        reason: 'voice attempt still tagged as voice',
      );
      expect(sent[ChatEventProps.voiceNoteId], 'voice-note-99');
      expect(
        sent[ChatEventProps.chatSessionId],
        'existing-session',
        reason: 'drop still groups against the current session',
      );
    });

    test('send when !isPro fires chat_message_sent with '
        'send_status=dropped_paywall AND emits paywallRequiredNonce', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(
        analytics: analytics,
        repo: repo,
        isPro: false,
      );
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(
          message: 'Pay-gated attempt',
          promptSource: 'typed',
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final sends = analytics.allProps(ChatEvents.chatMessageSent);
      expect(sends, hasLength(1));
      expect(
        sends.single[ChatEventProps.sendStatus],
        ChatSendStatus.droppedPaywall,
      );
      final s = bloc.state;
      expect(s, isA<ChatReady>());
      expect(
        (s as ChatReady).paywallRequiredNonce,
        isNotNull,
        reason: 'paywall route still fires',
      );
    });

    test('dropped sends do NOT bump _messageCount — the next accepted '
        'send still reports message_number=1', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(
        analytics: analytics,
        repo: repo,
        isPro: false,
      );
      addTearDown(bloc.close);

      // First: dropped (paywall).
      bloc.add(
        const ChatMessageSubmitted(message: 'attempt 1', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      // Bloc is now ChatReady w/ paywallRequiredNonce set. Simulate the
      // user completing payment by mounting a fresh bloc — the counter is
      // per-mount so this test just re-uses the drop assertion above and
      // asserts that _messageCount didn't move.
      expect(
        bloc.messageNumberForNextSend,
        1,
        reason: 'dropped attempt must not advance the counter',
      );
    });
  });

  group('chat_type is a global concern (TAM-167)', () {
    // Previously the bloc conditionally stamped `chat_type` from
    // ChatCounters on every fire — silently omitting the property for
    // control-cohort users, which is why `chat_closed` was dark in the
    // warehouse. TAM-167 moved the stamp into [AnalyticsEnricher] (see
    // `test/core/analytics_enricher_test.dart`) with a `'control'`
    // fallback. The bloc no longer stamps `chat_type` itself; these
    // tests lock that contract so a future refactor can't reintroduce
    // the per-fire double-stamp that hid the `'control'` cohort.
    test('bloc does NOT stamp chat_type on chat_message_sent, regardless of '
        'ChatCounters state', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final counters = ChatCounters.inMemory()
        ..saveChatType('kuldevta_chat')
        ..saveAgentId('agent-persist-1');
      final bloc = ChatBloc(
        repository: repo,
        counters: counters,
        isPro: () => true,
        analytics: analytics,
      );
      bloc.add(const ChatStarted());
      await bloc.stream.firstWhere((s) => s is ChatReady);
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 40));

      final sent = analytics.propsFor(ChatEvents.chatMessageSent);
      expect(
        sent.containsKey(ChatEventProps.chatType),
        isFalse,
        reason: 'chat_type is now enricher-owned; bloc must not stamp it',
      );
    });

    test('bloc does NOT stamp chat_type when ChatCounters is empty '
        '(previously omitted — now the enricher fills in "control")', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 40));

      final sent = analytics.propsFor(ChatEvents.chatMessageSent);
      expect(
        sent.containsKey(ChatEventProps.chatType),
        isFalse,
        reason: 'chat_type is now enricher-owned; bloc must not stamp it',
      );
    });
  });

  group('chat_closed double-fire guard (session-active guard)', () {
    test('onSessionClose fires exactly once per active session even when '
        'called from every path (PopScope + app-bar back + dispose + '
        'appBackgrounded observer)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);
      // Clear the chat_page_viewed fire so counts are clean.
      analytics.events.clear();

      bloc.onSessionClose(exitReason: ChatExitReason.appBackgrounded);
      bloc.onSessionClose(exitReason: ChatExitReason.back);
      bloc.onSessionClose(exitReason: ChatExitReason.back);
      bloc.onSessionClose(exitReason: ChatExitReason.back);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final closes = analytics.allProps(ChatEvents.chatClosed);
      expect(
        closes,
        hasLength(1),
        reason: 'session-active guard blocks duplicates within a visit',
      );
      expect(
        closes.single[ChatEventProps.exitReason],
        ChatExitReason.appBackgrounded,
        reason:
            'first-caller reason wins — matches how the session '
            'actually ended',
      );
    });

    test('re-entering chat AFTER an exit fires a NEW chat_closed on the '
        'next exit (was blocked by the once-per-bloc-mount guard)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);
      analytics.events.clear();

      // Visit 1: exit via tab-swap.
      bloc.onSessionClose(exitReason: ChatExitReason.tabSwitch);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      // Visit 2: user comes back to chat, then exits via back.
      bloc.add(const ChatEntered());
      await Future<void>.delayed(const Duration(milliseconds: 20));
      bloc.onSessionClose(exitReason: ChatExitReason.back);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final closes = analytics.allProps(ChatEvents.chatClosed);
      expect(
        closes,
        hasLength(2),
        reason:
            'one chat_closed per visit — the old once-per-mount '
            'guard would have blocked the second fire',
      );
      expect(closes[0][ChatEventProps.exitReason], ChatExitReason.tabSwitch);
      expect(closes[1][ChatEventProps.exitReason], ChatExitReason.back);
    });

    test('ChatEntered fires a fresh chat_page_viewed on every entry (was '
        'once per bloc mount)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);
      // Baseline: first-mount page_viewed already fired via _onStarted.
      final baseline = analytics.allProps(ChatEvents.chatPageViewed).length;
      expect(baseline, 1);

      bloc.onSessionClose(exitReason: ChatExitReason.tabSwitch);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      bloc.add(const ChatEntered());
      await Future<void>.delayed(const Duration(milliseconds: 20));
      bloc.onSessionClose(exitReason: ChatExitReason.tabSwitch);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      bloc.add(const ChatEntered());
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final pageViews = analytics.allProps(ChatEvents.chatPageViewed);
      expect(pageViews, hasLength(3), reason: '1 first-mount + 2 re-entries');
      // open_count bumps each time.
      expect(pageViews[0][ChatEventProps.openCount], 1);
      expect(pageViews[1][ChatEventProps.openCount], 2);
      expect(pageViews[2][ChatEventProps.openCount], 3);
    });
  });

  group('chat_closed carries chat_session_id (TAM-167 P0)', () {
    // Audit 2026-09-09 showed 0/16 chat_closed events had a non-null
    // chat_session_id in the warehouse — the fire was missing the
    // property entirely, breaking every "join chat_closed back to the
    // conversation it closed" query. Locked here so a future refactor
    // can't silently drop it again.
    test('chat_closed after a successful send carries the server-authoritative '
        'session id', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      repo.nextSendResult = SendMessageResult(
        sessionId: 'server-session-close-1',
        agentId: 'test-agent-id',
        userMessage: ChatMessage(
          id: 'u1',
          sessionId: 'server-session-close-1',
          role: ChatMessageRoleEnum.user,
          message: 'Namaste',
          confidence: null,
          content: ChatContentGroups(
            aarti: const <ChatContentItem>[],
            bhajan: const <ChatContentItem>[],
            mantra: const <ChatContentItem>[],
            ringtone: const <ChatContentItem>[],
            status: const <ChatContentItem>[],
            wallpaper: const <ChatContentItem>[],
          ),
          createdAt: DateTime(2026, 9, 9),
        ),
        botMessage: ChatMessage(
          id: 'b1',
          sessionId: 'server-session-close-1',
          role: ChatMessageRoleEnum.bot,
          message: 'Jai Shri Krishna',
          confidence: null,
          content: ChatContentGroups(
            aarti: const <ChatContentItem>[],
            bhajan: const <ChatContentItem>[],
            mantra: const <ChatContentItem>[],
            ringtone: const <ChatContentItem>[],
            status: const <ChatContentItem>[],
            wallpaper: const <ChatContentItem>[],
          ),
          createdAt: DateTime(2026, 9, 9),
        ),
      );
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);
      bloc.add(
        const ChatMessageSubmitted(message: 'Namaste', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 40));
      analytics.events.clear();

      bloc.onSessionClose(exitReason: ChatExitReason.back);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final closes = analytics.allProps(ChatEvents.chatClosed);
      expect(closes, hasLength(1));
      expect(
        closes.single[ChatEventProps.chatSessionId],
        'server-session-close-1',
        reason: 'chat_closed must join back to its conversation',
      );
    });

    test('chat_closed fires with empty-string chat_session_id when the visit '
        'ended before any send succeeded (no server session id yet)', () async {
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(analytics: analytics, repo: repo);
      addTearDown(bloc.close);
      analytics.events.clear();

      bloc.onSessionClose(exitReason: ChatExitReason.back);
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final closes = analytics.allProps(ChatEvents.chatClosed);
      expect(closes, hasLength(1));
      expect(
        closes.single[ChatEventProps.chatSessionId],
        '',
        reason:
            'no server session id → empty string, never absent — '
            'the property must always be present so the warehouse '
            'column has a consistent shape',
      );
    });
  });

  group('send-time re-gate obeys the server switch', () {
    // Gate 3 of 3. `requiresPro` comes from `/users/me → chatConfig` and is
    // what decides whether the defensive re-gate is armed at all; `isPro` is
    // the user's entitlement. Only the pair (armed, not-Pro) may drop a send.

    test('paywall OFF: a NON-PRO user\'s message is sent, not dropped', () async {
      // The whole point of the ticket. Before the switch this send was
      // rejected before the POST with `dropped_paywall`.
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(
        analytics: analytics,
        repo: repo,
        isPro: false,
        requiresPro: false,
      );
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(
          message: 'Free chat, no Pro',
          promptSource: 'typed',
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      final sends = analytics.allProps(ChatEvents.chatMessageSent);
      expect(sends, hasLength(1));
      expect(
        sends.single[ChatEventProps.sendStatus],
        isNot(ChatSendStatus.droppedPaywall),
        reason: 'an un-armed gate must not report a paywall drop',
      );
      final s = bloc.state;
      expect(s, isA<ChatReady>());
      expect(
        (s as ChatReady).paywallRequiredNonce,
        isNull,
        reason: 'no nonce means the screen never pushes /paywall',
      );
    });

    test('the flag is re-read per send, not captured at construction', () async {
      // Mirrors the discipline `isPro` already has: `/users/me` can be
      // refetched mid-session, so a paywall re-armed by the server must take
      // effect on the very next send without rebuilding the bloc.
      var requiresPro = false;
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = ChatBloc(
        repository: repo,
        counters: ChatCounters.inMemory(),
        isPro: () => false,
        requiresPro: () => requiresPro,
        analytics: analytics,
      );
      bloc.add(const ChatStarted());
      await bloc.stream.firstWhere((s) => s is ChatReady);
      await Future<void>.delayed(Duration.zero);
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(message: 'first', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(
        analytics.allProps(ChatEvents.chatMessageSent).single[
          ChatEventProps.sendStatus
        ],
        isNot(ChatSendStatus.droppedPaywall),
      );

      // The server re-arms the paywall under the running session.
      requiresPro = true;
      analytics.events.clear();

      bloc.add(
        const ChatMessageSubmitted(message: 'second', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(
        analytics.allProps(ChatEvents.chatMessageSent).single[
          ChatEventProps.sendStatus
        ],
        ChatSendStatus.droppedPaywall,
        reason: 'a bool captured at construction would have let this through',
      );
    });

    test('paywall ON still drops a non-Pro send (unchanged)', () async {
      // Re-arming must restore the old behaviour exactly — this is the
      // regression guard for the day the switch is flipped back.
      final analytics = RecordingAnalytics();
      final repo = FakeChatRepository();
      final bloc = await seedReady(
        analytics: analytics,
        repo: repo,
        isPro: false,
        requiresPro: true,
      );
      addTearDown(bloc.close);

      bloc.add(
        const ChatMessageSubmitted(message: 'gated', promptSource: 'typed'),
      );
      await Future<void>.delayed(const Duration(milliseconds: 20));

      expect(
        analytics.allProps(ChatEvents.chatMessageSent).single[
          ChatEventProps.sendStatus
        ],
        ChatSendStatus.droppedPaywall,
      );
      expect((bloc.state as ChatReady).paywallRequiredNonce, isNotNull);
    });
  });
}
