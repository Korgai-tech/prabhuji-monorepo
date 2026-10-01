/// In-memory holder for the shared session facts the analytics enricher
/// stamps onto every event (PRD §9, TAM-55).
///
/// Blocs write to this via public setters; the enricher reads. Kept
/// intentionally dumb — no persistence, no reactivity, no equality — so a
/// bloc mutation is cheap and the enricher's read is always O(1) for the
/// fire-and-forget analytics path.
///
/// Nullable everywhere: cold-start (before OTP verify) has no user id,
/// pre-paywall has no config version. The enricher passes nulls through so
/// the downstream warehouse sees explicit absence, not a fabricated value.
///
/// Registered as a get_it singleton in `service_locator.dart`; the same
/// instance is passed into [AnalyticsEnricher.init] so writes are immediately
/// visible on the next `trackEvent` call.
class SessionContext {
  SessionContext();

  /// The signed-in user id (JWT `sub`). Written by the orchestrator on the
  /// first successful `/users/me` call. `null` before OTP verify.
  String? userId;

  /// User's selected language (ISO code — `hi`, `mr`, …). Written by the
  /// orchestrator when `/users/me` returns a persisted preference AND by the
  /// name+language bloc on save.
  String? selectedLanguage;

  /// Latest `/subscription/status` value from the orchestrator — one of
  /// `free`, `active`, `pending`, `cancelled`, `expired`, etc. `null` before
  /// the first subscription check.
  String? subscriptionStatus;

  /// Flipped true once the user has passed the name+language save (i.e. the
  /// orchestrator saw `onboardingCompletedAt`). Persisted only in memory —
  /// the orchestrator re-derives it from `/users/me` on cold start.
  bool hasCompletedOnboarding = false;

  /// Latest paywall config version seen (from `PaywallReady`). Rides on
  /// every subsequent event as `config_version` even after the paywall is
  /// closed, so a downstream `paywall_pay_now_tapped` can be joined back to
  /// the config that displayed the plans.
  int? paywallConfigVersion;

  /// Latest paywall id seen (from `PaywallReady`) — the CMS-authored key
  /// (e.g. `vip-membership-v1`, `vip-carousel-v1`). Written the moment
  /// `_onConfigRequested` emits Ready, alongside [paywallConfigVersion] +
  /// [paywallLayout]. Rides on every subsequent paywall / payment analytics
  /// event so the warehouse can attribute funnel steps to a specific A/B
  /// variant — TAM-160.
  String? paywallId;

  /// Latest paywall layout key seen (from `PaywallReady`) — the render-shape
  /// discriminator (`card_hero`, `video_bleed`, `icon_grid`, `carousel`).
  /// Written the moment `_onConfigRequested` emits Ready. Emitted as
  /// `paywall_layout` on every paywall / payment analytics event — TAM-160.
  String? paywallLayout;

  /// `'cold_start'` on the first launch, `'resume'` after the first
  /// AppLifecycleState.resumed observed on the same process. Flipped via
  /// [markResume]; safe to call more than once.
  ///
  /// Emitted as `entry_source` on every event by [AnalyticsEnricher] — the
  /// name matches the analytics contract (Sheet 2 common properties).
  String entrySource = 'cold_start';

  /// Flip [entrySource] to `'resume'`. Called from the app-level lifecycle
  /// observer when the process is brought to the foreground after a
  /// backgrounded state. Idempotent.
  void markResume() {
    entrySource = 'resume';
  }
}
