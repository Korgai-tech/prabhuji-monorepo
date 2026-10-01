import 'package:equatable/equatable.dart';

/// Why a payment attempt failed, as a CLOSED client vocabulary.
///
/// Deliberately not the provider's error strings: those are unbounded, change
/// without notice, and are unsafe to put in analytics (they can carry payer
/// detail). Every failure is mapped into one of these before it leaves the
/// bloc.
enum PaymentErrorCode {
  /// The user declined the mandate in their UPI app.
  mandateRejected,

  /// The approval link expired before they acted.
  mandateExpired,

  /// NPCI revoked the mandate — typically after a failed first debit. The user
  /// can recover, but only by consenting again.
  mandateRevoked,

  /// No app could handle the `upi://` intent.
  upiAppUnavailable,

  network,
  server,
}

sealed class PaymentState extends Equatable {
  const PaymentState();

  @override
  List<Object?> get props => const [];
}

class PaymentIdle extends PaymentState {
  const PaymentIdle();
}

/// Registering the mandate with the server. Blocks the CTA.
class PaymentCreatingMandate extends PaymentState {
  const PaymentCreatingMandate();
}

/// The UPI app has been opened; we are waiting for the user to approve.
class PaymentAwaitingApproval extends PaymentState {
  const PaymentAwaitingApproval({required this.mandateId});

  final String mandateId;

  @override
  List<Object?> get props => [mandateId];
}

/// Actively polling the server for the outcome.
class PaymentPolling extends PaymentState {
  const PaymentPolling({required this.mandateId, required this.attempt});

  final String mandateId;
  final int attempt;

  @override
  List<Object?> get props => [mandateId, attempt];
}

/// Entitlement granted. [trialEndsAt] is non-null when the user is in the free
/// trial rather than a paid period.
class PaymentSucceeded extends PaymentState {
  const PaymentSucceeded({
    required this.subscriptionStatus,
    required this.trialEndsAt,
  });

  final String subscriptionStatus;
  final DateTime? trialEndsAt;

  @override
  List<Object?> get props => [subscriptionStatus, trialEndsAt];
}

/// The approval did not resolve within our poll budget.
///
/// NOT a failure: UPI mandates can settle minutes later, so the correct UX is
/// "we'll let you know", never "it failed". Telling the user it failed invites
/// a second payment attempt for a mandate that is about to succeed.
class PaymentPending extends PaymentState {
  const PaymentPending({required this.mandateId, required this.pollAttempts});

  final String mandateId;
  final int pollAttempts;

  @override
  List<Object?> get props => [mandateId, pollAttempts];
}

class PaymentFailed extends PaymentState {
  const PaymentFailed({
    required this.code,
    required this.message,
    required this.canRetry,
    required this.requiresReRegistration,
  });

  final PaymentErrorCode code;
  final String message;
  final bool canRetry;

  /// Drives a "set up autopay again" CTA rather than a generic retry — the old
  /// mandate is dead and a new one must be consented to from scratch.
  final bool requiresReRegistration;

  @override
  List<Object?> get props => [code, message, canRetry, requiresReRegistration];
}

/// The user backed out. [stage] distinguishes where, for funnel analysis.
class PaymentCancelled extends PaymentState {
  const PaymentCancelled({required this.stage});

  /// `before_launch` | `awaiting_approval` | `polling`
  final String stage;

  @override
  List<Object?> get props => [stage];
}
