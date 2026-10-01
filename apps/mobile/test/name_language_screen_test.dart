import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_event.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_bloc.dart';
import 'package:mobile/features/onboarding/profile/presentation/name_language_screen.dart';

import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

/// Repo stub — never actually saves; throws if the widget attempts to.
class _StubUsersRepository implements UsersRepository {
  @override
  Future<MeResult> getMe() async => const MeResult();

  @override
  Future<MeUser> updateMe({
    String? name,
    String? selectedLanguage,
  }) =>
      throw UnimplementedError('widget tests should not update');
}

class _OrchestratorStub extends OnboardingOrchestratorBloc {
  _OrchestratorStub()
      : super(
          authStore: FakeAuthStore(token: null),
          usersRepository: FakeUsersRepository(result: const MeResult()),
          subscriptionRepository: FakeSubscriptionRepository(),
        );

  @override
  void add(OnboardingOrchestratorEvent event) {
    // Prevent test-time re-resolves.
  }
}

Future<void> _pump(WidgetTester tester, NameLanguageBloc bloc) {
  return tester.pumpWidget(
    MaterialApp(
      home: BlocProvider<NameLanguageBloc>.value(
        value: bloc,
        child: const NameLanguageScreen(),
      ),
    ),
  );
}

Future<void> _dispose(WidgetTester tester, NameLanguageBloc bloc) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump();
  await tester.runAsync(bloc.close);
}

void main() {
  testWidgets('8 language cards render + native/english labels visible',
      (tester) async {
    final bloc = NameLanguageBloc(
      usersRepository: _StubUsersRepository(),
      languagesRepository: FakeLanguagesRepository(),
      orchestrator: _OrchestratorStub(),
    );
    await _pump(tester, bloc);
    await tester.pump();

    for (final option in const [
      'hi',
      'mr',
      'gu',
      'bn',
      'or',
      'ta',
      'te',
      'kn',
    ]) {
      expect(find.byKey(Key('name-language-card-$option')), findsOneWidget,
          reason: 'card $option must render');
    }
    expect(find.text('हिंदी'), findsOneWidget);
    expect(find.text('Marathi'), findsOneWidget);

    await _dispose(tester, bloc);
  });

  testWidgets('Hindi is selected by default (check icon on hi card)',
      (tester) async {
    final bloc = NameLanguageBloc(
      usersRepository: _StubUsersRepository(),
      languagesRepository: FakeLanguagesRepository(),
      orchestrator: _OrchestratorStub(),
    );
    await _pump(tester, bloc);
    await tester.pump();

    expect(find.byKey(const Key('name-language-check-hi')), findsOneWidget);
    for (final other in const ['mr', 'gu', 'bn', 'or', 'ta', 'te', 'kn']) {
      expect(find.byKey(Key('name-language-check-$other')), findsNothing,
          reason: 'only Hindi is checked initially');
    }

    await _dispose(tester, bloc);
  });

  testWidgets('Continue CTA disabled when name is empty (even with Hindi)',
      (tester) async {
    final bloc = NameLanguageBloc(
      usersRepository: _StubUsersRepository(),
      languagesRepository: FakeLanguagesRepository(),
      orchestrator: _OrchestratorStub(),
    );
    await _pump(tester, bloc);
    await tester.pump();

    final cta = tester.widget<InkWell>(
      find.byKey(const Key('name-language-continue-cta')),
    );
    expect(cta.onTap, isNull);

    await _dispose(tester, bloc);
  });

  testWidgets('Continue CTA enables once a name is typed', (tester) async {
    final bloc = NameLanguageBloc(
      usersRepository: _StubUsersRepository(),
      languagesRepository: FakeLanguagesRepository(),
      orchestrator: _OrchestratorStub(),
    );
    await _pump(tester, bloc);
    await tester.pump();

    await tester.enterText(
      find.byKey(const Key('name-language-name-field')),
      'Aarav',
    );
    await tester.pump();

    final cta = tester.widget<InkWell>(
      find.byKey(const Key('name-language-continue-cta')),
    );
    expect(cta.onTap, isNotNull);

    await _dispose(tester, bloc);
  });

  testWidgets('Tapping Marathi deselects Hindi', (tester) async {
    final bloc = NameLanguageBloc(
      usersRepository: _StubUsersRepository(),
      languagesRepository: FakeLanguagesRepository(),
      orchestrator: _OrchestratorStub(),
    );
    await _pump(tester, bloc);
    await tester.pump();

    await tester.tap(find.byKey(const Key('name-language-card-mr')));
    await tester.pump();

    expect(find.byKey(const Key('name-language-check-mr')), findsOneWidget);
    expect(find.byKey(const Key('name-language-check-hi')), findsNothing);

    await _dispose(tester, bloc);
  });
}
