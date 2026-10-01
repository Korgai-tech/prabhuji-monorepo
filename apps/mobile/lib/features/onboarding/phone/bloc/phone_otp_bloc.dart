// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `authRepository:` etc. — the private field
// names would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../api/api_client.dart';
import '../../../../core/analytics.dart';
import '../../../referral/referral_sync_service.dart';
import '../../data/auth_repository.dart';
import '../../onboarding_analytics.dart';
import 'phone_otp_event.dart';
import 'phone_otp_state.dart';

/// Bloc for BOTH phone-choice (terms only) and phone-input (terms + number +
/// send-OTP mutation). Sharing one bloc keeps the terms toggle + phone entry
/// coherent even though the flow spans two routes.
///
/// Analytics: raw phone numbers NEVER leave this class. Only `country_code`,
/// `phone_number_length`, `terms_accepted`, `is_phone_valid_client_side`.
class PhoneOtpBloc extends Bloc<PhoneOtpEvent, PhoneOtpState> {
  PhoneOtpBloc({
    required AuthRepository authRepository,
    Analytics? analytics,
    ReferralSyncService? referralSync,
    String phoneCountryCode = '+91',
  })  : _authRepository = authRepository,
        _analytics = analytics,
        _referralSync = referralSync,
        _phoneCountryCode = phoneCountryCode,
        super(const PhoneOtpInitial()) {
    on<PhoneChanged>(_onPhoneChanged);
    on<TermsToggled>(_onTermsToggled);
    on<SendOtpRequested>(_onSendOtpRequested);
  }

  final AuthRepository _authRepository;
  final Analytics? _analytics;
  // Optional (null in tests) — fired the moment `POST /auth/otp/send`
  // returns a userId, so the once-per-install install-attribution POST
  // happens BEFORE OTP verify. The referral endpoint is auth-less
  // (skipAuth + tenant headers), so no JWT is needed — the userId TAM-154
  // mints on send is enough. Idempotent + gated by SharedPrefs inside
  // the service; a second call from the JWT-login path in main.dart
  // simply early-returns.
  final ReferralSyncService? _referralSync;
  final String _phoneCountryCode;

  String get phoneCountryCode => _phoneCountryCode;

  /// Number of Get OTP requests dispatched in the current flow. Starts at
  /// 0; `nextRequestAttempt()` returns the value the NEXT dispatch will
  /// use (1, 2, 3, ...) and increments the internal counter. Read by the
  /// widget to stamp `attempt_number` on Sheet 1 row 7.
  int _requestAttempt = 0;

  /// One-shot latch for the row-5 `phone_number_entered` event — fires the
  /// first time the entered phone reaches the client-side gate. Reset when
  /// the user clears the field so a corrective re-entry still emits once.
  bool _phoneEnteredFired = false;

  int nextRequestAttempt() {
    _requestAttempt++;
    return _requestAttempt;
  }

  void _onPhoneChanged(PhoneChanged event, Emitter<PhoneOtpState> emit) {
    // Preserve termsAccepted; clear any prior failure so the user can retry.
    emit(PhoneOtpInitial(
      termsAccepted: state.termsAccepted,
      phoneNumber: event.phoneNumber,
    ));
    // Sheet 1 row 5 — `phone_number_entered`. Fires the first time the
    // entered phone matches the client-side length gate (mirrors the
    // backend regex). One-shot: rearms if the user clears the field, so a
    // typed-then-corrected entry re-emits once.
    if (event.phoneNumber.isEmpty) {
      _phoneEnteredFired = false;
      return;
    }
    if (_phoneEnteredFired) return;
    if (!_phoneRegex.hasMatch(event.phoneNumber)) return;
    _phoneEnteredFired = true;
    unawaited(_analytics?.trackEvent(
      OnboardingEvents.phoneNumberEntered,
      properties: <String, Object?>{
        OnboardingEventProps.countryCode: _phoneCountryCode,
        OnboardingEventProps.phoneNumberLength: event.phoneNumber.length,
      },
    ));
  }

  void _onTermsToggled(TermsToggled event, Emitter<PhoneOtpState> emit) {
    emit(PhoneOtpInitial(
      termsAccepted: event.accepted,
      phoneNumber: state.phoneNumber,
    ));
  }

