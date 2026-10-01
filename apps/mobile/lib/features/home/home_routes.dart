/// go_router paths for Home (TAM-62).
///
/// Home IS the shell's first branch (TAM-58 `StatefulShellRoute`, branch 0) —
/// Figma `750:6252` renders the five-item bottom nav with Home active, so the
/// screen lives INSIDE the shell and keeps its own stack + scroll position
/// across tab switches. Every module it links to either pushes over the shell
/// (Aarti/Mantras/Ringtone/Wallpaper) or is another branch (Status/Horoscope/
/// Books) — see `HomeDestinations`.
class HomeRoutes {
  HomeRoutes._();

  /// Module entry — the shell's Home tab.
  static const String home = '/home';

  /// Profile v2 opened from the home header avatar (TAM-N-profile-v2). The
  /// v2 layout adds the identity block (avatar + name + phone) above the
  /// existing legal / language / log-out rows and gains a Support tile.
  static const String profile = '/profile';

  /// Edit Profile screen (TAM-N-profile-v2, Figma `1527:10036`). Personal-
  /// only name + avatar edit; phone is display-only in v2.
  static const String editProfile = '/profile/edit';

  /// Manage Subscription details screen (TAM-125, Figma `1939:19854` active /
  /// `1939:20420` cancellation-scheduled). Reachable ONLY from the Profile
  /// v2 "Manage Subscription" tile — not deep-linkable in this ticket. Free-
  /// tier users bounce to /paywall (guarded at the call site).
  static const String subscription = '/profile/subscription';

  /// Language-only variant of the name+language screen, opened from the profile
  /// menu. Reuses the onboarding screen with the name field hidden and the
  /// CTA reused as a "Save" action that writes back through `PATCH /users/me`.
  static const String language = '/language';

  /// Account/Settings, opened from the profile avatar in a future phase.
  static const String? account = null;

  /// Help & Support (see [account] for why this is null in Phase 1).
  static const String? help = null;
}
