// See the equivalent note on OnboardingOrchestratorBloc — explicit named
// params keep the public API readable at the cost of a lint suppression.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../api/api_client.dart';
import '../../../../core/analytics.dart';
import '../../../../core/auth_store.dart';
import '../../../../core/services/clarity_service.dart';
import '../../bloc/onboarding_orchestrator_bloc.dart';
import '../../bloc/onboarding_orchestrator_event.dart';
import '../../data/auth_repository.dart';
import '../../onboarding_analytics.dart';
import 'otp_event.dart';
import 'otp_state.dart';

/// Per-navigation bloc — instantiated inside the `/otp` route builder because
/// it depends on send-OTP response extras (session id, phone, resend seconds,
/// otp length).
///
/// Owns the countdown via `Stream.periodic(1s)` so a hot-reload or a widget
/// rebuild doesn't drift the timer. On successful verify: JWT persisted +
/// `SessionRefreshed` fired at the orchestrator.
class OtpBloc extends Bloc<OtpEvent, OtpState> {
  OtpBloc({
    required AuthRepository authRepository,
    required AuthStore authStore,
    required OnboardingOrchestratorBloc orchestrator,
    required String otpSessionId,
    required String phoneCountryCode,
    required String phoneNumber,
    required int initialResendSeconds,
    required int otpLength,
    Analytics? analytics,
  })  : _authRepository = authRepository,
        _authStore = authStore,
        _orchestrator = orchestrator,
        _analytics = analytics,
        _otpSessionId = otpSessionId,
        _phoneCountryCode = phoneCountryCode,
        _phoneNumber = phoneNumber,
        _initialResendSeconds = initialResendSeconds,
        _otpLength = otpLength,
        super(OtpIdle(
          otpDigits: '',
          attemptCount: 0,
          resendCount: 0,
          countdownRemainingSeconds: initialResendSeconds,
        )) {
    on<DigitEntered>(_onDigitEntered);
    on<SubmitTapped>(_onSubmitTapped);
    on<ResendTapped>(_onResendTapped);
    on<CountdownTicked>(_onCountdownTicked);
    on<ChangeNumberTapped>(_onChangeNumberTapped);
    _startCountdown();
  }

  final AuthRepository _authRepository;
  final AuthStore _authStore;
  final OnboardingOrchestratorBloc _orchestrator;
  final Analytics? _analytics;
  final String _otpSessionId;
  final String _phoneCountryCode;
  final String _phoneNumber;
  final int _initialResendSeconds;
  final int _otpLength;

  StreamSubscription<int>? _countdownSub;

  /// Reset on every send/resend so the row-14 `resend_otp_clicked` event
  /// can stamp `seconds_since_last_request` from a real elapsed measure —
  /// not the countdown value, which represents the SCHEDULED wait rather
  /// than the actual wait the user experienced.
  final Stopwatch _lastOtpRequestStopwatch = Stopwatch()..start();

  /// One-shot latch for row 11 (`otp_entered`) — fires the first time the
  /// user fills the digit boxes to the expected length.
  bool _otpEnteredFired = false;

  // --- public accessors used by the screen ---------------------------------

  String get phoneCountryCode => _phoneCountryCode;
  String get phoneNumber => _phoneNumber;
  int get otpLength => _otpLength;
  int get initialResendSeconds => _initialResendSeconds;

  // --- countdown ------------------------------------------------------------

  void _startCountdown() {
    _countdownSub?.cancel();
    _countdownSub = Stream<int>.periodic(
      const Duration(seconds: 1),
      (i) => i,
    ).listen((_) {
      if (!isClosed) add(const CountdownTicked());
    });
  }

  void _onCountdownTicked(CountdownTicked event, Emitter<OtpState> emit) {
    final remaining = state.countdownRemainingSeconds;
    if (remaining <= 0) return;
    final next = remaining - 1;
    // Preserve the state variant so a tick during OtpInvalid stays OtpInvalid.
    emit(_copyWithCountdown(state, next));
  }

  // --- digit entry ----------------------------------------------------------

