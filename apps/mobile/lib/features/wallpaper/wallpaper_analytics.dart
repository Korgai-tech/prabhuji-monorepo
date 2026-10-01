/// Wallpaper analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 127–140 (module: "Wallpaper"). Every string here has a matching row
/// in that sheet — do NOT add locally-invented events; if the funnel needs a
/// new one, add the row to the sheet first and then land it here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 14 events fire)
///
/// Most events fire from the obvious call site (home bloc, listing screen,
/// preview bloc, tap-handler, etc.). Four needed a small amount of extra
/// plumbing worth calling out so future edits know where to look:
///
///  * `swiped` — `WallpaperPreviewBloc._onIndexChanged` computes the swipe
///    direction from the delta between the previous and new active index
///    and fires this with `from_wallpaper_id` + `to_wallpaper_id` +
///    `direction` + `source_context`.
///  * `backClicked` — `WallpaperPreviewScreen`'s back handler reads the
///    active page's `playback_time_seconds` via a registered position
///    callback (only live pages report >0; static pages report 0). The port
///    exposes `currentPosition` for this.
///  * `shareResult` — the share flow in `WallpaperPreviewBloc._onShareRequested`
///    captures `ShareService.share()`'s `ShareOutcome` and fires this AFTER
///    the sheet closes, with `result` + `destination_app` + `error_code`.
///  * `setWallpaperResult` — `SetWallpaperBloc` fires this on EACH terminal
///    state (`success` / `failure` / `unsupported` / `cancelled`) so the set
///    funnel resolves for every attempt, not just the happy path. The
///    `unsupported` branch additionally fires `unsupportedActionViewed`
///    (row 140) for the compatibility guardrail.
class WallpaperEvents {
  WallpaperEvents._();

  // Discovery + browse (rows 127–130) -----------------------------------------
  static const String pageViewed = 'wallpaper_page_viewed';
  static const String deitySelected = 'wallpaper_deity_selected';
  static const String rowViewed = 'wallpaper_row_viewed';
  static const String selected = 'wallpaper_selected';

  // Preview + engagement (rows 131–136) ---------------------------------------
  static const String previewViewed = 'wallpaper_preview_viewed';
  static const String swiped = 'wallpaper_swiped';
  static const String backClicked = 'wallpaper_back_clicked';
  static const String likeChanged = 'wallpaper_like_changed';
  static const String shareClicked = 'wallpaper_share_clicked';
  static const String shareResult = 'wallpaper_share_result';

  // Set + system-action outcomes (rows 137–140) -------------------------------
  static const String setWallpaperClicked = 'set_wallpaper_clicked';
  static const String setLockscreenClicked = 'set_lockscreen_clicked';
  static const String setWallpaperResult = 'set_wallpaper_result';
  static const String unsupportedActionViewed =
      'wallpaper_unsupported_action_viewed';
}

/// Canonical property-key names used across Wallpaper events. Kept here so a
/// value name like `wallpaper_id` lives in one place — call sites reference the
/// constant, not the string literal.
class WallpaperEventProps {
  WallpaperEventProps._();

  // Media identity + classification (used across most events)
  static const String wallpaperId = 'wallpaper_id';
  static const String wallpaperName = 'wallpaper_name';
  static const String mediaType = 'media_type';

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
  static const String rowId = 'row_id';
  static const String rowName = 'row_name';
  static const String itemCount = 'item_count';
  static const String positionIndex = 'position_index';
  static const String selectionSource = 'selection_source';

  // Preview / feed
  static const String sourceContext = 'source_context';
  static const String fromWallpaperId = 'from_wallpaper_id';
  static const String toWallpaperId = 'to_wallpaper_id';
  static const String direction = 'direction';

  // Back / playback
  static const String playbackTimeSeconds = 'playback_time_seconds';

  // Engagement
  static const String action = 'action';

  // Share
  static const String result = 'result';
  static const String destinationApp = 'destination_app';
  static const String errorCode = 'error_code';

  // Set / system-action outcomes
  static const String setTarget = 'set_target';
  static const String deviceModel = 'device_model';
  static const String androidVersion = 'android_version';

  // Screen context
  static const String previousScreen = 'previous_screen';
  static const String entrySource = 'entry_source';

  // Set-target fixed values (row 137: home_screen; row 138: lock_screen).
  static const String setTargetHomeScreen = 'home_screen';
  static const String setTargetLockScreen = 'lock_screen';

  // Result enum values (Sheet-1: success | failure | pending | cancelled).
  static const String resultSuccess = 'success';
  static const String resultFailure = 'failure';
  static const String resultCancelled = 'cancelled';
  static const String resultUnsupported = 'unsupported';

  // Direction enum values for swipe.
  static const String directionForward = 'forward';
  static const String directionBackward = 'backward';

  // Like/unlike action values.
  static const String actionLike = 'like';
  static const String actionUnlike = 'unlike';
}
