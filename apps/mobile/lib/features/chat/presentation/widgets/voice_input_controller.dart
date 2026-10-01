import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../chat_analytics.dart';

/// Thin wrapper around the `speech_to_text` SDK that gives the chat
/// composer (TAM-166 §18.3) a testable seam for device-native speech
/// recognition — Apple's `SFSpeechRecognizer` on iOS, Google's on-device
/// recognizer on Android. Locale is locked to `hi-IN`.
///
/// The controller owns three responsibilities:
///
///   1. One-shot [initialize] against the underlying SDK (idempotent — the
///      SDK's own `initialize` short-circuits on repeat calls, we do the
///      same at this layer so callers don't need to guard).
///   2. A single [start] → [stop]-or-[cancel] listen cycle at a time. The
///      controller exposes the partial transcript stream while [start] is
///      inflight so the composer can render a live preview.
///   3. Deterministic mapping of SDK-level errors to the closed
///      §18.3 `ChatVoiceTranscriptionFailureReason` vocabulary. The
///      controller never fires analytics itself — the composer owns those
///      calls because it has the Riverpod ref.
///
/// **Test seam.** The single-arg constructor takes an optional
/// [SpeechToText] so unit tests can inject a fake recognizer without
/// touching the platform method channel. The composer widget wraps this
/// controller behind its own factory param so widget tests can inject a
/// controller subclass and never construct a real recognizer.
class VoiceInputController {
  VoiceInputController({SpeechToText? recognizer})
    : _recognizer = recognizer ?? SpeechToText();

  final SpeechToText _recognizer;
  final StreamController<String> _partialController =
      StreamController<String>.broadcast();

  bool _initialized = false;
  bool _listening = false;
  String _lastTranscript = '';
  double? _lastConfidence;
  DateTime? _startedAt;
  String? _pendingFailureReason;
  Completer<void>? _finalResultCompleter;

  /// Broadcast stream of partial transcripts (empty on start, latest
  /// recognised words on each partial callback). The composer subscribes
  /// while recording so the field pill can render a live preview.
  Stream<String> get partialResults => _partialController.stream;

  /// True while a listen session is active (between successful [start] and
  /// the resolution of [stop] / [cancel]). Mirrors the recognizer's own
  /// `isListening` for callers that don't have direct access to it.
  bool get isListening => _listening;

  /// Latest transcript observed on the current or last listen session.
  /// Exposed for widget tests that want to assert what the controller
  /// would have returned without waiting for [stop] to resolve.
  @visibleForTesting
  String get lastTranscript => _lastTranscript;

  /// One-time SDK setup. Safe to call repeatedly — subsequent calls short-
  /// circuit against a cached initialised flag. Returns `false` when the
  /// device / user has declined speech recognition; callers should fall
  /// back to the coming-soon path or surface the permission recovery UI.
  Future<bool> initialize() async {
    if (_initialized) return true;
    _initialized = await _recognizer.initialize(
      onError: _onError,
      onStatus: _onStatus,
    );
    return _initialized;
  }

  /// Begin a listen session. [locale] defaults to `hi-IN` (PRD lock);
  /// [listenFor] caps recording at 60s (matches WhatsApp/iMessage voice
  /// notes); [pauseFor] auto-stops after a 3s silence gap.
  ///
  /// Callers MUST await [initialize] first — this throws
  /// [StateError] if the SDK is not ready.
  Future<void> start({
    String locale = 'hi-IN',
    Duration listenFor = const Duration(seconds: 60),
    Duration pauseFor = const Duration(seconds: 3),
  }) async {
    if (!_initialized) {
      throw StateError(
        'VoiceInputController.start() called before initialize()',
      );
    }
    _lastTranscript = '';
    _lastConfidence = null;
    _pendingFailureReason = null;
    _startedAt = DateTime.now();
    _listening = true;
    await _recognizer.listen(
      onResult: _onResult,
      listenOptions: SpeechListenOptions(
        partialResults: true,
        onDevice: false,
        cancelOnError: true,
        listenMode: ListenMode.dictation,
        pauseFor: pauseFor,
        listenFor: listenFor,
        localeId: locale,
      ),
    );
  }

  /// End the current session and finalise the transcript. Resolves with
  /// the accumulated final transcript, the confidence the platform
  /// reported (nullable — iOS often omits it), and the total elapsed
  /// milliseconds since [start].
  ///
  /// If the SDK reported a permanent error during the session, this
  /// throws a [VoiceTranscribeException] carrying the mapped
  /// `ChatVoiceTranscriptionFailureReason`. The composer catches that and
  /// fires `chat_voice_transcription_failed`.
  Future<VoiceTranscribeOutcome> stop() async {
    final startedAt = _startedAt;
    _listening = false;
    if (!_initialized) {
      // Defensive: nothing to finalise. Return a zero-duration empty
      // outcome so callers don't have to distinguish this from the
      // "user pressed stop before start settled" path.
      return VoiceTranscribeOutcome(
        transcript: '',
        confidence: null,
        durationMs: 0,
      );
    }
    // Wait a short bounded window for the SDK's final callback to arrive
    // after stop() — Android especially can take up to a second past the
    // stop request to deliver the final result via onResult. Longer than
    // this and we take whatever partial we have (safe: it's identical to
    // the last live-preview the user just saw).
    _finalResultCompleter = Completer<void>();
    await _recognizer.stop();
    try {
      await _finalResultCompleter!.future.timeout(const Duration(seconds: 3));
    } on TimeoutException {
      // Fine — fall through with `_lastTranscript` as-is.
    } finally {
      _finalResultCompleter = null;
    }
    final failure = _pendingFailureReason;
    final duration = startedAt == null
        ? 0
        : DateTime.now().difference(startedAt).inMilliseconds;
    if (failure != null) {
      throw VoiceTranscribeException(
        failureReason: failure,
        durationMs: duration,
      );
    }
    return VoiceTranscribeOutcome(
      transcript: _lastTranscript,
      confidence: _lastConfidence,
      durationMs: duration,
    );
  }