  void _onDigitEntered(DigitEntered event, Emitter<OtpState> emit) {
    // Never emit while a verify is in flight — the widget shouldn't be
    // accepting input, and re-entering OtpIdle mid-flight would cancel the
    // spinner.
    if (state is OtpVerifying || state is OtpResending) return;
    final trimmed = event.digits.length > _otpLength
        ? event.digits.substring(0, _otpLength)
        : event.digits;
    // Any subsequent input clears the invalid banner so the user can retry.
    emit(OtpIdle(
      otpDigits: trimmed,
      attemptCount: state.attemptCount,
      resendCount: state.resendCount,
      countdownRemainingSeconds: state.countdownRemainingSeconds,
    ));

    // Sheet 1 row 11 — `otp_entered`. Fires the first time the box count
    // reaches the expected length. Rearms when the boxes are cleared
    // (invalid submit / resend) so a corrective re-entry emits once.
    if (trimmed.isEmpty) {
      _otpEnteredFired = false;
      return;
    }
    if (_otpEnteredFired) return;
    if (trimmed.length != _otpLength) return;
    _otpEnteredFired = true;
    unawaited(_analytics?.trackEvent(
      OnboardingEvents.otpEntered,
      properties: <String, Object?>{
        OnboardingEventProps.otpDigitCount: trimmed.length,
        OnboardingEventProps.attemptNumber: state.attemptCount + 1,
      },
    ));
  }

  // --- submit ---------------------------------------------------------------

  Future<void> _onSubmitTapped(
    SubmitTapped event,
    Emitter<OtpState> emit,
  ) async {
    final digits = state.otpDigits;
    if (digits.length != _otpLength) return;
    if (state is OtpVerifying) return;
    if (state is OtpRateLimited) return;

    final attemptCount = state.attemptCount + 1;

    // Sheet 1 row 12 — `otp_submitted`. `attempt_number` is the same
    // 1-indexed counter as row 9's `otp_screen_viewed`.
    // NOTE: keep the property key `otp_digit_count_entered` alongside
    // the sheet's canonical `otp_digit_count`; the existing PII-leak
    // guardrail test asserts on the former (test/analytics/
    // no_pii_leak_test.dart), and both convey the exact same value.
    unawaited(_analytics?.trackEvent(
      OnboardingEvents.otpSubmitted,
      properties: <String, Object?>{
        OnboardingEventProps.otpDigitCount: digits.length,
        'otp_digit_count_entered': digits.length,
        OnboardingEventProps.attemptNumber: attemptCount,
      },
    ));

    emit(OtpVerifying(
      otpDigits: digits,
      attemptCount: attemptCount,
      resendCount: state.resendCount,
      countdownRemainingSeconds: state.countdownRemainingSeconds,
    ));

    final stopwatch = Stopwatch()..start();
    try {
      final result = await _authRepository.verifyOtp(
        otpSessionId: _otpSessionId,
        otp: digits,
      );
      stopwatch.stop();
      await _authStore.write(result.token);
      // Nudge the orchestrator to re-resolve so the router hops to the next
      // step — the widget also does a safety-net `context.go('/name-language')`.
      _orchestrator.add(const SessionRefreshed());

      // Sheet 1 row 13 — `otp_verification_result` (success).
      final verificationProps = <String, Object?>{
        OnboardingEventProps.result: OnboardingEventProps.resultSuccess,
        OnboardingEventProps.errorCode: null,
        OnboardingEventProps.attemptNumber: attemptCount,
        OnboardingEventProps.responseTimeMs: stopwatch.elapsedMilliseconds,
      };
      unawaited(_analytics?.trackEvent(
        OnboardingEvents.otpVerificationResult,
        properties: verificationProps,
      ));

      // `registration_successful` — the acquisition signal, fired only for a
      // first-ever verification. Same properties as the funnel event above;
      // the ONE difference is `event_id`, which carries the user id instead
      // of the UUID `trackEvent` would stamp. One registration per user
      // ever, so that id is the natural dedupe key — a retry, a replay or a
      // second sink counting the same signup collapses to one row instead
      // of inflating acquisition. Rides to Meta on the same fan-out.
      if (result.isNewUser) {
        unawaited(_analytics?.trackEvent(
          OnboardingEvents.registrationSuccessful,
          properties: <String, Object?>{
            ...verificationProps,
            OnboardingEventProps.eventId: result.userId,
          },
        ));
      }

      _countdownSub?.cancel();
      emit(OtpVerified(
        otpDigits: digits,
        attemptCount: attemptCount,
        resendCount: state.resendCount,
        countdownRemainingSeconds: state.countdownRemainingSeconds,
        token: result.token,
        isNewUser: result.isNewUser,
      ));
    } catch (error) {
      stopwatch.stop();
      final code = error is ApiException ? error.errorCode : null;

      if (code == 'OTP_SESSION_EXHAUSTED' || code == 'OTP_RATE_LIMITED') {
        // Sheet 1 row 13 — `otp_verification_result` (failure, rate limited).
        unawaited(_analytics?.trackEvent(
          OnboardingEvents.otpVerificationResult,
          properties: <String, Object?>{
            OnboardingEventProps.result: OnboardingEventProps.resultFailure,
            OnboardingEventProps.errorCode: code,
            OnboardingEventProps.attemptNumber: attemptCount,
            OnboardingEventProps.responseTimeMs:
                stopwatch.elapsedMilliseconds,
          },
        ));
        emit(OtpRateLimited(
          otpDigits: '',
          attemptCount: attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: state.countdownRemainingSeconds,
          message: 'Too many attempts — try again later',
        ));
        return;
      }

      final message = error is ApiException
          ? (code == 'OTP_INVALID' ? 'Invalid OTP' : error.message)
          : 'Something went wrong. Please try again.';

      // Sheet 1 row 13 — `otp_verification_result` (failure, generic).
      unawaited(_analytics?.trackEvent(
        OnboardingEvents.otpVerificationResult,
        properties: <String, Object?>{
          OnboardingEventProps.result: OnboardingEventProps.resultFailure,
          OnboardingEventProps.errorCode: code ?? 'NETWORK_ERROR',
          OnboardingEventProps.attemptNumber: attemptCount,
          OnboardingEventProps.responseTimeMs: stopwatch.elapsedMilliseconds,
        },
      ));

      emit(OtpInvalid(
        otpDigits: '',
        attemptCount: attemptCount,
        resendCount: state.resendCount,
        countdownRemainingSeconds: state.countdownRemainingSeconds,
        errorMessage: message,
      ));
    }
  }

