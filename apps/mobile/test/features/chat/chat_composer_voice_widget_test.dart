import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/features/chat/application/chat_bloc.dart';
import 'package:mobile/features/chat/application/chat_event.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/data/chat_counters.dart';
import 'package:mobile/features/chat/presentation/widgets/chat_composer.dart';
import 'package:mobile/features/chat/presentation/widgets/voice_input_controller.dart';
import 'package:mobile/state/providers.dart' as app_providers;

import '../../support/chat_harness.dart';
import '../../support/fake_analytics.dart';

/// Widget tests for the TAM-166 voice branch on [ChatComposer].
///
/// Every test injects a [_FakeVoiceInputController] so no real
/// `speech_to_text` recogniser is constructed, and stubs
/// `permission_handler` to return `granted` so the composer skips the
/// rationale dialog and goes straight into the recording UI.
void main() {
  const permissionChannel = MethodChannel(
    'flutter.baseflow.com/permissions/methods',
  );
  // Track which permission channel-handler tests overrode, so we can
  // clean up after each test.
  void stubMicPermission(int statusValue) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(permissionChannel, (call) async {
          // Permission.microphone.value == 7 across the versions we ship.
          // The stub doesn't care about the value — every check + request
          // resolves to the requested status.
          if (call.method == 'checkPermissionStatus' ||
              call.method == 'requestPermissions') {
            if (call.method == 'requestPermissions') {
              // Request returns Map<int, int>.
              return <int, int>{7: statusValue};
            }
            return statusValue;
          }
          return null;
        });
  }

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(permissionChannel, null);
  });

  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('mic tap starts recording — the recording strip is shown', (
    tester,
  ) async {
    stubMicPermission(1); // granted
    final harness = await _pumpComposer(tester);

    await tester.tap(find.byKey(const Key('chat-composer-mic')));
    // Two pumps: (1) resolve the async permission read + start() future
    // chain, (2) let setState() flush the recording strip in.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byKey(const Key('chat-composer-recording')), findsOneWidget);
    expect(harness.voice.startCalls, 1);
    expect(harness.analytics.fired(ChatEvents.chatVoiceClicked), isTrue);
  });

  testWidgets('stop dispatches ChatMessageSubmitted with promptSource=voice + '
      'non-empty voice_note_id + fires chat_voice_recorded and '
      'chat_voice_transcribed(success)', (tester) async {
    stubMicPermission(1);
    final harness = await _pumpComposer(
      tester,
      uuidFactory: () => 'voice-note-uuid-fixed',
    );

    // Start recording.
    await tester.tap(find.byKey(const Key('chat-composer-mic')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // Queue up a canned success outcome and end the recording. The
    // action button shows the SEND glyph while recording (tap = send the
    // dictated transcript) so the finalize tap targets the send key.
    harness.voice.nextStopOutcome = const VoiceTranscribeOutcome(
      transcript: 'Aap kaise hain Prabhuji',
      confidence: 0.9,
      durationMs: 4200,
    );
    await tester.tap(find.byKey(const Key('chat-composer-send')));
    await tester.pumpAndSettle();

    // The composer dispatches ChatMessageSubmitted; the bloc's `add`
    // override captured it.
    expect(harness.chatBloc.captured, hasLength(1));
    final event = harness.chatBloc.captured.single as ChatMessageSubmitted;
    expect(event.promptSource, 'voice');
    expect(event.voiceNoteId, 'voice-note-uuid-fixed');
    expect(event.audioDurationMs, 4200);
    expect(event.message, 'Aap kaise hain Prabhuji');

    // Analytics fires — order matches the composer's stop sequence.
    expect(harness.analytics.fired(ChatEvents.chatVoiceRecorded), isTrue);
    final transcribed = harness.analytics.propsFor(
      ChatEvents.chatVoiceTranscribed,
    );
    expect(
      transcribed[ChatEventProps.result],
      ChatVoiceTranscribeResult.success,
    );
    expect(
      transcribed[ChatEventProps.transcriptText],
      'Aap kaise hain Prabhuji',
    );
    expect(transcribed[ChatEventProps.transcriptLanguage], 'hi-IN');
    expect(transcribed[ChatEventProps.audioDurationMs], 4200);
    expect(transcribed[ChatEventProps.voiceNoteId], 'voice-note-uuid-fixed');
    // No cancellation / failure fires on the happy path.
    expect(harness.analytics.fired(ChatEvents.chatVoiceCancelled), isFalse);
    expect(
      harness.analytics.fired(ChatEvents.chatVoiceTranscriptionFailed),
      isFalse,
    );
  });

  testWidgets(
    'slide-to-cancel discards the send and fires chat_voice_cancelled',
    (tester) async {
      stubMicPermission(1);
      final harness = await _pumpComposer(tester);

      await tester.tap(find.byKey(const Key('chat-composer-mic')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // Drag the recording strip left past the cancel threshold (-80px).
      // A single drag update crosses the threshold in one go.
      final stripFinder = find.byKey(const Key('chat-composer-recording'));
      expect(stripFinder, findsOneWidget);
      await tester.drag(stripFinder, const Offset(-100, 0));
      await tester.pumpAndSettle();

      // Cancel was invoked; no ChatMessageSubmitted dispatched; the
      // §18.3 cancelled fire landed with a duration_ms.
      expect(harness.voice.cancelCalls, 1);
      expect(harness.chatBloc.captured, isEmpty);
      final cancelled = harness.analytics.propsFor(
        ChatEvents.chatVoiceCancelled,
      );
      expect(cancelled[ChatEventProps.durationMs], isA<int>());
      expect(harness.analytics.fired(ChatEvents.chatMessageSent), isFalse);
    },
  );

  testWidgets(
    'empty transcript surfaces the Hinglish snackbar and does NOT send',
    (tester) async {
      stubMicPermission(1);
      final harness = await _pumpComposer(tester);

      await tester.tap(find.byKey(const Key('chat-composer-mic')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      harness.voice.nextStopOutcome = const VoiceTranscribeOutcome(
        transcript: '',
        confidence: null,
        durationMs: 900,
      );
      // Send glyph shows during recording — tap-to-finalize targets it.
      await tester.tap(find.byKey(const Key('chat-composer-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(harness.chatBloc.captured, isEmpty);
      expect(
        find.byKey(const Key('chat-voice-empty-snackbar')),
        findsOneWidget,
      );
      final transcribed = harness.analytics.propsFor(
        ChatEvents.chatVoiceTranscribed,
      );
      expect(
        transcribed[ChatEventProps.result],
        ChatVoiceTranscribeResult.empty,
      );
      expect(transcribed[ChatEventProps.transcriptText], '');
    },
  );
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

class _ComposerHarness {
  _ComposerHarness({
    required this.chatBloc,
    required this.voice,
    required this.analytics,
    required this.controller,
  });

  final _RecordingChatBloc chatBloc;
  final _FakeVoiceInputController voice;
  final RecordingAnalytics analytics;
  final TextEditingController controller;
}

Future<_ComposerHarness> _pumpComposer(
  WidgetTester tester, {
  String Function()? uuidFactory,
}) async {
  final analytics = RecordingAnalytics();
  final voice = _FakeVoiceInputController();
  final chatBloc = _RecordingChatBloc();
  addTearDown(chatBloc.close);
  final controller = TextEditingController();
  addTearDown(controller.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [app_providers.analyticsProvider.overrideWithValue(analytics)],
      child: MaterialApp(
        home: Scaffold(
          body: BlocProvider<ChatBloc>.value(
            value: chatBloc,
            child: ChatComposer(
              controller: controller,
              onSend: (_) {},
              voiceControllerFactory: () => voice,
              uuidFactory: uuidFactory,
            ),
          ),
        ),
      ),
    ),
  );
  return _ComposerHarness(
    chatBloc: chatBloc,
    voice: voice,
    analytics: analytics,
    controller: controller,
  );
}

/// Real [ChatBloc] whose `add` is intercepted so the widget test can
/// assert what was dispatched without kicking off any side-effects. The
/// bloc's state stays at [ChatInitial] for the whole test — the composer
/// only reads `messageNumberForNextSend` and `state.sessionId` from it.
class _RecordingChatBloc extends ChatBloc {
  _RecordingChatBloc()
    : super(
        repository: FakeChatRepository(),
        counters: ChatCounters.inMemory(),
        isPro: () => true,
      );

  final List<ChatEvent> captured = <ChatEvent>[];

  @override
  void add(ChatEvent event) {
    captured.add(event);
    // Do NOT forward to super — the base bloc would try to talk to the
    // repository / counters we don't want to exercise in the composer
    // test. The bloc is exercised end-to-end elsewhere.
  }
}

/// Fake [VoiceInputController]. Every SDK-touching method is stubbed;
/// tests set `nextStopOutcome` to control what a stop() call returns.
class _FakeVoiceInputController implements VoiceInputController {
  int initializeCalls = 0;
  int startCalls = 0;
  int stopCalls = 0;
  int cancelCalls = 0;
  bool initReturns = true;
  bool _listening = false;
  VoiceTranscribeOutcome nextStopOutcome = const VoiceTranscribeOutcome(
    transcript: '',
    confidence: null,
    durationMs: 0,
  );

  final StreamController<String> _partial =
      StreamController<String>.broadcast();

  @override
  Stream<String> get partialResults => _partial.stream;

  @override
  bool get isListening => _listening;

  @override
  String get lastTranscript => nextStopOutcome.transcript;

  @override
  Future<bool> initialize() async {
    initializeCalls++;
    return initReturns;
  }

  @override
  Future<void> start({
    String locale = 'hi-IN',
    Duration listenFor = const Duration(seconds: 60),
    Duration pauseFor = const Duration(seconds: 3),
  }) async {
    startCalls++;
    _listening = true;
  }

  @override
  Future<VoiceTranscribeOutcome> stop() async {
    stopCalls++;
    _listening = false;
    return nextStopOutcome;
  }

  @override
  Future<int> cancel() async {
    cancelCalls++;
    _listening = false;
    return nextStopOutcome.durationMs;
  }

  @override
  Future<void> dispose() async {
    await _partial.close();
  }
}
