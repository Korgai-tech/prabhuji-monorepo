import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/core/analytics.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_event.dart';
import 'package:mobile/features/onboarding/data/auth_repository.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_bloc.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_event.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_state.dart';
import 'package:mobile/features/onboarding/onboarding_analytics.dart';

import 'support/fake_analytics.dart';
import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

/// Full-control auth repo used by the OTP bloc suite. verify + resend can
/// each be scripted with a queue of Future producers so we can test success,
/// invalid, exhausted, and network-error paths without a shared mutable var.
class _ScriptedAuthRepository implements AuthRepository {
  _ScriptedAuthRepository({
    Iterable<Future<VerifyOtpResult> Function()> verifyResponses = const [],
    Iterable<Future<ResendOtpResult> Function()> resendResponses = const [],
  })  : _verifyQueue = List.of(verifyResponses),
        _resendQueue = List.of(resendResponses);

  final List<Future<VerifyOtpResult> Function()> _verifyQueue;
  final List<Future<ResendOtpResult> Function()> _resendQueue;

  int verifyCalls = 0;
  int resendCalls = 0;
  String? lastOtp;

  @override
  Future<SendOtpResult> sendOtp({
    required String phoneCountryCode,
    required String phoneNumber,
    String? appSignatureHash,
  }) =>
      throw UnimplementedError('scripted repo only supports verify + resend');

  @override
  Future<VerifyOtpResult> verifyOtp({
    required String otpSessionId,
    required String otp,
  }) async {
    verifyCalls++;
    lastOtp = otp;
    if (_verifyQueue.isEmpty) {
      throw StateError('verifyOtp called with no scripted response');
    }
    return _verifyQueue.removeAt(0)();
  }

  @override
  Future<ResendOtpResult> resendOtp({required String otpSessionId}) async {
    resendCalls++;
    if (_resendQueue.isEmpty) {
      throw StateError('resendOtp called with no scripted response');
    }
    return _resendQueue.removeAt(0)();
  }
}

/// Records every event added to the orchestrator so we can assert
/// SessionRefreshed fires on verify success.
class _OrchestratorSpy extends OnboardingOrchestratorBloc {
  _OrchestratorSpy()
      : super(
          authStore: FakeAuthStore(token: null),
          usersRepository: FakeUsersRepository(result: const MeResult()),
          subscriptionRepository: FakeSubscriptionRepository(),
        );

  final events = <OnboardingOrchestratorEvent>[];

  @override
  void add(OnboardingOrchestratorEvent event) {
    events.add(event);
    // Don't forward — we don't want the real _resolveRoute to run inside the
    // bloc test and pull on the fake repos.
  }
}

OtpBloc _buildBloc({
  required AuthRepository repo,
  int otpLength = 4,
  int initialResendSeconds = 20,
  FakeAuthStore? authStore,
  _OrchestratorSpy? orchestrator,
  Analytics? analytics,
}) {
  return OtpBloc(
    authRepository: repo,
    authStore: authStore ?? FakeAuthStore(token: null),
    orchestrator: orchestrator ?? _OrchestratorSpy(),
    otpSessionId: 'session-1',
    phoneCountryCode: '+91',
    phoneNumber: '9812345678',
    initialResendSeconds: initialResendSeconds,
    otpLength: otpLength,
    analytics: analytics,
  );
}

Future<T> _waitFor<T extends OtpState>(OtpBloc bloc) {
  return bloc.stream.firstWhere((s) => s is T).then((s) => s as T);
}

