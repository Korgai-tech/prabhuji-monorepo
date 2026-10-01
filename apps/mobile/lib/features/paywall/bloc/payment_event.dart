import 'package:equatable/equatable.dart';

sealed class PaymentEvent extends Equatable {
  const PaymentEvent();

  @override
  List<Object?> get props => const [];
}

/// Pay Now was tapped. Carries the selected plan's display metadata purely for
/// analytics — the AMOUNT is never sent to the server, which resolves it from
/// the paywall config so the client cannot choose what it pays.
class PayNowTapped extends PaymentEvent {
  const PayNowTapped({
    required this.planId,
    this.upiPackageName,
    this.selectedPlanPeriod,
    this.selectedProductId,
    this.displayPrice,
    this.currency,
    this.trialAvailable,
    this.trialDays,
    this.paymentMethodDisplayed,
    this.triggerModule,
    this.triggerAction,
    this.entrySource,
  });

  final String planId;

  /// The UPI app the user picked from the "PAY USING" chooser. Null lets the
  /// system show its own chooser.
  final String? upiPackageName;

  final String? selectedPlanPeriod;
  final String? selectedProductId;
  final String? displayPrice;
  final String? currency;
  final bool? trialAvailable;
  final int? trialDays;
  final String? paymentMethodDisplayed;

  /// Which module opened the paywall (`aarti_bhajans`, `ringtone`, `home`, …).
  /// Rides on every payment analytics event as `trigger_module`. Threaded
  /// through `PaywallArgs` route extra → `PaywallScreen` → this event. Null
  /// when the paywall was opened standalone (Profile Upgrade, Manage
  /// Subscription, deep link, onboarding — those have no feature module).
  final String? triggerModule;

  /// The specific paid intent that caused the paywall (`play_audio`,
  /// `set_wallpaper`, `upgrade_cta`, …). Rides on every payment analytics
  /// event as `trigger_action`; values come from `PaywallTriggerAction`.
  final String? triggerAction;

  /// The surface the user came from when the paywall opened (`home`,
  /// `feature`, `profile`, `manage_subscription`, `onboarding`, `deep_link`).
  /// Rides on every payment analytics event as `entry_source`; values come
  /// from `PaywallEntrySource`.
  final String? entrySource;

  @override
  List<Object?> get props => [
        planId,
        upiPackageName,
        selectedPlanPeriod,
        selectedProductId,
        displayPrice,
        currency,
        trialAvailable,
        trialDays,
        paymentMethodDisplayed,
        triggerModule,
        triggerAction,
        entrySource,
      ];
}

/// The app came back to the foreground while awaiting approval — the user has
/// probably just finished (or abandoned) the UPI app. Triggers an immediate
/// poll rather than waiting for the background cadence.
class AppResumedFromUpi extends PaymentEvent {
  const AppResumedFromUpi();
}

/// Re-check mandate state. Emitted on a backoff schedule while awaiting
/// approval; the server does the authoritative provider check.
class PollRequested extends PaymentEvent {
  const PollRequested();
}

/// Retry after a failure, or start over after a mandate was revoked.
class PaymentRetried extends PaymentEvent {
  const PaymentRetried();
}

/// The user dismissed the payment sheet/error without completing.
class PaymentDismissed extends PaymentEvent {
  const PaymentDismissed();
}
