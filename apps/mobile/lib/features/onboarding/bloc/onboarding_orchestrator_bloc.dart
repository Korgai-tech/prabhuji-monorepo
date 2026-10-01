// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `authStore:`, `usersRepository:` etc. — the
// private field names would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../core/analytics.dart';
import '../../../core/auth_store.dart';
import '../../../core/session_context.dart';
import '../../../core/user_properties.dart';
import '../../paywall/data/subscription_repository.dart';
import '../data/users_repository.dart';
import '../onboarding_analytics.dart';
import 'onboarding_orchestrator_event.dart';
import 'onboarding_orchestrator_state.dart';

/// The keystone of the mobile side of the onboarding epic — reads three
/// sources (JWT presence, `GET /users/me`, `GET /subscription/status`) and
/// resolves to exactly one `RouteTarget` per PRD §6.1.
///
/// Bloc-only (per MEMORY.md). Screens listen through go_router redirect; they
/// do NOT call this bloc directly for navigation.
///
/// A last-known good `RouteTarget` is retained internally so a subsequent
/// network flake falls back to it instead of stranding the user on splash.
class OnboardingOrchestratorBloc
    extends Bloc<OnboardingOrchestratorEvent, OrchestratorState> {
  OnboardingOrchestratorBloc({
    required AuthStore authStore,
    required UsersRepository usersRepository,
    required SubscriptionRepository subscriptionRepository,
    Analytics? analytics,
    SessionContext? sessionContext,
    UserPropertiesTracker? userPropertiesTracker,
  })  : _authStore = authStore,
        _usersRepository = usersRepository,
        _subscriptionRepository = subscriptionRepository,
        _analytics = analytics,
        _sessionContext = sessionContext,
        _userProperties = userPropertiesTracker,
        super(const OrchestratorInitial()) {
    on<AppStarted>(_onAppStarted);
    on<SessionRefreshed>(_onSessionRefreshed);
    on<SubscriptionRefreshed>(_onSubscriptionRefreshed);
    on<OnboardingStepCompleted>(_onStepCompleted);
  }

  final AuthStore _authStore;
  final UsersRepository _usersRepository;
  final SubscriptionRepository _subscriptionRepository;
  final Analytics? _analytics;
  final SessionContext? _sessionContext;
  final UserPropertiesTracker? _userProperties;

  /// Sink for the subscription snapshot fetched by the orchestrator. Set from
  /// the app layer to feed `entitlementProvider` — keeps this Bloc free of a
  /// Riverpod import while ensuring the PaywallGate sees the real Pro flag
  /// immediately after login/session-restore (not after a second round-trip).
  /// Bridges the app-start subscription read into `entitlementProvider`.
  ///
  /// Carries the whole snapshot rather than a bool: the cache needs the
  /// server's `entitledUntil` to be able to expire itself, and collapsing to
  /// `isPro` here is exactly what made a stale `true` immortal.
  void Function(SubscriptionSnapshot snapshot)? onSubscriptionSnapshot;

  /// Cached most-recent successful decision — used only as a fallback when a
  /// subsequent check fails and we can't reach the server.
  RouteTarget? _lastKnownTarget;
  bool? _lastKnownOnboardingCompleted;
  String? _lastKnownSubscriptionStatus;

  /// TAM-259 — the landing the server named for THIS app open, not yet applied.
  ///
  /// Separate from [_lastKnownLanding] because they answer different questions:
  /// that one is "what did the server last say" (replayed on a cached
  /// fallback), this one is "is there a landing still owed to the user".
  ///
  /// ── WHY TAKE-ONCE ───────────────────────────────────────────────────────
  /// The trigger that applies it — `wireDeepLinkReplayOnHome` — fires every
  /// time `/home` becomes the top of the stack, which includes the user simply
  /// tapping the Home tab. Without clearing it on read, an experiment arm
  /// would drag them back to Status every time they tried to go Home, which
  /// reads as the app being broken rather than as an experiment.
  ///
  /// Set from the server's answer regardless of which target was emitted: a
  /// free user's decision is `paywall`, and the landing is owed to them once
  /// they get past it. Cleared by [takePendingLanding].
  String _pendingLanding = '';

  /// The landing owed to this user, or `''`. Clears it — call once per arrival.
  String takePendingLanding() {
    final landing = _pendingLanding;
    _pendingLanding = '';
    return landing;
  }

  /// TAM-259 — the last landing the server named, replayed with a cached
  /// decision so a network flake does not silently demote an ad arrival to
  /// Home. Its one-shot-ness is server-side (`ad_landing_consumed_at`), so
  /// re-serving a cached landing cannot double-spend anything: the server
  /// already decided this open gets it.
  String _lastKnownLanding = '';

  Future<void> _onAppStarted(
    AppStarted event,
    Emitter<OrchestratorState> emit,
  ) async {
    emit(const OrchestratorLoading());
    await _resolveRoute(emit);
  }

  Future<void> _onSessionRefreshed(
    SessionRefreshed event,
    Emitter<OrchestratorState> emit,
  ) async {
    emit(const OrchestratorLoading());
    await _resolveRoute(emit);
  }

  Future<void> _onSubscriptionRefreshed(
    SubscriptionRefreshed event,
    Emitter<OrchestratorState> emit,
  ) async {
    // Full re-resolve — subscription changes may happen mid-onboarding (e.g.
    // successful purchase from paywall) and we want the whole chain re-checked.
    emit(const OrchestratorLoading());
    await _resolveRoute(emit);
  }

  Future<void> _onStepCompleted(
    OnboardingStepCompleted event,
    Emitter<OrchestratorState> emit,
  ) async {
    // Deterministic forward hop — no network needed to know the next step.
    switch (event.step) {
      case OnboardingStep.phoneVerified:
        _emitDecided(
          emit,
          target: RouteTarget.nameLanguage,
          reason: RouteReason.stepAdvance,
        );
        return;
      case OnboardingStep.nameLanguageSaved:
        // After saving name+language, revalidate subscription for the
        // paywall vs. home fork.
        emit(const OrchestratorLoading());
        await _resolveRoute(emit);
        return;
      case OnboardingStep.paywallDismissed:
        _emitDecided(
          emit,
          target: RouteTarget.home,
          reason: RouteReason.stepAdvance,
          subscriptionStatus: _lastKnownSubscriptionStatus ?? 'free',
          hasCompletedOnboarding: true,
          // Deterministic forward hop — no `/users/me` is fetched here, so the
          // landing has to come from the cache the paywall decision filled.
          landing: _cachedLanding(),
        );
        return;
    }
  }

  /// The core PRD §6.1 decision tree.
  Future<void> _resolveRoute(Emitter<OrchestratorState> emit) async {
    final token = _authStore.read();

    // Rule 1: no JWT → phone input (the intermediate phone-choice screen was
    // removed; a logged-out user lands straight on the phone-number entry).
    if (token == null || token.isEmpty) {
      _emitDecided(
        emit,
        target: RouteTarget.phoneInput,
        reason: RouteReason.loggedOut,
        hasCompletedOnboarding: false,
      );
      return;
    }

    // Rule 2 + user fetch.
    MeResult meResult;
    try {
      meResult = await _usersRepository.getMe();
    } catch (e) {
      _emitCachedOrError(emit, error: e);
      return;
    }

    if (meResult.authFailed) {
      // JWT rejected — drop it and route back to logged-out flow.
      await _authStore.clear();
      _emitDecided(
        emit,
        target: RouteTarget.phoneInput,
        reason: RouteReason.authFailed,
        hasCompletedOnboarding: false,
      );
      return;
    }

    final user = meResult.user;
    if (user == null) {
      // Empty user body — treat like auth failure.
      await _authStore.clear();
      _emitDecided(
        emit,
        target: RouteTarget.phoneInput,
        reason: RouteReason.authFailed,
        hasCompletedOnboarding: false,
      );
      return;
    }

    // Publish the user's identity + language pref to the shared session
    // context so downstream analytics (`user_id`, `selected_language`) are
    // populated on every subsequent event.
    _sessionContext?.userId = user.id;
    final lang = user.selectedLanguage;
    if (lang != null) {
      _sessionContext?.selectedLanguage = lang;
    }

    // Sheet-3 user-properties identify. `Analytics.setUser(user.id)` is
    // called separately from main.dart's auth listener; this call fills in
    // the identify payload with everything else the client knows at login:
    // language, onboarding completion, and (later, when it lands) the
    // server-mirrored profile snapshot. Subscription details flow through
    // `EntitlementNotifier.seed()` → `tracker.onSubscriptionChanged`, so we
    // deliberately pass `subscriptionStatus: null` here to avoid a stale
    // write from before the subscription fetch completes below.
    _userProperties?.onLogin(
      selectedLanguage: lang ?? '',
      onboardingCompletedAt: user.onboardingCompletedAt,
      subscriptionStatus: null,
    );

    // Rule 3: JWT + user but no phone → phone input.
    if (!user.hasPhone) {
      _emitDecided(
        emit,
        target: RouteTarget.phoneInput,
        reason: RouteReason.partialPhone,
        hasCompletedOnboarding: false,
      );
      return;
    }

    // Rule 4 (name + language) is intentionally removed — the onboarding no
    // longer collects a name or a language. Every phone-verified user goes
    // straight to the subscription-gated fork below, whether or not the server
    // has flipped `onboardingCompletedAt`. A user without a name/language
    // simply has null values on their profile row; UI that reads `name` for
    // display already tolerates null (falls back to a generic greeting).
    //
    // Rules 5 + 6: phone verified → paywall vs. home is subscription-gated.
    SubscriptionSnapshot subscription;
    try {
      subscription = await _subscriptionRepository.getStatus();
    } catch (e) {
      _emitCachedOrError(emit, error: e, hasCompletedOnboarding: true);
      return;
    }

    onSubscriptionSnapshot?.call(subscription);

    unawaited(_analytics?.trackEvent(
      'paywall_subscription_status_checked',
      properties: {
        'status': subscription.status.value,
        'is_pro': subscription.isPro,
      },
    ));

    if (subscription.isPro) {
      unawaited(_analytics?.trackEvent(
        'paywall_subscription_restored',
        properties: {'status': subscription.status.value},
      ));
      _emitDecided(
        emit,
        target: RouteTarget.home,
        reason: RouteReason.onboardingCompletePro,
        subscriptionStatus: subscription.status.value,
        hasCompletedOnboarding: true,
        landing: user.landing,
      );
      return;
    }

    // The landing rides along even though `paywall` cannot use it — that is
    // what caches it for the `paywallDismissed` hop below, which IS the first
    // landing after the paywall for a fresh install and has no `/users/me`
    // response of its own to read.
    _emitDecided(
      emit,
      target: RouteTarget.paywall,
      reason: RouteReason.onboardingCompleteFree,
      subscriptionStatus: subscription.status.value,
      hasCompletedOnboarding: true,
      landing: user.landing,
    );
  }

  /// Emits [OrchestratorRouteDecided], updates the last-known cache, and
  /// records `onboarding_route_decided` for analytics.
  void _emitDecided(
    Emitter<OrchestratorState> emit, {
    required RouteTarget target,
    required String reason,
    String? subscriptionStatus,
    bool? hasCompletedOnboarding,
    MeLanding? landing,
  }) {
    _lastKnownTarget = target;
    if (landing != null) {
      _lastKnownLanding = landing.deeplink;
      // Owed regardless of THIS decision's target — a free user is routed to
      // the paywall first, and the landing applies when they reach home.
      if (landing.deeplink.isNotEmpty) _pendingLanding = landing.deeplink;
    }
    if (subscriptionStatus != null) {
      _lastKnownSubscriptionStatus = subscriptionStatus;
      _sessionContext?.subscriptionStatus = subscriptionStatus;
    }
    if (hasCompletedOnboarding != null) {
      _lastKnownOnboardingCompleted = hasCompletedOnboarding;
      _sessionContext?.hasCompletedOnboarding = hasCompletedOnboarding;
    }

    emit(OrchestratorRouteDecided(
      target: target,
      reason: reason,
      subscriptionStatus: subscriptionStatus,
      hasCompletedOnboarding: hasCompletedOnboarding,
      // Only `home` can be refined by a landing. Sending one alongside
      // `paywall` or `phoneInput` would have the router's post-frame hook
      // navigate away from a screen the user still has to finish.
      landing: target == RouteTarget.home ? (landing?.deeplink ?? '') : '',
    ));

    // Sheet 1 row 3 — `app_route_decided`. `route_destination` = the picked
    // RouteTarget (`home`, `paywall`, `phoneInput`, `nameLanguage`, ...);
    // `route_reason` = the RouteReason enum value that drove the choice
    // (`loggedOut`, `onboardingCompletePro`, `cachedFallback`, ...). The
    // `subscription_status`/`has_completed_onboarding` fields ride along
    // (still relevant for diagnosing routing decisions) but are not on
    // the sheet.
    unawaited(_analytics?.trackEvent(
      OnboardingEvents.appRouteDecided,
      properties: {
        OnboardingEventProps.routeDestination: target.name,
        OnboardingEventProps.routeReason: reason,
        'subscription_status': ?subscriptionStatus,
        'has_completed_onboarding': ?hasCompletedOnboarding,
        // TAM-258/259 — the landing experiment's three dimensions, forwarded
        // VERBATIM. The app never validates them: `module` and `source` are the
        // server's vocabulary and may gain values this build predates, and the
        // ad codes are placeholders that will be renamed — an allowlist here
        // would silently blank exactly the new values the funnel is watching
        // for. Only fired when the server sent a landing at all, so a server
        // that predates the rollout adds no empty columns.
        if (landing != null) ...{
          OnboardingEventProps.landingModule: landing.module,
          OnboardingEventProps.landingSource: landing.source,
          OnboardingEventProps.utmCode: landing.utmCode,
        },
      },
    ));
  }

  /// The last landing the server named, as a [MeLanding] the emit path can
  /// take. `null` when none was ever seen, which reads as "no landing".
  ///
  /// The analytics half is deliberately blanked rather than cached: `module` /
  /// `source` / `utm_code` describe the decision the SERVER made on a specific
  /// request, and re-reporting them against a cached fallback would inflate
  /// `utm_matched` with opens the server never attributed. The deep link is the
  /// only part that is still true.
  MeLanding? _cachedLanding() => _lastKnownLanding.isEmpty
      ? null
      : MeLanding(
          deeplink: _lastKnownLanding,
          module: '',
          source: '',
          utmCode: '',
        );

  /// If we have a cached decision, re-emit it with `reason: cached_fallback`;
  /// otherwise land on `OrchestratorError` so the splash shows a retry.
  void _emitCachedOrError(
    Emitter<OrchestratorState> emit, {
    required Object error,
    bool? hasCompletedOnboarding,
  }) {
    final cached = _lastKnownTarget;
    // A PRE-AUTH target is never safe to re-emit here. This path is reached
    // after `user.hasPhone` is already true, so falling back to `phoneInput` or
    // `otp` bounces a verified user to the login screen — which is precisely the
    // failure the old hand-parsed `isEntitled` fallback existed to avoid.
    // Deleting that fallback without this guard would bring the bug back through
    // the front door.
    //
    // Stated as an EXCLUSION rather than an allow-list, deliberately. It was
    // written as `{home, paywall}` first, which silently dropped `nameLanguage`
    // — a legitimate post-auth target — and would silently drop the next target
    // anyone adds. An allow-list has to be remembered on every change; the
    // exclusion only has to be right about what is unsafe, which is the thing
    // this guard actually knows.
    const preAuth = {RouteTarget.phoneInput, RouteTarget.otp};
    if (cached != null && !preAuth.contains(cached)) {
      _emitDecided(
        emit,
        target: cached,
        reason: RouteReason.cachedFallback,
        subscriptionStatus: _lastKnownSubscriptionStatus,
        hasCompletedOnboarding:
            hasCompletedOnboarding ?? _lastKnownOnboardingCompleted,
        landing: _cachedLanding(),
      );
      return;
    }
    emit(OrchestratorError(error.toString()));
  }
}
