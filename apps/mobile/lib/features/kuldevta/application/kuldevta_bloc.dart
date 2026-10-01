// Named ctor params kept explicit — matches the convention on other blocs.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/analytics.dart';
import '../data/kuldevta_counters.dart';
import '../data/kuldevta_repository.dart';
import '../domain/kuldevta_answers.dart';
import '../kuldevta_analytics.dart';
import 'kuldevta_event.dart';
import 'kuldevta_state.dart';

/// State-holder for the kuldevta discovery flow (TAM-166).
///
/// Owns:
///
///  * The six-step wizard cursor (0..5) + the accumulating
///    [KuldevtaAnswers].
///  * The `POST /kuldevta/identify` call and its cancellation (loading
///    screen's back arrow) and retry (error screen's Retry affordance).
///  * The transient result payload — kept in-memory only, never persisted
///    (spec §Scope › OUT of scope on `SharedPreferences`).
///
/// The bloc emits state transitions ONLY; screen navigation
/// (`router.push` / `pop`) is dispatched by the screens that consume the
/// state. Analytics fires from this seam so every transition has exactly
/// one event fire, regardless of which screen initiated it.
class KuldevtaBloc extends Bloc<KuldevtaEvent, KuldevtaState> {
  KuldevtaBloc({
    required KuldevtaRepository repository,
    required KuldevtaCounters counters,
    required bool Function() isPro,
    Analytics? analytics,
    Future<void> Function()? refetchMe,
    Duration typingDelay = const Duration(milliseconds: 900),
  }) : _repository = repository,
       _counters = counters,
       _isPro = isPro,
       _analytics = analytics,
       _refetchMe = refetchMe ?? _noopRefetch,
       _typingDelay = typingDelay,
       super(const KuldevtaEntry()) {
    on<KuldevtaFlowMounted>(_onFlowMounted);
    on<KuldevtaStarted>(_onStarted);
    on<KuldevtaAnswerSubmitted>(_onAnswerSubmitted);
    on<KuldevtaPataNahiTapped>(_onPataNahiTapped);
    on<KuldevtaBackTapped>(_onBackTapped);
    on<KuldevtaLoadingCancelled>(_onLoadingCancelled);
    on<KuldevtaRetryTapped>(_onRetryTapped);
    on<KuldevtaShareTapped>(_onShareTapped);
    on<KuldevtaChatTapped>(_onChatTapped);
  }

  final KuldevtaRepository _repository;
  final KuldevtaCounters _counters;
  final bool Function() _isPro;
  final Analytics? _analytics;

  /// Fire-and-forget `/users/me` refetch used by [KuldevtaChatTapped] so
  /// `chatConfig.kuldevtaAssigned` flips to `true` for the next Chat-tab
  /// tap (locked decision #16: result screen is one-time only). The
  /// router wires this to `() async => ref.refresh(meProvider.future)`;
  /// test harnesses inject their own closure.
  final Future<void> Function() _refetchMe;

  static Future<void> _noopRefetch() async {}

  /// How long the typing bubble sits between an answer and the next question.
  ///
  /// Injectable so widget tests can collapse it to [Duration.zero]: a real
  /// delay would force every test that walks the six questions to pump ~5s of
  /// fake clock, and `pumpAndSettle` would time out on the animating dots.
  final Duration _typingDelay;

  /// Owned by the loading state — cancelled if the user taps back on the
  /// spinner. Recreated on retry.
  CancelToken? _identifyCancelToken;

  /// Wall-clock at which the current identify request fired. Used to
  /// compute `time_to_assign_ms` on `assignment_completed` /
  /// `assignment_failed` / `identify_cancelled`.
  DateTime? _identifyStartedAt;

  /// Wall-clock at which the currently-visible question was emitted.
  /// Reset on every step transition (forward, backward, or the
  /// pata-nahi advance) so `time_on_question_ms` reflects only the time
  /// spent on THIS pass through THIS question — restarting Q3 after a
  /// back-nav restarts the timer.
  DateTime? _questionMountedAt;

  /// Client-side retry counter, incremented on every `KuldevtaRetryTapped`
  /// event. Rides on `assignment_failed` so the warehouse can see
  /// whether users are stuck in a retry loop.
  int _retryCount = 0;

