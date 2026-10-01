import 'package:equatable/equatable.dart';

/// One selectable language (PRD §6.5), as served by `GET /languages`.
///
/// `code` matches the backend's `LanguageCodeSchema` (TAM-44). `nativeLabel` is
/// the label rendered in the language's own script; `englishLabel` is a small
/// disambiguating label rendered below it.
class LanguageOption extends Equatable {
  const LanguageOption({
    required this.code,
    required this.nativeLabel,
    required this.englishLabel,
  });

  final String code;
  final String nativeLabel;
  final String englishLabel;

  @override
  List<Object?> get props => [code, nativeLabel, englishLabel];
}

sealed class NameLanguageState extends Equatable {
  const NameLanguageState({
    required this.name,
    required this.selectedLanguage,
    this.languages = const <LanguageOption>[],
  });

  final String name;
  final String selectedLanguage;

  /// The selectable languages, from `GET /languages`. EMPTY until the fetch
  /// resolves — the app ships no fallback list, because the screen is only
  /// reachable post-OTP and cannot be completed without `PATCH /users/me`, so a
  /// baked-in list would only let someone pick a language and then fail to save.
  final List<LanguageOption> languages;

  /// The screen's Continue CTA is enabled when the name (trimmed) is non-empty
  /// AND a language is selected. `selectedLanguage` is pre-filled from the
  /// server's `defaultCode`, so the gate reduces to "name is non-empty".
  bool get isFormValid =>
      name.trim().isNotEmpty && selectedLanguage.isNotEmpty;

  @override
  List<Object?> get props => [name, selectedLanguage, languages];
}

/// The `GET /languages` fetch is in flight — the grid shows a spinner. There is
/// nothing to render before it resolves.
class NameLanguageLoading extends NameLanguageState {
  const NameLanguageLoading({
    super.name = '',
    super.selectedLanguage = '',
  });
}

/// Idle — waiting for the user to type / pick. Emitted after every field
/// change so `BlocBuilder` rebuilds the CTA enabled state.
class NameLanguageIdle extends NameLanguageState {
  const NameLanguageIdle({
    super.name = '',
    super.selectedLanguage = '',
    super.languages,
  });
}

/// A `PATCH /users/me` is in flight — CTA shows a spinner, inputs are locked.
class NameLanguageSaving extends NameLanguageState {
  const NameLanguageSaving({
    required super.name,
    required super.selectedLanguage,
    super.languages,
  });
}

/// Save succeeded. The paywall screen is the target — the widget uses this
/// as a safety-net redirect trigger; the orchestrator's `OnboardingStepCompleted`
/// dispatch normally beats it.
class NameLanguageSaved extends NameLanguageState {
  const NameLanguageSaved({
    required super.name,
    required super.selectedLanguage,
    super.languages,
  });
}

/// Save OR the language fetch failed — keep the user on the screen with a retry
/// affordance. The spec explicitly says do NOT navigate on save failure.
class NameLanguageError extends NameLanguageState {
  const NameLanguageError({
    required super.name,
    required super.selectedLanguage,
    required this.message,
    this.errorCode,
    super.languages,
  });

  final String message;
  final String? errorCode;

  /// True when the LANGUAGE LIST could not be loaded, so the screen is unusable
  /// and the retry must re-fetch rather than re-save.
  bool get isLanguagesFailure => languages.isEmpty;

  @override
  List<Object?> get props =>
      [name, selectedLanguage, languages, message, errorCode];
}
