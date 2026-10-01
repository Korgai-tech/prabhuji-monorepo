// Explicit named params — see the equivalent note on the orchestrator bloc.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../api/api_client.dart';
import '../../../../core/analytics.dart';
import '../../../../core/session_context.dart';
import '../../bloc/onboarding_orchestrator_bloc.dart';
import '../../bloc/onboarding_orchestrator_event.dart';
import '../../data/languages_repository.dart';
import '../../data/users_repository.dart';
import '../../onboarding_analytics.dart';
import 'name_language_event.dart';
import 'name_language_state.dart';

/// PRD §6.5 — the Name + Language screen bloc.
///
/// Per-navigation factory (registered as a factory in `service_locator.dart`).
/// Starts in [NameLanguageLoading] and fetches the selectable languages from
/// `GET /languages`; the app ships NO hardcoded list. Once loaded, the server's
/// `defaultCode` is pre-selected so the Continue CTA only needs the name.
///
/// On successful save:
///  1. Emits [NameLanguageSaved]
///  2. Fires `orchestrator.add(OnboardingStepCompleted(nameLanguageSaved))` so
///     the orchestrator re-resolves and the router hops us forward.
///
/// Never emits or logs the raw name — analytics carry only `name_length_bucket`
/// and `name_present`.
class NameLanguageBloc extends Bloc<NameLanguageEvent, NameLanguageState> {
  NameLanguageBloc({
    required UsersRepository usersRepository,
    required LanguagesRepository languagesRepository,
    required OnboardingOrchestratorBloc orchestrator,
    Analytics? analytics,
    SessionContext? sessionContext,
    bool nameRequired = true,
    bool pickLanguage = true,
  })  : _usersRepository = usersRepository,
        _languagesRepository = languagesRepository,
        _orchestrator = orchestrator,
        _analytics = analytics,
        _sessionContext = sessionContext,
        _nameRequired = nameRequired,
        _pickLanguage = pickLanguage,
        super(const NameLanguageLoading()) {
    on<ScreenViewed>(_onScreenViewed);
    on<LanguagesRequested>(_onLanguagesRequested);
    on<NameChanged>(_onNameChanged);
    on<LanguageSelected>(_onLanguageSelected);
    on<ContinueTapped>(_onContinueTapped);
    add(const LanguagesRequested());
  }

  final UsersRepository _usersRepository;
  final LanguagesRepository _languagesRepository;
  final OnboardingOrchestratorBloc _orchestrator;
  final Analytics? _analytics;
  final SessionContext? _sessionContext;

  /// True in the onboarding flow (screen shows the name field and requires a
  /// non-empty name to submit). False in the profile-triggered language-only
  /// flow (name field hidden; a language is always pre-selected so the CTA is
  /// enabled immediately, and the save PATCH sends language only).
  final bool _nameRequired;

  bool get nameRequired => _nameRequired;

  /// True when the language grid should be rendered and the user chooses their
  /// own language (the profile-triggered flow). False during onboarding, where
  /// the language step has been removed and every new user silently gets the
  /// default (`hi`) — the server marks onboarding complete once BOTH `name` and
  /// `selectedLanguage` are non-null (`users.service.ts::updateMe`), so the
  /// save PATCH still carries `selectedLanguage: 'hi'`. When false, the
  /// `/languages` fetch is skipped entirely — no round-trip, no loading state,
  /// no dependence on that endpoint being reachable.
  final bool _pickLanguage;

  bool get pickLanguage => _pickLanguage;

  /// The language code stamped onto the user's row when the onboarding flow
  /// no longer asks them to pick one. Matches the server's
  /// `DEFAULT_LANGUAGE_CODE` in `shared/language.schema.ts`, so a user who
  /// silently gets this default sees the same content the server would have
  /// resolved by default anyway.
  static const _defaultOnboardingLanguage = 'hi';

