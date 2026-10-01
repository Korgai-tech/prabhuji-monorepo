/// Paywall analytics — event names + property keys.
///
/// Combines two Sheet-1 sources:
///  * **Sheet 1 rows 17–26** ("Paywall" module) — paywall reach, close and
///    video events, plus intent (`pay_now_clicked` / `payment_started`) and
///    the residual terminal-outcome event (`payment_result`) for the two
///    states the new Payment Events sheet doesn't cover (cancelled + pending).
///  * **"Frontend Payment Events" sheet** — the trial + subscription
///    lifecycle events + the consolidated `payment` revenue record.
///
/// ## Retire vs. keep vs. add (2026-07-31)
///
/// * **Retired** (have equivalents in the new schema):
///   - `trial_activated`         → `trial_success`
///   - `subscription_activated`  → `subscription_started`
///   - `payment_result(success|failure)` → consolidated `payment` event
///
/// * **Kept** (no equivalent in the new schema):
///   - `paywall_viewed`, `pay_now_clicked`, `payment_started` — the new
///     schema has no direct-paid "initiated" event, so these intent
///     signals stay. All three now carry `trigger_module`.
///   - `payment_result` for `cancelled` and `pending` only — the new
///     `payment` event tracks `success | failed | refunded`; cancelled and
///     pending states have no equivalent and stay on `payment_result`.
///   - `paywall_closed`, `paywall_video_*` — paywall UX, unrelated to the
///     payment schema.
///
/// * **Added** (new from "Frontend Payment Events"):
///   - `trial_payment_initiated` — trial-plan Pay Now taps (fires alongside
///     `payment_started` when `snapshot.trialEndsAt != null`).
///   - `trial_success`, `trial_failed` — trial terminal outcomes.
///   - `subscription_started` — direct-paid or trial-conversion or restore.
///   - `payment` — consolidated revenue record with
///     `payment_status: success | failed | refunded`; fires alongside
///     `trial_success` / `trial_failed` / `subscription_started`. Cancelled
///     and pending states do NOT emit `payment` — they emit only
///     `payment_result` (kept-old).
///
/// ## Wiring notes
///
///  * `trigger_module` / `trigger_action` / `entry_source` — the three
///    attribution dimensions. Every call site that pushes `/paywall` builds
///    a `PaywallArgs`; the router threads them into `ConfigRequested` (so
///    `paywall_viewed` / `paywall_closed` ship with attribution) and into
///    `PaywallScreen` → `PayNowTapped` (so every payment event does too).
///    `trigger_module` values match `UserPropertyModule` in
///    `lib/core/user_properties.dart`; `trigger_action` values live in
///    [PaywallTriggerAction]; `entry_source` values live in
///    [PaywallEntrySource].
///  * `attempt_number` — `int _attemptNumber` on `PaymentBloc`, starts at
///    1, increments on `PaymentRetried`. Rides on `trial_failed` and (per
///    the sheet) the retired `payment_result(failure)` too.
///  * `upi_type` — mapped from `PayNowTapped.upiPackageName` via
///    `_upiTypeFromPackage` in `payment_bloc.dart` (`'PhonePe' | 'GPay' |
///    'Paytm' | 'Other'`).
///  * `payment_id` / `index` / `is_first_payment` / `billing_cycle` are
///    emitted as `null` — the server doesn't expose them yet. See
///    `docs/ANALYTICS-USER-PROPERTIES-BACKEND.md` (payment section).
///  * The `paywall_video_watch_time` accumulator remains unchanged.
class PaywallEvents {
  PaywallEvents._();

  // Reach + intent (Sheet 1 rows 17–19) --------------------------------------
  static const String paywallViewed = 'paywall_viewed';
  static const String payNowClicked = 'pay_now_clicked';
  static const String paymentStarted = 'payment_started';

  // Residual terminal outcome — cancelled + pending only (Sheet 1 row 20) ---
  static const String paymentResult = 'payment_result';

  // Close (Sheet 1 row 23) ---------------------------------------------------
  static const String paywallClosed = 'paywall_closed';

  // Video (Sheet 1 rows 24–26) -----------------------------------------------
  static const String paywallVideoStarted = 'paywall_video_started';
  static const String paywallVideoWatchTime = 'paywall_video_watch_time';
  static const String paywallVideoFailed = 'paywall_video_failed';

  // Frontend Payment Events — Trial ------------------------------------------
  static const String trialPaymentInitiated = 'trial_payment_initiated';
  static const String trialSuccess = 'trial_success';
  static const String trialFailed = 'trial_failed';

  // Frontend Payment Events — Subscription -----------------------------------
  static const String subscriptionStarted = 'subscription_started';

  // Frontend Payment Events — Consolidated revenue record --------------------
  static const String payment = 'payment';

