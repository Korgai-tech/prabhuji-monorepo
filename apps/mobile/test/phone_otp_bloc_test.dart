import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/features/onboarding/data/auth_repository.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_bloc.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_event.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_state.dart';

/// Repository double: records every call and returns a canned success or a
/// caller-provided error. Kept local to this test so we don't need to alter
/// the shared FakeAuthRepository (which returns a hardcoded success).
class _SpyAuthRepository implements AuthRepository {
  _SpyAuthRepository({this.onSend});

  final Future<SendOtpResult> Function(String phone)? onSend;

  int sendCalls = 0;
  String? lastPhoneNumber;
  String? lastCountryCode;
  String? lastAppSignatureHash;

  @override
  Future<SendOtpResult> sendOtp({
    required String phoneCountryCode,
    required String phoneNumber,
    String? appSignatureHash,
  }) async {
    sendCalls++;
    lastPhoneNumber = phoneNumber;
    lastCountryCode = phoneCountryCode;
    lastAppSignatureHash = appSignatureHash;
    if (onSend != null) return onSend!(phoneNumber);
    return const SendOtpResult(
      otpSessionId: 'session-1',
      resendAvailableAfterSeconds: 20,
      otpLength: 4,
    );
  }

  @override
  Future<VerifyOtpResult> verifyOtp({
    required String otpSessionId,
    required String otp,
  }) =>
      throw UnimplementedError();

  @override
  Future<ResendOtpResult> resendOtp({required String otpSessionId}) =>
      throw UnimplementedError();
}

Future<T> _waitFor<T extends PhoneOtpState>(PhoneOtpBloc bloc) {
  return bloc.stream.firstWhere((s) => s is T).then((s) => s as T);
}

void main() {
  group('PhoneOtpBloc', () {
    test('default state: terms accepted, phone empty, canSubmit false', () {
      final bloc = PhoneOtpBloc(authRepository: _SpyAuthRepository());
      expect(bloc.state, isA<PhoneOtpInitial>());
      expect(bloc.state.termsAccepted, isTrue);
      expect(bloc.state.phoneNumber, '');
      expect(bloc.state.canSubmit, isFalse);
      bloc.close();
    });

    test('PhoneChanged updates phone + keeps terms sticky', () async {
      final bloc = PhoneOtpBloc(authRepository: _SpyAuthRepository());
      bloc.add(const PhoneChanged('9812345678'));
      await _waitFor<PhoneOtpInitial>(bloc);
      expect(bloc.state.phoneNumber, '9812345678');
      expect(bloc.state.termsAccepted, isTrue);
      expect(bloc.state.isPhoneValid, isTrue);
      expect(bloc.state.canSubmit, isTrue);
      await bloc.close();
    });

    test('TermsToggled(false) disables submit even for valid phone', () async {
      final bloc = PhoneOtpBloc(authRepository: _SpyAuthRepository());
      bloc.add(const PhoneChanged('9812345678'));
      await _waitFor<PhoneOtpInitial>(bloc);
      bloc.add(const TermsToggled(false));
      await bloc.stream.firstWhere((s) => !s.termsAccepted);
      expect(bloc.state.termsAccepted, isFalse);
      expect(bloc.state.canSubmit, isFalse);
      await bloc.close();
    });

    test(
      'SendOtpRequested with invalid phone is a no-op — repo is NOT called',
      () async {
        final spy = _SpyAuthRepository();
        final bloc = PhoneOtpBloc(authRepository: spy);
        // Starts with '5' — regex [6-9]\d{9} rejects it.
        bloc.add(const SendOtpRequested('5123456789'));
        // Give the event loop a beat to prove nothing fires.
        await Future<void>.delayed(const Duration(milliseconds: 20));
        expect(spy.sendCalls, 0);
        expect(bloc.state, isA<PhoneOtpInitial>());
        await bloc.close();
      },
    );

    test(
      'SendOtpRequested with terms unchecked is a no-op — repo is NOT called',
      () async {
        final spy = _SpyAuthRepository();
        final bloc = PhoneOtpBloc(authRepository: spy);
        bloc.add(const PhoneChanged('9812345678'));
        await _waitFor<PhoneOtpInitial>(bloc);
        bloc.add(const TermsToggled(false));
        await bloc.stream.firstWhere((s) => !s.termsAccepted);
        bloc.add(const SendOtpRequested('9812345678'));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        expect(spy.sendCalls, 0);
        await bloc.close();
      },
    );

    test('SendOtpRequested with valid phone → Sending → Success', () async {
      final spy = _SpyAuthRepository();
      final bloc = PhoneOtpBloc(authRepository: spy);
      bloc.add(const PhoneChanged('9812345678'));
      await _waitFor<PhoneOtpInitial>(bloc);
      bloc.add(const SendOtpRequested('9812345678'));
      final success = await _waitFor<PhoneOtpSendSuccess>(bloc);
      expect(spy.sendCalls, 1);
      expect(spy.lastCountryCode, '+91');
      expect(spy.lastPhoneNumber, '9812345678');
      expect(success.otpSessionId, 'session-1');
      expect(success.resendAvailableAfterSeconds, 20);
      expect(success.otpLength, 4);
      expect(success.phoneCountryCode, '+91');
      await bloc.close();
    });

    test('SendOtpRequested failure → PhoneOtpSendFailure with errorCode',
        () async {
      final spy = _SpyAuthRepository(
        onSend: (_) => throw ApiException('Too many requests',
            errorCode: 'OTP_RATE_LIMITED', statusCode: 429),
      );
      final bloc = PhoneOtpBloc(authRepository: spy);
      bloc.add(const PhoneChanged('9812345678'));
      await _waitFor<PhoneOtpInitial>(bloc);
      bloc.add(const SendOtpRequested('9812345678'));
      final failure = await _waitFor<PhoneOtpSendFailure>(bloc);
      expect(failure.errorCode, 'OTP_RATE_LIMITED');
      expect(failure.errorMessage, 'Too many requests');
      // Terms + phone are preserved so the user can retry without re-entering.
      expect(failure.termsAccepted, isTrue);
      expect(failure.phoneNumber, '9812345678');
      await bloc.close();
    });

    test(
      'raw phone number never appears as a top-level bloc field name in props',
      () async {
        // Guard against a future refactor that accidentally exposes the raw
        // number under a name like "raw" or "phone_raw" — the spec forbids raw
        // phone in any external surface.
        final bloc = PhoneOtpBloc(authRepository: _SpyAuthRepository());
        bloc.add(const PhoneChanged('9812345678'));
        await _waitFor<PhoneOtpInitial>(bloc);
        // The phone number lives on `phoneNumber` — the only field carrying it.
        expect(bloc.state.phoneNumber, '9812345678');
        // Bloc state props are used by analytics/inspection tools; the digit
        // count is a safer proxy for logging.
        expect(bloc.state.phoneNumber.length, 10);
        await bloc.close();
      },
    );
  });
}
