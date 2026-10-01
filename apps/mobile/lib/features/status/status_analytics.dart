/// Status Sharing analytics — event names + property keys.
///
/// Sourced 1:1 from the analytics contract's Sheet 1 (User Flow Events),
/// rows 86–101 (module: "Status Sharing"). Every string here has a matching
/// row in that sheet — do NOT add locally-invented events; if the funnel
/// needs a new one, add the row to the sheet first and then land it here.
///
/// Callers use these constants, never string literals, so a rename is a
/// grep-safe atomic change.
///
/// ## Wiring notes (all 16 events fire)
///
/// Most events fire from the obvious call site (feed bloc, share bloc,
/// profile bloc). A few needed care worth calling out so future edits know
/// where to look:
///
///  * `shareCtaClicked` / `shareSheetViewed` — the two pre-tile funnel
///    steps. `shareCtaClicked` fires from the Share CTA handler in the
///    WIDGET layer (`StatusHomeScreen._StatusCard._onSharePressed` and
///    `home_feed_card.dart::_shareStatusFromFeed`) because the bloc is not
///    reached until a destination is picked; `shareSheetViewed` fires from
///    `status_story_share_sheet.dart` once `installedTargets()` resolves.
///    Both carry the `share_session_id` minted at the CTA tap, which the
///    widget then hands to the bloc on `StatusShareRequested` so all six
///    events of one attempt join.
///  * `exportResult` — fires from `StatusShareBloc._render` when the render
///    terminates, with `result` = success/failure and (on failure) an
///    `error_code` = `render_failed` | `render_unsupported`.
///  * `shareResult` — fires from `StatusShareBloc._shareFile` after the
///    share sheet returns. `shareRenderedFile` has no `ShareOutcome`
///    (returns void), so we report success on no-throw and failure on
///    throw; the sheet notes "when detectable" so `cancelled` is
///    intentionally out of scope for this path. `destination_app` stays
///    null (the story-target flow uses the direct-intent path which cannot
///    report the chosen app).
///  * `businessDetailsCompleted` / `businessDetailsPageViewed` /
///    `businessDetailsSaveResult` — constants retained for the sheet's
///    contract, but the mobile app NEVER emits them after TAM-168. The
///    Business persona is retired from the mobile UI; grandfathered
///    `activeProfileType='business'` rows render as personal.
///  * `addDetailsStripClicked` — TAM-168; fires from the strip's
///    `GestureDetector` in `_OverlayPrompt` when the profile has no name
///    or photo saved. Precedes the `pushStatusDetails` call so a slow
///    route never loses the funnel event.
///  * `personalNameAdded` — fires from `StatusProfileBloc._onFieldChanged`
///    the FIRST time the personal name transitions from empty to
///    non-empty in the current bloc lifetime (bucketed length; never the
///    raw name).
///
/// ## Profile presence is GLOBAL, not per-event
///
/// Whether the user has a display name / avatar saved is answered by
/// `has_name` and `has_photo`, stamped on EVERY event in the app by
/// `AnalyticsEnricher` (backed by `StatusProfileFlagsStore`, which the
/// status repository mirrors on every profile fetch and save). Do NOT add a
/// per-event presence property here — that is exactly the drift this
/// replaced. The removed ones were `name_present`, `avatar_present`,
/// `existing_details_present` and `has_existing_details`; two of them
/// disagreed with each other (`existing_details_present` ignored the avatar
/// entirely, so a photo-only user reported "no details").
///  * `personalDetailsPageViewed` / `businessDetailsPageViewed` — fire
///    from `StatusProfileBloc._onLoad` after the initial load resolves,
///    tagged by the active tab that will render first.
///  * `profileImageResult` — fires from `StatusProfileBloc._onAvatarRequested`
///    after the picker returns, mapping picked/cancelled/unavailable to
///    success/cancelled/failure.
class StatusEvents {
  StatusEvents._();

  // Status Home (rows 86–87) --------------------------------------------------
  static const String pageViewed = 'status_page_viewed';
  static const String editDetailsClicked = 'status_edit_details_clicked';

  /// TAM-168 — the empty-state overlay strip becomes a tappable discovery
  /// affordance for the details editor. Fires from the strip's `GestureDetector`
  /// BEFORE the push (so a slow route never loses it). Sibling of
  /// `editDetailsClicked` — same destination, different entry point.
  static const String addDetailsStripClicked =
      'status_add_details_strip_clicked';

  // Filters + Status Feed (rows 88–91) ---------------------------------------
  static const String deitySelected = 'status_deity_selected';
  static const String viewed = 'status_viewed';
  static const String likeChanged = 'status_like_changed';