  // Gateway UI presence — one pair per checkout attempt ----------------------
  /// The moment the payment-gateway UI is presented to the user.
  ///   * Razorpay: fired right before `startCheckout` — the SDK sheet appears.
  ///   * Decentro (intent-launch): fired right after `launched == true` —
  ///     the OS has handed control to a UPI app.
  /// Never fires on the "no UPI app" or mandate-API-failed branches, because
  /// the gateway UI was never actually presented on those paths. Also serves
  /// as the Clarity-replay landmark for "user has left our app" — the funnel
  /// gap between `pay_now_clicked` and `payment_result` is otherwise blind.
  static const String paymentGatewayOpened = 'payment_gateway_opened';

  /// The moment the payment-gateway UI goes away (control returns to us).
  ///   * Razorpay: fired the moment `startCheckout` returns — the sheet is
  ///     dismissed. Fires for approved, declined, AND cancelled outcomes.
  ///   * Decentro: fired on the first `AppResumedFromUpi` after opened
  ///     (the user returned from the UPI app). If the user never comes
  ///     back (hard-quit), this deliberately never fires — the gateway is
  ///     still "open" from our POV.
  /// Idempotent per checkout attempt — the flag resets on the next
  /// `PayNowTapped`, and terminal-state emits do NOT re-fire it.
  static const String paymentGatewayClosed = 'payment_gateway_closed';
}

/// Canonical property-key names used across Paywall + Payment events. Kept
/// here so a value name like `plan_id` lives in one place — call sites
/// reference the constant, not the string literal.
class PaywallEventProps {
  PaywallEventProps._();

  // Paywall identity + config
  static const String paywallId = 'paywall_id';
  static const String paywallVersion = 'paywall_version';
  // TAM-160 — render-shape discriminator (`card_hero`, `video_bleed`,
  // `icon_grid`, `carousel`). Emitted on every paywall + payment event so the
  // warehouse can compare funnel conversion per variant. Read from
  // `SessionContext.paywallLayout` at the emission site (NOT via the
  // enricher — see paywall_bloc._onConfigRequested).
  static const String paywallLayout = 'paywall_layout';
  static const String impressionNumber = 'impression_number';

  // Plan + product
  static const String planId = 'plan_id';
  static const String productId = 'product_id';
  static const String amount = 'amount';
  static const String currency = 'currency';
  static const String billingCycle = 'billing_cycle';

  // Attribution
  static const String entrySource = 'entry_source';
  static const String triggerModule = 'trigger_module';
  static const String triggerAction = 'trigger_action';

  /// Per-event dedupe id. `Analytics.trackEvent` stamps a fresh UUID v4 on
  /// every event; a call site may override it by passing this key, and every
  /// success terminal event does — `trial_success`, `subscription_started`
  /// and the consolidated `payment` all carry the server's
  /// `paymentReferenceId` from the mandate response, so one captured payment
  /// is one id across the three client rows AND the backend's matching
  /// `bk_*` event. Meta gets the same value (the custom events plus the
  /// standard `StartTrial`).
  ///
  /// Two rows deliberately keep their own UUID: `payment(payment_status=
  /// failed)` from `_fail`, and the residual `payment_result`.
  static const String eventId = 'event_id';

  // Payment identity + method
  static const String paymentProvider = 'payment_provider';
  static const String paymentMethod = 'payment_method';
  static const String paymentId = 'payment_id';
  static const String mandateId = 'mandate_id';
  /// Razorpay Order id (`order_XXX`), minted server-side by
  /// `POST /v1/orders` and returned on the mandate API's `data.razorpay.orderId`.
  /// Present the moment `payment_started` fires (it comes back with the
  /// mandate response) — no backend work needed to populate it. Null on
  /// non-Razorpay providers.
  static const String orderId = 'order_id';
  static const String upiType = 'upi_type';

  // Payment lifecycle (Frontend Payment Events)
  static const String type = 'type';
  static const String index = 'index';
  static const String paymentStatus = 'payment_status';
  static const String paymentDate = 'payment_date';
  static const String isFirstPayment = 'is_first_payment';

  // Payment outcome (existing `payment_result` shape)
  static const String result = 'result';
  static const String errorCode = 'error_code';
  // Frontend Payment Events use `failure_code` (distinct wire name from
  // the residual `payment_result`'s `error_code`).
  static const String failureCode = 'failure_code';
  static const String failureReason = 'failure_reason';
  static const String attemptNumber = 'attempt_number';

  // Entitlement
  static const String subscriptionNumber = 'subscription_number';
  static const String activationSource = 'activation_source';
  static const String trialStartDate = 'trial_start_date';
  static const String trialEndDate = 'trial_end_date';
  static const String subscriptionStartDate = 'subscription_start_date';
  static const String nextBillingDate = 'next_billing_date';

  // Close
  static const String closeMethod = 'close_method';
  static const String timeSpentSeconds = 'time_spent_seconds';

  // Video
  static const String videoId = 'video_id';
  static const String startType = 'start_type';
  static const String watchTimeMs = 'watch_time_ms';

  // Fixed `type` values (Frontend Payment Events)
  static const String typeTrial = 'trial';
  static const String typeSubscription = 'subscription';

