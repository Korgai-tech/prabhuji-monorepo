import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'service_locator.dart';
import 'session_context.dart';

/// The user's selected content language (`User.selectedLanguage` — ISO code
/// `hi`, `mr`, …), resolved for the content-feed language filter (TAM-108).
///
/// The API now filters each feed by LANGUAGE MEMBERSHIP: an item shows when the
/// requested locale is in its `languages` set OR its set is empty (= every
/// language). The mobile app must send the user's choice so the filter actually
/// runs — but ABSENCE is meaningful: sending nothing tells the server to return
/// all languages. So this returns `null` (not a `hi` default) when the user has
/// not chosen a language yet; the repositories omit the query param on `null`.
///
/// Reads [SessionContext] fresh on every call — it is the app's existing home
/// for this fact (the onboarding orchestrator writes it from `GET /users/me` on
/// cold start; the name+language bloc writes it on save) and is deliberately
/// non-reactive, so a plain read (never a cached provider value) is what keeps a
/// later language change visible to the next feed request.
///
/// Contrast `horoscopeLocaleProvider`, which defaults to `hi`: horoscope MUST
/// pick a voice locale, so absence collapses to the onboarding default there.
/// Content feeds instead treat absence as "no filter", so this stays nullable.
String? selectedContentLanguage() {
  final context = serviceLocator.isRegistered<SessionContext>()
      ? serviceLocator<SessionContext>()
      : null;
  final selected = context?.selectedLanguage;
  return (selected == null || selected.isEmpty) ? null : selected;
}

/// The resolver the content-feed repository providers inject into their
/// dio-backed impls (a tear-off of [selectedContentLanguage]). Exposed as a
/// provider so a widget/bloc harness can override the resolved language without
/// standing up a [SessionContext]; the repositories themselves stay ignorant of
/// where the language comes from — they just call the injected getter.
final contentLanguageResolverProvider = Provider<String? Function()>(
  (ref) => selectedContentLanguage,
);
