/// Aarti & Bhajans analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 41–63 (module: "Aarti & Bhajans"). Every string here has a matching
/// row in that sheet — do NOT add locally-invented events; if the funnel
/// needs a new one, add the row to the sheet first and then land it here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 23 events fire)
///
/// Most events fire from the obvious call site (main-page bloc, player
/// bloc, tap-handler, etc.). Three needed a small amount of extra plumbing
/// worth calling out so future edits know where to look:
///
///  * `audioShareResult` — the share flow in `aarti_player_bloc.dart`
///    captures `ShareService.share()`'s `ShareOutcome` and fires this
///    event AFTER the sheet closes, with `result` + `destination_app` +
///    `error_code`.
///  * `playerClosed` — overrides `AartiPlayerBloc.close()` (fires when the
///    router pops the player route) and reads `playback_position_seconds`
///    + `playback_state` from the audio port so the values reflect where
///    the user actually was. `destination_screen` is currently null — a
///    router observer would be the proper source once we add one globally.
///  * `audioAppStateChanged` — `AartiPlayerScreen` state mixes in
///    `WidgetsBindingObserver` while the screen is mounted; every
///    lifecycle transition dispatches `AartiPlayerAppStateChanged` to the
///    bloc, which fires the event with the current `playback_state` +
///    `playback_position_seconds` (bloc no-ops when it's not on
///    `AartiPlayerReady`).
class AartiEvents {
  AartiEvents._();

  // Main + browse discovery (rows 41–47) --------------------------------------
  static const String pageViewed = 'aarti_bhajans_page_viewed';
  static const String recentlyPlayedShowAllClicked =
      'aarti_recently_played_show_all_clicked';
  static const String recentlyPlayedPageViewed =
      'aarti_recently_played_page_viewed';
  static const String categoryClicked = 'aarti_category_clicked';
  static const String deityClicked = 'aarti_deity_clicked';
  static const String browsePageViewed = 'aarti_browse_page_viewed';
  static const String audioSelected = 'aarti_audio_selected';

  // Player (rows 48–59) -------------------------------------------------------
  static const String playerPageViewed = 'aarti_player_page_viewed';
  static const String audioStarted = 'aarti_audio_started';
  static const String audioPaused = 'aarti_audio_paused';
  static const String audioCompleted = 'aarti_audio_completed';
  static const String audioLikeChanged = 'aarti_audio_like_changed';
  static const String audioShareClicked = 'aarti_audio_share_clicked';
  static const String audioShareResult = 'aarti_audio_share_result';
  static const String forward10SecondsClicked =
      'aarti_forward_10_seconds_clicked';
  static const String rewind10SecondsClicked =
      'aarti_rewind_10_seconds_clicked';
  static const String nextAudioClicked = 'aarti_next_audio_clicked';
  static const String previousAudioClicked = 'aarti_previous_audio_clicked';
  static const String playerClosed = 'aarti_player_closed';

  // Mini-player + playback lifecycle (rows 60–63) -----------------------------
  static const String miniPlayerViewed = 'aarti_mini_player_viewed';
  static const String miniPlayerClicked = 'aarti_mini_player_clicked';
  static const String audioAppStateChanged = 'aarti_audio_app_state_changed';
  static const String audioPlaybackFailed = 'aarti_audio_playback_failed';
}

/// Canonical property-key names used across Aarti events. Kept here so a
/// value name like `audio_id` lives in one place — call sites reference the
/// constant, not the string literal.
class AartiEventProps {
  AartiEventProps._();

  // Media identity + classification (used across most events)
  static const String audioId = 'audio_id';
  static const String audioName = 'audio_name';
  static const String audioType = 'audio_type';
  static const String durationSeconds = 'duration_seconds';

  // Browse / discovery
  static const String categoryId = 'category_id';
  static const String categoryName = 'category_name';
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
  static const String elapsedPlaySeconds = 'elapsed_play_seconds';
  static const String playbackState = 'playback_state';
  static const String startReason = 'start_reason';
  static const String pauseReason = 'pause_reason';

  // Player controls (seek / next / prev)
  static const String fromAudioId = 'from_audio_id';
  static const String toAudioId = 'to_audio_id';
  static const String fromPositionSeconds = 'from_position_seconds';
  static const String toPositionSeconds = 'to_position_seconds';

  // Screen context / navigation
  static const String previousScreen = 'previous_screen';
  static const String entrySource = 'entry_source';
  static const String sourceScreen = 'source_screen';
  static const String destinationScreen = 'destination_screen';

  // Like / share
  static const String action = 'action';
  static const String result = 'result';
  static const String destinationApp = 'destination_app';
  static const String errorCode = 'error_code';

  // App/playback lifecycle
  static const String appState = 'app_state';

  // Failure diagnostics
  static const String failureStage = 'failure_stage';
  static const String retryCount = 'retry_count';
}

/// Canonical vocabulary for `entry_source` on [AartiEvents.pageViewed].
/// Mirrors `HomeEntrySource` so the two page-viewed funnels use the same
/// values; sourced from the app-wide `SessionContext.entrySource`.
class AartiEntrySource {
  AartiEntrySource._();

  static const String coldStart = 'cold_start';
  static const String resume = 'resume';
  static const String internal = 'internal';
  static const String deepLink = 'deep_link';
}

/// Fixed values for `audio_type` across the Aarti module. The current data
/// model has no per-item type field, so every item served by this module is
/// classified as `aarti`; if the CMS later returns a per-item type (bhajan /
/// mantra / stuti), thread it through `AartiAudio` and read it here instead.
class AartiAudioType {
  AartiAudioType._();

  static const String aarti = 'aarti';
  static const String bhajan = 'bhajan';
  static const String mantra = 'mantra';
  static const String stuti = 'stuti';
}

/// Canonical vocabulary for `start_reason` on [AartiEvents.audioStarted].
///
///  * `auto_play` — first play in a fresh player mount (user navigated into
///    the player, first track starts).
///  * `user_play` — user hit the play button after an explicit pause.
///  * `next_item` — queue advance (user Next / user Previous / auto-next on
///    track completion — all queue-driven boundary crossings).
///  * `resume` — reserved for post-app-resume playback continuation; not
///    wired yet.
class AartiStartReason {
  AartiStartReason._();

  static const String autoPlay = 'auto_play';
  static const String userPlay = 'user_play';
  static const String nextItem = 'next_item';
  static const String resume = 'resume';
}
