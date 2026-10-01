// See the note on OnboardingOrchestratorBloc — private fields kept
// underscored so the public constructor params (`onVerify:`) stay readable.
// ignore_for_file: prefer_initializing_formals

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_event.dart';
import 'package:mobile/features/onboarding/data/auth_repository.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/onboarding/otp/bloc/otp_bloc.dart';
import 'package:mobile/features/onboarding/otp/presentation/otp_screen.dart';

import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

class _StubOrchestrator extends OnboardingOrchestratorBloc {
  _StubOrchestrator()
      : super(
          authStore: FakeAuthStore(token: null),
          usersRepository: FakeUsersRepository(result: const MeResult()),
          subscriptionRepository: FakeSubscriptionRepository(),
        );

  @override
  void add(OnboardingOrchestratorEvent event) {
    // No-op — the widget tests shouldn't drive the real decision tree.
  }
}

class _ScriptedRepo implements AuthRepository {
  _ScriptedRepo({Future<VerifyOtpResult> Function()? onVerify})
      : _onVerify = onVerify;

  final Future<VerifyOtpResult> Function()? _onVerify;

  /// Set on every `verifyOtp` call so a test can assert WHICH code the screen
  /// submitted (the auto-verify path never goes through the CTA).
  String? lastOtp;
  int verifyCalls = 0;

  @override
  Future<SendOtpResult> sendOtp({
    required String phoneCountryCode,
    required String phoneNumber,
    String? appSignatureHash,
  }) =>
      throw UnimplementedError();

  @override
  Future<VerifyOtpResult> verifyOtp({
    required String otpSessionId,
    required String otp,
  }) {
    lastOtp = otp;
    verifyCalls++;
    if (_onVerify == null) throw UnimplementedError();
    return _onVerify();
  }

  @override
  Future<ResendOtpResult> resendOtp({required String otpSessionId}) =>
      throw UnimplementedError();
}

OtpBloc _bloc({
  required AuthRepository repo,
  int otpLength = 4,
  int initialResendSeconds = 20,
}) =>
    OtpBloc(
      authRepository: repo,
      authStore: FakeAuthStore(token: null),
      orchestrator: _StubOrchestrator(),
      otpSessionId: 'session-1',
      phoneCountryCode: '+91',
      phoneNumber: '9812345678',
      initialResendSeconds: initialResendSeconds,
      otpLength: otpLength,
    );

Future<void> _pump(WidgetTester tester, OtpBloc bloc) {
  // Wrap in a minimal Router so `context.go` calls in listeners don't blow up
  // during widget disposal. We route both the OTP screen and a stub for
  // /name-language.
  final router = GoRouter(
    initialLocation: '/otp',
    routes: [
      GoRoute(
        path: '/otp',
        builder: (_, _) => BlocProvider<OtpBloc>.value(
          value: bloc,
          child: const OtpScreen(),
        ),
      ),
      GoRoute(
        path: '/name-language',
        builder: (_, _) => const Scaffold(body: Text('name-language stub')),
      ),
      GoRoute(
        path: '/phone-input',
        builder: (_, _) => const Scaffold(body: Text('phone-input stub')),
      ),
    ],
  );
  return tester.pumpWidget(MaterialApp.router(routerConfig: router));
}

/// Same shape as [_pump] but hands the router back so a test can assert the
/// location the screen navigated to.
GoRouter _routerFor(OtpBloc bloc) => GoRouter(
      initialLocation: '/otp',
      routes: [
        GoRoute(
          path: '/otp',
          builder: (_, _) => BlocProvider<OtpBloc>.value(
            value: bloc,
            child: const OtpScreen(),
          ),
        ),
        GoRoute(
          path: '/phone-input',
          builder: (_, _) => const Scaffold(body: Text('phone-input stub')),
        ),
      ],
    );

Future<void> _dispose(WidgetTester tester, OtpBloc bloc) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
  await tester.runAsync(bloc.close);
}