  Future<void> _onFlowMounted(
    KuldevtaFlowMounted event,
    Emitter<KuldevtaState> emit,
  ) async {
    final openCount = _counters.incrementOpenCount();
    unawaited(
      _analytics?.trackEvent(
        KuldevtaEvents.introViewed,
        properties: <String, Object?>{
          KuldevtaEventProps.openCount: openCount,
          KuldevtaEventProps.userSubscriptionStatus:
              KuldevtaUserSubscriptionStatus.fromIsPro(_isPro()),
        },
      ),
    );
  }

  Future<void> _onStarted(
    KuldevtaStarted event,
    Emitter<KuldevtaState> emit,
  ) async {
    unawaited(
      _analytics?.trackEvent(
        KuldevtaEvents.khojStarted,
        properties: <String, Object?>{
          // Read WITHOUT incrementing — khoj-started shares the intro's
          // denominator so the funnel can compute "intent vs curiosity".
          KuldevtaEventProps.openCount: _counters.openCount(),
        },
      ),
    );
    // Reset the retry counter for this fresh flow — a completed flow's
    // retry_count MUST NOT carry across to the next attempt.
    _retryCount = 0;
    _stampQuestionMounted();
    emit(KuldevtaAnsweringQuestion(stepIndex: 0, answers: state.answers));
  }