  /// The Share CTA tap on a status card — the user's INTENT moment, fired
  /// immediately on tap before anything async runs (no profile load, no
  /// installed-apps probe, no Pro gate).
  ///
  /// Read the name carefully: this is NOT [shareClicked]. Ordering is
  ///
  ///   shareCtaClicked → shareSheetViewed → shareClicked → exportStarted
  ///
  /// i.e. `status_share_cta_clicked` fires FIRST (Share button) and
  /// `status_share_clicked` fires LATER (the destination tile inside our own
  /// story-share sheet). The two used to collapse into one number, which hid
  /// three separate drop-offs: tap → sheet visible → destination picked.
  /// [shareClicked] keeps its historical name so existing dashboards and the
  /// warehouse funnel don't break.
  static const String shareCtaClicked = 'status_share_cta_clicked';

  /// The story-share sheet is up AND its installed-apps probe has resolved,
  /// so [StatusEventProps.appsShown] describes what the user can actually
  /// tap. Deliberately NOT first paint — the sheet renders dimmed tiles
  /// while `installedTargets()` is in flight, and an event fired then would
  /// report an empty app list on every share.
  static const String shareSheetViewed = 'status_share_sheet_viewed';

  /// A destination tile inside the story-share sheet was tapped. Despite the
  /// generic name this is the THIRD step of the funnel, not the first — see
  /// [shareCtaClicked].
  static const String shareClicked = 'status_share_clicked';

  // Export + Share Sheet (rows 92–94) ----------------------------------------
  static const String exportStarted = 'status_export_started';
  static const String exportResult = 'status_export_result';
  static const String shareResult = 'status_share_result';

  // Personal Details (rows 95–98) --------------------------------------------
  static const String personalDetailsPageViewed =
      'status_personal_details_page_viewed';
  static const String profileImageResult = 'status_profile_image_result';
  static const String personalNameAdded = 'status_personal_name_added';
  static const String personalDetailsSaveResult =
      'status_personal_details_save_result';

  // Business Details (rows 99–101) -------------------------------------------
  static const String businessDetailsPageViewed =
      'status_business_details_page_viewed';
  static const String businessDetailsCompleted =
      'status_business_details_completed';
  static const String businessDetailsSaveResult =
      'status_business_details_save_result';
}

/// Canonical property-key names used across Status events. Kept here so a
/// value name like `status_id` lives in one place — call sites reference the
/// constant, not the string literal.
class StatusEventProps {
  StatusEventProps._();

  // Content identity / classification
  static const String statusId = 'status_id';
  static const String mediaType = 'media_type';
  static const String filterId = 'filter_id';
  static const String positionIndex = 'position_index';

  // Filter / discovery
  static const String deityId = 'deity_id';
  static const String deityName = 'deity_name';

  /// The slug of the deity the content belongs to (`deities.slug` — e.g.
  /// `hanuman`, `krishna`, `ganesha`). Distinct from [deityId], which on
  /// discovery/filter events carries the SELECTED filter (`all` when no
  /// deity is chosen): `deity_slug` always describes the CONTENT itself, so
  /// the warehouse can group any outcome event by deity regardless of how
  /// the user arrived at it. `null` for an uncategorised item.
  static const String deitySlug = 'deity_slug';

  /// Whether the user was entitled to Pro **at the moment this event fired**
  /// — read live from the share bloc's `isPro` seam at each call site, NOT
  /// snapshotted when the flow started.
  ///
  /// Deliberately NOT named `is_premium_user`: that name is already taken by
  /// the user property, which carries CURRENT-state semantics (whatever the
  /// user's entitlement is when the warehouse reads the profile). The two
  /// answer different questions and diverge exactly where it matters — a user
  /// who hits the paywall and buys mid-flow fires `status_share_clicked` with
  /// `is_pro_at_event: false` and `status_export_started` /
  /// `status_export_result` / `status_share_result` with `true`, while the
  /// user property reads `true` for all four forever after. Reusing the name
  /// would silently collapse the free→paid conversion step this chain exists
  /// to measure.
  static const String isProAtEvent = 'is_pro_at_event';

  /// Correlation id for ONE share attempt. Minted at the Share CTA tap and
  /// carried, unchanged, through every event of that attempt:
  ///
  ///   status_share_cta_clicked → status_share_sheet_viewed
  ///     → status_share_clicked → status_export_started
  ///     → status_export_result → status_share_result
  ///
  /// This is what makes the funnel joinable PER ATTEMPT. Without it a user
  /// who taps Share, backs out of the sheet, then taps Share again and
  /// completes produces two interleaved half-funnels that can only be
  /// stitched by timestamp guesswork.
  ///
  /// Distinct from the SDK's own `session_id` (a 30-minute inactivity
  /// window spanning the whole app) and from `event_id` (unique per event).
  /// A share attempt is a sub-session: many per SDK session, one per tap.
  ///
  /// Minted with `newUuidV4()` in the widget layer and handed to the bloc on
  /// [StatusShareRequested] — the bloc must never generate its own, or the
  /// pre-tile events would carry a different id from the post-tile ones.
  static const String shareSessionId = 'share_session_id';

