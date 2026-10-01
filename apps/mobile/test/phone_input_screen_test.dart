import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/onboarding/data/auth_repository.dart';
import 'package:mobile/features/onboarding/phone/bloc/phone_otp_bloc.dart';
import 'package:mobile/features/onboarding/phone/presentation/phone_input_screen.dart';

/// Minimal repo stub — the widget tests never drive a real send. Any accidental
/// send-OTP hit throws so the test fails loudly instead of silently succeeding.
class _StubAuthRepository implements AuthRepository {
  @override
  Future<SendOtpResult> sendOtp({
    required String phoneCountryCode,
    required String phoneNumber,
    String? appSignatureHash,
  }) =>
      throw UnimplementedError('widget tests should not send OTPs');

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

Future<void> _pump(
  WidgetTester tester,
  PhoneOtpBloc bloc, {
  String? resetToken,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: BlocProvider<PhoneOtpBloc>.value(
        value: bloc,
        child: PhoneInputScreen(resetToken: resetToken),
      ),
    ),
  );
}

Future<void> _dispose(WidgetTester tester, PhoneOtpBloc bloc) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
  await tester.runAsync(bloc.close);
}

/// The CTA is an [InkWell] wrapping the gradient container. Post-fidelity we
/// no longer use ElevatedButton; the InkWell's `onTap` is null when the CTA
/// is disabled — same semantics, different widget.
InkWell _cta(WidgetTester tester) => tester.widget<InkWell>(
      find.byKey(const Key('phone-input-cta')),
    );

void main() {
  testWidgets(
    'renders the fixed +91 prefix + title + safety text + floating label',
    (tester) async {
      final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
      await _pump(tester, bloc);
      await tester.pump();

      // "+91 " is baked into the field as a Text widget preceding the input
      // (Figma node 397:2829 shows the value as "+91 9876543219").
      expect(find.text('+91 '), findsOneWidget);
      expect(find.byKey(const Key('phone-input-title')), findsOneWidget);
      expect(find.byKey(const Key('phone-input-safety')), findsOneWidget);
      expect(find.byKey(const Key('phone-input-floating-label')),
          findsOneWidget);
      expect(find.byKey(const Key('phone-input-cta')), findsOneWidget);

      await _dispose(tester, bloc);
    },
  );

  testWidgets('Get OTP CTA is disabled by default (empty phone)',
      (tester) async {
    final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
    await _pump(tester, bloc);
    await tester.pump();

    expect(_cta(tester).onTap, isNull);

    await _dispose(tester, bloc);
  });

  testWidgets(
    'Get OTP CTA is disabled when the phone is invalid (starts with 5)',
    (tester) async {
      final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
      await _pump(tester, bloc);
      await tester.pump();

      await tester.enterText(
        find.byKey(const Key('phone-input-field')),
        '5123456789',
      );
      await tester.pump();

      expect(_cta(tester).onTap, isNull,
          reason: 'invalid phone must gate the CTA');

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'Get OTP CTA is disabled when terms are unchecked even with a valid phone',
    (tester) async {
      final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
      await _pump(tester, bloc);
      await tester.pump();

      await tester.enterText(
        find.byKey(const Key('phone-input-field')),
        '9812345678',
      );
      await tester.pump();

      // Tap the terms checkbox to uncheck it.
      await tester.tap(find.byKey(const Key('terms-checkbox-phone_input')));
      await tester.pump();

      expect(_cta(tester).onTap, isNull,
          reason: 'unchecking terms must gate the CTA');

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'Get OTP CTA is enabled with a valid phone AND terms checked',
    (tester) async {
      final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
      await _pump(tester, bloc);
      await tester.pump();

      await tester.enterText(
        find.byKey(const Key('phone-input-field')),
        '9812345678',
      );
      await tester.pump();

      expect(_cta(tester).onTap, isNotNull);

      await _dispose(tester, bloc);
    },
  );

  // "Change No." on the OTP screen hops back here with `?reset=<n>`. go_router
  // reuses this page (same State, same controller), so re-pumping the SAME
  // State with a new token is exactly what that hop looks like.
  testWidgets(
    'a new resetToken clears the phone field and the bloc number',
    (tester) async {
      final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
      await _pump(tester, bloc);
      await tester.pump();

      await tester.enterText(
        find.byKey(const Key('phone-input-field')),
        '9812345678',
      );
      await tester.pump();
      expect(bloc.state.phoneNumber, '9812345678');

      await _pump(tester, bloc, resetToken: '1');
      await tester.pump();

      expect(
        tester.widget<TextField>(find.byKey(const Key('phone-input-field')))
            .controller!
            .text,
        isEmpty,
        reason: 'Change No. must leave an empty field to type the new number',
      );
      expect(bloc.state.phoneNumber, isEmpty);
      expect(_cta(tester).onTap, isNull, reason: 'cleared phone gates the CTA');

      await _dispose(tester, bloc);
    },
  );

  testWidgets(
    'an unchanged resetToken does not re-clear what the user typed',
    (tester) async {
      final bloc = PhoneOtpBloc(authRepository: _StubAuthRepository());
      await _pump(tester, bloc, resetToken: '1');
      await tester.pump();

      await tester.enterText(
        find.byKey(const Key('phone-input-field')),
        '9812345678',
      );
      await tester.pump();

      // A router rebuild (auth refreshListenable) re-runs the route builder
      // with the SAME token — the field must survive.
      await _pump(tester, bloc, resetToken: '1');
      await tester.pump();

      expect(
        tester.widget<TextField>(find.byKey(const Key('phone-input-field')))
            .controller!
            .text,
        '9812345678',
      );

      await _dispose(tester, bloc);
    },
  );
}
