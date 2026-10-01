import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/chat_analytics.dart';
import 'package:mobile/features/chat/presentation/widgets/voice_input_controller.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

/// Unit tests for [VoiceInputController] — the composer's `speech_to_text`
/// wrapper. All tests inject a [_FakeSpeechToText] so the platform method
/// channel is NEVER touched.
void main() {
  group('VoiceInputController.initialize', () {
    test('caches success and short-circuits on repeat calls', () async {
      final fake = _FakeSpeechToText();
      final controller = VoiceInputController(recognizer: fake);
      expect(await controller.initialize(), isTrue);
      expect(await controller.initialize(), isTrue);
      expect(
        fake.initializeCalls,
        1,
        reason: 'initialize should be idempotent',
      );
    });

    test('propagates a failed init (recogniser unavailable)', () async {
      final fake = _FakeSpeechToText()..initReturns = false;
      final controller = VoiceInputController(recognizer: fake);
      expect(await controller.initialize(), isFalse);
      // Subsequent initialize retries — no positive cache on failure.
      fake.initReturns = true;
      expect(await controller.initialize(), isTrue);
      expect(fake.initializeCalls, 2);
    });
  });

  group('VoiceInputController.start + partials', () {
    test(
      'emits successive partial transcripts on the partialResults stream',
      () async {
        final fake = _FakeSpeechToText();
        final controller = VoiceInputController(recognizer: fake);
        await controller.initialize();
        final received = <String>[];
        final subscription = controller.partialResults.listen(received.add);
        await controller.start();
        fake.emitPartial('Namaste');
        fake.emitPartial('Namaste Prabhu');
        // Give the broadcast stream a microtask hop to fan out.
        await Future<void>.delayed(Duration.zero);
        expect(received, <String>['Namaste', 'Namaste Prabhu']);
        await subscription.cancel();
      },
    );

    test('start throws StateError when initialize was not awaited', () async {
      final fake = _FakeSpeechToText();
      final controller = VoiceInputController(recognizer: fake);
      expect(() => controller.start(), throwsA(isA<StateError>()));
    });
  });

  group('VoiceInputController.stop', () {
    test('resolves with the final transcript + duration on success', () async {
      final fake = _FakeSpeechToText();
      final controller = VoiceInputController(recognizer: fake);
      await controller.initialize();
      await controller.start();
      // A single final result arriving after stop() runs. Confidence set
      // so we can assert it propagates through the outcome.
      final stopFuture = controller.stop();
      fake.emitFinal('Aap kaise hain', confidence: 0.87);
      final outcome = await stopFuture;
      expect(outcome.transcript, 'Aap kaise hain');
      expect(outcome.confidence, closeTo(0.87, 1e-9));
      expect(outcome.durationMs, greaterThanOrEqualTo(0));
      expect(fake.stopCalls, 1);
    });

    test(
      'falls back to the last partial when no final callback arrives',
      () async {
        final fake = _FakeSpeechToText();
        final controller = VoiceInputController(recognizer: fake);
        await controller.initialize();
        await controller.start();
        fake.emitPartial('Om Namah');
        // Deliberately never emit a final. The controller's stop() bounds
        // the wait at 3s; we run the timeout via fakeAsync via a plain
        // Future timer with a shorter bound using the actual internal
        // timeout below.
        // For the unit test we rely on the 3s cap.
        final outcome = await controller.stop().timeout(
          const Duration(seconds: 5),
        );
        expect(
          outcome.transcript,
          'Om Namah',
          reason: 'stop should return the last observed partial on timeout',
        );
      },
      timeout: const Timeout(Duration(seconds: 8)),
    );
  });

  group('VoiceInputController.cancel', () {
    test('discards state and returns the elapsed ms', () async {
      final fake = _FakeSpeechToText();
      final controller = VoiceInputController(recognizer: fake);
      await controller.initialize();
      await controller.start();
      fake.emitPartial('half a message');
      final duration = await controller.cancel();
      expect(duration, greaterThanOrEqualTo(0));
      expect(
        controller.lastTranscript,
        '',
        reason: 'cancel should wipe the accumulated transcript',
      );
      expect(fake.cancelCalls, 1);
    });
  });

  group('VoiceInputController error mapping', () {
    test('error_no_match → noSpeechDetected', () async {
      await _expectFailure(
        errorMsg: 'error_no_match',
        expected: ChatVoiceTranscriptionFailureReason.noSpeechDetected,
      );
    });

    test('error_speech_timeout → noSpeechDetected', () async {
      await _expectFailure(
        errorMsg: 'error_speech_timeout',
        expected: ChatVoiceTranscriptionFailureReason.noSpeechDetected,
      );
    });

    test('error_network → serviceError', () async {
      await _expectFailure(
        errorMsg: 'error_network',
        expected: ChatVoiceTranscriptionFailureReason.serviceError,
      );
    });

    test('error_client → serviceError', () async {
      await _expectFailure(
        errorMsg: 'error_client',
        expected: ChatVoiceTranscriptionFailureReason.serviceError,
      );
    });

    test('unknown error string → serviceError (fail-safe)', () async {
      await _expectFailure(
        errorMsg: 'error_unknown (42)',
        expected: ChatVoiceTranscriptionFailureReason.serviceError,
      );
    });
  });
}

