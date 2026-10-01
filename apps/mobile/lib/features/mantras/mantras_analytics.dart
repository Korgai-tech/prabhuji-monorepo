/// Mantras & Stutis analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 64–85 (module: "Mantras & Stutis"). Every string here has a
/// matching row in that sheet — do NOT add locally-invented events; if the
/// funnel needs a new one, add the row to the sheet first and then land it
/// here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 22 events fire)
///
/// Most events fire from the obvious call site (main-page bloc, player
/// bloc, listing bloc, tap handler, counter sheet, playlist sheet). Four
/// needed extra plumbing worth calling out so future edits know where to
/// look:
///
///  * `audioShareResult` — the share flow in `mantras_player_bloc.dart`
///    captures `ShareService.share()`'s `ShareOutcome` and fires this
///    event AFTER the sheet closes, with `result` + `destination_app` +
///    `error_code`.
///  * `audioAppStateChanged` — `MantrasPlayerScreen` state mixes in
///    `WidgetsBindingObserver` while the screen is mounted; every
///    lifecycle transition dispatches `MantrasPlayerAppStateChanged` to
///    the bloc, which fires the event with the current `playback_state`
///    + `playback_position_seconds` (bloc no-ops when it's not on
///    `MantrasPlayerReady`).
///  * `repetitionCompleted` / `repeatTargetCompleted` — the bloc owns the
///    japa repeat counter (§6.9); each single playthrough emits
///    `repetitionCompleted` with `repetition_number` + `repeat_target`, and
///    the completion that hits the selected target fires
///    `repeatTargetCompleted` with `total_listen_seconds` read from the
///    audio port.
///  * `counterSheetViewed` / `counterSheetClosed` — the counter bottom
///    sheet reports its own visibility + dismissal (with `close_method`)
///    from within the sheet host in `mantras_player_screen.dart`.
class MantrasEvents {
  MantrasEvents._();

  // Main + browse discovery (rows 64–68) --------------------------------------
  static const String pageViewed = 'mantras_stutis_page_viewed';
  static const String recentlyPlayedShowAllClicked =
      'mantras_recently_played_show_all_clicked';
  static const String browsingPageViewed = 'mantras_browsing_page_viewed';
  static const String deityClicked = 'mantras_deity_clicked';
  static const String audioSelected = 'mantras_audio_selected';

  // Player (rows 69–75) -------------------------------------------------------
  static const String playerPageViewed = 'mantras_player_page_viewed';
  static const String audioStarted = 'mantras_audio_started';
  static const String audioPaused = 'mantras_audio_paused';
  static const String repetitionCompleted = 'mantras_repetition_completed';
  static const String audioLikeChanged = 'mantras_audio_like_changed';
  static const String audioShareClicked = 'mantras_audio_share_clicked';
  static const String audioShareResult = 'mantras_audio_share_result';

  // Counter (rows 76–80) ------------------------------------------------------
  static const String counterClicked = 'mantras_counter_clicked';
  static const String counterSheetViewed = 'mantras_counter_sheet_viewed';
  static const String repeatCountSelected = 'mantras_repeat_count_selected';
  static const String repeatTargetCompleted = 'mantras_repeat_target_completed';
  static const String counterSheetClosed = 'mantras_counter_sheet_closed';

  // Playlist (rows 81–83) -----------------------------------------------------
  static const String playlistOpened = 'mantras_playlist_opened';
  static const String playlistItemSelected = 'mantras_playlist_item_selected';
  static const String playlistPlayClicked = 'mantras_playlist_play_clicked';

  // Playback lifecycle + reliability (rows 84–85) -----------------------------
  static const String audioAppStateChanged = 'mantras_audio_app_state_changed';
  static const String audioPlaybackFailed = 'mantras_audio_playback_failed';
}

/// Canonical property-key names used across Mantras events. Kept here so a
/// value name like `audio_id` lives in one place — call sites reference the
/// constant, not the string literal.
class MantrasEventProps {
  MantrasEventProps._();

  // Media identity + classification (used across most events)
  static const String audioId = 'audio_id';
  static const String audioName = 'audio_name';
  static const String audioType = 'audio_type';

  // Browse / discovery
  static const String deityId = 'deity_id';
  static const String deityName = 'deity_name';

  /// The slug of the deity the content belongs to (`deities.slug` — e.g.
  /// `hanuman`, `krishna`, `ganesha`). Distinct from [deityId], which on
  /// discovery/filter events carries the SELECTED filter (`all` when no
  /// deity is chosen): `deity_slug` always describes the CONTENT itself, so
  /// the warehouse can group any outcome event by deity regardless of how
  /// the user arrived at it. `null` for an uncategorised item.
  static const String deitySlug = 'deity_slug';
  static const String browseType = 'browse_type';
  static const String browseId = 'browse_id';
  static const String resultCount = 'result_count';
  static const String selectionSource = 'selection_source';
  static const String positionIndex = 'position_index';

  // Playback state
  static const String playbackPositionSeconds = 'playback_position_seconds';
  static const String playbackState = 'playback_state';
  static const String startReason = 'start_reason';
  static const String pauseReason = 'pause_reason';

  // Counter / repetition
  static const String repeatTarget = 'repeat_target';
  static const String previousRepeatTarget = 'previous_repeat_target';
  static const String currentRepeatTarget = 'current_repeat_target';
  static const String repetitionNumber = 'repetition_number';
  static const String repetitionCount = 'repetation_count'; // sheet spelling
  static const String totalListenSeconds = 'total_listen_seconds';

  // Playlist
  static const String sourceAudioId = 'source_audio_id';
  static const String selectedAudioId = 'selected_audio_id';
  static const String playlistSize = 'playlist_size';

  // Screen context / navigation
  static const String previousScreen = 'previous_screen';
  static const String entrySource = 'entry_source';

  // Like / share
  static const String action = 'action';
  static const String result = 'result';
  static const String destinationApp = 'destination_app';
  static const String errorCode = 'error_code';

  // App/playback lifecycle
  static const String appState = 'app_state';

  // Counter sheet
  static const String closeMethod = 'close_method';

  // Failure diagnostics
  static const String failureStage = 'failure_stage';
}
