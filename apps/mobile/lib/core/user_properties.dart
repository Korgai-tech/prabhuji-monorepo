import 'dart:async';

import 'analytics.dart';

/// The exhaustive set of user-property keys from the analytics contract
/// (Sheet 3: User Properties). Every `identifyUser({set/setOnce})` call in
/// the app MUST use these constants — never a string literal — so the
/// warehouse keys stay in one place and rename churn is grep-safe.
///
/// The lifecycle for each key (setOnce vs set vs server-populated) is
/// encoded in the corresponding method on [UserPropertiesTracker] below.
class UserProperty {
  UserProperty._();

  // Identity ------------------------------------------------------------------
  /// Attached via `Analytics.setUser(...)`, NOT as an identify property — the
  /// Amplitude SDK binds it as the identity dimension so every event carries
  /// it automatically. Kept in this list only for documentation completeness.
  static const String userId = 'user_id';

  // Account tenure ------------------------------------------------------------
  static const String accountCreatedAt = 'account_created_at';
  static const String onboardingCompleted = 'onboarding_completed';
  static const String onboardingCompletedAt = 'onboarding_completed_at';

  // Content / preferences -----------------------------------------------------
  static const String selectedLanguage = 'selected_language';

  // Subscription --------------------------------------------------------------
  static const String subscriptionStatus = 'subscription_status';
  static const String subscriptionPlanId = 'subscription_plan_id';
  static const String subscriptionStartedAt = 'subscription_started_at';
  static const String subscriptionExpiresAt = 'subscription_expires_at';
  static const String firstPaidAt = 'first_paid_at';

  // Acquisition (install-referrer / first-touch) ------------------------------
  static const String acquisitionSource = 'acquisition_source';
  static const String acquisitionCampaign = 'acquisition_campaign';

  // Engagement (server-tracked — client mirrors after /users/me refresh) ------
  static const String firstAppOpenAt = 'first_app_open_at';
  static const String lastAppOpenAt = 'last_app_open_at';
  static const String totalSessions = 'total_sessions';
  static const String lastActiveModule = 'last_active_module';

  // Derived (server-owned — client never sets) --------------------------------
  static const String preferredContentType = 'preferred_content_type';
  static const String preferredDeityId = 'preferred_deity_id';

  // Feature-activation flags (client observes first success, setOnce true) ---
  static const String hasCompletedAudio = 'has_completed_audio';
  static const String hasSharedContent = 'has_shared_content';
  static const String hasSetRingtone = 'has_set_ringtone';
  static const String hasSetWallpaper = 'has_set_wallpaper';
}

/// One-value enum of module names used across:
///  * [UserProperty.lastActiveModule] on the identify stream, and
///  * `PaywallArgs.triggerModule` / the `trigger_module` property on every
///    payment event (Sheet 1 rows 17–19 + the Frontend Payment Events).
/// Kept centralised so a warehouse aggregation doesn't have to canonicalise
/// loose strings. `books` is here because Books can still push the paywall
/// even though the module itself no longer emits any Sheet-1 events.
class UserPropertyModule {
  UserPropertyModule._();
  static const String aartiBhajans = 'aarti_bhajans';
  static const String mantrasStutis = 'mantras_stutis';
  static const String statusSharing = 'status_sharing';
  static const String horoscope = 'horoscope';
  static const String ringtone = 'ringtone';
  static const String wallpaper = 'wallpaper';
  static const String home = 'home';
  static const String profile = 'profile';
  static const String books = 'books';
  // Chat (TAM-166 Phase 1) — paywall trigger_module value for
  // chat-entry paywall opens (bottom-nav tab tap for non-Pro users,
  // "Mata Se Baat Karein" tap on the kuldevta result screen). Paired
  // with `PaywallTriggerAction.openChat` and
  // `PaywallEntrySource.chat`.
  static const String chat = 'chat';
  // Used only as `trigger_module` on the paywall that opens right after
  // login/onboarding lands the user on Home — no feature module behind it.
  static const String login = 'login';
  // Used only as `trigger_module` on the paywall interstitial pushed by a
  // deep-link arrival — the actual feature target rides on `entry_source`.
  static const String deepLink = 'deep_link';
  // Same, for the paywall pushed by a push-notification tap.
  static const String notification = 'notification';
  // Used as `trigger_module` fallback when the paywall opens without any
  // explicit call-site attribution (cold-start orchestrator, notification
  // tap, WebView / payment-return re-entry).
  static const String appOpen = 'app_open';
}