  // Profile / overlay
  static const String profileType = 'profile_type';

  /// Whether the export actually burned an overlay band in — i.e. the render
  /// decision, not the profile state that produced it.
  ///
  /// Numerically this is `has_name || has_photo`, and BOTH of those now ride
  /// on every event as global properties stamped by `AnalyticsEnricher`, so
  /// this is derivable. It is kept deliberately: it reports what the RENDERER
  /// did, which is the thing `status_export_started` exists to describe, and
  /// existing dashboards filter on it. If the render gate ever stops being a
  /// pure function of the two flags, this is the property that stays correct.
  static const String overlayUsed = 'overlay_used';

  // Screen context / navigation
  static const String previousScreen = 'previous_screen';
  static const String entrySource = 'entry_source';
  static const String sourceScreen = 'source_screen';

  /// TAM-168 — the destination screen the strip tap navigates to (canonical
  /// value: `status_personal_details`). Kept as a property so any future
  /// re-target lands in analytics without a new event name.
  static const String destinationScreen = 'destination_screen';

  // Like / share
  static const String action = 'action';
  static const String result = 'result';
  static const String destinationApp = 'destination_app';
  static const String errorCode = 'error_code';

  // Share sheet
  /// Milliseconds from the Share CTA tap to the story-share sheet being up
  /// WITH its installed-apps probe resolved. Measures the dead time the user
  /// stares at before they can pick a destination — on Home this includes a
  /// profile fetch that may still be in flight.
  static const String timeToSheetMs = 'time_to_sheet_ms';

  /// The destinations actually offered as tappable, as a list of
  /// [StoryShareTarget] names (`whatsapp`, `instagram`, …).
  ///
  /// Excludes `more_apps`: that row is ALWAYS rendered as the OS-chooser
  /// fallback, so including it would add a constant to every row and inflate
  /// [appsShownCount] by exactly one forever. On iOS the platform channel
  /// resolves the installed set to empty by design, so this is `[]` there.
  static const String appsShown = 'apps_shown';

  /// Length of [appsShown]. Denormalised so the warehouse can filter and
  /// bucket without unpacking the JSON array.
  static const String appsShownCount = 'apps_shown_count';

  // Export diagnostics
  static const String renderTimeMs = 'render_time_ms';
  static const String outputSizeBucket = 'output_size_bucket';

  // Personal / business details form (all booleans / bucketed — never raw)
  //
  // NOTE: `existing_details_present`, `name_present` and `avatar_present`
  // used to live here. All three reported the same two facts the global
  // `has_name` / `has_photo` properties now stamp on EVERY event (see
  // `AnalyticsEnricher`), so they were removed rather than left to drift —
  // one key per fact. `name_length_bucket` stays: length is a different
  // question from presence.
  static const String nameLengthBucket = 'name_length_bucket';
  static const String fileSizeBucket = 'file_size_bucket';
  static const String businessNamePresent = 'business_name_present';
  static const String businessDetailsPresent = 'business_details_present';
  static const String businessPhonePresent = 'business_phone_present';
}

/// Canonical `entry_source` values for `status_personal_details_page_viewed`
/// and `status_add_details_strip_clicked` (TAM-168). One string constant per
/// entry point so the two call sites can't drift.
class StatusEntrySources {
  StatusEntrySources._();

  /// Tap originated on the empty-state overlay strip.
  static const String addDetailsStrip = 'add_details_strip';

  /// Tap originated on the top-right "Edit Details" pill.
  static const String editDetailsButton = 'edit_details_button';

  /// TAM-174 — tap originated on the generalized modal's CTA (the
  /// "add your name and photo" status-intro prompt shown on Home cold
  /// start). See `lib/features/modals/presentation/modal_host.dart`.
  static const String introModal = 'intro_modal';
}

/// Canonical `source_screen` values for the share funnel — which surface the
/// Share CTA was tapped on. Two entry points reach the SAME
/// [StatusShareBloc], so without this property their funnels are
/// indistinguishable in the warehouse.
class StatusShareSourceScreens {
  StatusShareSourceScreens._();

  /// The Status tab's own card feed (`StatusHomeScreen`).
  static const String statusFeed = 'status_feed';

  /// A status card's CTA on the Home feed (`HomeFeedCard`).
  static const String homeFeed = 'home_feed';
}

/// Canonical `destination_screen` values for TAM-168.
class StatusDestinationScreens {
  StatusDestinationScreens._();

  /// The personal-only details editor (TAM-168 — Business tab removed).
  static const String personalDetails = 'status_personal_details';
}

/// Bucket a name length into one of Sheet-1's canonical buckets. Callers must
/// never send the raw name — only the bucket string.
String statusNameLengthBucket(int length) {
  if (length <= 0) return '0';
  if (length <= 5) return '1-5';
  if (length <= 10) return '6-10';
  if (length <= 20) return '11-20';
  if (length <= 40) return '21-40';
  return '41+';
}
