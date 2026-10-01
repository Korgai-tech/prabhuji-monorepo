import 'package:equatable/equatable.dart';

sealed class PaywallEvent extends Equatable {
  const PaywallEvent();

  @override
  List<Object?> get props => const [];
}

/// Fired on paywall mount — kicks off the `/paywall/config` fetch. Carries
/// the three attribution dimensions that ride on `paywall_viewed` and
/// `paywall_closed` (see [PaywallArgs] on the route).
class ConfigRequested extends PaywallEvent {
  const ConfigRequested(
    this.locale, {
    this.triggerModule,
    this.triggerAction,
    this.entrySource,
    this.agentId,
    this.chatType,
  });
  final String locale;
  final String? triggerModule;
  final String? triggerAction;
  final String? entrySource;

  /// Bug 7 — chat attribution when the paywall was opened from the chat
  /// surface. Null on non-chat entries; the bloc omits them from the
  /// `paywall_viewed` fire in that case.
  final String? agentId;
  final String? chatType;

  @override
  List<Object?> get props =>
      [locale, triggerModule, triggerAction, entrySource, agentId, chatType];
}

/// The user tapped one of the plan tabs.
class PlanSelected extends PaywallEvent {
  const PlanSelected(this.planId);
  final String planId;

  @override
  List<Object?> get props => [planId];
}

/// The user tapped the header video — toggles play/pause.
class VideoTapped extends PaywallEvent {
  const VideoTapped();
}

/// App went to background — the paywall pauses the video.
class AppBackgrounded extends PaywallEvent {
  const AppBackgrounded();
}

/// App resumed — the paywall is redisplayed but does NOT auto-resume the
/// video (the user should decide whether to un-pause).
class AppResumed extends PaywallEvent {
  const AppResumed();
}

/// User tapped Retry on the error screen.
class RetryRequested extends PaywallEvent {
  const RetryRequested();
}

/// The paywall is being closed — either by an explicit user action
/// (tapping the X, `trigger: 'user_close'`) or by the empty-plans
/// auto-redirect (`trigger: 'no_valid_plans'`). Fires the §9
/// `paywall_closed` analytics event; the widget owns the actual
/// navigation via `context.go`. No state change.
class CloseTapped extends PaywallEvent {
  const CloseTapped({
    this.trigger = 'user_close',
    this.selectedPlanId,
    this.selectedPlanPeriod,
    this.routeAfterClose = 'home',
    this.paywallImpressionCountForUser,
    this.timeOnPaywallSeconds,
    this.videoPlayed,
    this.videoWatchSeconds,
  });

  final String trigger;
  final String? selectedPlanId;
  final String? selectedPlanPeriod;
  final String routeAfterClose;
  final int? paywallImpressionCountForUser;
  final int? timeOnPaywallSeconds;
  final bool? videoPlayed;
  final int? videoWatchSeconds;

  @override
  List<Object?> get props => [
        trigger,
        selectedPlanId,
        selectedPlanPeriod,
        routeAfterClose,
        paywallImpressionCountForUser,
        timeOnPaywallSeconds,
        videoPlayed,
        videoWatchSeconds,
      ];
}