/// Snapshot of the server-owned user-profile fields that we mirror onto the
/// user property stream after every `/users/me` (and equivalent) fetch. Every
/// field is nullable — the backend is rolling out these keys incrementally
/// (see `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md`), so absent-means-unknown.
///
/// Kept a plain value type (no methods) so any layer can construct one from
/// its own DTO without a dependency on the generated model.
class ServerUserProfileSnapshot {
  const ServerUserProfileSnapshot({
    this.accountCreatedAt,
    this.firstAppOpenAt,
    this.lastAppOpenAt,
    this.totalSessions,
    this.lastActiveModule,
    this.firstPaidAt,
    this.subscriptionPlanId,
    this.subscriptionStartedAt,
    this.subscriptionExpiresAt,
    this.acquisitionSource,
    this.acquisitionCampaign,
    this.preferredContentType,
    this.preferredDeityId,
  });

  final DateTime? accountCreatedAt;
  final DateTime? firstAppOpenAt;
  final DateTime? lastAppOpenAt;
  final int? totalSessions;
  final String? lastActiveModule;
  final DateTime? firstPaidAt;
  final String? subscriptionPlanId;
  final DateTime? subscriptionStartedAt;
  final DateTime? subscriptionExpiresAt;
  final String? acquisitionSource;
  final String? acquisitionCampaign;
  final String? preferredContentType;
  final String? preferredDeityId;
}

/// Lifecycle-hook facade over [Analytics.identifyUser] — the ONLY place in
/// the app that writes user properties. Every touchpoint (login, module open,
/// audio completion, subscription change, …) calls a semantically-named
/// method here; the tracker owns the setOnce-vs-set split so callers don't
/// have to remember which key is which.
///
/// Client vs server ownership (per plan v2, based on the user's directive
/// "keep server-tracked properties on the server; fetch at app start, update
/// on action, refetch next start"):
///
///  * **Client-owned** — set directly from client-observed state (login JWT,
///    entitlement changes, first-time success flags). Fires immediately.
///  * **Server-tracked** — the client mirrors what the server tells it via
///    [applyServerSnapshot]. On any qualifying action the client also POSTs
///    to the (still-to-be-built) `/users/me/activity` endpoint AND updates
///    the mirrored value locally so the next event carries the fresh number.
///  * **Server-derived** (`preferred_content_type`, `preferred_deity_id`) —
///    warehouse-computed; client never sets, only mirrors.
///
/// Fire-and-forget everywhere — `Analytics.identifyUser` is already null-safe
/// via the deduper, and this class wraps it with `unawaited`. Analytics
/// must never block or break the caller.
class UserPropertiesTracker {
  UserPropertiesTracker(this._analytics);

  final Analytics? _analytics;