void main() {
  group('OtpBloc', () {
    test('initial state — idle, countdown = initialResendSeconds', () {
      final bloc = _buildBloc(
        repo: _ScriptedAuthRepository(),
        initialResendSeconds: 20,
      );
      expect(bloc.state, isA<OtpIdle>());
      expect(bloc.state.countdownRemainingSeconds, 20);
      expect(bloc.state.attemptCount, 0);
      expect(bloc.state.resendCount, 0);
      bloc.close();
    });

    test('SubmitTapped with incomplete digits → no verify call', () async {
      final repo = _ScriptedAuthRepository();
      final bloc = _buildBloc(repo: repo);
      bloc.add(const DigitEntered('12')); // 2 of 4 digits
      await _waitFor<OtpIdle>(bloc);
      bloc.add(const SubmitTapped());
      // Let the queue drain — no verify should fire.
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(repo.verifyCalls, 0);
      await bloc.close();
    });

    test('SubmitTapped with complete digits → verify → OtpVerified', () async {
      final orchestrator = _OrchestratorSpy();
      final authStore = FakeAuthStore(token: null);
      final repo = _ScriptedAuthRepository(
        verifyResponses: [
          () async => const VerifyOtpResult(
                token: 'jwt-fresh',
                userId: 'user-1',
                phoneCountryCode: '+91',
                phoneNumber: '9876543210',
                isNewUser: true,
              ),
        ],
      );
      final bloc = _buildBloc(
        repo: repo,
        orchestrator: orchestrator,
        authStore: authStore,
      );
      bloc.add(const DigitEntered('1234'));
      await _waitFor<OtpIdle>(bloc);
      bloc.add(const SubmitTapped());
      final verified = await _waitFor<OtpVerified>(bloc);
      expect(verified.token, 'jwt-fresh');
      expect(verified.isNewUser, isTrue);
      expect(repo.verifyCalls, 1);
      expect(repo.lastOtp, '1234');
      expect(authStore.writes, 1,
          reason: 'JWT should be persisted on verify success');
      expect(orchestrator.events.whereType<SessionRefreshed>().length, 1,
          reason: 'SessionRefreshed must fire so the router re-resolves');
      await bloc.close();
    });

    test(
        'new user verify fires registration_successful beside '
        'otp_verification_result, with event_id = user id', () async {
      final analytics = RecordingAnalytics();
      final repo = _ScriptedAuthRepository(
        verifyResponses: [
          () async => const VerifyOtpResult(
                token: 'jwt-fresh',
                userId: 'user-1',
                phoneCountryCode: '+91',
                phoneNumber: '9876543210',
                isNewUser: true,
              ),
        ],
      );
      final bloc = _buildBloc(repo: repo, analytics: analytics);
      bloc.add(const DigitEntered('1234'));
      await _waitFor<OtpIdle>(bloc);
      bloc.add(const SubmitTapped());
      await _waitFor<OtpVerified>(bloc);

      final registration =
          analytics.propsFor(OnboardingEvents.registrationSuccessful);
      // Overrides the UUID `trackEvent` stamps: one registration per user
      // ever, so the user id is the dedupe key.
      expect(registration[OnboardingEventProps.eventId], 'user-1');
      // Same property set as the funnel event beside it.
      final verification =
          analytics.propsFor(OnboardingEvents.otpVerificationResult);
      expect(verification[OnboardingEventProps.result],
          OnboardingEventProps.resultSuccess);
      for (final key in verification.keys) {
        expect(registration[key], verification[key],
            reason: '$key must match otp_verification_result');
      }
      // ...and the funnel event keeps its own client-stamped UUID.
      expect(verification.containsKey(OnboardingEventProps.eventId), isFalse);
      await bloc.close();
    });

    test('returning user verify does NOT fire registration_successful',
        () async {
      final analytics = RecordingAnalytics();
      final repo = _ScriptedAuthRepository(
        verifyResponses: [
          () async => const VerifyOtpResult(
                token: 'jwt-fresh',
                userId: 'user-1',
                phoneCountryCode: '+91',
                phoneNumber: '9876543210',
                isNewUser: false,
              ),
        ],
      );
      final bloc = _buildBloc(repo: repo, analytics: analytics);
      bloc.add(const DigitEntered('1234'));
      await _waitFor<OtpIdle>(bloc);
      bloc.add(const SubmitTapped());
      await _waitFor<OtpVerified>(bloc);

      expect(analytics.fired(OnboardingEvents.otpVerificationResult), isTrue);
      expect(analytics.fired(OnboardingEvents.registrationSuccessful), isFalse,
          reason: 'acquisition signal is first verification only');
      await bloc.close();
    });

    test('Wrong OTP → OtpInvalid state with attempt increment', () async {
      final repo = _ScriptedAuthRepository(
        verifyResponses: [
          () async =>
              throw ApiException('Invalid OTP', errorCode: 'OTP_INVALID'),
        ],
      );
      final bloc = _buildBloc(repo: repo);
      bloc.add(const DigitEntered('9999'));
      await _waitFor<OtpIdle>(bloc);
      bloc.add(const SubmitTapped());
      final invalid = await _waitFor<OtpInvalid>(bloc);
      expect(invalid.attemptCount, 1);
      expect(invalid.otpDigits, '');
      expect(invalid.errorMessage, 'Invalid OTP');
      await bloc.close();
    });

    test('Exhausted session → OtpRateLimited state', () async {
      final repo = _ScriptedAuthRepository(
        verifyResponses: [
          () async => throw ApiException(
                'OTP session is no longer valid',
                errorCode: 'OTP_SESSION_EXHAUSTED',
                statusCode: 401,
              ),
        ],
      );
      final bloc = _buildBloc(repo: repo);
      bloc.add(const DigitEntered('1234'));
      await _waitFor<OtpIdle>(bloc);
      bloc.add(const SubmitTapped());
      final rl = await _waitFor<OtpRateLimited>(bloc);
      expect(rl.message, contains('Too many attempts'));
      await bloc.close();
    });

    test('Countdown ticks down 1s at a time', () async {
      final bloc = _buildBloc(
        repo: _ScriptedAuthRepository(),
        initialResendSeconds: 3,
      );
      // Wait for the first countdown tick to land.
      await bloc.stream.firstWhere((s) => s.countdownRemainingSeconds < 3);
      expect(bloc.state.countdownRemainingSeconds, lessThan(3));
      await bloc.close();
    });

    test(
      'ResendTapped after countdown = 0 → Resending → Idle with reset countdown',
      () async {
        final repo = _ScriptedAuthRepository(
          resendResponses: [
            () async => const ResendOtpResult(resendAvailableAfterSeconds: 30),
          ],
        );
        final bloc = _buildBloc(repo: repo, initialResendSeconds: 0);
        // Countdown is already 0 — resend is tappable.
        bloc.add(const ResendTapped());
        // Should transition Resending → ResendSuccess → Idle(30).
        final idle = await bloc.stream.firstWhere(
          (s) => s is OtpIdle && s.countdownRemainingSeconds == 30,
        ) as OtpIdle;
        expect(repo.resendCalls, 1);
        expect(idle.resendCount, 1);
        await bloc.close();
      },
    );

    test(
      'ResendTapped is a no-op while countdown > 0',
      () async {
        final repo = _ScriptedAuthRepository();
        final bloc = _buildBloc(repo: repo, initialResendSeconds: 30);
        bloc.add(const ResendTapped());
        await Future<void>.delayed(const Duration(milliseconds: 30));
        expect(repo.resendCalls, 0);
        await bloc.close();
      },
    );

    test('ChangeNumberTapped does not emit a new state', () async {
      final bloc = _buildBloc(repo: _ScriptedAuthRepository());
      final before = bloc.state;
      bloc.add(const ChangeNumberTapped());
      await Future<void>.delayed(const Duration(milliseconds: 10));
      // State may have ticked down by a second but MUST still be OtpIdle —
      // no verify / resend / rate-limited transition.
      expect(bloc.state.runtimeType, before.runtimeType);
      await bloc.close();
    });
  });
}
