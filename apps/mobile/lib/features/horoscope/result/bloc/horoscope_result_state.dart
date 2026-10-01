import 'package:equatable/equatable.dart';

import '../../data/horoscope_models.dart';

enum HoroscopeResultStatus {
  /// Fetching. No TTS until content is ready (AC "loading-result (no TTS…)").
  loading,
  ready,

  /// 409 — the mode has zero enabled steps. Friendly error + Retry.
  emptyConfig,

  /// Offline with no cache — retry state.
  offline,

  /// Any other failure (incl. 404/5xx). Keeps zodiac + date context.
  failure,
}

/// State of the Pro-gated result flow (Figma 387:2571).
class HoroscopeResultState extends Equatable {
  const HoroscopeResultState({
    required this.zodiacId,
    this.status = HoroscopeResultStatus.loading,
    this.result,
    this.index = 0,
    this.muted = false,
    this.videoFallback = false,
    this.ttsUnavailable = false,
    this.finished = false,
    this.errorMessage,
  });

  /// The tapped sign — known before the fetch, so the header keeps its context
  /// even in the error state (AC).
  final String zodiacId;
  final HoroscopeResultStatus status;
  final HoroscopeDailyResultData? result;

  /// Index into [steps]. The step list is DATA — never a hardcoded 8.
  final int index;

  /// Session-scoped mute (q3): never persisted; a new session starts unmuted.
  final bool muted;

  /// The video failed → the static fallback is showing.
  final bool videoFallback;

  /// The served locale has no system voice → text-only, narration skipped.
  final bool ttsUnavailable;

  /// Finish was tapped — the screen pops.
  final bool finished;

  final String? errorMessage;

  /// The ordered, backend-configured steps. Empty until loaded.
  List<HoroscopeStep> get steps => result?.steps ?? const [];

  HoroscopeStep? get currentStep =>
      index >= 0 && index < steps.length ? steps[index] : null;

  /// The step the flow would advance to next, or null on the final step.
  /// Used by analytics events that carry `to_step_id` (rows 106, 110).
  HoroscopeStep? get nextStep =>
      index + 1 >= 0 && index + 1 < steps.length ? steps[index + 1] : null;

  bool get isFinalStep => steps.isNotEmpty && index >= steps.length - 1;

  /// True when the CTA should read "Finish" rather than "Next" (Figma 392:2628).
  bool get showFinish => isFinalStep;

  /// Whether narration should run for the current step: not muted, the engine
  /// has the voice, and the server enabled TTS for this step.
  bool get shouldSpeak =>
      !muted && !ttsUnavailable && (currentStep?.ttsEnabled ?? false);

  /// The locale the server actually served — what TTS narrates in (q2).
  String get localeServed => result?.localeServed ?? '';

  String get dateIst => result?.dateIst ?? '';

  HoroscopeResultState copyWith({
    HoroscopeResultStatus? status,
    HoroscopeDailyResultData? result,
    int? index,
    bool? muted,
    bool? videoFallback,
    bool? ttsUnavailable,
    bool? finished,
    String? errorMessage,
    bool clearError = false,
  }) {
    return HoroscopeResultState(
      zodiacId: zodiacId,
      status: status ?? this.status,
      result: result ?? this.result,
      index: index ?? this.index,
      muted: muted ?? this.muted,
      videoFallback: videoFallback ?? this.videoFallback,
      ttsUnavailable: ttsUnavailable ?? this.ttsUnavailable,
      finished: finished ?? this.finished,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }

  @override
  List<Object?> get props => [
        zodiacId,
        status,
        result,
        index,
        muted,
        videoFallback,
        ttsUnavailable,
        finished,
        errorMessage,
      ];
}
