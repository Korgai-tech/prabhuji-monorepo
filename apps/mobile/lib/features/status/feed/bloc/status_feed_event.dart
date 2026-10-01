import 'package:equatable/equatable.dart';

/// Events for the Status feed (TAM-72).
sealed class StatusFeedEvent extends Equatable {
  const StatusFeedEvent();

  @override
  List<Object?> get props => const [];
}

/// Module entry — loads the overlay template + profile + the first feed page.
/// Fires `status_page_viewed` (Sheet 1 row 86). [entrySource] tags where the
/// user came from (`home_widget`, `bottom_navigation`, `deep_link`, …); if
/// the caller doesn't know, `internal` is the safe fallback.
///
/// [pinnedStatusId] (TAM-166): when set (e.g. the chat status-card tap), the
/// FIRST feed fetch asks the backend to prepend that card and dedupe it from
/// the tail. Kept on state after the initial page so it can survive rebuilds,
/// but is NOT re-sent on cursor pages or refetches (backend ignores it on
/// cursor pages — defense in depth).
class StatusFeedStarted extends StatusFeedEvent {
  const StatusFeedStarted({this.entrySource = 'internal', this.pinnedStatusId});
  final String entrySource;
  final String? pinnedStatusId;

  @override
  List<Object?> get props => [entrySource, pinnedStatusId];
}

/// A deity chip was tapped; `null` == All Gods (no filter). Refetches page 1 and
/// fires `status_deity_selected` (Sheet 1 row 88). [deityName] and
/// [positionIndex] ride into the event so the funnel can attribute filter
/// demand per-deity and per-position.
class StatusFeedDeitySelected extends StatusFeedEvent {
  const StatusFeedDeitySelected(this.deitySlug, {this.deityName, this.positionIndex});
  final String? deitySlug;
  final String? deityName;
  final int? positionIndex;

  @override
  List<Object?> get props => [deitySlug, deityName, positionIndex];
}

/// The active card changed (swipe or Next). Drives the single-active-video rule
/// and restarts the 2s view timer. `viaNext` is retained on the event for
/// backwards compat with call sites but is no longer surfaced as its own
/// analytics event (Sheet 1 rows 86–101 have no `status_next_*` row — the
/// only click event on the feed row is `status_share_clicked`).
class StatusFeedIndexChanged extends StatusFeedEvent {
  const StatusFeedIndexChanged(this.index, {this.viaNext = false});
  final int index;
  final bool viaNext;

  @override
  List<Object?> get props => [index, viaNext];
}

/// The active card has been visible for the 2s threshold (q5) — fires
/// `status_viewed` (Sheet 1 row 89) and POSTs `/status/{id}/view`. Emitted
/// once per card.
class StatusFeedViewThresholdReached extends StatusFeedEvent {
  const StatusFeedViewThresholdReached(this.statusId);
  final String statusId;

  @override
  List<Object?> get props => [statusId];
}

/// Like toggled on the active card (FREE) — optimistic, reverts on failure.
class StatusFeedLikeToggled extends StatusFeedEvent {
  const StatusFeedLikeToggled();
}

/// The user reached the end of the loaded feed — pull the next cursor page.
class StatusFeedMoreRequested extends StatusFeedEvent {
  const StatusFeedMoreRequested();
}

/// The saved profile changed (returned from the details flow) — the overlay
/// preview reads the active profile, so it just re-reads it.
class StatusFeedProfileRefreshed extends StatusFeedEvent {
  const StatusFeedProfileRefreshed();
}

/// The Status tab was re-tapped while already active: reload the first page
/// under the current deity filter. Unlike [StatusFeedStarted] it does NOT fire
/// `status_page_viewed` (the user never left the page) and never re-sends a
/// pinned id.
class StatusFeedRefreshRequested extends StatusFeedEvent {
  const StatusFeedRefreshRequested();
}

/// Dismiss the transient error banner.
class StatusFeedErrorCleared extends StatusFeedEvent {
  const StatusFeedErrorCleared();
}
