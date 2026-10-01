import 'package:meta/meta.dart';

import 'data/status_models.dart';
import 'status_analytics.dart';

/// go_router paths for the Status module (TAM-72).
///
/// Unlike Aarti/Mantras/Ringtone/Wallpaper (which open full-screen OVER the
/// shell), Status Home IS a shell branch — Figma `302:4384` renders the
/// five-item bottom nav with Status active, so the feed lives INSIDE the
/// TAM-58 `StatefulShellRoute` and keeps its own stack. The details flow pushes
/// over the shell (it has its own back-nav and no bottom tabs, per `371:2185`).
class StatusRoutes {
  StatusRoutes._();

  /// Module entry — the shell's Status branch (bottom-nav tab + Home CTA).
  static const String home = '/status';

  /// The Personal/Business details flow — the [StatusDetailsArgs] ride as
  /// `extra`. Pushed over the shell.
  static const String details = '/status/details';

  /// Query parameter on [home] carrying the status card to PIN to the top.
  static const String pinnedIdParam = 'pinnedId';

  /// Chat deep-link into the feed with a specific status card PINNED to the
  /// top (TAM-166). The SAME [home] route with [pinnedIdParam] — the chat
  /// status-card tap `context.go`es here, so the Status tab's own page
  /// reloads with the pin (bottom nav visible, Status highlighted) and one
  /// back goes Home. It used to be a nested `/status/pinned/:id` page stacked
  /// on the feed, so the first back only revealed an identical-looking feed.
  /// The backend accepts `pinnedId` on `GET /status/feed` and prepends the
  /// card fail-soft (missing/filtered id ⇒ ignored, feed still renders).
  static String homePinned(String id) =>
      Uri(path: home, queryParameters: {pinnedIdParam: id}).toString();
}

/// Route extra for the details flow. After TAM-168 the mobile app only renders
/// the personal face — [initialType] is retained on the API but the bloc
/// always resolves the active type to personal at load, so a caller passing
/// [StatusProfileType.business] is harmless.
///
/// [entryMessage] is shown as a SnackBar on first mount. TAM-168 removed the
/// forced details bounce on Share, so this is now only used by legacy callers
/// (kept optional for compatibility).
///
/// [entrySource] tags which surface pushed this route so
/// `status_personal_details_page_viewed` can attribute the funnel entry
/// (`add_details_strip` vs `edit_details_button`). Missing / unknown value
/// defaults to `edit_details_button` — the pill is by far the more common
/// entry, and defaulting to a real bucket is safer than shipping a `null`
/// metric.
@immutable
class StatusDetailsArgs {
  const StatusDetailsArgs({
    this.initialType = StatusProfileType.personal,
    this.entryMessage,
    this.entrySource = StatusEntrySources.editDetailsButton,
  });

  final StatusProfileType initialType;
  final String? entryMessage;
  final String entrySource;
}
