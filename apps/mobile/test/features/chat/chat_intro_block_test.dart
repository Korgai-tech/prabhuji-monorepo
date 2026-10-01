import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../support/chat_harness.dart';

/// TAM-178 — the first-time intro block on an empty Content / Gita thread.
///
/// The load-bearing rules, in order of how easy they are to get wrong:
///   1. It shows ONCE per agent per install, and never again.
///   2. It retires on ANY engagement, including a voice note, which never
///      passes through the screen.
///   3. It renders without a video, because gita shipped that way.
///   4. It is per AGENT, so being re-bucketed does not suppress a pitch the
///      user has never seen.
ChatHistoryResponseData _history({
  ChatIntroVideo? video,
  String agentId = 'test-agent-id',
  List<ChatMessage> transcript = const <ChatMessage>[],
}) {
  final base = buildHistoryWith(transcript: transcript, agentId: agentId);
  return ChatHistoryResponseData(
    sessionId: base.sessionId,
    previousChat: base.previousChat,
    nextCursor: base.nextCursor,
    chatConfig: ChatScreenConfig(
      introVideo: video,
      enabled: true,
      agentId: agentId,
      title: base.chatConfig.title,
      subtitle: base.chatConfig.subtitle,
      recommendedMessages: <ChatRecommendedMessage>[
        ChatRecommendedMessage(
          id: 'troubled_mood',
          order: 0,
          text: 'Aaj mann bahut pareshan hai',
        ),
        ChatRecommendedMessage(
          id: 'play_hanuman_chalisa',
          order: 1,
          text: 'Hanuman Chalisa suna do',
        ),
        ChatRecommendedMessage(
          id: 'today_horoscope',
          order: 2,
          text: 'Aaj ka rashifal batao',
        ),
        // A fourth, to prove the design's three-chip cap is enforced client
        // side rather than assumed of the server.
        ChatRecommendedMessage(id: 'extra', order: 3, text: 'Extra chip'),
      ],
    ),
  );
}

ChatIntroVideo _video() => ChatIntroVideo(
  videoId: 'content_chat_intro_v1',
  url: 'https://cdn.test/Content_Chat.mp4',
  durationMs: 27200,
);

void main() {
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  group('the intro block on an empty thread', () {
    testWidgets('renders the video, the caption and three chips', (
      tester,
    ) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: _history(video: _video())),
      );

      expect(find.byKey(const Key('chat-intro-bubble')), findsOneWidget);
      expect(find.byKey(const Key('chat-intro-video')), findsOneWidget);
      expect(find.text('Aaj aap kya poochna chahenge?'), findsOneWidget);
      expect(find.text('Aaj mann bahut pareshan hai'), findsOneWidget);
      expect(find.text('Hanuman Chalisa suna do'), findsOneWidget);
      expect(find.text('Aaj ka rashifal batao'), findsOneWidget);
      // Capped at three even though the server sent four.
      expect(find.text('Extra chip'), findsNothing);
      // The duration badge is server-sourced, so it paints before any frame.
      expect(find.text('0:27'), findsOneWidget);
    });

    testWidgets('renders caption + chips with NO video — the gita case', (
      tester,
    ) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: _history()),
      );

      expect(find.byKey(const Key('chat-intro-bubble')), findsOneWidget);
      expect(
        find.byKey(const Key('chat-intro-video')),
        findsNothing,
        reason: 'no asset is a designed state, not a hole in the bubble',
      );
      expect(find.text('Aaj aap kya poochna chahenge?'), findsOneWidget);
      expect(find.text('Aaj mann bahut pareshan hai'), findsOneWidget);
    });

    testWidgets('the old empty state is NOT rendered alongside it', (
      tester,
    ) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: _history(video: _video())),
      );

      // The intro block replaces the roundel/"Namaste"/RECOMMENDED treatment
      // for a first-time user; showing both would be two competing openers.
      expect(find.byKey(const Key('chat-empty-scroll')), findsNothing);
      expect(
        find.byKey(const Key('chat-empty-recommended-label')),
        findsNothing,
      );
    });

    testWidgets('does NOT render once the thread has messages', (tester) async {
      final seeded = _history(video: _video());
      final withMsg = buildHistoryWith(
        transcript: <ChatMessage>[
          ChatMessage(
            id: 'm1',
            sessionId: 's1',
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
            createdAt: DateTime(2026, 9, 18),
          ),
        ],
      );
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(
          seedHistory: ChatHistoryResponseData(
            sessionId: withMsg.sessionId,
            previousChat: withMsg.previousChat,
            nextCursor: withMsg.nextCursor,
            chatConfig: seeded.chatConfig,
          ),
        ),
      );

      expect(find.byKey(const Key('chat-intro-bubble')), findsNothing);
      expect(find.text('Namaste'), findsOneWidget);
    });
  });

  group('the rule is simply "is the thread empty"', () {
    testWidgets('a second visit to a thread that is STILL empty shows it '
        'again — there is no separate seen flag to disagree with the '
        'thread', (tester) async {
      final repo = FakeChatRepository(seedHistory: _history(video: _video()));

      await pumpChatScreen(tester, repository: repo);
      expect(find.byKey(const Key('chat-intro-bubble')), findsOneWidget);

      // Remount, same empty history — the block is back, because nothing has
      // happened that would make it stale.
      await pumpChatScreen(tester, repository: repo);
      expect(find.byKey(const Key('chat-intro-bubble')), findsOneWidget);
    });

    testWidgets('the old centred empty state is gone from the live chat', (
      tester,
    ) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: _history()),
      );
      // The roundel/"Namaste"/RECOMMENDED treatment survives only for the
      // read-only case; an empty live thread must never render it.
      expect(find.byKey(const Key('chat-empty-scroll')), findsNothing);
      expect(find.text('Namaste'), findsNothing);
    });
  });
}