  /// Called at the moment login completes (or session restores on cold
  /// start). Emits everything the client already knows about the user in a
  /// single identify payload — `user_id` is bound separately via
  /// [Analytics.setUser] which the caller invokes alongside.
  ///
  /// The server-mirrored snapshot ([server]) is optional — pass whatever
  /// fields your `/users/me` response carries; missing keys are simply
  /// omitted from the identify payload (nulls degrade cleanly at the
  /// warehouse side and the deduper suppresses no-op resends).
  void onLogin({
    required String selectedLanguage,
    required DateTime? onboardingCompletedAt,
    required String? subscriptionStatus,
    ServerUserProfileSnapshot? server,
  }) {
    final now = DateTime.now().toUtc();
    final setOnce = <String, Object?>{
      if (server?.accountCreatedAt != null)
        UserProperty.accountCreatedAt: server!.accountCreatedAt!.toIso8601String(),
      if (server?.firstAppOpenAt != null)
        UserProperty.firstAppOpenAt: server!.firstAppOpenAt!.toIso8601String(),
      if (server?.firstPaidAt != null)
        UserProperty.firstPaidAt: server!.firstPaidAt!.toIso8601String(),
      if (server?.acquisitionSource != null)
        UserProperty.acquisitionSource: server!.acquisitionSource,
      if (server?.acquisitionCampaign != null)
        UserProperty.acquisitionCampaign: server!.acquisitionCampaign,
    };
    final set = <String, Object?>{
      UserProperty.selectedLanguage: selectedLanguage,
      UserProperty.onboardingCompleted: onboardingCompletedAt != null,
      if (onboardingCompletedAt != null)
        UserProperty.onboardingCompletedAt:
            onboardingCompletedAt.toIso8601String(),
      UserProperty.subscriptionStatus: ?subscriptionStatus,
      // Server-mirrored on this call. Subsequent calls to
      // [applyServerSnapshot] refresh these independently.
      if (server?.subscriptionPlanId != null)
        UserProperty.subscriptionPlanId: server!.subscriptionPlanId,
      if (server?.subscriptionStartedAt != null)
        UserProperty.subscriptionStartedAt:
            server!.subscriptionStartedAt!.toIso8601String(),
      if (server?.subscriptionExpiresAt != null)
        UserProperty.subscriptionExpiresAt:
            server!.subscriptionExpiresAt!.toIso8601String(),
      if (server?.totalSessions != null)
        UserProperty.totalSessions: server!.totalSessions,
      if (server?.lastAppOpenAt != null)
        UserProperty.lastAppOpenAt: server!.lastAppOpenAt!.toIso8601String(),
      if (server?.lastActiveModule != null)
        UserProperty.lastActiveModule: server!.lastActiveModule,
      if (server?.preferredContentType != null)
        UserProperty.preferredContentType: server!.preferredContentType,
      if (server?.preferredDeityId != null)
        UserProperty.preferredDeityId: server!.preferredDeityId,
      // Client-side "we just opened the app" write. Server will overwrite on
      // next `/users/me` fetch if it disagrees.
      UserProperty.lastAppOpenAt: now.toIso8601String(),
    };
    unawaited(_analytics?.identifyUser(set: set, setOnce: setOnce));
  }

  /// Called after every `/users/me` (or activity POST) that returns fresh
  /// server-owned values. Only the fields present on [snapshot] are
  /// forwarded; the deduper suppresses no-op resends.
  void applyServerSnapshot(ServerUserProfileSnapshot snapshot) {
    final set = <String, Object?>{
      if (snapshot.subscriptionPlanId != null)
        UserProperty.subscriptionPlanId: snapshot.subscriptionPlanId,
      if (snapshot.subscriptionStartedAt != null)
        UserProperty.subscriptionStartedAt:
            snapshot.subscriptionStartedAt!.toIso8601String(),
      if (snapshot.subscriptionExpiresAt != null)
        UserProperty.subscriptionExpiresAt:
            snapshot.subscriptionExpiresAt!.toIso8601String(),
      if (snapshot.totalSessions != null)
        UserProperty.totalSessions: snapshot.totalSessions,
      if (snapshot.lastAppOpenAt != null)
        UserProperty.lastAppOpenAt: snapshot.lastAppOpenAt!.toIso8601String(),
      if (snapshot.lastActiveModule != null)
        UserProperty.lastActiveModule: snapshot.lastActiveModule,
      if (snapshot.preferredContentType != null)
        UserProperty.preferredContentType: snapshot.preferredContentType,
      if (snapshot.preferredDeityId != null)
        UserProperty.preferredDeityId: snapshot.preferredDeityId,
    };
    final setOnce = <String, Object?>{
      if (snapshot.accountCreatedAt != null)
        UserProperty.accountCreatedAt:
            snapshot.accountCreatedAt!.toIso8601String(),
      if (snapshot.firstAppOpenAt != null)
        UserProperty.firstAppOpenAt:
            snapshot.firstAppOpenAt!.toIso8601String(),
      if (snapshot.firstPaidAt != null)
        UserProperty.firstPaidAt: snapshot.firstPaidAt!.toIso8601String(),
      if (snapshot.acquisitionSource != null)
        UserProperty.acquisitionSource: snapshot.acquisitionSource,
      if (snapshot.acquisitionCampaign != null)
        UserProperty.acquisitionCampaign: snapshot.acquisitionCampaign,
    };
    if (set.isEmpty && setOnce.isEmpty) return;
    unawaited(_analytics?.identifyUser(set: set, setOnce: setOnce));
  }

