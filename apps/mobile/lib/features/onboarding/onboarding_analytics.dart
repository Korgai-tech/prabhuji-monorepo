/// Onboarding + App Launch analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 1–3 (module: "App Launch") and rows 4–16 (module: "Onboarding").
/// Every string here has a matching row in that sheet — do NOT add locally-
/// invented events; if the funnel needs a new one, add the row to the sheet
/// first and then land it here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 16 events fire)
///
/// Most events fire from the obvious call site (splash, phone-input, otp,
/// name-language). Three needed a small amount of extra plumbing worth
/// calling out so future edits know where to look:
///
///  * `appOpened` — fired from `main.dart` before the splash mounts, ONCE
///    per process. `AppLaunchTracker` holds a `_fired` latch to survive
///    hot restart / a second `runApp`. Warm resumes are deliberately
///    silent — this app treats one process as one session, and
///    `entry_source: resume` (set by `SessionContext.markResume` on the
///    first `AppLifecycleState.resumed`) rides on every subsequent event
///    so consumers can still distinguish mid-session events without a
///    second `app_opened` fire. `is_first_open` + `days_since_last_open`
///    are derived from a `SharedPreferences` timestamp written on each
///    open.
///  * `otpVerificationResult` — `OtpBloc._onSubmitTapped` already wraps the
///    verify call in a `Stopwatch`; the elapsed ms flows into
///    `response_time_ms` on both the success and failure branches. The bloc
///    state carries `attemptCount` (already there — renamed conceptually to
///    `attempt_number` on the wire) and increments on every submit.
///  * `resendOtpClicked` — carries `seconds_since_last_request`, computed
///    from a `Stopwatch` reset on send + resend inside `OtpBloc`. The
///    initial resend window (from `PhoneOtpBloc.SendOtpResult`) seeds the
///    first tick.
class OnboardingEvents {
  OnboardingEvents._();

  // App Launch (rows 1–3) -----------------------------------------------------
  static const String appOpened = 'app_opened';
  static const String splashScreenViewed = 'splash_screen_viewed';
  static const String appRouteDecided = 'app_route_decided';

  // Phone input (rows 4–8) ----------------------------------------------------
  static const String phoneInputScreenViewed = 'phone_input_screen_viewed';
  static const String phoneNumberEntered = 'phone_number_entered';
  static const String termsConsentChanged = 'terms_consent_changed';
  static const String getOtpClicked = 'get_otp_clicked';
  static const String otpRequestResult = 'otp_request_result';

  // OTP screen (rows 9–15) ----------------------------------------------------
  static const String otpScreenViewed = 'otp_screen_viewed';
  static const String changePhoneNumberClicked = 'change_phone_number_clicked';
  static const String otpEntered = 'otp_entered';
  static const String otpSubmitted = 'otp_submitted';
  static const String otpVerificationResult = 'otp_verification_result';
  static const String resendOtpClicked = 'resend_otp_clicked';
  static const String resendOtpResult = 'resend_otp_result';

  /// First-ever verification for this account — fires ALONGSIDE
  /// `otp_verification_result(success)`, only when the server reports
  /// `isNewUser`, and carries the same property set. The pair is
  /// deliberate: `otp_verification_result` is the funnel step (every
  /// verification, new or returning), this is the acquisition signal.
  /// Its `event_id` is the user id rather than a fresh UUID — see
  /// [OnboardingEventProps.eventId].
  static const String registrationSuccessful = 'registration_successful';

  // Onboarding completion (row 16) --------------------------------------------
  static const String onboardingProfileSaveResult =
      'onboarding_profile_save_result';
}

/// Canonical property-key names used across Onboarding + App Launch events.
/// Kept here so a value name like `attempt_number` lives in one place —
/// call sites reference the constant, not the string literal.
class OnboardingEventProps {
  OnboardingEventProps._();

  // App Launch --------------------------------------------------------------
  /// Effectively constant `cold` — `app_opened` fires ONCE per process.
  /// Retained on the wire for Sheet 1 row 1 schema stability.
  static const String launchType = 'launch_type';

  /// Whether this is the first-ever open for this installation.
  static const String isFirstOpen = 'is_first_open';

  /// Whole days since the previous app open; null on the first open.
  static const String daysSinceLastOpen = 'days_since_last_open';

  /// Milliseconds until the screen is visible and interactive.
  static const String loadTimeMs = 'load_time_ms';

  /// Where the orchestrator routed the app after startup checks.
  static const String routeDestination = 'route_destination';

