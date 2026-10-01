import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/generated/openapi.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../support/chat_harness.dart';

/// TAM-178 — the intro block across device sizes and text scales.
///
/// Two properties, and the first is the one the design hinges on:
///
///  1. **Chips HUG their label.** Figma `3975:23838` / `3975:24029` give three
///     different widths per screen (230/208/166 and 235/160/200) because each
///     pill is `text + 20`. A full-width stack reads as the old RECOMMENDED
///     card list, which is exactly what this block replaces. The regression
///     that produced it is subtle — a `Container` with a non-null `alignment`
///     expands to its constraints instead of sizing to its child — so it is
///     pinned here rather than left to a golden.
///
///  2. Nothing overflows at any size, including 320 dp × textScale 2.0, where
///     a long chip must wrap and grow its pill.
ChatHistoryResponseData _history({ChatIntroVideo? video}) {
  final base = buildHistoryWith(transcript: const <ChatMessage>[]);
  return ChatHistoryResponseData(
    sessionId: base.sessionId,
    previousChat: base.previousChat,
    nextCursor: base.nextCursor,
    chatConfig: ChatScreenConfig(
      introVideo: video,
      enabled: true,
      agentId: 'test-agent-id',
      title: base.chatConfig.title,
      subtitle: base.chatConfig.subtitle,
      recommendedMessages: <ChatRecommendedMessage>[
        // Deliberately three very different lengths — equal widths would hide
        // the hug regression.
        ChatRecommendedMessage(
          id: 'a',
          order: 0,
          text: 'Krishna ne Arjun se kya kaha?',
        ),
        ChatRecommendedMessage(id: 'b', order: 1, text: 'Gita kya sikhati he?'),
        ChatRecommendedMessage(
          id: 'c',
          order: 2,
          text: 'Mann shaant kaise rahe?',
        ),
      ],
    ),
  );
}

void main() {
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  const widths = <double>[320, 360, 390, 428];
  const heights = <double>[600, 800, 1200];

  group('intro chips hug their label', () {
    testWidgets('three different labels give three different widths', (
      tester,
    ) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: _history()),
        size: const Size(390, 800),
      );

      final a = tester.getSize(find.byKey(const Key('chat-intro-chip-a')));
      final b = tester.getSize(find.byKey(const Key('chat-intro-chip-b')));
      final c = tester.getSize(find.byKey(const Key('chat-intro-chip-c')));

      expect(
        a.width == b.width && b.width == c.width,
        isFalse,
        reason:
            'equal widths mean the chips stretched instead of hugging — the '
            'design gives each pill its own width',
      );
      // Longest label -> widest pill, shortest -> narrowest.
      expect(a.width, greaterThan(c.width));
      expect(c.width, greaterThan(b.width));

      // And none of them fills the screen.
      expect(
        a.width,
        lessThan(390 - 32),
        reason: 'a hugging chip never spans the full content width',
      );
    });

    testWidgets('chips are left-aligned, not centred', (tester) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: _history()),
        size: const Size(390, 800),
      );

      final a = tester.getRect(find.byKey(const Key('chat-intro-chip-a')));
      final b = tester.getRect(find.byKey(const Key('chat-intro-chip-b')));
      expect(
        a.left,
        closeTo(b.left, 0.5),
        reason: 'all chips share one left edge; centred chips would not',
      );
    });
  });

  group('the media bubble matches Figma, not the text bubble', () {
    testWidgets('the video is ~242 wide in a 360 frame, not full width', (
      tester,
    ) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(
          seedHistory: _history(
            video: ChatIntroVideo(
              videoId: 'v1',
              url: 'https://cdn.test/v.mp4',
              durationMs: 20880,
            ),
          ),
        ),
        size: const Size(360, 800),
      );

      // Measured on the VIDEO, not the bubble: ChatBubble's root is an Align
      // that legitimately fills the row, so a width assertion there would pass
      // no matter how wide the pill grew. The video is inside the pill, so its
      // width pins the bubble's — Figma has media 242 inside a 250 bubble.
      final video = tester.getSize(find.byKey(const Key('chat-intro-video')));
      expect(
        video.width,
        closeTo(242, 10),
        reason:
            'the media bubble is 0.694 of the frame with 4dp padding; the '
            'text bubble geometry (0.92 + 16dp) would give ~299',
      );
      expect(
        video.width,
        lessThan(360 * 0.75),
        reason: 'if this passes 0.75 the text-bubble geometry has crept back',
      );
    });

    testWidgets('the video keeps the Figma aspect ratio', (tester) async {
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(
          seedHistory: _history(
            video: ChatIntroVideo(
              videoId: 'v1',
              url: 'https://cdn.test/v.mp4',
              durationMs: 20880,
            ),
          ),
        ),
        size: const Size(360, 800),
      );

      final video = tester.getSize(find.byKey(const Key('chat-intro-video')));
      // Figma media is 242 x 306.5.
      expect(video.width / video.height, closeTo(242 / 306.5, 0.02));
    });
  });

  group('no overflow across sizes', () {
    for (final w in widths) {
      for (final h in heights) {
        testWidgets('no layout exception @ ${w.toInt()}x${h.toInt()}', (
          tester,
        ) async {
          await pumpChatScreen(
            tester,
            repository: FakeChatRepository(seedHistory: _history()),
            size: Size(w, h),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }

    for (final w in <double>[320, 390]) {
      testWidgets('no layout exception @ ${w.toInt()}x600 × textScale 2.0', (
        tester,
      ) async {
        await pumpChatScreen(
          tester,
          repository: FakeChatRepository(seedHistory: _history()),
          size: Size(w, 600),
          textScaleFactor: 2.0,
        );
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('a very long chip wraps instead of overflowing', (
      tester,
    ) async {
      final long = ChatHistoryResponseData(
        sessionId: null,
        previousChat: const <ChatMessage>[],
        nextCursor: null,
        chatConfig: ChatScreenConfig(
          introVideo: null,
          enabled: true,
          agentId: 'test-agent-id',
          title: 'Namaste',
          subtitle: 'Aaj kya poochhna chahenge?',
          recommendedMessages: <ChatRecommendedMessage>[
            ChatRecommendedMessage(
              id: 'long',
              order: 0,
              text:
                  'Mujhe aaj bahut zyada tension ho rahi hai aur mann bilkul '
                  'shaant nahi ho raha, kya karun bhagwan',
            ),
          ],
        ),
      );
      await pumpChatScreen(
        tester,
        repository: FakeChatRepository(seedHistory: long),
        size: const Size(320, 600),
      );
      expect(tester.takeException(), isNull);

      final chip = tester.getSize(
        find.byKey(const Key('chat-intro-chip-long')),
      );
      expect(
        chip.width,
        lessThanOrEqualTo(320 - 32),
        reason: 'a long label must wrap within the content width, not spill',
      );
      expect(
        chip.height,
        greaterThan(40),
        reason: 'wrapping grows the pill rather than clipping the text',
      );
    });
  });
}