  // Fixed `payment_method` values
  static const String paymentMethodUpiAutopay = 'upi_autopay';

  // Fixed `payment_status` values (new `payment` event)
  static const String paymentStatusSuccess = 'success';
  static const String paymentStatusFailed = 'failed';
  static const String paymentStatusRefunded = 'refunded';

  // Fixed `result` values. `resultSuccess` is dropped from the client (the
  // new `payment(payment_status=success)` covers it); `resultFailure` is
  // retained for direct-paid failures that have no new-schema equivalent.
  static const String resultFailure = 'failure';
  static const String resultPending = 'pending';
  static const String resultCancelled = 'cancelled';

  // Fixed `activation_source` values
  static const String activationDirectPayment = 'direct_payment';
  static const String activationTrialConversion = 'trial_conversion';
  static const String activationRestore = 'restore';

  // Fixed `close_method` values
  static const String closeMethodCloseIcon = 'close_icon';
  static const String closeMethodBack = 'back';
  static const String closeMethodSwipe = 'swipe';
  static const String closeMethodSystem = 'system';

  // Fixed `start_type` values
  static const String startTypeAutoPlay = 'auto_play';
  static const String startTypeUserPlay = 'user_play';
}

/// Canonical vocabulary for `trigger_action` — the specific paid intent that
/// caused the paywall to open. Every gated tap in the app maps to exactly one
/// of these; keeping the list closed means warehouse aggregation doesn't have
/// to canonicalise loose strings.
///
/// Feature actions pair with a [UserPropertyModule] on `trigger_module`;
/// standalone actions (`upgradeCta`, `onboardingCta`, `deepLink`) come with a
/// null `trigger_module` because there is no feature module behind them.
class PaywallTriggerAction {
  PaywallTriggerAction._();

  // Feature-gated intents (paired with a UserPropertyModule).
  static const String playAudio = 'play_audio';
  static const String playRingtone = 'play_ringtone';
  static const String setWallpaper = 'set_wallpaper';
  static const String shareStatus = 'share_status';
  static const String openBook = 'open_book';
  static const String openHoroscope = 'open_horoscope';
  // Downloads (TAM-125) — the play-page Download tap (free user) opens the
  // unified paywall with `trigger_action: download`; the lapsed-play path
  // (tapping a Downloaded row after premium lapsed) uses `lapsed_play`.
  static const String download = 'download';
  static const String lapsedPlay = 'lapsed_play';
  // Chat (TAM-166 Phase 1) — trigger_action for the paywall opens that
  // gate chat access: the Chat-tab tap for a non-Pro-and-non-kuldevta
  // user AND the "Mata Se Baat Karein" tap for a non-Pro kuldevta user
  // after they've completed discovery. Paired with
  // `UserPropertyModule.chat` and `PaywallEntrySource.chat`.
  static const String openChat = 'open_chat';

  // Standalone paywall opens (trigger_module = null).
  static const String upgradeCta = 'upgrade_cta';
  static const String onboardingCta = 'onboarding_cta';
  static const String deepLink = 'deep_link';
  // Push-notification tap on a Pro target by a non-Pro user.
  static const String notification = 'notification';
  // Post-login handoff — the paywall shown as the user lands on Home for the
  // first time after completing auth/onboarding. Paired with
  // `trigger_module: login` + `entry_source: login`.
  static const String landToHome = 'land_to_home';
  // Fallback used by the paywall route builder when the paywall is opened
  // without explicit attribution (cold-start orchestrator redirect, push
  // notification tap, WebView pop fallback, deep-link payment return).
  static const String appOpen = 'app_open';
}

/// Canonical vocabulary for `entry_source` — the surface the user came from
/// when the paywall opened. Deliberately coarse (surface level, not feature
/// level) — the [PaywallTriggerAction] carries the fine-grained intent.
class PaywallEntrySource {
  PaywallEntrySource._();

  static const String home = 'home';
  static const String feature = 'feature';
  static const String profile = 'profile';
  static const String manageSubscription = 'manage_subscription';
  static const String onboarding = 'onboarding';
  static const String deepLink = 'deep_link';
  static const String notification = 'notification';
  // Downloads (TAM-125) — paywall opened from the play-page Download tap or
  // from a lapsed-user tapping a downloaded row.
  static const String download = 'download';
  // Chat (TAM-164) — paywall opened by tapping the chat bottom-nav tab.
  // Chat entry is Pro-gated: a non-Pro user's tab tap hits `PaywallGate.run`,
  // which opens the paywall with this entry_source.
  static const String chat = 'chat';
  // First paywall of the session, opened as the user lands on Home right
  // after completing login/onboarding.
  static const String login = 'login';
  // Fallback for paywall mounts with no explicit source — cold-start
  // orchestrator redirect (returning free user), push-notification tap,
  // WebView pop fallback, deep-link payment return.
  static const String appOpen = 'app_open';
}