  // --- resend ---------------------------------------------------------------

  Future<void> _onResendTapped(
    ResendTapped event,
    Emitter<OtpState> emit,
  ) async {
    if (state.countdownRemainingSeconds > 0) return;
    if (state is OtpResending) return;
    if (state is OtpRateLimited) return;

    final nextResendCount = state.resendCount + 1;

    // Sheet 1 row 14 — `resend_otp_clicked`. `seconds_since_last_request`
    // is the ACTUAL elapsed time since the last send/resend, measured by
    // the persistent stopwatch. The `attempt_number` here restarts the
    // verify-attempt counter conceptually: the state's `attemptCount` is
    // preserved (we still count total verifies), but for the funnel we
    // ship the resend-count since that's the current-flow "which attempt
    // to receive an OTP is this" measure.
    final secondsSinceLast = _lastOtpRequestStopwatch.elapsed.inSeconds;
    _lastOtpRequestStopwatch
      ..reset()
      ..start();
    unawaited(_analytics?.trackEvent(
      OnboardingEvents.resendOtpClicked,
      properties: <String, Object?>{
        OnboardingEventProps.attemptNumber: nextResendCount,
        OnboardingEventProps.secondsSinceLastRequest: secondsSinceLast,
      },
    ));

    emit(OtpResending(
      otpDigits: state.otpDigits,
      attemptCount: state.attemptCount,
      resendCount: state.resendCount,
      countdownRemainingSeconds: 0,
    ));

    final stopwatch = Stopwatch()..start();
    try {
      final result =
          await _authRepository.resendOtp(otpSessionId: _otpSessionId);
      stopwatch.stop();

      // Sheet 1 row 15 — `resend_otp_result` (success).
      unawaited(_analytics?.trackEvent(
        OnboardingEvents.resendOtpResult,
        properties: <String, Object?>{
          OnboardingEventProps.result: OnboardingEventProps.resultSuccess,
          OnboardingEventProps.errorCode: null,
          OnboardingEventProps.attemptNumber: nextResendCount,
        },
      ));

      emit(OtpResendSuccess(
        otpDigits: '',
        attemptCount: state.attemptCount,
        resendCount: nextResendCount,
        countdownRemainingSeconds: result.resendAvailableAfterSeconds,
        resendAvailableAfterSeconds: result.resendAvailableAfterSeconds,
      ));

      // Immediately fall back to Idle so the countdown widget renders the new
      // timer without the transient snackbar sticking around.
      emit(OtpIdle(
        otpDigits: '',
        attemptCount: state.attemptCount,
        resendCount: nextResendCount,
        countdownRemainingSeconds: result.resendAvailableAfterSeconds,
      ));

      _startCountdown();
    } catch (error) {
      stopwatch.stop();
      final code = error is ApiException ? error.errorCode : null;
      final message = error is ApiException
          ? error.message
          : 'Something went wrong. Please try again.';

      // Sheet 1 row 15 — `resend_otp_result` (failure).
      unawaited(_analytics?.trackEvent(
        OnboardingEvents.resendOtpResult,
        properties: <String, Object?>{
          OnboardingEventProps.result: OnboardingEventProps.resultFailure,
          OnboardingEventProps.errorCode: code ?? 'NETWORK_ERROR',
          OnboardingEventProps.attemptNumber: nextResendCount,
        },
      ));

      emit(OtpResendFailure(
        otpDigits: state.otpDigits,
        attemptCount: state.attemptCount,
        resendCount: state.resendCount,
        countdownRemainingSeconds: 0,
        message: message,
      ));
    }
  }