  /// Discard the current session with no transcript delivered. Returns
  /// the total elapsed milliseconds so the composer can populate the
  /// `duration_ms` on `chat_voice_cancelled`.
  Future<int> cancel() async {
    final startedAt = _startedAt;
    _listening = false;
    _pendingFailureReason = null;
    _lastTranscript = '';
    _lastConfidence = null;
    _finalResultCompleter = null;
    if (_initialized) {
      await _recognizer.cancel();
    }
    if (startedAt == null) return 0;
    return DateTime.now().difference(startedAt).inMilliseconds;
  }

  /// Release the broadcast stream. Callers own the lifecycle — typically
  /// the composer disposes the controller in its own `dispose()`.
  Future<void> dispose() async {
    await _partialController.close();
  }

  void _onResult(SpeechRecognitionResult result) {
    _lastTranscript = result.recognizedWords;
    // The SDK returns 0 for missing confidence on some platforms and -1
    // on others; normalise both to null so downstream can distinguish
    // "no signal" from a real 0.0.
    final rawConfidence = result.confidence;
    _lastConfidence = (result.hasConfidenceRating && rawConfidence > 0)
        ? rawConfidence
        : null;
    if (!_partialController.isClosed) {
      _partialController.add(_lastTranscript);
    }
    if (result.finalResult) {
      final completer = _finalResultCompleter;
      if (completer != null && !completer.isCompleted) {
        completer.complete();
      }
    }
  }

  void _onError(SpeechRecognitionError error) {
    // Map the SDK's error strings to the closed §18.3 vocabulary. The
    // full list of possible strings is in speech_to_text.dart's dartdoc
    // above `SpeechErrorListener`; we deliberately only distinguish the
    // two families the PRD schema requires (`no_speech_detected` vs
    // `service_error`) — `unsupported_language` and `unintelligible` are
    // NEVER emitted (locale is locked to hi-IN, and the device recogniser
    // does not distinguish "no match" from "unintelligible").
    switch (error.errorMsg) {
      case 'error_no_match':
      case 'error_speech_timeout':
        _pendingFailureReason =
            ChatVoiceTranscriptionFailureReason.noSpeechDetected;
      case 'error_network':
      case 'error_network_timeout':
      case 'error_client':
      case 'error_server':
      case 'error_server_disconnected':
      case 'error_audio_error':
      case 'error_busy':
      default:
        _pendingFailureReason =
            ChatVoiceTranscriptionFailureReason.serviceError;
    }
    // A permanent error terminates the session — if a stop() is currently
    // awaiting the final callback, unblock it so the composer's stop
    // handler runs promptly (it will observe `_pendingFailureReason` and
    // throw the mapped exception).
    if (error.permanent) {
      _listening = false;
      final completer = _finalResultCompleter;
      if (completer != null && !completer.isCompleted) {
        completer.complete();
      }
    }
  }

  void _onStatus(String status) {
    // The SDK's status callback reports transitions between listening /
    // notListening / done. The composer already gates on isListening; no
    // fire-and-forget analytics from this layer (composer owns fires).
    if (status == SpeechToText.doneStatus ||
        status == SpeechToText.notListeningStatus) {
      _listening = false;
    } else if (status == SpeechToText.listeningStatus) {
      _listening = true;
    }
  }
}

/// The successful outcome of a [VoiceInputController.stop] call.
@immutable
class VoiceTranscribeOutcome {
  const VoiceTranscribeOutcome({
    required this.transcript,
    required this.confidence,
    required this.durationMs,
  });

  /// The final recognised words. Empty string when the recogniser heard
  /// nothing usable — callers should treat this as
  /// [ChatVoiceTranscribeResult.empty] rather than dispatching a send.
  final String transcript;

  /// The platform-reported confidence for [transcript], or `null` when
  /// the platform did not attach one (iOS often does not).
  final double? confidence;

  /// Wall-clock milliseconds between [VoiceInputController.start] and
  /// this [VoiceInputController.stop] resolving. Rides on
  /// `chat_voice_recorded.duration_ms` and
  /// `chat_voice_transcribed.audio_duration_ms`.
  final int durationMs;
}

/// Thrown by [VoiceInputController.stop] when the SDK reported a
/// permanent error during the listen session. Carries a value from
/// [ChatVoiceTranscriptionFailureReason] plus the elapsed
/// [durationMs] so the composer can fire
/// `chat_voice_transcription_failed` with the correct properties.
@immutable
class VoiceTranscribeException implements Exception {
  const VoiceTranscribeException({
    required this.failureReason,
    required this.durationMs,
  });

  final String failureReason;
  final int durationMs;

  @override
  String toString() =>
      'VoiceTranscribeException($failureReason, durationMs=$durationMs)';
}