  /// Buckets the name length for analytics. NEVER emit raw name. Kept
  /// public because the PII-leak guardrail test asserts on it.
  static String bucketForNameLength(int length) {
    if (length <= 0) return '0';
    if (length <= 3) return '1-3';
    if (length <= 6) return '4-6';
    if (length <= 12) return '7-12';
    return '13+';
  }

  /// Wall clock at the first `ScreenViewed` — stamps
  /// `completion_time_seconds` on the row 16 save-result event.
  final Stopwatch _onboardingStopwatch = Stopwatch()..start();

  void _onScreenViewed(ScreenViewed event, Emitter<NameLanguageState> emit) {
    // `onboarding_language_screen_viewed` was dropped as an orphan (not
    // on Sheet 1 rows 4–16). The screen still gets a bloc-level `initState`
    // hook because the completion-timer needs a stable start reference —
    // reset it here so the row-16 `completion_time_seconds` measures
    // time-on-this-step rather than time-since-bloc-construction.
    _onboardingStopwatch
      ..reset()
      ..start();
  }

  /// Loads the selectable languages. On failure the screen is unusable — there
  /// is no bundled fallback — so this emits [NameLanguageError] with an empty
  /// `languages`, which the screen renders as a retry affordance.
  Future<void> _onLanguagesRequested(
    LanguagesRequested event,
    Emitter<NameLanguageState> emit,
  ) async {
    // Onboarding no longer asks the user to pick a language — silently seed
    // the default so the save PATCH still carries a `selectedLanguage` (which
    // is what causes the server to flip `onboardingCompletedAt` on the write).
    // No `/languages` fetch: skipping the round-trip also means the flow no
    // longer breaks when that endpoint isn't yet on the deployed server.
    if (!_pickLanguage) {
      emit(NameLanguageIdle(
        name: state.name,
        selectedLanguage: _defaultOnboardingLanguage,
        languages: const [],
      ));
      return;
    }
    emit(NameLanguageLoading(name: state.name));
    try {
      final catalog = await _languagesRepository.fetchLanguages();

      // The language-only flow re-opens on an already-chosen language; keep it
      // if the server still offers it, else fall back to the server's default.
      final stored = _sessionContext?.selectedLanguage;
      final keepStored = !_nameRequired &&
          stored != null &&
          stored.isNotEmpty &&
          catalog.languages.any((l) => l.code == stored);

      emit(NameLanguageIdle(
        name: state.name,
        selectedLanguage: keepStored ? stored : catalog.defaultCode,
        languages: catalog.languages,
      ));
    } catch (error) {
      emit(NameLanguageError(
        name: state.name,
        selectedLanguage: '',
        message: error is ApiException
            ? error.message
            : 'Could not load languages. Please try again.',
        errorCode: error is ApiException ? error.errorCode : null,
      ));
    }
  }

  void _onNameChanged(NameChanged event, Emitter<NameLanguageState> emit) {
    // Any subsequent typing clears an error state and returns to Idle so the
    // CTA re-enables.
    emit(NameLanguageIdle(
      name: event.name,
      selectedLanguage: state.selectedLanguage,
      languages: state.languages,
    ));
    // `onboarding_name_field_completed` was dropped as an orphan (not on
    // Sheet 1 rows 4–16). The row-16 `onboarding_profile_save_result`
    // event carries `name_present` on save, which covers the funnel.
  }

  void _onLanguageSelected(
    LanguageSelected event,
    Emitter<NameLanguageState> emit,
  ) {
    emit(NameLanguageIdle(
      name: state.name,
      selectedLanguage: event.code,
      languages: state.languages,
    ));
    // `onboarding_language_selected` was dropped as an orphan (not on
    // Sheet 1 rows 4–16). The row-16 `onboarding_profile_save_result`
    // event carries `language_code` on save, which captures the final
    // language decision.
  }