void main() {
  testWidgets('renders otpLength digit boxes dynamically (default 4)',
      (tester) async {
    final bloc = _bloc(repo: _ScriptedRepo(), otpLength: 4);
    await _pump(tester, bloc);
    await tester.pump();

    // 4 boxes for a 4-digit length.
    expect(find.byKey(const Key('otp-digit-box-0')), findsOneWidget);
    expect(find.byKey(const Key('otp-digit-box-1')), findsOneWidget);
    expect(find.byKey(const Key('otp-digit-box-2')), findsOneWidget);
    expect(find.byKey(const Key('otp-digit-box-3')), findsOneWidget);
    expect(find.byKey(const Key('otp-digit-box-4')), findsNothing);

    await _dispose(tester, bloc);
  });

  testWidgets('renders otpLength digit boxes dynamically (6 also works)',
      (tester) async {
    final bloc = _bloc(repo: _ScriptedRepo(), otpLength: 6);
    await _pump(tester, bloc);
    await tester.pump();

    for (var i = 0; i < 6; i++) {
      expect(find.byKey(Key('otp-digit-box-$i')), findsOneWidget);
    }
    expect(find.byKey(const Key('otp-digit-box-6')), findsNothing);

    await _dispose(tester, bloc);
  });

  testWidgets(
    'submit CTA is disabled until digits complete',
    (tester) async {
      final bloc = _bloc(repo: _ScriptedRepo(), otpLength: 4);
      await _pump(tester, bloc);
      await tester.pump();

      InkWell submit() =>
          tester.widget<InkWell>(find.byKey(const Key('otp-submit')));
      expect(submit().onTap, isNull);

      // Three of four — still short, still gated. The FOURTH digit is not
      // asserted here because it auto-verifies (see the auto-verify test
      // below), which takes the CTA straight into its loading state.
      for (var i = 0; i < 3; i++) {
        await tester.enterText(find.byKey(Key('otp-digit-box-$i')), '${i + 1}');
        await tester.pump();
      }

      expect(submit().onTap, isNull);

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'entering the last digit auto-verifies — no Submit tap needed',
    (tester) async {
      final repo = _ScriptedRepo(
        onVerify: () async =>
            throw ApiException('Invalid OTP', errorCode: 'OTP_INVALID'),
      );
      final bloc = _bloc(repo: repo, otpLength: 4);
      await _pump(tester, bloc);
      await tester.pump();

      for (var i = 0; i < 3; i++) {
        await tester.enterText(find.byKey(Key('otp-digit-box-$i')), '${i + 1}');
        await tester.pump();
      }
      expect(repo.verifyCalls, 0, reason: 'a partial code must not verify');

      await tester.enterText(find.byKey(const Key('otp-digit-box-3')), '4');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(repo.verifyCalls, 1);
      expect(repo.lastOtp, '1234');
      expect(find.byKey(const Key('otp-invalid-pill')), findsOneWidget);

      // The invalid attempt wiped the boxes — a corrected code must auto-verify
      // again rather than latch off after the first automatic submit.
      for (var i = 0; i < 4; i++) {
        await tester.enterText(find.byKey(Key('otp-digit-box-$i')), '9');
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 50));

      expect(repo.verifyCalls, 2);
      expect(repo.lastOtp, '9999');

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'invalid state shows the "Invalid OTP" message',
    (tester) async {
      final bloc = _bloc(
        repo: _ScriptedRepo(
          onVerify: () async =>
              throw ApiException('Invalid OTP', errorCode: 'OTP_INVALID'),
        ),
        otpLength: 4,
      );
      await _pump(tester, bloc);
      await tester.pump();

      for (var i = 0; i < 4; i++) {
        await tester.enterText(find.byKey(Key('otp-digit-box-$i')), '${i + 1}');
        await tester.pump();
      }
      // The fourth digit auto-verifies; no Submit tap needed.
      await tester.pump(); // fire the async
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.byKey(const Key('otp-invalid-pill')), findsOneWidget);
      expect(find.byKey(const Key('otp-invalid-text')), findsOneWidget);
      expect(find.text('Invalid OTP'), findsOneWidget);

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'resend row shows the countdown while > 0 and is not tappable',
    (tester) async {
      final bloc = _bloc(repo: _ScriptedRepo(), initialResendSeconds: 20);
      await _pump(tester, bloc);
      await tester.pump();

      // Countdown starts at 20 → shows "Resent OTP (20)" (Figma copy).
      expect(find.textContaining('Resent OTP ('), findsOneWidget);

      // Sanity: the InkWell's onTap is null while countdown > 0.
      final resend = tester.widget<InkWell>(
        find.byKey(const Key('otp-resend')),
      );
      expect(resend.onTap, isNull);

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'Change No. navigates to /phone-input with a reset token',
    (tester) async {
      final bloc = _bloc(repo: _ScriptedRepo());
      final router = _routerFor(bloc);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.pump();

      await tester.tap(find.byKey(const Key('otp-change-number')));
      await tester.pumpAndSettle();

      // The token is what makes the (reused) phone-input page clear the old
      // number — a bare '/phone-input' would leave it in the field.
      final location = router.routerDelegate.currentConfiguration.uri;
      expect(location.path, '/phone-input');
      expect(location.queryParameters['reset'], isNotNull);

      await _dispose(tester, bloc);
    },
  );
}
