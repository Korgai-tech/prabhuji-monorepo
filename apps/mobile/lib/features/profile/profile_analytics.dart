/// Profile & Settings analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 141–150 (module: "Profile & Settings"). Every string here has a
/// matching row in that sheet — do NOT add locally-invented events; if the
/// funnel needs a new one, add the row to the sheet first and then land it
/// here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (TAM-N-profile-v2 landed)
///
/// Fully wired (8/11):
///
///  * `pageViewed` — `profile_screen_v2.dart` fires once from `initState`
///    on the menu's `StatefulWidget`. Carries `previous_screen: 'home'`
///    (the profile screen is only reachable via the home header's avatar).
///  * `termsClicked` / `privacyPolicyClicked` — `_openLegal` in
///    `profile_screen_v2.dart` fires the click event before pushing the
///    webview. `source_screen: 'profile_menu'`. `document_version` is
///    currently null (we don't version legal URLs yet).
///  * `termsViewed` / `privacyPolicyViewed` — `InAppWebViewScreen` invokes
///    the optional `onLoaded(loadTimeMs)` callback the first time
///    `NavigationDelegate.onPageFinished` fires; `_openLegal` maps the
///    invocation to the matching viewed event.
///  * `logoutClicked` — the Log out tile fires this on tap BEFORE opening
///    the confirmation dialog. `source_screen: 'profile_menu'`.
///  * `logoutResult` — the destructive CTA in `LogoutConfirmationDialog`
///    fires this after the 8-step cascade completes (success) or in its
///    catch branch (failure with `error_code`).
///  * `nameEditResult` — the Edit Profile screen fires this on save-
///    completion when the name was edited (TAM-N-profile-v2). Payload:
///    `result`, `name_present`, `name_length_bucket`, `error_code`. Never
///    the raw name.
///  * `avatarEditResult` — the Edit Profile screen's avatar picker fires
///    this after the picker resolves (TAM-N-profile-v2). Payload: `status`
///    in `{picked, cancelled, unavailable}` — mirrors
///    `StatusAvatarPickResult.status`. Never a URL, bytes or filename.
///
/// Not wired — phone is display-only in v2 (2/11 silent):
///
///  * `phoneEditStarted` / `phoneEditResult` — the Edit Profile screen
///    renders phone in a disabled field with no tap handler; these events
///    stay declared for a future ticket that opens phone editing.
///
/// The legacy `user_logged_out` event lives in `SharedAnalyticsEvents`
/// (see `lib/core/shared_analytics.dart`) alongside `share_initiated` and
/// the `deep_link_*` events — cross-cutting signal that does not belong
/// to any single feature module. It fires in addition to the Sheet-1
/// `logoutClicked` / `logoutResult` events defined below.
class ProfileEvents {
  ProfileEvents._();

  // Profile page (row 141) ----------------------------------------------------
  static const String pageViewed = 'profile_page_viewed';

  // Profile edits (rows 142–144) ---------------------------------------------
  static const String nameEditResult = 'profile_name_edit_result';
  static const String phoneEditStarted = 'profile_phone_edit_started';
  static const String phoneEditResult = 'profile_phone_edit_result';

  /// Avatar-picker outcome fired from the Edit Profile screen
  /// (TAM-N-profile-v2). `status: 'picked'|'cancelled'|'failed'|'unavailable'`,
  /// mirroring `StatusAvatarPickResult.status`. `failed` carries an
  /// `error_code` (e.g. `s3_rejected_403`, `s3_offline`, `presign_timeout`)
  /// so dashboards can separate S3 rejections from network drops from parse
  /// errors. Never includes the URL, bytes, or filename.
  static const String avatarEditResult = 'profile_avatar_edit_result';

  // Legal — terms (rows 145–146) ---------------------------------------------
  static const String termsClicked = 'terms_clicked';
  static const String termsViewed = 'terms_viewed';

  // Legal — privacy (rows 147–148) -------------------------------------------
  static const String privacyPolicyClicked = 'privacy_policy_clicked';
  static const String privacyPolicyViewed = 'privacy_policy_viewed';

  // Logout (rows 149–150) ----------------------------------------------------
  static const String logoutClicked = 'logout_clicked';
  static const String logoutResult = 'logout_result';
}

/// Canonical property-key names for Profile & Settings events. Reused across
/// call sites so a value name like `source_screen` lives in one place.
class ProfileEventProps {
  ProfileEventProps._();

  // Page entry / navigation context
  static const String previousScreen = 'previous_screen';
  static const String sourceScreen = 'source_screen';

  // Legal documents
  static const String documentVersion = 'document_version';
  static const String loadTimeMs = 'load_time_ms';

  // Result envelope + failure diagnostics
  static const String result = 'result';
  static const String errorCode = 'error_code';

  // Name edit (never carry the raw name)
  //
  // NOTE: `name_present` used to live here. This screen writes the SAME
  // `/status/profile` record the Status details editor does (see
  // `_handleSave` — it calls `StatusRepository.saveProfile`), so the flag was
  // a duplicate of the global `has_name` that `AnalyticsEnricher` now stamps
  // on every event. `name_length_bucket` stays: length is a different
  // question from presence.
  static const String nameLengthBucket = 'name_length_bucket';

  // Phone edit (never carry the raw number)
  static const String verificationRequired = 'verification_required';
  static const String countryCode = 'country_code';
  static const String phoneNumberLength = 'phone_number_length';

  /// Avatar-picker status property. `picked` / `cancelled` / `failed` /
  /// `unavailable` — mirrors `StatusAvatarPickResult.status`.
  static const String avatarStatus = 'status';
}

/// Bucket a trimmed name length into the sheet's 3 canonical buckets
/// (short 1–4, medium 5–20, long 21+). Empty names fall to `short` — the
/// global `has_name` property distinguishes empty from "1–4 char"
/// downstream, so callers do NOT need to special-case an empty name here.
String profileNameLengthBucket(int length) {
  if (length <= 4) return 'short';
  if (length <= 20) return 'medium';
  return 'long';
}
