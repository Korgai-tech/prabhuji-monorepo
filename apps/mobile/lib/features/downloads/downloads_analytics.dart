/// Downloads analytics — event-name + property-key constants (TAM-125).
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events) for
/// the "Downloads" module — 11 events. Every string here has a matching row
/// in that sheet; call sites reference the constant, never the string
/// literal.
///
/// **Scoping** (per `docs/ANALYTICS-FLUTTER-GUIDE.md`):
///
///  * Facts about the ACTION → these event props.
///  * Facts about the USER (subscription state, session id) → the analytics
///    enricher (already stamped on every event automatically).
///  * `download_count`, `download_lifetime_count`,
///    `download_offline_play_share` → set via `identifyUser`
///    (`user_properties_tracker.dart`), NOT event props.
///
/// **Never** put `player_id` / `plan` / `workspace_id` / `subscription_status`
/// in `properties: {...}` — those belong on identify.
class DownloadsEvents {
  DownloadsEvents._();

  /// Fires on the play-page Download icon tap (BOTH free + Pro).
  static const String downloadClicked = 'download_clicked';

  /// Fires when a task transitions from idle/queued → actively downloading.
  static const String downloadStarted = 'download_started';

  /// Fires when a file finishes writing + integrity-checks and is playable
  /// offline.
  static const String downloadCompleted = 'download_completed';

  /// Fires on any failed download.
  static const String downloadFailed = 'download_failed';

  /// Fires on cancel — ring tap on the play page OR sheet on the row.
  static const String downloadCancelled = 'download_cancelled';

  /// Fires on Delete Download.
  static const String downloadRemoved = 'download_removed';

  /// Fires when the Downloads library first paints in a session.
  static const String downloadsPageViewed = 'downloads_page_viewed';

  /// Fires on filter-chip taps in the library.
  static const String downloadsFilterClicked = 'downloads_filter_clicked';

  /// Fires when playback starts from a downloaded file.
  static const String downloadedContentPlayed = 'downloaded_content_played';

  /// Fires ONCE per offline transition (false → true, debounced against
  /// flicker) — see `application/offline_watcher.dart`.
  static const String appOfflineModeEntered = 'app_offline_mode_entered';

  /// Fires on either the free-download tap OR the lapsed-play tap.
  static const String downloadsPaywallTriggered = 'downloads_paywall_triggered';
}

/// Canonical property-key names for downloads events.
class DownloadsEventProps {
  DownloadsEventProps._();

  static const String contentId = 'content_id';
  static const String contentType = 'content_type';
  static const String sourceScreen = 'source_screen';
  static const String userSubscriptionStatus = 'user_subscription_status';
  static const String fileSizeBytes = 'file_size_bytes';
  static const String networkType = 'network_type';
  static const String queuePosition = 'queue_position';
  static const String durationMs = 'duration_ms';
  static const String failureReason = 'failure_reason';
  static const String retryCount = 'retry_count';
  static const String bytesDownloaded = 'bytes_downloaded';
  static const String percentComplete = 'percent_complete';
  static const String daysSinceDownload = 'days_since_download';
  static const String playCount = 'play_count';
  static const String entryPoint = 'entry_point';
  static const String downloadCount = 'download_count';
  static const String isOffline = 'is_offline';
  static const String filterType = 'filter_type';
  static const String resultCount = 'result_count';
  static const String trigger = 'trigger';
}

/// Vocabulary for `entry_point` on `downloads_page_viewed`.
class DownloadsEntryPoint {
  DownloadsEntryPoint._();
  static const String bottomNav = 'bottom_nav';
  static const String profile = 'profile';
}

/// Vocabulary for `trigger` on `downloads_paywall_triggered`.
class DownloadsPaywallTrigger {
  DownloadsPaywallTrigger._();
  static const String freeDownloadTap = 'free_download_tap';
  static const String lapsedPlayTap = 'lapsed_play_tap';
}

/// Vocabulary for `filter_type` on `downloads_filter_clicked`.
class DownloadsFilterType {
  DownloadsFilterType._();
  static const String all = 'all';
  static const String aarti = 'aarti';
  static const String bhajan = 'bhajan';
  static const String mantra = 'mantra';
}

/// Vocabulary for `network_type` on `download_started` + `download_completed`.
///
/// `wifi` / `mobile` are the spec's two canonical values; `ethernet` +
/// `other` cover connectivity_plus's less common connection types (USB
/// tether, VPN, bluetooth) so we never emit a bare enum name; `offline`
/// is defensive — a legitimate `download_completed` should never carry it
/// (the file arrived somehow), but keeping the label consistent means
/// dashboards never see an unmapped raw enum.
class DownloadsNetworkType {
  DownloadsNetworkType._();
  static const String wifi = 'wifi';
  static const String mobile = 'mobile';
  static const String ethernet = 'ethernet';
  static const String other = 'other';
  static const String offline = 'offline';
}
