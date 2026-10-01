/// Cross-cutting analytics events — event names + property keys that live
/// outside any single feature module.
///
/// These events are NOT in Sheet 1 (User Flow Events) of the analytics
/// contract because they aggregate signal across multiple modules or
/// belong to app-wide infrastructure (deep-link intake, logout). Rather
/// than duplicate them across every feature's `<feature>_analytics.dart`,
/// they live here and every call site references these constants.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes
///
/// ### Share funnel (`share_initiated`)
///
/// The TAM-124 unified share-funnel event. Fires from every feature's
/// share flow BEFORE the OS share sheet opens, alongside the feature's
/// own `*_share_clicked` event (which stays for feature-specific views).
/// The funnel dashboard reads `share_initiated` for cross-feature
/// aggregation.
///
/// Call sites:
///  * `home_feed_card._share` — `source_screen: 'home_feed'`
///  * `aarti_player_bloc._onShareRequested` — `source_screen: 'aarti_player'`
///  * `mantras_player_bloc` / `wallpaper_preview_bloc` — parallel wiring
///  * `ringtone_preview_bloc` — `source_screen: 'ringtone_preview'`
///  * `status_share_bloc` — `source_screen: 'status_share'` (also carries
///    `share_target` for the story-vs-more-apps split)
///
/// Every emission carries `source_screen` + `target_type` + `target_id`.
///
/// ### Logout (`user_logged_out`)
///
/// Legacy logout event kept alongside the Sheet-1 `logout_clicked` /
/// `logout_result` events (owned by `profile_analytics.dart`). Fires
/// from `profile_menu_screen._handleLogout` after the AuthStore clear
/// cascade, before the router redirect.
///
/// ### Deep-link intake (`deep_link_*`)
///
/// The deep-link service ([`deep_link_service.dart`]) fires these
/// events as URIs move through its dispatch tree:
///
///  * `deep_link_received` — every URI arrival (cold_start / warm_resume).
///    Carries `source`, `type`, `target_id` (per target subclass), plus
///    the target's attribution map (`ref`, `utm_source`, …).
///  * `deep_link_paywall_shown` — non-Pro user's URI is gated by the
///    paywall interstitial. Carries `type`.
///  * `deep_link_replayed` — a previously-parked pending intent is
///    replayed post-onboarding or post-paywall-pop. Carries `uri`,
///    `type`, and the target's attribution map.
class SharedAnalyticsEvents {
  SharedAnalyticsEvents._();

  // Share funnel -------------------------------------------------------------
  static const String shareInitiated = 'share_initiated';

  // Logout -------------------------------------------------------------------
  static const String userLoggedOut = 'user_logged_out';

  // Deep-link intake ---------------------------------------------------------
  static const String deepLinkReceived = 'deep_link_received';
  static const String deepLinkPaywallShown = 'deep_link_paywall_shown';
  static const String deepLinkReplayed = 'deep_link_replayed';
}

/// Canonical property-key names for cross-cutting events. Reused across
/// call sites so a value name like `source_screen` lives in one place.
class SharedAnalyticsEventProps {
  SharedAnalyticsEventProps._();

  // Share funnel
  static const String sourceScreen = 'source_screen';
  static const String targetType = 'target_type';
  static const String targetId = 'target_id';
  static const String shareTarget = 'share_target';

  // Deep-link intake
  static const String source = 'source';
  static const String type = 'type';
  static const String uri = 'uri';
}
