import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/api/api_client.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_bloc.dart';
import 'package:mobile/features/onboarding/bloc/onboarding_orchestrator_event.dart';
import 'package:mobile/features/onboarding/data/languages_repository.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_bloc.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_event.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_state.dart';

import 'support/fake_auth_store.dart';
import 'support/fake_repositories.dart';

/// Scripted users-repository stub so tests can queue different `updateMe`
/// outcomes without a shared mutable var.
class _ScriptedUsersRepository implements UsersRepository {
  _ScriptedUsersRepository({
    Iterable<Future<MeUser> Function()> updateResponses = const [],
  }) : _updates = List.of(updateResponses);

  final List<Future<MeUser> Function()> _updates;

  int updateCalls = 0;
  String? lastName;
  String? lastLanguage;

  @override
  Future<MeResult> getMe() async => const MeResult();

  @override
  Future<MeUser> updateMe({
    String? name,
    String? selectedLanguage,
  }) async {
    updateCalls++;
    lastName = name;
    lastLanguage = selectedLanguage;
    if (_updates.isEmpty) {
      throw StateError('updateMe called with no scripted response');
    }
    return _updates.removeAt(0)();
  }
}

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
    // Don't forward — we don't want a real resolve inside a unit test.
  }
}

NameLanguageBloc _build({
  required UsersRepository repo,
  _OrchestratorSpy? orchestrator,
  LanguagesRepository? languages,
}) =>
    NameLanguageBloc(
      usersRepository: repo,
      // The catalogue now comes from `GET /languages` — the app ships no
      // hardcoded list — so every bloc needs one. The fake's default is the
      // eight Phase-1 languages with `hi` as `defaultCode`.
      languagesRepository: languages ?? FakeLanguagesRepository(),
      orchestrator: orchestrator ?? _OrchestratorSpy(),
    );

MeUser _meUser({String? name, String? language}) => MeUser(
      id: 'user-1',
      name: name,
      selectedLanguage: language,
      onboardingCompletedAt: DateTime.utc(2026),
      phoneCountryCode: '+91',
      phoneNumber: '9876543210',
    );

Future<T> _waitFor<T extends NameLanguageState>(NameLanguageBloc bloc) =>
    bloc.stream.firstWhere((s) => s is T).then((s) => s as T);