  // --- change number --------------------------------------------------------

  void _onChangeNumberTapped(
    ChangeNumberTapped event,
    Emitter<OtpState> emit,
  ) {
    // Sheet 1 row 10 — `change_phone_number_clicked`.
    unawaited(_analytics?.trackEvent(
      OnboardingEvents.changePhoneNumberClicked,
      properties: <String, Object?>{
        OnboardingEventProps.attemptNumber: state.attemptCount,
      },
    ));
    // The pending userId attached at send time (TAM-154) belongs to the
    // OLD number's User row. If the user enters a different number the next
    // send will mint (or find) a different row, so drop the old id BEFORE
    // navigating back — otherwise the phone-input events fired after the
    // pop still attribute to the abandoned identity.
    //
    // Fire-and-forget so the tap doesn't block on a platform channel; the
    // change_phone_number_clicked event above already went out under the
    // outgoing id, which is what we want (that event belongs to this session).
    unawaited(_analytics?.clearPendingUser());
    // Symmetric to `clearPendingUser`: the Clarity session currently
    // recording was booted for the OLD number's userId (see
    // PhoneInputScreen's `PhoneOtpSendSuccess` listener). Reset the seam
    // so the NEXT send-otp initialize() re-boots Clarity under the new
    // number's userId — otherwise the replay would continue tagged to
    // an abandoned identity. `reset` is a local-state flip, not a
    // teardown, and is a no-op in debug/profile builds by design.
    ClarityService().reset();
    // No state change — the widget handles the pop/navigate.
  }

  // --- helpers --------------------------------------------------------------

  static OtpState _copyWithCountdown(OtpState state, int remaining) {
    switch (state) {
      case OtpIdle():
        return state.copyWith(countdownRemainingSeconds: remaining);
      case OtpVerifying():
        return OtpVerifying(
          otpDigits: state.otpDigits,
          attemptCount: state.attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: remaining,
        );
      case OtpInvalid():
        return OtpInvalid(
          otpDigits: state.otpDigits,
          attemptCount: state.attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: remaining,
          errorMessage: state.errorMessage,
        );
      case OtpRateLimited():
        return OtpRateLimited(
          otpDigits: state.otpDigits,
          attemptCount: state.attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: remaining,
          message: state.message,
        );
      case OtpResending():
        return OtpResending(
          otpDigits: state.otpDigits,
          attemptCount: state.attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: remaining,
        );
      case OtpResendSuccess():
        return OtpResendSuccess(
          otpDigits: state.otpDigits,
          attemptCount: state.attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: remaining,
          resendAvailableAfterSeconds: state.resendAvailableAfterSeconds,
        );
      case OtpResendFailure():
        return OtpResendFailure(
          otpDigits: state.otpDigits,
          attemptCount: state.attemptCount,
          resendCount: state.resendCount,
          countdownRemainingSeconds: remaining,
          message: state.message,
        );
      case OtpVerified():
        return state; // once verified, ticks are a no-op
    }
  }

  @override
  Future<void> close() {
    _countdownSub?.cancel();
    return super.close();
  }
}
