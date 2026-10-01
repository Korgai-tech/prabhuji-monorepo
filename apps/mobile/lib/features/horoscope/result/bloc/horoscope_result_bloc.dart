// Function-typed ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/horoscope_models.dart';
import '../../data/horoscope_repository.dart';
import '../../data/tts_port.dart';
import '../../horoscope_analytics.dart';
import 'horoscope_result_event.dart';
import 'horoscope_result_state.dart';

/// Drives the Pro-gated result flow (TAM-74 §6.3–6.7).
///
/// ## Steps are DATA
/// The 8 sections in Figma are examples. This bloc iterates whatever ordered,
/// enabled steps the API returns — add/remove/rename/reorder a step server-side
/// and it appears with no app change (PRD §6.5/§10). Nothing here knows a step
/// id, a count, or a title.
///
/// ## Narration never blocks text
/// TTS runs behind [TtsPort]. Any failure — no voice for the served locale, an
/// engine error, a dead channel — degrades to text-only. The step is already on
/// screen before we ever try to speak.
///
/// ## Mute is session-scoped (q3)
/// Never persisted; a fresh result session starts unmuted.
///
/// ## Analytics scope
/// This bloc owns Sheet 1 rows 104–112 (see `horoscope_analytics.dart` for the
/// full wiring notes). Load latency uses a `Stopwatch` around
/// `fetchDaily`, session totals accumulate across the whole result flow, and
/// `horoscope_completed` fires exactly once — whichever comes first between
/// `HoroscopeFinishTapped` and a TTS auto-advance landing on the final step.
class HoroscopeResultBloc
    extends Bloc<HoroscopeResultEvent, HoroscopeResultState> {
  HoroscopeResultBloc({
    required HoroscopeRepository repository,
    required TtsPort tts,
    required String zodiacId,
    required String locale,
    Analytics? analytics,
  })  : _repository = repository,
        _tts = tts,
        _locale = locale,
        _analytics = analytics,
        super(HoroscopeResultState(zodiacId: zodiacId)) {
    on<HoroscopeResultRequested>(_onRequested);
    on<HoroscopeResultRetried>(_onRetried);
    on<HoroscopeNextTapped>(_onNext);
    on<HoroscopeFinishTapped>(_onFinish);
    on<HoroscopeBackTapped>(_onBack);
    on<HoroscopeTtsCompleted>(_onTtsCompleted);
    on<HoroscopeMuteToggled>(_onMuteToggled);
    on<HoroscopeAppBackgrounded>(_onBackgrounded);
    on<HoroscopeVideoFailed>(_onVideoFailed);

    // The port only reports utterances that finished on their OWN — a stop()
    // never lands here, so cutting speech short can't trigger an auto-advance.
    _completionSub = _tts.completions.listen((_) {
      if (!isClosed) add(const HoroscopeTtsCompleted());
    });
  }

  final HoroscopeRepository _repository;
  final TtsPort _tts;
  final String _locale;
  final Analytics? _analytics;
  StreamSubscription<void>? _completionSub;

  /// Wall-clock stopwatch started at the FIRST load attempt; the
  /// `total_time_seconds` on `horoscope_completed` reads its elapsed value.
  final Stopwatch _sessionWatch = Stopwatch();

  /// Retry count for `horoscope_result_failed.retry_count` — 0 on the first
  /// attempt, incremented on every `HoroscopeResultRetried`.
  int _retryCount = 0;

  /// Whether ANY TTS utterance was started during this session. Read by
  /// `horoscope_completed.tts_used`.
  bool _ttsUsed = false;

  /// One-shot latch so `horoscope_completed` fires exactly once per session
  /// even if Finish and a final-step auto-advance both try to emit it.
  bool _completedFired = false;

  @override
  Future<void> close() {
    _completionSub?.cancel();
    // Leaving the flow ALWAYS silences narration.
    unawaited(_tts.stop());
    return super.close();
  }

  Future<void> _onRequested(
    HoroscopeResultRequested event,
    Emitter<HoroscopeResultState> emit,
  ) =>
      _load(emit);

  Future<void> _onRetried(
    HoroscopeResultRetried event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    _retryCount += 1;
    await _load(emit);
  }

  Future<void> _load(Emitter<HoroscopeResultState> emit) async {
    if (!_sessionWatch.isRunning) _sessionWatch.start();
    emit(state.copyWith(
      status: HoroscopeResultStatus.loading,
      index: 0,
      finished: false,
      clearError: true,
    ));

    // Sheet 1 row 104 — `load_time_ms` measures the /horoscope/daily fetch
    // duration only (video init is separate; a fallback swap re-stamps
    // `video_fallback_used` on subsequent step events).
    final loadWatch = Stopwatch()..start();
    try {
      final result = await _repository.fetchDaily(
        zodiacId: state.zodiacId,
        locale: _locale,
      );
      loadWatch.stop();

      // An enabled-but-empty list would leave nothing to read. The server
      // guards this with a 409, but a defensive check keeps the UI honest.
      if (result.steps.isEmpty) {
        _trackResultFailed(
          HoroscopeFailureStage.load,
          HoroscopeErrorKind.emptyConfig,
        );
        emit(state.copyWith(
          status: HoroscopeResultStatus.emptyConfig,
          errorMessage: "Today's horoscope isn't ready yet. Please try again.",
        ));
        return;
      }

      // Ask the engine BEFORE narrating: an unsupported locale is a text-only
      // session, not an error (PRD §6.6/§7).
      final available = await _tts.isLanguageAvailable(result.localeServed);

      emit(state.copyWith(
        status: HoroscopeResultStatus.ready,
        result: result,
        index: 0,
        ttsUnavailable: !available,
      ));

      // Sheet 1 row 104 — `today_horoscope_page_viewed`. Fires AFTER the
      // ready emit so the screen has already transitioned.
      unawaited(_analytics?.trackEvent(
        HoroscopeEvents.todayHoroscopePageViewed,
        properties: {
          HoroscopeProps.zodiacSign: result.zodiacId,
          HoroscopeProps.horoscopeDate: result.dateIst,
          HoroscopeProps.stepCount: result.steps.length,
          HoroscopeProps.loadTimeMs: loadWatch.elapsedMilliseconds,
          HoroscopeProps.videoFallbackUsed: state.videoFallback,
        },
      ));

      await _enterStep(emit);
    } catch (error) {
      loadWatch.stop();
      final kind = error is HoroscopeException
          ? error.kind
          : HoroscopeErrorKind.unknown;
      _trackResultFailed(HoroscopeFailureStage.load, kind);
      emit(state.copyWith(
        status: switch (kind) {
          HoroscopeErrorKind.emptyConfig => HoroscopeResultStatus.emptyConfig,
          HoroscopeErrorKind.offline => HoroscopeResultStatus.offline,
          _ => HoroscopeResultStatus.failure,
        },
        errorMessage: switch (kind) {
          HoroscopeErrorKind.emptyConfig =>
            "Today's horoscope isn't ready yet. Please try again.",
          HoroscopeErrorKind.offline =>
            'You seem to be offline. Please check your connection.',
          HoroscopeErrorKind.proRequired =>
            'This reading is for Prabhuji VIP members.',
          _ => 'Could not load your horoscope. Please try again.',
        },
      ));
    }
  }

  /// Fire section_viewed for the current step and narrate it if we should.
  /// Called on load and after every advance — the ONE place narration starts.
  Future<void> _enterStep(Emitter<HoroscopeResultState> emit) async {
    final step = state.currentStep;
    if (step == null) return;

    // Sheet 1 row 105 — `horoscope_section_viewed`.
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.sectionViewed,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.stepId: step.stepId,
        HoroscopeProps.stepName: step.title,
        HoroscopeProps.stepOrder: step.order,
      },
    ));

    if (!state.shouldSpeak) return;

    _ttsUsed = true;
    // Sheet 1 row 109 — `horoscope_tts_started`. `voice_locale` is the
    // SERVED locale — what the engine actually speaks in (q2), not the
    // requested one.
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.ttsStarted,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.stepId: step.stepId,
        HoroscopeProps.voiceLocale: state.localeServed,
      },
    ));
    // Narrate in the locale the server SERVED, not the one we asked for (q2).
    await _tts.speak(step.spokenText, locale: state.localeServed);
  }

  Future<void> _onNext(
    HoroscopeNextTapped event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    if (state.status != HoroscopeResultStatus.ready) return;
    final fromStep = state.currentStep;
    final toStep = state.nextStep;
    // Sheet 1 row 106 — `horoscope_next_clicked`.
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.nextClicked,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.fromStepId: fromStep?.stepId,
        HoroscopeProps.toStepId: toStep?.stepId,
      },
    ));
    // Next while speaking cuts the current utterance (AC). stop() suppresses the
    // completion, so this can't race an auto-advance into a double-skip.
    await _tts.stop();
    await _advance(emit);
  }

  Future<void> _onTtsCompleted(
    HoroscopeTtsCompleted event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    if (state.status != HoroscopeResultStatus.ready) return;
    // Muted sessions don't speak, so a completion here would be stale.
    if (state.muted) return;
    // The final step must NOT auto-advance past itself — the user taps Finish.
    // Sheet 1 row 111 fires `horoscope_completed` here on the "reaches/finishes
    // final step" reading — the user REACHED it and its narration finished, so
    // count it as a completion even if Finish is never tapped.
    if (state.isFinalStep) {
      _emitCompleted();
      return;
    }

    final fromStep = state.currentStep;
    final toStep = state.nextStep;
    // Sheet 1 row 110 — `horoscope_auto_advanced`.
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.autoAdvanced,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.fromStepId: fromStep?.stepId,
        HoroscopeProps.toStepId: toStep?.stepId,
      },
    ));
    await _advance(emit);
  }

  /// Move to the next step and narrate it. Stops at the last step — Finish is an
  /// explicit user action.
  Future<void> _advance(Emitter<HoroscopeResultState> emit) async {
    if (state.isFinalStep) return;
    emit(state.copyWith(index: state.index + 1));
    await _enterStep(emit);
  }

  Future<void> _onFinish(
    HoroscopeFinishTapped event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    _emitCompleted();
    await _tts.stop();
    emit(state.copyWith(finished: true));
  }

  Future<void> _onBack(
    HoroscopeBackTapped event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    // Sheet 1 row 107 — `horoscope_back_clicked`. Back leaves the flow, so
    // `to_step_id` is null (the screen pops out of the horoscope stack).
    final fromStep = state.currentStep;
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.backClicked,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.fromStepId: fromStep?.stepId,
        HoroscopeProps.toStepId: null,
      },
    ));
  }

  Future<void> _onMuteToggled(
    HoroscopeMuteToggled event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    final nowMuted = !state.muted;
    emit(state.copyWith(muted: nowMuted));
    // Sheet 1 row 108 — `horoscope_audio_clicked`. Fixed `action` value
    // covers both mute AND unmute (a single event with a bucket, per the
    // sheet's "Fixed value: mute_or_unmute" note).
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.audioClicked,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.stepId: state.currentStep?.stepId,
        HoroscopeProps.action: HoroscopeAudioAction.muteOrUnmute,
      },
    ));

    if (nowMuted) {
      // Silence immediately; the user drives with Next from here (PRD §6.7).
      await _tts.stop();
      return;
    }
    // Unmute resumes narration from the CURRENT step — it never jumps ahead.
    await _enterStep(emit);
  }

  Future<void> _onBackgrounded(
    HoroscopeAppBackgrounded event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    // Never let narration continue once the user has left the flow (AC).
    await _tts.stop();
  }

  Future<void> _onVideoFailed(
    HoroscopeVideoFailed event,
    Emitter<HoroscopeResultState> emit,
  ) async {
    if (state.videoFallback) return; // once per session
    emit(state.copyWith(videoFallback: true));
    // Sheet 1 row 112 — `horoscope_result_failed` with `failure_stage=render`
    // covers the video-init failure. `retry_count` is 0 because the video
    // has no in-session retry (the fallback swap is one-shot).
    _trackResultFailed(HoroscopeFailureStage.render, HoroscopeErrorKind.unknown);
  }

  void _trackResultFailed(String failureStage, HoroscopeErrorKind kind) {
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.resultFailed,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.failureStage: failureStage,
        HoroscopeProps.errorCode: kind.name,
        HoroscopeProps.retryCount: _retryCount,
      },
    ));
  }

  void _emitCompleted() {
    if (_completedFired) return;
    _completedFired = true;
    _sessionWatch.stop();
    // Sheet 1 row 111 — `horoscope_completed`. `steps_completed` counts the
    // steps the user REACHED (index+1 → 1-based), which mirrors the funnel's
    // "how deep did they get" question.
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.completed,
      properties: {
        HoroscopeProps.zodiacSign: state.zodiacId,
        HoroscopeProps.stepsCompleted: state.index + 1,
        HoroscopeProps.totalTimeSeconds: _sessionWatch.elapsed.inSeconds,
        HoroscopeProps.ttsUsed: _ttsUsed,
      },
    ));
  }
}