void main() {
  group('NameLanguageBloc', () {
    // The app holds NO hardcoded language list — the catalogue comes from
    // `GET /languages`, so the bloc starts empty and resolves asynchronously.
    test('initial state — loading, nothing selected, empty name', () {
      final bloc = _build(repo: _ScriptedUsersRepository());
      expect(bloc.state, isA<NameLanguageLoading>());
      expect(bloc.state.languages, isEmpty);
      expect(bloc.state.selectedLanguage, '');
      expect(bloc.state.name, '');
      expect(bloc.state.isFormValid, isFalse);
      bloc.close();
    });

    test('after the fetch — idle, server languages, server default selected',
        () async {
      final languages = FakeLanguagesRepository();
      final bloc = _build(repo: _ScriptedUsersRepository(), languages: languages);

      final state = await _waitFor<NameLanguageIdle>(bloc);

      expect(languages.fetchCalls, 1);
      expect(state.languages.map((l) => l.code), [
        'hi', 'mr', 'gu', 'bn', 'or', 'ta', 'te', 'kn',
      ]);
      // Pre-selection is the SERVER's `defaultCode`, not a hardcoded `hi`.
      expect(state.selectedLanguage, 'hi');
      expect(state.isFormValid, isFalse); // still needs a name
      await bloc.close();
    });

    test('server default drives the pre-selection, not a hardcoded `hi`',
        () async {
      final bloc = _build(
        repo: _ScriptedUsersRepository(),
        languages: FakeLanguagesRepository(defaultCode: 'ta'),
      );

      final state = await _waitFor<NameLanguageIdle>(bloc);

      expect(state.selectedLanguage, 'ta');
      await bloc.close();
    });

    test('a ninth language served by the API reaches the picker unchanged',
        () async {
      // The payoff: adding a language server-side needs no app release.
      final bloc = _build(
        repo: _ScriptedUsersRepository(),
        languages: FakeLanguagesRepository(
          languages: const [
            ...FakeLanguagesRepository.defaultLanguages,
            LanguageOption(code: 'pa', nativeLabel: 'ਪੰਜਾਬੀ', englishLabel: 'Punjabi'),
          ],
        ),
      );

      final state = await _waitFor<NameLanguageIdle>(bloc);

      expect(state.languages, hasLength(9));
      expect(state.languages.last.code, 'pa');
      await bloc.close();
    });

    test('fetch failure → error state with an empty list, and Retry re-fetches',
        () async {
      var attempts = 0;
      final languages = FakeLanguagesRepository(onFetch: () async {
        attempts++;
        if (attempts == 1) throw ApiException('offline');
        return const LanguageCatalog(
          languages: FakeLanguagesRepository.defaultLanguages,
          defaultCode: 'hi',
        );
      });
      final bloc = _build(repo: _ScriptedUsersRepository(), languages: languages);

      final failed = await _waitFor<NameLanguageError>(bloc);
      // `isLanguagesFailure` is what the screen keys its Retry affordance off —
      // there is no bundled fallback list to fall back to.
      expect(failed.isLanguagesFailure, isTrue);
      expect(failed.languages, isEmpty);

      bloc.add(const LanguagesRequested());
      final recovered = await _waitFor<NameLanguageIdle>(bloc);

      expect(attempts, 2);
      expect(recovered.languages, hasLength(8));
      await bloc.close();
    });

    test('NameChanged updates state — Continue still gated on trim', () async {
      final bloc = _build(repo: _ScriptedUsersRepository());
      bloc.add(const NameChanged('   '));
      await _waitFor<NameLanguageIdle>(bloc);
      expect(bloc.state.name, '   ');
      expect(bloc.state.isFormValid, isFalse,
          reason: 'whitespace-only names are not valid');
      bloc.add(const NameChanged('Aarav'));
      await bloc.stream.firstWhere((s) => s.name == 'Aarav');
      expect(bloc.state.isFormValid, isTrue);
      await bloc.close();
    });

    test('LanguageSelected updates state + fires analytics', () async {
      final bloc = _build(repo: _ScriptedUsersRepository());
      bloc.add(const LanguageSelected('mr'));
      await bloc.stream.firstWhere((s) => s.selectedLanguage == 'mr');
      expect(bloc.state.selectedLanguage, 'mr');
      await bloc.close();
    });

    test('ContinueTapped with empty name → no updateMe call', () async {
      final repo = _ScriptedUsersRepository();
      final bloc = _build(repo: repo);
      bloc.add(const ContinueTapped());
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(repo.updateCalls, 0);
      await bloc.close();
    });

    test(
      'ContinueTapped success — updateMe called, Saved, orchestrator advanced',
      () async {
        final orchestrator = _OrchestratorSpy();
        final repo = _ScriptedUsersRepository(
          updateResponses: [
            () async => _meUser(name: 'Priya', language: 'mr'),
          ],
        );
        final bloc = _build(repo: repo, orchestrator: orchestrator);
        bloc.add(const NameChanged('Priya'));
        bloc.add(const LanguageSelected('mr'));
        await bloc.stream.firstWhere((s) => s.name == 'Priya');
        bloc.add(const ContinueTapped());
        final saved = await _waitFor<NameLanguageSaved>(bloc);
        expect(saved.name, 'Priya');
        expect(saved.selectedLanguage, 'mr');
        expect(repo.updateCalls, 1);
        expect(repo.lastName, 'Priya');
        expect(repo.lastLanguage, 'mr');
        expect(
          orchestrator.events.whereType<OnboardingStepCompleted>().length,
          1,
          reason: 'Orchestrator must be told the step is done',
        );
        expect(
          orchestrator.events
              .whereType<OnboardingStepCompleted>()
              .first
              .step,
          OnboardingStep.nameLanguageSaved,
        );
        await bloc.close();
      },
    );

    test('ContinueTapped failure — NameLanguageError, stays on screen',
        () async {
      final repo = _ScriptedUsersRepository(
        updateResponses: [
          () async => throw ApiException(
                'Something broke',
                errorCode: 'SERVER_ERROR',
                statusCode: 500,
              ),
        ],
      );
      final orchestrator = _OrchestratorSpy();
      final bloc = _build(repo: repo, orchestrator: orchestrator);
      bloc.add(const NameChanged('Ravi'));
      await bloc.stream.firstWhere((s) => s.name == 'Ravi');
      bloc.add(const ContinueTapped());
      final err = await _waitFor<NameLanguageError>(bloc);
      expect(err.name, 'Ravi');
      expect(err.errorCode, 'SERVER_ERROR');
      expect(orchestrator.events, isEmpty,
          reason: 'Orchestrator must NOT advance on failure');
      await bloc.close();
    });

    test('name_length_bucket helper never leaks raw name', () {
      expect(NameLanguageBloc.bucketForNameLength(0), '0');
      expect(NameLanguageBloc.bucketForNameLength(3), '1-3');
      expect(NameLanguageBloc.bucketForNameLength(6), '4-6');
      expect(NameLanguageBloc.bucketForNameLength(12), '7-12');
      expect(NameLanguageBloc.bucketForNameLength(50), '13+');
    });
  });
}
