/// Ringtone analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 113–126 (module: "Ringtone"). Every string here has a matching row
/// in that sheet — do NOT add locally-invented events; if the funnel needs a
/// new one, add the row to the sheet first and then land it here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 14 events fire)
///
/// Most events fire from the obvious call site (home bloc, preview bloc,
/// share flow, tap-handler, etc.). Four needed a small amount of extra
/// plumbing worth calling out so future edits know where to look:
///
///  * `shareResult` — the share flow in `RingtonePreviewBloc._onShareRequested`
///    captures `ShareService.share()`'s `ShareOutcome` and fires this AFTER
///    the sheet closes, with `result` + `destination_app` + `error_code`
///    (Aarti pattern).
///  * `setRingtoneResult` — `SetRingtoneBloc` fires this on EACH terminal
///    state (`success` / `failure` / `permission_denied`) so the set funnel
///    resolves for every attempt, not just the happy path. The event stamps
///    `device_model` + `android_version` per-row (row 125 explicitly asks
///    for both, even though the enricher also carries them).
///  * `permissionResult` — fires from `SetRingtoneBloc._onResumed` when the
///    WRITE_SETTINGS re-check runs after the settings-screen round-trip.
///    Tri-state: `result: success`/`permission_status: granted` on grant,
///    `result: failure`/`permission_status: not_granted` on denial. Stamps
///    `android_version` per row 124.
///  * `likeChanged` — one row (120) with `action: like | unlike`; unlike no
///    longer has its own event.
///
/// The direct-Set flow from a Home feed card (`home_feed_card.dart`
/// `_directSetRingtoneFromFeed`) shares this bloc, so the same set-result
/// events fire for both entry points automatically.
class RingtoneEvents {
  RingtoneEvents._();

  // Discovery + browse (rows 113–115) -----------------------------------------
  static const String pageViewed = 'ringtone_page_viewed';
  static const String deitySelected = 'ringtone_deity_selected';
  static const String selected = 'ringtone_selected';

  // Preview + playback (rows 116–120) -----------------------------------------
  static const String playerPageViewed = 'ringtone_player_page_viewed';
  static const String playStarted = 'ringtone_play_started';
  static const String playPaused = 'ringtone_play_paused';
  static const String playCompleted = 'ringtone_play_completed';
  static const String likeChanged = 'ringtone_like_changed';

  // Share (rows 121–122) ------------------------------------------------------
  static const String shareClicked = 'ringtone_share_clicked';
  static const String shareResult = 'ringtone_share_result';

  // Set flow + system-permission outcomes (rows 123–125) ----------------------
  static const String setRingtoneClicked = 'set_ringtone_clicked';
  static const String permissionResult = 'ringtone_permission_result';
  static const String setRingtoneResult = 'set_ringtone_result';

  // Preview failure (row 126) -------------------------------------------------
  static const String playbackFailed = 'ringtone_playback_failed';
}

/// Canonical property-key names used across Ringtone events. Kept here so a
/// value name like `ringtone_id` lives in one place — call sites reference the
/// constant, not the string literal.
class RingtoneEventProps {
  RingtoneEventProps._();

  // Media identity
  static const String ringtoneId = 'ringtone_id';
  static const String ringtoneName = 'ringtone_name';
  static const String durationSeconds = 'duration_seconds';

  // Discovery / browse
  static const String deityId = 'deity_id';
  static const String deityName = 'deity_name';

  /// The slug of the deity the content belongs to (`deities.slug` — e.g.
  /// `hanuman`, `krishna`, `ganesha`). Distinct from [deityId], which on
  /// discovery/filter events carries the SELECTED filter (`all` when no
  /// deity is chosen): `deity_slug` always describes the CONTENT itself, so
  /// the warehouse can group any outcome event by deity regardless of how
  /// the user arrived at it. `null` for an uncategorised item.
  static const String deitySlug = 'deity_slug';
  static const String selectionSource = 'selection_source';
  static const String positionIndex = 'position_index';

  // Preview / playback
  static const String playbackPositionSeconds = 'playback_position_seconds';
  static const String startReason = 'start_reason';

  // Screen context
  static const String previousScreen = 'previous_screen';
  static const String entrySource = 'entry_source';

  // Engagement (like)
  static const String action = 'action';

  // Share
  static const String result = 'result';
  static const String destinationApp = 'destination_app';
  static const String errorCode = 'error_code';

  // Set flow + system permission
  static const String permissionStatusBeforeClick =
      'permission_status_before_click';
  static const String permissionStatus = 'permission_status';
  static const String deviceModel = 'device_model';
  static const String androidVersion = 'android_version';

  // Failure diagnostics
  static const String failureStage = 'failure_stage';

  // --- Enum values -----------------------------------------------------------

  // Result enum (rows 122/124/125).
  static const String resultSuccess = 'success';
  static const String resultFailure = 'failure';
  static const String resultCancelled = 'cancelled';
  static const String resultPending = 'pending';
  static const String resultPermissionDenied = 'permission_denied';

  // Permission status enum (rows 123/124).
  static const String permissionGranted = 'granted';
  static const String permissionNotGranted = 'not_granted';

  // Like/unlike action values (row 120).
  static const String actionLike = 'like';
  static const String actionUnlike = 'unlike';

  // Start-reason values (row 117).
  static const String startReasonAutoPlay = 'auto_play';
  static const String startReasonUserPlay = 'user_play';
  static const String startReasonResume = 'resume';
  static const String startReasonNextItem = 'next_item';

  // Failure-stage values (row 126).
  static const String failureStagePlayback = 'playback';
  static const String failureStageLoad = 'load';
}