  Future<void> _onSendOtpRequested(
    SendOtpRequested event,
    Emitter<PhoneOtpState> emit,
  ) async {
    final termsAccepted = state.termsAccepted;
    final phoneNumber = event.phoneNumber;

    // Client-side gate: mirror the AC + backend Zod. If either fails, silently
    // ignore — the CTA should already be disabled at this point; this is a
    // belt-and-braces guard against accidental double-taps.
    if (!termsAccepted) return;
    if (!_phoneRegex.hasMatch(phoneNumber)) return;

    emit(PhoneOtpSending(
      termsAccepted: termsAccepted,
      phoneNumber: phoneNumber,
    ));

    final stopwatch = Stopwatch()..start();
    try {
      final result = await _authRepository.sendOtp(
        phoneCountryCode: _phoneCountryCode,
        phoneNumber: phoneNumber,
        // TAM-123: forwarded to MSG91's template as the SMS Retriever suffix
        // so the OTP screen's `getSmsWithRetrieverApi` listener can match.
        // Null on iOS / when smart_auth failed — server treats absent field
        // as "don't append a suffix", so the SMS still delivers, just
        // without auto-fill on that install.
        appSignatureHash: event.appSignatureHash,
      );
      stopwatch.stop();

      // TAM-154: the server-side write mints (or finds) the User row at OTP
      // send, so from here on every event has a real userId to attribute to.
      // Attach BEFORE the row-8 trackEvent below so `otp_request_result` and
      // everything downstream (`otp_screen_viewed`, `otp_entered`, ...) rides
      // the id at the SDK's top-level. If the user abandons before verify,
      // OtpBloc's change-number handler / main.dart's cold-start check will
      // wipe it via `clearPendingUser` — no ghost identity carries over.
      //
      // `userId` is null on server builds that don't yet return the field —
      // in that case we degrade to un-attributed events (existing behaviour)
      // rather than fabricating one.
      final pendingUserId = result.userId;
      if (pendingUserId != null) {
        await _analytics?.setPendingUser(pendingUserId);
        // Referral install-attribution POST — the endpoint doesn't need a
        // JWT (skipAuth + tenant headers), so we fire the moment we have
        // ANY server-issued userId. Fire-and-forget: attribution must
        // never block OTP flow. Idempotent — a subsequent fire from
        // main.dart's JWT-login path early-returns via the
        // `referral_synced_v1` flag.
        unawaited(_referralSync?.syncIfNeeded(userId: pendingUserId));
      }

      // Sheet 1 row 8 — `otp_request_result`. `response_time_ms` from the
      // stopwatch above; `attempt_number` uses the same counter the widget
      // stamped on `get_otp_clicked` so the two events join naturally.
      unawaited(_analytics?.trackEvent(
        OnboardingEvents.otpRequestResult,
        properties: <String, Object?>{
          OnboardingEventProps.result: OnboardingEventProps.resultSuccess,
          OnboardingEventProps.errorCode: null,
          OnboardingEventProps.attemptNumber: _requestAttempt,
          OnboardingEventProps.responseTimeMs: stopwatch.elapsedMilliseconds,
        },
      ));

      emit(PhoneOtpSendSuccess(
        termsAccepted: termsAccepted,
        phoneNumber: phoneNumber,
        otpSessionId: result.otpSessionId,
        phoneCountryCode: _phoneCountryCode,
        resendAvailableAfterSeconds: result.resendAvailableAfterSeconds,
        otpLength: result.otpLength,
        // Carried onto the state so the phone-input screen's listener can
        // boot Clarity with the same server userId `setPendingUser` above
        // just latched onto — one server-issued identity, three sinks.
        pendingUserId: pendingUserId,
      ));
    } catch (error) {
      stopwatch.stop();
      final message = _messageFor(error);
      final code = error is ApiException ? error.errorCode : null;

      unawaited(_analytics?.trackEvent(
        OnboardingEvents.otpRequestResult,
        properties: <String, Object?>{
          OnboardingEventProps.result: OnboardingEventProps.resultFailure,
          OnboardingEventProps.errorCode: code ?? 'NETWORK_ERROR',
          OnboardingEventProps.attemptNumber: _requestAttempt,
          OnboardingEventProps.responseTimeMs: stopwatch.elapsedMilliseconds,
        },
      ));

      emit(PhoneOtpSendFailure(
        termsAccepted: termsAccepted,
        phoneNumber: phoneNumber,
        errorMessage: message,
        errorCode: code,
      ));
    }
  }

  static String _messageFor(Object error) {
    if (error is ApiException) return error.message;
    return 'Something went wrong. Please try again.';
  }
}

final RegExp _phoneRegex = RegExp(r'^[6-9]\d{9}$');
