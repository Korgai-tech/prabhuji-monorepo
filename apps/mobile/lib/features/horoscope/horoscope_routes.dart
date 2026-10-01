/// go_router paths for the Horoscope module (TAM-74).
///
/// Like Status (and unlike Aarti/Mantras/Ringtone/Wallpaper), the module's entry
/// screen IS a shell branch — Figma `371:3796` renders the five-item bottom nav
/// with Horoscope active, so the grid lives INSIDE the TAM-58
/// `StatefulShellRoute`. The result flow pushes OVER the shell: its frame
/// (`387:2571`) has the nav component `visible:false` and carries its own back
/// arrow.
class HoroscopeRoutes {
  HoroscopeRoutes._();

  /// Module entry — the shell's Horoscope branch (bottom-nav tab + Home CTA).
  static const String main = '/horoscope';

  /// The Pro-gated daily result for one sign. Pushed over the shell.
  static const String resultPattern = '/horoscope/result/:zodiacId';

  /// Build the result path for [zodiacId].
  static String result(String zodiacId) => '/horoscope/result/$zodiacId';
}

/// TAM-164 — user-visible rename of the Horoscope module to **Rashifal** (the
/// Hindi term the app already uses in copy). This class is the canonical
/// route-constant vocabulary for the shell / nav after the rename; the
/// underlying paths intentionally stay `/horoscope` so already-shared deep
/// links keep resolving. Analytics `destination_screen` / route names / labels
/// use "rashifal" now.
///
/// [HoroscopeRoutes] is retained (unmodified) so the module's own internal
/// call sites (main-screen tap handler → result screen) do not churn in the
/// same PR as the shell rename.
class RashifalRoutes {
  RashifalRoutes._();

  /// Module entry — the shell's Rashifal branch (bottom-nav tab + Home CTA).
  /// Aliases [HoroscopeRoutes.main] to preserve deep-link continuity.
  static const String main = HoroscopeRoutes.main;

  /// The Pro-gated daily result for one sign. Pushed over the shell.
  static const String resultPattern = HoroscopeRoutes.resultPattern;

  /// Build the result path for [zodiacId].
  static String result(String zodiacId) => HoroscopeRoutes.result(zodiacId);
}
