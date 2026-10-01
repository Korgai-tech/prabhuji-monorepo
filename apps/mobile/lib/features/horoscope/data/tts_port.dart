import 'dart:async';

import 'package:flutter_tts/flutter_tts.dart';

/// The system-TTS seam for horoscope narration (TAM-74).
///
/// Mirrors the TAM-59 `AudioEngine` / TAM-70 `WallpaperVideoPort` pattern:
/// interface + a real `flutter_tts` impl + a fake (test support), so the result
/// bloc's whole narration state machine (auto-start → complete → auto-advance,
/// mute, stop-on-exit, unsupported-language skip) is unit-testable with NO
/// device, NO platform channel and NO audio.
///
/// ## Not runtime-verifiable in this environment
/// There is no Android device/emulator attached here, so [FlutterTtsPort] — the
/// only part that touches the platform channel — is exercised by the fake in
/// tests and has NOT been heard out loud. What IS verified: every branch of the
/// bloc that consumes this port. Speaking on a real device (voice present,
/// voice ABSENT, mid-speech interruption, backgrounding) remains a manual-QA
/// item — see the spec's Manual Testing checklist.
///
/// ## The one rule
/// Narration is best-effort; text is not. Every method here is allowed to fail
/// silently — a TTS failure must NEVER prevent a step from rendering (PRD
/// §6.6/§7). Callers treat [isLanguageAvailable] == false as "show text, skip
/// narration, log it" — never as an error state.
abstract interface class TtsPort {
  /// Whether the engine has a voice for [locale] (e.g. `hi`, `en`).
  /// `false` → the caller renders text and skips narration.
  Future<bool> isLanguageAvailable(String locale);

  /// Narrate [text] in [locale]. Completes when speech STARTS (not ends);
  /// completion is delivered via [completions].
  Future<void> speak(String text, {required String locale});

  /// Stop any in-flight speech immediately (Next / Back / Finish / background).
  Future<void> stop();

  /// Fires once each time an utterance finishes on its own. Never fires for an
  /// utterance cut short by [stop] — otherwise a stop would trigger the
  /// auto-advance it is meant to prevent.
  Stream<void> get completions;

  Future<void> dispose();
}

/// Real `flutter_tts` implementation.
class FlutterTtsPort implements TtsPort {
  FlutterTtsPort({FlutterTts? tts}) : _tts = tts ?? FlutterTts() {
    _tts
      ..setCompletionHandler(() {
        // A handler can still fire after a stop() on some engines; suppress it
        // so a cancelled utterance never auto-advances the flow.
        if (_stopping) {
          _stopping = false;
          return;
        }
        if (!_completions.isClosed) _completions.add(null);
      })
      ..setCancelHandler(() => _stopping = false)
      // An engine-level error must not strand the flow: surface it as a
      // completion so an unmuted session still advances rather than hanging on
      // a step forever.
      ..setErrorHandler((dynamic _) {
        if (_stopping) {
          _stopping = false;
          return;
        }
        if (!_completions.isClosed) _completions.add(null);
      });
  }

  final FlutterTts _tts;
  final StreamController<void> _completions = StreamController<void>.broadcast();
  bool _stopping = false;

  @override
  Stream<void> get completions => _completions.stream;

  @override
  Future<bool> isLanguageAvailable(String locale) async {
    try {
      final result = await _tts.isLanguageAvailable(_bcp47(locale));
      return result == true;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> speak(String text, {required String locale}) async {
    if (text.trim().isEmpty) return;
    try {
      await _tts.setLanguage(_bcp47(locale));
      await _tts.setSpeechRate(_speechRate);
      await _tts.awaitSpeakCompletion(false);
      await _tts.speak(text);
    } catch (_) {
      // Swallow: the step's text is already on screen.
    }
  }

  @override
  Future<void> stop() async {
    _stopping = true;
    try {
      await _tts.stop();
    } catch (_) {
      _stopping = false;
    }
  }

  @override
  Future<void> dispose() async {
    await stop();
    await _completions.close();
  }

  /// A calm devotional pace for older users (PRD §6.7). Android's default 1.0 is
  /// noticeably fast for Devanagari; 0.5 is the platform's "normal" speech.
  static const double _speechRate = 0.5;

  /// The contract serves bare ISO codes (`hi`, `en`); the engines want BCP-47.
  /// Anything already regioned (`hi-IN`) passes through.
  static String _bcp47(String locale) {
    if (locale.contains('-') || locale.contains('_')) {
      return locale.replaceAll('_', '-');
    }
    switch (locale) {
      case 'hi':
        return 'hi-IN';
      case 'en':
        return 'en-IN';
      default:
        return locale;
    }
  }
}
