import 'package:equatable/equatable.dart';

sealed class NameLanguageEvent extends Equatable {
  const NameLanguageEvent();

  @override
  List<Object?> get props => const [];
}

/// The user typed into the name field.
class NameChanged extends NameLanguageEvent {
  const NameChanged(this.name);
  final String name;

  @override
  List<Object?> get props => [name];
}

/// The user tapped a language card. Carries the ISO code (`hi`, `mr`, …).
class LanguageSelected extends NameLanguageEvent {
  const LanguageSelected(this.code);
  final String code;

  @override
  List<Object?> get props => [code];
}

/// The user tapped the Continue CTA.
class ContinueTapped extends NameLanguageEvent {
  const ContinueTapped();
}

/// Emitted once, from the widget's `initState` post-frame callback so the
/// `onboarding_language_screen_viewed` fires exactly once per mount rather than
/// per rebuild.
class ScreenViewed extends NameLanguageEvent {
  const ScreenViewed();
}

/// Load (or retry loading) the selectable languages from `GET /languages`. The
/// bloc dispatches this to itself on construction; the error state's Retry
/// re-dispatches it.
class LanguagesRequested extends NameLanguageEvent {
  const LanguagesRequested();
}