  Future<void> _onAnswerSubmitted(
    KuldevtaAnswerSubmitted event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaAnsweringQuestion) return;
    final trimmed = event.text.trim();
    if (trimmed.isEmpty) {
      // Guard: the CTA is disabled while trimmed input is empty, so this
      // is a defensive no-op the widget should never trigger. Silently
      // drop so a stray widget-level bug doesn't send `""` through the
      // "answered" path (analytics would misreport).
      return;
    }
    await _recordAnswer(
      emit,
      current: current,
      answer: trimmed,
      method: event.byVoice
          ? KuldevtaAnswerMethod.voice
          : KuldevtaAnswerMethod.typed,
    );
  }

  Future<void> _onPataNahiTapped(
    KuldevtaPataNahiTapped event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaAnsweringQuestion) return;
    await _recordAnswer(
      emit,
      current: current,
      answer: '',
      method: KuldevtaAnswerMethod.pataNahi,
    );
  }

  Future<void> _recordAnswer(
    Emitter<KuldevtaState> emit, {
    required KuldevtaAnsweringQuestion current,
    required String answer,
    required String method,
  }) async {
    final stepIndex = current.stepIndex;
    final field = KuldevtaAnswers.fields[stepIndex];
    final nextAnswers = current.answers.copyWithField(stepIndex, answer);

    unawaited(
      _analytics?.trackEvent(
        KuldevtaEvents.questionAnswered,
        properties: <String, Object?>{
          KuldevtaEventProps.questionNumber: stepIndex + 1,
          KuldevtaEventProps.questionKey: KuldevtaFieldKeys.prdKey(field),
          // Raw text is deliberate — the alias table learns from these
          // strings (product signed off, 2026-09-03). Pata-nahi sends the
          // empty string, not `null`, matching the server contract.
          KuldevtaEventProps.answerText: method == KuldevtaAnswerMethod.pataNahi
              ? ''
              : answer,
          KuldevtaEventProps.answerMethod: method,
          KuldevtaEventProps.timeOnQuestionMs: _timeOnQuestionMs(),
        },
      ),
    );

    if (stepIndex < 5) {
      // A beat of "typing" before the next question, so the thread reads as a
      // conversation rather than a form advancing. Emitted as a state so the
      // transcript owns the rendering and the delay is testable.
      emit(
        KuldevtaAnsweringQuestion(
          stepIndex: stepIndex + 1,
          answers: nextAnswers,
          botTyping: true,
        ),
      );
      await Future<void>.delayed(_typingDelay);
      // The bloc can be closed mid-delay (the user backs out of the khoj), and
      // emitting after that throws.
      if (emit.isDone) return;
      // Stamped AFTER the pause: `time_on_question_ms` measures how long the
      // user took to answer, and the typing beat is our latency, not theirs.
      _stampQuestionMounted();
      emit(
        KuldevtaAnsweringQuestion(
          stepIndex: stepIndex + 1,
          answers: nextAnswers,
        ),
      );
      return;
    }
    // Step 6 tap — fire identify. The `IdentifyRequested` state is
    // [KuldevtaIdentifying]; the screen mounts the loading interstitial
    // on that transition.
    await _fireIdentify(emit, nextAnswers);
  }

  Future<void> _fireIdentify(
    Emitter<KuldevtaState> emit,
    KuldevtaAnswers answers,
  ) async {
    emit(KuldevtaIdentifying(answers: answers));
    _identifyCancelToken = CancelToken();
    _identifyStartedAt = DateTime.now();

    try {
      final result = await _repository.identify(
        answers,
        cancelToken: _identifyCancelToken,
      );
      final timeToAssignMs = _latencyMs();
      _identifyCancelToken = null;
      _identifyStartedAt = null;
      unawaited(
        _analytics?.trackEvent(
          KuldevtaEvents.assignmentCompleted,
          properties: <String, Object?>{
            KuldevtaEventProps.deityId: result.slug,
            KuldevtaEventProps.deityName: result.nameRoman,
            KuldevtaEventProps.assignmentTier: result.tier,
            KuldevtaEventProps.isFallback: result.tier == 'fallback',
            // Join with '+' so the warehouse can read the composite tier
            // ladder at a glance — matches the sibling PRD's convention
            // (e.g. "community+region").
            KuldevtaEventProps.matchedOn: result.matchedOn.join('+'),
            KuldevtaEventProps.questionsAnswered: answers.answeredCount,
            KuldevtaEventProps.timeToAssignMs: timeToAssignMs,
          },
        ),
      );
      // THE ASSIGNMENT IS A SERVER FACT THE MOMENT `identify` RETURNS, so this
      // is where the client has to learn it — not at the "Mata Se Baat Karein"
      // tap.
      //
      // That tap runs inside the paywall gate's `pending` action, which a
      // NON-PRO user never reaches: they get the paywall instead. So a free
      // user who completed the khoj and dismissed the paywall kept a stale
      // `chatConfig.kuldevtaAssigned == false` for the rest of the session —
      // the chat stayed in khoj mode, the header never showed the deity name,
      // and re-entering replayed the khoj thread they had already finished.
      // Entitlement gates whether they can TALK to their kuldevta; it cannot
      // gate whether they have one.
      unawaited(_refetchMe());
      emit(KuldevtaResultReady(answers: answers, kuldevta: result));
    } on DioException catch (e) {
      final timeToAssignMs = _latencyMs();
      _identifyCancelToken = null;
      _identifyStartedAt = null;
      if (CancelToken.isCancel(e)) {
        unawaited(
          _analytics?.trackEvent(
            KuldevtaEvents.identifyCancelled,
            properties: <String, Object?>{
              KuldevtaEventProps.latencyMs: timeToAssignMs,
            },
          ),
        );
        _stampQuestionMounted();
        emit(KuldevtaAnsweringQuestion(stepIndex: 5, answers: answers));
        return;
      }
      final status = e.response?.statusCode;
      final code = _extractErrorCode(e.response?.data);
      final errorKind = _errorKindForStatus(status);
      unawaited(
        _analytics?.trackEvent(
          KuldevtaEvents.assignmentFailed,
          properties: <String, Object?>{
            KuldevtaEventProps.failureStage:
                KuldevtaFailureStage.fromHttpStatus(status),
            KuldevtaEventProps.errorCode: code,
            KuldevtaEventProps.retryCount: _retryCount,
          },
        ),
      );
      emit(
        KuldevtaFailed(
          answers: answers,
          errorKind: errorKind,
          httpStatus: status,
          errorCode: code,
        ),
      );
    } catch (_) {
      _identifyCancelToken = null;
      _identifyStartedAt = null;
      unawaited(
        _analytics?.trackEvent(
          KuldevtaEvents.assignmentFailed,
          properties: <String, Object?>{
            // Non-Dio catch: response either arrived and we couldn't
            // decode it, or a client-side model constructor threw.
            // `parse` is the honest bucket — `retrieve` (the old value)
            // would imply a network failure, which this branch is not.
            KuldevtaEventProps.failureStage: KuldevtaFailureStage.parse,
            KuldevtaEventProps.errorCode: null,
            KuldevtaEventProps.retryCount: _retryCount,
          },
        ),
      );
      emit(KuldevtaFailed(answers: answers, errorKind: 'network'));
    }
  }

  Future<void> _onBackTapped(
    KuldevtaBackTapped event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaAnsweringQuestion) return;
    if (current.stepIndex == 0) {
      emit(KuldevtaEntry(answers: current.answers));
      return;
    }
    _stampQuestionMounted();
    emit(
      KuldevtaAnsweringQuestion(
        stepIndex: current.stepIndex - 1,
        answers: current.answers,
      ),
    );
  }

  Future<void> _onLoadingCancelled(
    KuldevtaLoadingCancelled event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaIdentifying) return;
    // Cancel the inflight dio call; the try/catch above catches the
    // CancelToken cancellation and drives the emit back to step 6. If
    // the request already resolved this is a no-op.
    _identifyCancelToken?.cancel();
  }

  Future<void> _onRetryTapped(
    KuldevtaRetryTapped event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaFailed) return;
    _retryCount += 1;
    await _fireIdentify(emit, current.answers);
  }

  Future<void> _onShareTapped(
    KuldevtaShareTapped event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaResultReady) return;
    final deityId = current.kuldevta.slug;
    // recordShare returns TRUE the first time we see this deity — invert
    // for `is_repeat_share` (true iff we've already seen it).
    final isFirstShare = _counters.recordShare(deityId);
    unawaited(
      _analytics?.trackEvent(
        KuldevtaEvents.resultShared,
        properties: <String, Object?>{
          KuldevtaEventProps.deityId: deityId,
          // TAM-167: `channel` stays `os_share_sheet` — that IS the sheet
          // the user is looking at today (no custom pre-share picker yet).
          // The receiving app the OS reported back rides on
          // `destination_app` alongside, so slice-by-destination works
          // without waiting on a custom sheet redesign.
          KuldevtaEventProps.channel: KuldevtaShareChannel.osShareSheet,
          KuldevtaEventProps.destinationApp: event.destinationApp,
          KuldevtaEventProps.isRepeatShare: !isFirstShare,
        },
      ),
    );
  }

  Future<void> _onChatTapped(
    KuldevtaChatTapped event,
    Emitter<KuldevtaState> emit,
  ) async {
    final current = state;
    if (current is! KuldevtaResultReady) return;
    unawaited(
      _analytics?.trackEvent(
        KuldevtaEvents.resultChatTapped,
        properties: <String, Object?>{
          KuldevtaEventProps.deityId: current.kuldevta.slug,
          KuldevtaEventProps.gender: current.kuldevta.gender.name,
        },
      ),
    );
    // Kept as a BACKSTOP only. The authoritative refetch now happens at
    // assignment success (see `_identify`), because that is when the server
    // fact exists and it must not depend on a paywalled tap. This one still
    // covers the case where that first refetch lost a race with a cold network.
    // `ref.invalidate` is idempotent, so firing twice costs one wasted GET.
    unawaited(_refetchMe());
  }

  int? _latencyMs() {
    final started = _identifyStartedAt;
    if (started == null) return null;
    return DateTime.now().difference(started).inMilliseconds;
  }

  void _stampQuestionMounted() {
    _questionMountedAt = DateTime.now();
  }

  int? _timeOnQuestionMs() {
    final mounted = _questionMountedAt;
    if (mounted == null) return null;
    return DateTime.now().difference(mounted).inMilliseconds;
  }

  static String _errorKindForStatus(int? status) {
    if (status == null) return 'network';
    if (status >= 500 && status <= 599) return 'server_5xx';
    if (status == 400) return 'validation';
    if (status == 401) return 'auth';
    return 'unknown';
  }

  static String? _extractErrorCode(Object? body) {
    if (body is Map) {
      final code = body['errorCode'];
      return code is String ? code : null;
    }
    return null;
  }
}
