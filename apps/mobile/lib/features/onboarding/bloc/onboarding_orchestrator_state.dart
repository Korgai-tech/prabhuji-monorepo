import 'package:equatable/equatable.dart';

/// The set of route targets the orchestrator can resolve to.
///
/// Every value maps 1:1 to a `GoRoute` path in `lib/core/router.dart` — see
/// [routeTargetPath] for the mapping. Adding a new value here without a route
/// registration is a bug the redirect will surface via a fall-through.
enum RouteTarget {
  phoneInput,
  otp,
  nameLanguage,
  paywall,
  home,
  offline,
}

/// Reason attached to `onboarding_route_decided` — kept as a plain string so
/// analytics can group cheaply and PMs can add new reasons without a code push.
class RouteReason {
  RouteReason._();

  static const loggedOut = 'logged_out';
  static const authFailed = 'auth_failed';
  static const partialPhone = 'partial_phone';
  static const partialNameLang = 'partial_name_language';
  static const onboardingCompletePro = 'onboarding_complete_pro';
  static const onboardingCompleteFree = 'onboarding_complete_free';
  static const cachedFallback = 'cached_fallback';
  static const networkError = 'network_error';
  static const stepAdvance = 'step_advance';
}

sealed class OrchestratorState extends Equatable {
  const OrchestratorState();

  @override
  List<Object?> get props => const [];
}

/// First-frame state — set once at bloc construction, never re-emitted.
class OrchestratorInitial extends OrchestratorState {
  const OrchestratorInitial();
}

/// A check is in flight (session, /users/me, or /subscription/status).
class OrchestratorLoading extends OrchestratorState {
  const OrchestratorLoading();
}

/// A route decision has been reached — the router redirect consumes [target]
/// and pushes the user there.
///
/// [reason], [subscriptionStatus] and [hasCompletedOnboarding] populate the
/// `onboarding_route_decided` analytics event.
class OrchestratorRouteDecided extends OrchestratorState {
  const OrchestratorRouteDecided({
    required this.target,
    required this.reason,
    this.subscriptionStatus,
    this.hasCompletedOnboarding,
    this.landing = '',
  });

  final RouteTarget target;
  final String reason;
  final String? subscriptionStatus;
  final bool? hasCompletedOnboarding;

  /// TAM-258/259 — the server's landing deep link, or `''` for none.
  ///
  /// Rides ALONGSIDE [target] rather than replacing it: the orchestrator's job
  /// is still "which of the onboarding route targets is this user at", and the
  /// landing only ever refines the `home` answer. Folding it into [target]
  /// would put a server-controlled string into an enum that go_router paths are
  /// derived from, and every non-Home target (phoneInput, otp, paywall) would
  /// need to explain why it ignores it.
  ///
  /// Consumed by the router's post-frame hook, and only when no deep-link
  /// intent was parked — see `_schedulePendingIntentReplay`.
  final String landing;

  @override
  List<Object?> get props =>
      [target, reason, subscriptionStatus, hasCompletedOnboarding, landing];
}

/// A non-recoverable error (rare: config fetch failure without a usable cache).
class OrchestratorError extends OrchestratorState {
  const OrchestratorError(this.message);
  final String message;

  @override
  List<Object?> get props => [message];
}