  /// Called on every cold start AND every warm resume. Sets
  /// `last_app_open_at` immediately (client-side); the server-tracked
  /// counters (`total_sessions`) refresh via [applyServerSnapshot] after the
  /// backend endpoint responds.
  void onAppOpen() {
    final now = DateTime.now().toUtc().toIso8601String();
    unawaited(_analytics?.identifyUser(
      set: {UserProperty.lastAppOpenAt: now},
      setOnce: {UserProperty.firstAppOpenAt: now},
    ));
  }

  /// Called from the language-selection flow when a save succeeds.
  void onLanguageChanged(String languageCode) {
    unawaited(_analytics?.identifyUser(set: {
      UserProperty.selectedLanguage: languageCode,
    }));
  }

  /// Called when the entitlement snapshot flips. `status` is the wire value
  /// (`free`, `trial`, `pro`, `grace_period`, `expired`, `unknown`).
  void onSubscriptionChanged({
    required String status,
    String? planId,
    DateTime? startedAt,
    DateTime? expiresAt,
    DateTime? firstPaidAt,
  }) {
    final set = <String, Object?>{
      UserProperty.subscriptionStatus: status,
      UserProperty.subscriptionPlanId: ?planId,
      UserProperty.subscriptionStartedAt: ?startedAt?.toIso8601String(),
      UserProperty.subscriptionExpiresAt: ?expiresAt?.toIso8601String(),
    };
    final setOnce = <String, Object?>{
      if (firstPaidAt != null)
        UserProperty.firstPaidAt: firstPaidAt.toIso8601String(),
    };
    unawaited(_analytics?.identifyUser(set: set, setOnce: setOnce));
  }

  /// Called from onboarding when the name+language save reports success.
  void onOnboardingCompleted(DateTime completedAt) {
    unawaited(_analytics?.identifyUser(set: {
      UserProperty.onboardingCompleted: true,
      UserProperty.onboardingCompletedAt: completedAt.toIso8601String(),
    }));
  }

  /// Called on every module main-page view. Client-side mirror for immediate
  /// warehouse visibility; the backend's `/users/me/activity` (spec pending)
  /// is the source of truth for `last_active_module` on subsequent launches.
  ///
  /// Use one of the [UserPropertyModule] constants to keep the enum shape
  /// stable across the codebase.
  void onModuleOpened(String moduleName) {
    unawaited(_analytics?.identifyUser(set: {
      UserProperty.lastActiveModule: moduleName,
    }));
  }

  /// Called the FIRST time an audio playback completes on this install. The
  /// deduper's setOnce semantics mean subsequent calls no-op — safe to call
  /// on every completion.
  void onAudioCompleted() {
    unawaited(_analytics?.identifyUser(
      setOnce: {UserProperty.hasCompletedAudio: true},
    ));
  }

  /// Called on the FIRST detectable successful share (any module).
  void onShareCompleted() {
    unawaited(_analytics?.identifyUser(
      setOnce: {UserProperty.hasSharedContent: true},
    ));
  }

  /// Called on the FIRST successful ringtone set (system-level action).
  void onRingtoneSet() {
    unawaited(_analytics?.identifyUser(
      setOnce: {UserProperty.hasSetRingtone: true},
    ));
  }

  /// Called on the FIRST successful wallpaper set (system-level action).
  void onWallpaperSet() {
    unawaited(_analytics?.identifyUser(
      setOnce: {UserProperty.hasSetWallpaper: true},
    ));
  }
}