  /// Why the orchestrator chose that route (e.g. `loggedOut`,
  /// `onboardingCompletePro`).
  static const String routeReason = 'route_reason';

  // App-landing experiments (TAM-258/259) ------------------------------------
  // All three ride on `app_route_decided` rather than a new event: the landing
  // IS a routing decision, and a separate event would have to be joined back to
  // this one to answer any question worth asking.
  //
  // Every value is the SERVER's, forwarded verbatim. The app never enumerates
  // them — same rule `chat_type` follows, and for a sharper reason here: the ad
  // codes are placeholders that will be renamed, so a client-side allowlist
  // would blank exactly the values the funnel was launched to watch.

  /// Where the app landed: `status`, `ringtone`, `home`, or whatever surface
  /// the console starts serving next. Open set by design.
  static const String landingModule = 'landing_module';

  /// Why: `utm_matched`, `utm_missing`, `utm_unmatched`, `bucket_assigned`,
  /// `not_in_experiment`.
  ///
  /// `utm_missing` (no first touch at all) and `utm_unmatched` (a touch whose
  /// ad group carries no code we know) are separate on purpose — the first is
  /// organic traffic landing in the arm, the second is an ad-group naming
  /// mistake, and only one of those is worth waking someone up for.
  static const String landingSource = 'landing_source';

  /// The ad code the server read from the user's first UTM group (`STS`,
  /// `RTG`), or blank.
  static const String utmCode = 'utm_code';

  // Phone input -------------------------------------------------------------
  /// Canonical prior screen (for step-reach events).
  static const String previousScreen = 'previous_screen';

  /// Phone country calling code only; NEVER send the raw phone number.
  static const String countryCode = 'country_code';

  /// Count of phone-number digits entered; NEVER send the raw phone number.
  static const String phoneNumberLength = 'phone_number_length';

  /// `true` if the terms checkbox is checked.
  static const String consentState = 'consent_state';

  /// Version of the legal document shown or accepted.
  static const String documentVersion = 'document_version';

  /// Per-event dedupe id. `Analytics.trackEvent` stamps a fresh UUID v4 on
  /// every event; a call site may override it by passing this key.
  /// `registration_successful` does, with the user id — one registration per
  /// user, ever, so the user id IS the natural dedupe key, and a replay or a
  /// second sink counting the same signup collapses to one row. Reaches
  /// Meta too: `trackEvent` ships the merged properties to every sink.
  static const String eventId = 'event_id';

  // OTP entry ---------------------------------------------------------------
  /// Attempt number for the CURRENT flow, starting at 1. Increments on each
  /// verify submit; resets to 0 on a fresh resend.
  static const String attemptNumber = 'attempt_number';

  /// Count of OTP digits entered; NEVER send the raw OTP value.
  static const String otpDigitCount = 'otp_digit_count';

  // Results / latency -------------------------------------------------------
  /// Outcome: `success`, `failure`, `pending`, `cancelled`.
  static const String result = 'result';

  /// Stable, non-sensitive code explaining a failure; blank on success.
  static const String errorCode = 'error_code';

  /// Milliseconds taken by the request to return.
  static const String responseTimeMs = 'response_time_ms';

  /// Seconds elapsed since the previous OTP request (send or resend).
  static const String secondsSinceLastRequest = 'seconds_since_last_request';

  // Onboarding completion ---------------------------------------------------
  /// ISO language code (e.g. `hi-IN`, `hi`, `mr`).
  static const String languageCode = 'language_code';

  /// Whether a non-empty name was provided; NEVER send the name.
  ///
  /// **Not a duplicate of the global `has_name`** — keep both. This reports the
  /// **account** name saved via `PATCH /users/me` at this step of onboarding.
  /// `has_name`, which `AnalyticsEnricher` stamps on every event, reports the
  /// `/status/profile` display name — a different record, and one that is
  /// still empty at this point in the funnel. The identically-named Status and
  /// Profile properties WERE duplicates of the global and were removed; this
  /// one survived that cleanup on purpose.
  static const String namePresent = 'name_present';

  /// Seconds from first onboarding step until successful save.
  static const String completionTimeSeconds = 'completion_time_seconds';

  // --- Enum values ---------------------------------------------------------
  static const String launchTypeCold = 'cold';

  static const String consentChecked = 'checked';
  static const String consentUnchecked = 'unchecked';

  static const String resultSuccess = 'success';
  static const String resultFailure = 'failure';
  static const String resultPending = 'pending';
  static const String resultCancelled = 'cancelled';
}
