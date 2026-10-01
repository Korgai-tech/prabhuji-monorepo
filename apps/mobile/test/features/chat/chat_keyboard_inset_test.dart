import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/api/generated/openapi.dart';
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

/// The soft keyboard must never bury the live end of a chat thread.
///
/// The transcript is a `ListView`. The reversed (normal chat) one is
/// bottom-anchored and survives a viewport shrink for free; the FORWARD,
/// top-anchored one used by the khoj thread and the first-time intro block
/// does NOT — it keeps its pixel offset, so the newest rows slide out under
/// the keyboard and the thread looks frozen. `ChatTranscript` re-pins the
/// newest end on a viewport shrink; these tests hold that.
///
/// The keyboard is simulated as a viewport shrink driven by MediaQuery view
/// insets. On device the shell `Scaffold` strips the inset and hands the chat
/// a shorter box instead — same shrink, which is exactly why the production
/// code keys off viewport HEIGHT rather than off the inset.
MeUser _me({required bool khoj}) => MeUser(
  id: 'test-user',
  name: 'Tester',
  selectedLanguage: 'hi',
  onboardingCompletedAt: DateTime(2026),
  phoneCountryCode: '+91',
  phoneNumber: '9999999999',
  chatConfig: MeChatConfig(
    enabled: true,
    agentId: 'test-agent-id',
    showKuldevtaChat: khoj,
    kuldevtaAssigned: false,
  ),
);

void main() {
  const size = Size(390, 800);
  const keyboard = 336.0;

  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  /// Pumps the chat screen with a LIVE keyboard inset: flipping
  /// `inset.value` re-lays-out the same element tree, exactly as the real
  /// keyboard animation does, instead of rebuilding the screen from scratch.
  Future<ValueNotifier<double>> pump(
    WidgetTester tester, {
    required bool khoj,
    FakeChatRepository? repository,
  }) async {
    GoogleFonts.config.allowRuntimeFetching = false;
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final inset = ValueNotifier<double>(0);
    addTearDown(inset.dispose);

    final chatBloc = ChatBloc(
      repository: repository ?? FakeChatRepository(),
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
            (ref) => Future<MeUser?>.value(_me(khoj: khoj)),
          ),
          app_providers.analyticsProvider.overrideWithValue(null),
          chatCountersProvider.overrideWith((ref) => ChatCounters.inMemory()),
          chatVideoPortFactoryProvider.overrideWithValue(FakeChatVideoPort.new),
          kuldevtaBlocProvider.overrideWith((ref) => kuldevtaBloc),
        ],
        child: ValueListenableBuilder<double>(
          valueListenable: inset,
          builder: (context, bottomInset, _) => MediaQuery(
            data: MediaQueryData(
              size: size,
              viewInsets: EdgeInsets.only(bottom: bottomInset),
            ),
            child: MaterialApp(
              home: BlocProvider<ChatBloc>.value(
                value: chatBloc,
                child: const ChatScreen(),
              ),
            ),
          ),
        ),
      ),
    );
    await settle(tester);
    return inset;
  }

  testWidgets('khoj: the live question and its action stay visible with the '
      'keyboard open', (tester) async {
    final inset = await pump(tester, khoj: true);
    await tester.tap(find.byKey(const Key('khoj-start-button')));
    await settle(tester);

    inset.value = keyboard;
    await settle(tester);

    final composer = tester.getRect(
      find.byKey(const Key('chat-composer-zone')),
    );
    expect(
      composer.bottom,
      closeTo(size.height - keyboard, 0.5),
      reason: 'the composer must sit on top of the keyboard',
    );

    final transcript = tester.getRect(find.byKey(const Key('chat-transcript')));
    final button = find.byKey(const Key('khoj-pata-nahi-button'));
    expect(
      button,
      findsOneWidget,
      reason: 'the newest row must still be built, not scrolled out of the '
          'shrunken viewport',
    );
    expect(
      tester.getRect(button).bottom,
      lessThanOrEqualTo(transcript.bottom + 0.5),
      reason: 'the newest row must be inside the visible transcript',
    );
  });

  testWidgets('normal chat: the newest message stays visible with the '
      'keyboard open', (tester) async {
    // `previousChat` is newest-FIRST on the wire (the bloc reverses it), so
    // index 0 is the live end of the thread — the message the keyboard must
    // not bury.
    final transcriptMessages = <ChatMessage>[
      for (var i = 0; i < 12; i++)
        ChatMessage(
          id: 'm$i',
          sessionId: 'session-1',
          role: i.isEven
              ? ChatMessageRoleEnum.user
              : ChatMessageRoleEnum.bot,
          message: 'Message number $i',
          confidence: null,
          content: ChatContentGroups(
            aarti: const <ChatContentItem>[],
            bhajan: const <ChatContentItem>[],
            mantra: const <ChatContentItem>[],
            ringtone: const <ChatContentItem>[],
            status: const <ChatContentItem>[],
            wallpaper: const <ChatContentItem>[],
          ),
          createdAt: DateTime(2026, 8, 28, 9, 30 + i),
        ),
    ];
    final inset = await pump(
      tester,
      khoj: false,
      repository: FakeChatRepository(
        seedHistory: buildHistoryWith(transcript: transcriptMessages),
      ),
    );

    inset.value = keyboard;
    await settle(tester);

    final composer = tester.getRect(
      find.byKey(const Key('chat-composer-zone')),
    );
    expect(composer.bottom, closeTo(size.height - keyboard, 0.5));

    final transcript = tester.getRect(find.byKey(const Key('chat-transcript')));
    final newest = find.text('Message number 0');
    expect(newest, findsOneWidget);
    expect(
      tester.getRect(newest).bottom,
      lessThanOrEqualTo(transcript.bottom + 0.5),
    );
  });
}
