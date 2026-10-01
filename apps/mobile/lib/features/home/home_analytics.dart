/// Home analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1, rows 27–40 (module:
/// "Home"). Two events in this list (`support_clicked`, `profile_clicked`)
/// intentionally lack a `home_` prefix — that matches the sheet's naming
/// (they live in the Home module but read as generic click events); do not
/// re-prefix them without updating Sheet 1 first.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 14 events fire)
///
///  * `contentShareResult` — share flow in `home_feed_card.dart` captures
///    `ShareService.share()`'s `ShareOutcome` and fires this AFTER the
///    sheet closes.
///  * `feedDepthReached` — `HomeFeedBloc` emits a checkpoint event when
///    the accumulated impression count crosses 10, 25, 50 or 100. One
///    fire per threshold per session.
///  * `contentLoadFailed` — `HomeFeedBloc._onFailure` fires this after
///    the last retry with `failure_area` + `error_code` + `retry_count`.
///  * `bottomNavigationClicked` — the shell bottom nav owns this; fires
///    per tap regardless of destination module.
class HomeEvents {
  HomeEvents._();

  // Page + top nav (rows 27–29) ------------------------------------------------
  static const String pageViewed = 'home_page_viewed';
  static const String supportClicked = 'support_clicked';
  static const String profileClicked = 'profile_clicked';

  // Banner (rows 30–31) --------------------------------------------------------
  static const String bannerViewed = 'home_banner_viewed';
  static const String bannerClicked = 'home_banner_clicked';

  // Feature widgets (row 32) ---------------------------------------------------
  static const String widgetClicked = 'home_widget_clicked';

  // Feed (rows 33–37) ----------------------------------------------------------
  static const String contentViewed = 'home_content_viewed';
  static const String contentLikeChanged = 'home_content_like_changed';
  static const String contentShareClicked = 'home_content_share_clicked';
  static const String contentShareResult = 'home_content_share_result';
  static const String listenToMoreClicked = 'listen_to_more_clicked';

  // Bottom nav (row 38) --------------------------------------------------------
  static const String bottomNavigationClicked = 'bottom_navigation_clicked';

  // Feed engagement + reliability (rows 39–40) --------------------------------
  static const String feedDepthReached = 'home_feed_depth_reached';
  static const String contentLoadFailed = 'home_content_load_failed';
}

/// Canonical property-key names for Home events. Reused across call sites so
/// a value name like `content_id` lives in one place.
class HomeEventProps {
  HomeEventProps._();

  // Page entry
  static const String entrySource = 'entry_source';
  static const String loadTimeMs = 'load_time_ms';
  static const String sourceScreen = 'source_screen';

  // Banner
  static const String bannerId = 'banner_id';
  static const String destinationType = 'destination_type';
  static const String destinationId = 'destination_id';
  static const String positionIndex = 'position_index';

  /// `image` | `video` — on BOTH `home_banner_viewed` and
  /// `home_banner_clicked`, so the funnel can compare view→click rates
  /// between the two banner kinds. The value is
  /// `HomeBannerMediaType.wire`, i.e. the CMS's own vocabulary.
  static const String mediaType = 'media_type';

  // Widgets
  static const String widgetId = 'widget_id';
  static const String widgetName = 'widget_name';
  static const String destinationModule = 'destination_module';

  /// TAM-174 — which shortcut-grid design this tap happened on:
  /// `control` or `gradient_v1`.
  ///
  /// An EVENT property, not a user property. It is a fact about how this
  /// surface was rendered for this action, not about the person — per
  /// `apps/mobile/CLAUDE.md`, facts about the user belong on `identifyUser`.
  ///
  /// Carries the ARM, never the bucket. The server's bucket is a salted digest
  /// and so is not reversible to anything, but it is also not a dimension any
  /// analysis needs: the arm is what splits the funnel.
  static const String gridVariant = 'grid_variant';

  // Content
  static const String contentId = 'content_id';
  static const String contentType = 'content_type';
  static const String action = 'action';

  // Share
  static const String result = 'result';
  static const String destination = 'destination';
  static const String errorCode = 'error_code';

  // Bottom nav
  static const String navigationItem = 'navigation_item';
  static const String destinationScreen = 'destination_screen';

  // Feed engagement / reliability
  static const String itemsSeenCount = 'items_seen_count';
  static const String failureArea = 'failure_area';
  static const String retryCount = 'retry_count';
}

/// Canonical vocabulary for `entry_source` on [HomeEvents.pageViewed].
/// Values align with the app-wide entry_source concept:
///
///  * `cold_start` — the app has just launched fresh; `HomeStarted` fires
///    for the first time on this process. Mirrors
///    `SessionContext.entrySource == 'cold_start'`.
///  * `resume` — the app returned from background before Home was reached
///    or was re-created. Mirrors `SessionContext.entrySource == 'resume'`.
///  * `internal` — the user navigated back to the Home tab from another
///    tab in the same session (bottom nav / back stack).
///  * `deep_link` — reserved for future deep-link-to-home entries.
class HomeEntrySource {
  HomeEntrySource._();

  static const String coldStart = 'cold_start';
  static const String resume = 'resume';
  static const String internal = 'internal';
  static const String deepLink = 'deep_link';
}
