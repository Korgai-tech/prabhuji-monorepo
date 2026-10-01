import 'package:dio/dio.dart';

/// Opt a request out of automatic `locale` injection.
///
/// Set `options.extra[kSkipLocale] = true` when the caller owns the locale and
/// its ABSENCE is meaningful — e.g. horoscope, whose locale comes from
/// `horoscopeLocaleProvider` (which defaults to `hi`), not from the user's
/// selected CONTENT language.
const String kSkipLocale = 'skipLocale';

/// Puts the user's selected content language on every GET as `?locale=`.
///
/// ## Why an interceptor and not a per-call parameter
///
/// Every content repository used to hand-write `'locale': ?_language()` into its
/// own `queryParameters` map — fourteen call sites. Six others simply forgot,
/// which is why Home banners/shortcuts/feed, Books home, Aarti main and Mantras
/// sections rendered English no matter what the user picked: the API supported
/// `locale` on all six and the app never sent it. One interceptor makes that
/// class of bug impossible — a new endpoint is localized by default.
///
/// ## Rules
///
///  - **GET only.** Writes don't take a locale; sending one would be noise.
///  - **Never overwrites.** A caller that already set `locale` (deity, paywall,
///    horoscope) wins — this only fills a gap.
///  - **Absence is preserved.** When the user has not chosen a language,
///    [language] returns null and the param is OMITTED, which the API reads as
///    "no language filter" (see `content_language.dart`). It is NOT defaulted to
///    `hi` here.
///
/// Safe to apply to endpoints that don't declare `locale`: no public querystring
/// schema in `apps/api` uses `.strict()`, so Zod strips unknown params.
Interceptor localeInterceptor(String? Function() language) {
  return InterceptorsWrapper(
    onRequest: (options, handler) {
      final wantsInjection = options.method.toUpperCase() == 'GET' &&
          options.extra[kSkipLocale] != true &&
          !options.queryParameters.containsKey('locale');
      if (wantsInjection) {
        final selected = language();
        if (selected != null) options.queryParameters['locale'] = selected;
      }
      handler.next(options);
    },
  );
}