  Future<void> _onContinueTapped(
    ContinueTapped event,
    Emitter<NameLanguageState> emit,
  ) async {
    final trimmed = state.name.trim();
    final languageCode = state.selectedLanguage;
    final isFormValid = (!_nameRequired || trimmed.isNotEmpty) &&
        languageCode.isNotEmpty;

    // `onboarding_language_continue_tapped` was dropped as an orphan
    // (not on Sheet 1 rows 4–16). The row-16 `onboarding_profile_save_result`
    // fires from the save branches below with `result` + `error_code`.

    if (!isFormValid) return;
    if (state is NameLanguageSaving) return;

    emit(NameLanguageSaving(
      name: trimmed,
      selectedLanguage: languageCode,
      languages: state.languages,
    ));

    try {
      await _usersRepository.updateMe(
        // Language-only flow: omit the name so the server leaves it untouched.
        name: _nameRequired ? trimmed : null,
        // The raw code, straight from the server-supplied picker — see
        // `UsersRepository.updateMe` for why this must not go through the
        // generated enum.
        selectedLanguage: languageCode,
      );

      // Persist the new language into the shared session context so subsequent
      // localized API calls pick it up on their next fresh read (content feeds
      // read this via `selectedContentLanguage()`; the paywall/deity/horoscope
      // path caches `selectedLocaleProvider` and needs the screen to invalidate
      // it after save — see the language screen listener).
      _sessionContext?.selectedLanguage = languageCode;

      _onboardingStopwatch.stop();

      // Sheet 1 row 16 — `onboarding_profile_save_result`. Only fires in
      // the onboarding flow (`_nameRequired: true`). The language-only
      // profile-menu flow reuses this bloc but is NOT an onboarding
      // completion, so it's excluded from the funnel event.
      if (_nameRequired) {
        unawaited(_analytics?.trackEvent(
          OnboardingEvents.onboardingProfileSaveResult,
          properties: <String, Object?>{
            OnboardingEventProps.result: OnboardingEventProps.resultSuccess,
            OnboardingEventProps.errorCode: null,
            OnboardingEventProps.languageCode: languageCode,
            OnboardingEventProps.namePresent: trimmed.isNotEmpty,
            OnboardingEventProps.completionTimeSeconds:
                _onboardingStopwatch.elapsed.inSeconds,
          },
        ));
      }

      emit(NameLanguageSaved(
        name: trimmed,
        selectedLanguage: languageCode,
        languages: state.languages,
      ));

      if (_nameRequired) {
        // Advance the orchestrator — it will re-resolve to paywall (free) or
        // home (unlikely, since the user just onboarded). Language-only flow
        // skips this so it doesn't reopen the paywall on every language change.
        _orchestrator.add(
          const OnboardingStepCompleted(OnboardingStep.nameLanguageSaved),
        );
      }
    } catch (error) {
      final code = error is ApiException ? error.errorCode : null;
      final message = error is ApiException
          ? error.message
          : 'Something went wrong. Please try again.';

      _onboardingStopwatch.stop();

      if (_nameRequired) {
        unawaited(_analytics?.trackEvent(
          OnboardingEvents.onboardingProfileSaveResult,
          properties: <String, Object?>{
            OnboardingEventProps.result: OnboardingEventProps.resultFailure,
            OnboardingEventProps.errorCode: code ?? 'NETWORK_ERROR',
            OnboardingEventProps.languageCode: languageCode,
            OnboardingEventProps.namePresent: trimmed.isNotEmpty,
            OnboardingEventProps.completionTimeSeconds:
                _onboardingStopwatch.elapsed.inSeconds,
          },
        ));
      }

      emit(NameLanguageError(
        name: state.name,
        selectedLanguage: languageCode,
        message: message,
        errorCode: code,
        // Retained so `isLanguagesFailure` reads false — this is a SAVE
        // failure; the grid stays rendered and Retry re-submits.
        languages: state.languages,
      ));
    }
  }
}
