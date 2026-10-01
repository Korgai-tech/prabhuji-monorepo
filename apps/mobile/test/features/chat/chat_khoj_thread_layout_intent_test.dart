import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/chat_providers.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/presentation/chat_screen.dart';
import 'package:mobile/features/kuldevta/application/kuldevta_bloc.dart';
import 'package:mobile/features/kuldevta/data/kuldevta_counters.dart';
import 'package:mobile/features/kuldevta/kuldevta_providers.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/state/providers.dart' as app_providers;
import 'package:visibility_detector/visibility_detector.dart';

import '../../support/chat_harness.dart';
import '../../support/fake_chat_video_port.dart';
import '../../support/kuldevta_harness.dart';

/// Layout-intent test for the khoj thread (TAM-177, Figma `3934:14677`,
/// `3938:26855`, `3938:27723`).
///
/// The khoj thread reuses the chat screen's skeleton, so it inherits the same
/// three zones and must honour the same rules at every device height:
///
///   * pinned-top app bar        `Key('chat-appbar')`  — reads "Kuldevta Khoj"
///   * flex-fill transcript      `Key('chat-transcript')`
///   * pinned-bottom composer    `Key('chat-composer-zone')`
///
/// What makes this worth its own file rather than a parameter on the existing
/// chat test: the khoj thread's content is entirely `leadingRows` /
/// `trailingRows` rather than messages, and the "Shuru Kijiye" / "Pata Nahi"
/// buttons live INSIDE the scrollable. A naive implementation would pin those
/// buttons above the composer, which reads fine on an 800 dp frame and breaks
/// the design at 600 dp. Only a height sweep catches that.
MeUser _khojMe() => MeUser(
  id: 'test-user',
  name: 'Tester',
  selectedLanguage: 'hi',
  onboardingCompletedAt: DateTime(2026),
  phoneCountryCode: '+91',
  phoneNumber: '9999999999',
  chatConfig: const MeChatConfig(
    enabled: true,
    agentId: 'test-agent-id',
    showKuldevtaChat: true,
    kuldevtaAssigned: false,
  ),
);

void main() {
  const width = 360.0;
  const heights = <double>[600, 800, 1200];

  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  Future<void> pumpKhoj(WidgetTester tester, Size size) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final chatBloc = ChatBloc(
      repository: FakeChatRepository(),
      counters: ChatCounters.inMemory(),
      isPro: () => true,
    )..add(const ChatStarted());
    addTearDown(chatBloc.close);

    final kuldevtaBloc = KuldevtaBloc(
      repository: FakeKuldevtaRepository()..nextResult = sampleKuldevtaDevi(),
      counters: KuldevtaCounters.inMemory(),
      isPro: () => true,
      typingDelay: Duration.zero,
    );
    addTearDown(kuldevtaBloc.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          app_providers.meProvider.overrideWith(
            (ref) => Future<MeUser?>.value(_khojMe()),
          ),
          app_providers.analyticsProvider.overrideWithValue(null),
          chatCountersProvider.overrideWith((ref) => ChatCounters.inMemory()),
          chatVideoPortFactoryProvider.overrideWithValue(FakeChatVideoPort.new),
          kuldevtaBlocProvider.overrideWith((ref) => kuldevtaBloc),
        ],
        child: MediaQuery(
          data: MediaQueryData(size: size),
          child: MaterialApp(
            home: BlocProvider<ChatBloc>.value(
              value: chatBloc,
              child: const ChatScreen(),
            ),
          ),
        ),
      ),
    );
    await settle(tester);
  }

  group('Khoj thread layout intent', () {
    for (final h in heights) {
      testWidgets('layout intent holds at ${h.toInt()}dp', (tester) async {
        await pumpKhoj(tester, Size(width, h));

        // The khoj header tier — proves we are actually testing khoj mode and
        // not silently falling through to the generic chat tree.
        expect(find.byKey(const Key('chat-appbar-khoj-title')), findsOneWidget);

        final appBar = tester.getRect(find.byKey(const Key('chat-appbar')));
        expect(
          appBar.top,
          closeTo(0, 0.5),
          reason: 'pinned-top app bar must sit at y=0 (was ${appBar.top})',
        );

        final composer = tester.getRect(
          find.byKey(const Key('chat-composer-zone')),
        );
        expect(
          composer.bottom,
          closeTo(h, 0.5),
          reason:
              'composer must be flush with the bottom edge '
              '(was ${composer.bottom}, expected $h)',
        );

        final transcript = tester.getRect(
          find.byKey(const Key('chat-transcript')),
        );
        expect(
          transcript.top,
          closeTo(appBar.bottom, 0.5),
          reason: 'transcript must sit directly under the app bar',
        );
        expect(
          transcript.bottom,
          closeTo(composer.top, 0.5),
          reason: 'transcript must sit directly above the composer',
        );

        // The khoj action button scrolls WITH the conversation — it is a
        // transcript row, not a fourth pinned zone. If it ever became pinned,
        // its bottom would coincide with the composer's top.
        final startButton = tester.getRect(
          find.byKey(const Key('khoj-start-button')),
        );
        expect(
          startButton.bottom < composer.top,
          isTrue,
          reason:
              '"Shuru Kijiye" belongs inside the scrollable thread, not '
              'pinned above the composer',
        );
      });
    }

    testWidgets('the thread is the only screen-level scrollable', (
      tester,
    ) async {
      await pumpKhoj(tester, const Size(width, 800));

      // The composer's TextField owns an internal EditableText Scrollable;
      // that one never scrolls the screen, so it is excluded the same way the
      // existing chat layout-intent test excludes it.
      final transcriptScroll = find.byKey(const Key('chat-transcript-scroll'));
      expect(transcriptScroll, findsOneWidget);

      final scrollablesInTranscript = find.descendant(
        of: find.byKey(const Key('chat-transcript')),
        matching: find.byType(Scrollable),
      );
      expect(
        scrollablesInTranscript,
        findsOneWidget,
        reason: 'exactly one flex-fill scrollable lives in the transcript zone',
      );
    });
  });
}