Future<void> _expectFailure({
  required String errorMsg,
  required String expected,
}) async {
  final fake = _FakeSpeechToText();
  final controller = VoiceInputController(recognizer: fake);
  await controller.initialize();
  await controller.start();
  // Kick off stop() first so the internal completer exists, THEN emit the
  // permanent error — that path completes the completer and stop() throws
  // immediately (mirrors what happens in production when the recogniser
  // reports an error while the user is holding stop). Emitting error
  // BEFORE stop() would work too but stop() would then only unblock on
  // the 3s bounded-wait timeout, tripling test wall-clock.
  final stopFuture = controller.stop();
  fake.emitError(errorMsg, permanent: true);
  await expectLater(
    stopFuture,
    throwsA(
      isA<VoiceTranscribeException>()
          .having((e) => e.failureReason, 'failureReason', expected)
          .having((e) => e.durationMs, 'durationMs', greaterThanOrEqualTo(0)),
    ),
  );
}

/// Deterministic in-memory fake for [SpeechToText]. Subclasses the SDK's
/// public `withMethodChannel` constructor and overrides every method the
/// controller calls, so no platform channel traffic is generated.
class _FakeSpeechToText extends SpeechToText {
  _FakeSpeechToText() : super.withMethodChannel();

  int initializeCalls = 0;
  int stopCalls = 0;
  int cancelCalls = 0;
  bool initReturns = true;

  SpeechErrorListener? _onError;
  SpeechResultListener? _onResult;

  @override
  Future<bool> initialize({
    SpeechErrorListener? onError,
    SpeechStatusListener? onStatus,
    debugLogging = false,
    Duration finalTimeout = SpeechToText.defaultFinalTimeout,
    List<SpeechConfigOption>? options,
  }) async {
    initializeCalls++;
    if (initReturns) {
      _onError = onError;
      return true;
    }
    return false;
  }

  @override
  Future<dynamic> listen({
    SpeechResultListener? onResult,
    // ignore: deprecated_member_use, unused_element
    Duration? listenFor,
    // ignore: deprecated_member_use, unused_element
    Duration? pauseFor,
    // ignore: deprecated_member_use, unused_element
    String? localeId,
    SpeechSoundLevelChange? onSoundLevelChange,
    // ignore: deprecated_member_use, unused_element
    cancelOnError = false,
    // ignore: deprecated_member_use, unused_element
    partialResults = true,
    // ignore: deprecated_member_use, unused_element
    onDevice = false,
    // ignore: deprecated_member_use, unused_element
    ListenMode listenMode = ListenMode.confirmation,
    // ignore: deprecated_member_use, unused_element
    sampleRate = 0,
    SpeechListenOptions? listenOptions,
  }) async {
    _onResult = onResult;
    return Future<void>.value();
  }

  @override
  Future<void> stop() async {
    stopCalls++;
  }

  @override
  Future<void> cancel() async {
    cancelCalls++;
  }

  void emitPartial(String text) {
    _onResult?.call(
      SpeechRecognitionResult(<SpeechRecognitionWords>[
        SpeechRecognitionWords(text, const <String>[], -1),
      ], ResultType.partial.value),
    );
  }

  void emitFinal(String text, {double? confidence}) {
    _onResult?.call(
      SpeechRecognitionResult(<SpeechRecognitionWords>[
        SpeechRecognitionWords(text, const <String>[], confidence ?? -1),
      ], ResultType.finalResult.value),
    );
  }

  void emitError(String errorMsg, {required bool permanent}) {
    _onError?.call(SpeechRecognitionError(errorMsg, permanent));
  }
}
