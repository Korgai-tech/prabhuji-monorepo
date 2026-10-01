/// TAM-125 subscription-cancellation analytics — event names + property keys.
///
/// Sheet-1 prerequisite: the five events below must be added to
/// `docs/ANALYTICS-EVENT-CONTRACT.md` Sheet 1 BEFORE the PR merges (§5's
/// "Sheet-1 prerequisite" rule).
///
/// Every call site uses these constants (never string literals) so a rename
/// is a grep-safe atomic change, matching the pattern in `profile_analytics.dart`.
///
/// Per `docs/ANALYTICS-FLUTTER-GUIDE.md`: all events are `snake_case`
/// `<object>_<past-tense-verb>`, all fire-and-forget under
/// `unawaited(ref.read(analyticsProvider)?.trackEvent(...))`, and NEVER carry
/// PII / user ids / subscription ids / plan / amount / envelope-message
/// strings in `properties`.
class SubscriptionCancelEvents {
  SubscriptionCancelEvents._();

  /// Fires from `ManageSubscriptionScreen.initState`'s `postFrameCallback` —
  /// exactly ONCE per mount, regardless of whether a cancel-request row
  /// exists. Properties: `previous_screen: 'profile_menu'`.
  static const String profileSubscriptionViewed =
      'profile_subscription_viewed';

  /// Fires from the Cancel-row `onTap` on `ManageSubscriptionScreen` —
  /// BEFORE the confirm modal opens (INTENT, not outcome). Properties:
  /// `entry_point: 'profile_manage_subscription'`.
  static const String subscriptionCancelTapped = 'subscription_cancel_tapped';

  /// Fires on 2xx OR on 409 `PENDING_REQUEST_EXISTS` — both mean "the queue
  /// has the user's request" (PO ruling #1). Fires AFTER the SnackBar is
  /// shown.
  ///
  /// Properties:
  ///   * `entry_point: 'profile_manage_subscription'`
  ///   * `outcome: 'created' | 'existing'` — so the funnel can distinguish
  ///     first-time creates from double-taps that hit the existing-pending
  ///     branch. NEVER carry the raw reason string (PII-adjacent).
  static const String subscriptionCancelConfirmed =
      'subscription_cancel_confirmed';

  /// Fires on any non-2xx that is NOT `PENDING_REQUEST_EXISTS` — 400/401/
  /// 403/404, other 409 error codes, 5xx, network / timeout.
  ///
  /// Properties:
  ///   * `entry_point: 'profile_manage_subscription'`
  ///   * `reason: 'network' | 'validation' | 'server_5xx' | 'unauthorized' |
  ///     'unknown'` — derived from Dio's error type / HTTP status.
  ///     NEVER the envelope `message`, the response body, or a stack trace.
  static const String subscriptionCancelFailed = 'subscription_cancel_failed';

  /// Fires when the manage-subscription screen renders a NON-null cancel-
  /// request row (any status).
  ///
  /// Properties:
  ///   * `request_status: 'pending' | 'processing' | 'completed' | 'rejected'`
  static const String subscriptionCancelRequestStatusViewed =
      'subscription_cancel_request_status_viewed';
}

/// Canonical property-key names for the §5 events. Kept in one place so a
/// value name like `entry_point` is grep-safe across every call site.
class SubscriptionCancelEventProps {
  SubscriptionCancelEventProps._();

  static const String previousScreen = 'previous_screen';
  static const String entryPoint = 'entry_point';
  static const String outcome = 'outcome';
  static const String reason = 'reason';
  static const String requestStatus = 'request_status';
}

/// Canonical values for the properties above. Kept as `const String`
/// literals so a rename is grep-safe and typos surface as unresolved
/// symbols instead of silently-mistyped strings.
class SubscriptionCancelEventValues {
  SubscriptionCancelEventValues._();

  // `previous_screen`
  static const String previousScreenProfileMenu = 'profile_menu';

  // `entry_point`
  static const String entryPointProfileManageSubscription =
      'profile_manage_subscription';

  // `outcome`
  static const String outcomeCreated = 'created';
  static const String outcomeExisting = 'existing';

  // `request_status` — mirrors `CancellationRequestStatus.toWire`.
  static const String requestStatusPending = 'pending';
  static const String requestStatusProcessing = 'processing';
  static const String requestStatusCompleted = 'completed';
  static const String requestStatusRejected = 'rejected';
}
