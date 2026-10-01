import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/analytics_enricher.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_intro_video_card.dart';
import 'package:mobile/state/providers.dart' as app_providers;
import 'package:visibility_detector/visibility_detector.dart';

import '../../support/fake_analytics.dart';
import '../../support/fake_chat_video_port.dart';

/// TAM-177 — the two new video events, and the one rule about them that is
/// easy to get wrong.
///
/// The written ticket lists `chat_type` as a property on BOTH events. It must
/// NOT be passed from the call site: `AnalyticsEnricher` stamps `chat_type` on
/// every event globally, and caller properties OVERRIDE the enricher, so a
/// call-site copy silently becomes a second source of truth that drifts. The
/// ticket's actual requirement — that `chat_type` separates Content, Gita and
/// Kuldevta on these events — is satisfied for free. Same rule TAM-167
/// established; mirrors the group in `chat_bloc_send_status_test.dart`.
void main() {
  setUp(() {
    // VisibilityDetector batches callbacks behind a timer; without this the
    // binding reports "A Timer is still pending even after the widget tree was
    // disposed" on every test that mounts the card.
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  const videoId = 'content_chat_intro_v1';
  const durationMs = 27200; // the real Content_Chat.mp4
  const agentId = 'test-agent-id';

  Future<FakeChatVideoPort> pumpCard(
    WidgetTester tester, {
    required RecordingAnalytics analytics,
    Duration position = Duration.zero,
    bool failInit = false,
  }) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    await tester.binding.setSurfaceSize(const Size(390, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final port = FakeChatVideoPort(failInit: failInit, position: position);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          app_providers.analyticsProvider.overrideWithValue(analytics),
          chatVideoPortFactoryProvider.overrideWithValue(() => port),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: ChatIntroVideoCard(
              videoUrl: 'https://cdn.test/content_chat.mp4',
              videoId: videoId,
              videoDurationMs: durationMs,
              agentId: agentId,
              pauseSignal: ChatVideoPauseSignal(),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    return port;
  }

  group('chat_video_started', () {
    testWidgets('fires with trigger: autoplay when the chat opens', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      await pumpCard(tester, analytics: analytics);

      final props = analytics.propsFor(ChatEvents.chatVideoStarted);
      expect(props[ChatEventProps.trigger], ChatVideoStartTrigger.autoplay);
      expect(props[ChatEventProps.videoId], videoId);
      expect(props[ChatEventProps.agentId], agentId);
      expect(props[ChatEventProps.positionMs], 0);
      expect(props[ChatEventProps.videoDurationMs], durationMs);
    });

    testWidgets('fires with trigger: user_tap and a non-zero position_ms when '
        'a paused card is resumed', (tester) async {
      final analytics = RecordingAnalytics();
      final port = await pumpCard(tester, analytics: analytics);

      // Pause by tapping, then let the position advance as it would while the
      // user was reading, then resume.
      await tester.tap(find.byKey(const Key('chat-intro-video-surface')));
      await tester.pump();
      port.position = const Duration(milliseconds: 4200);
      await tester.tap(find.byKey(const Key('chat-intro-video-surface')));
      await tester.pump();

      final starts = analytics.allProps(ChatEvents.chatVideoStarted);
      expect(starts.length, 2, reason: 'autoplay, then the tap-resume');
      expect(
        starts.last[ChatEventProps.trigger],
        ChatVideoStartTrigger.userTap,
      );
      expect(
        starts.last[ChatEventProps.positionMs],
        4200,
        reason: 'a resume is told apart from a first play by position_ms',
      );
    });
  });

  group('chat_video_paused', () {
    testWidgets('a card tap fires trigger: user_tap with watched_ms', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      final port = await pumpCard(tester, analytics: analytics);

      port.position = const Duration(milliseconds: 3000);
      await tester.tap(find.byKey(const Key('chat-intro-video-surface')));
      await tester.pump();

      final props = analytics.propsFor(ChatEvents.chatVideoPaused);
      expect(props[ChatEventProps.trigger], ChatVideoPauseTrigger.userTap);
      expect(props[ChatEventProps.watchedMs], 3000);
      expect(props[ChatEventProps.videoDurationMs], durationMs);
      expect(port.pauseCalls, 1);
    });

    testWidgets('the pause signal fires trigger: answer_started', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      GoogleFonts.config.allowRuntimeFetching = false;
      final signal = ChatVideoPauseSignal();
      final port = FakeChatVideoPort();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            app_providers.analyticsProvider.overrideWithValue(analytics),
            chatVideoPortFactoryProvider.overrideWithValue(() => port),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: ChatIntroVideoCard(
                videoUrl: 'https://cdn.test/content_chat.mp4',
                videoId: videoId,
                videoDurationMs: durationMs,
                agentId: agentId,
                pauseSignal: signal,
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();

      // This is what the composer's first keystroke / recording start /
      // chip tap / "Pata Nahi" all do.
      signal.requestPause(ChatVideoPauseTrigger.answerStarted);
      await tester.pump();

      expect(
        analytics.propsFor(ChatEvents.chatVideoPaused)[ChatEventProps.trigger],
        ChatVideoPauseTrigger.answerStarted,
      );
      expect(port.pauseCalls, 1);
    });

    testWidgets('leaving the screen fires trigger: screen_exit', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      await pumpCard(tester, analytics: analytics);

      // Tear the card down — the real path is a route push / tab switch /
      // app background, all of which end in dispose or a gate flip.
      await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
      await tester.pump();

      expect(
        analytics.propsFor(ChatEvents.chatVideoPaused)[ChatEventProps.trigger],
        ChatVideoPauseTrigger.screenExit,
      );
    });
  });

  group('#EXPORT_CRITICAL — chat_type is a global concern (TAM-167)', () {
    testWidgets('neither video event carries a call-site chat_type', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      final port = await pumpCard(tester, analytics: analytics);
      port.position = const Duration(milliseconds: 1500);
      await tester.tap(find.byKey(const Key('chat-intro-video-surface')));
      await tester.pump();

      expect(analytics.fired(ChatEvents.chatVideoStarted), isTrue);
      expect(analytics.fired(ChatEvents.chatVideoPaused), isTrue);
      for (final name in [
        ChatEvents.chatVideoStarted,
        ChatEvents.chatVideoPaused,
      ]) {
        for (final props in analytics.allProps(name)) {
          expect(
            props.containsKey(AnalyticsEnricher.kChatTypeKey),
            isFalse,
            reason:
                '$name must not pass chat_type — the enricher stamps it on '
                'every event and a caller value overrides it',
          );
        }
      }
    });
  });

  group('the video never restarts on its own', () {
    testWidgets('a rebuild does not re-initialize the port', (tester) async {
      final analytics = RecordingAnalytics();
      final port = await pumpCard(tester, analytics: analytics);

      // Force several rebuilds.
      for (var i = 0; i < 3; i++) {
        await tester.pump();
      }
      await tester.tap(find.byKey(const Key('chat-intro-video-surface')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('chat-intro-video-surface')));
      await tester.pump();

      expect(
        port.initializeCalls.length,
        1,
        reason:
            'a second initialize() would re-open the media and rewind to '
            '0:00, which is exactly what "does not restart after being '
            'paused" forbids',
      );
    });

    testWidgets('a failed init leaves the poster up and fires no start event', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      await pumpCard(tester, analytics: analytics, failInit: true);

      expect(analytics.fired(ChatEvents.chatVideoStarted), isFalse);
      // The duration badge still renders — it is server-sourced, not read off
      // the player, so it survives a dead video.
      expect(
        find.byKey(const Key('chat-intro-video-duration')),
        findsOneWidget,
      );
      expect(find.byKey(const Key('chat-intro-video-play')), findsOneWidget);
    });
  });

  group('duration badge', () {
    testWidgets('renders the server duration, not the Figma mock', (
      tester,
    ) async {
      final analytics = RecordingAnalytics();
      await pumpCard(tester, analytics: analytics);

      // 27_200 ms -> "0:27". Figma draws "0:10", which is a mock value; the
      // badge is server-sourced and must match the real asset.
      expect(find.text('0:27'), findsOneWidget);
    });
  });
}
