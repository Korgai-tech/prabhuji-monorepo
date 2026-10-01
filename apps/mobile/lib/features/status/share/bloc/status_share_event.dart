import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart';

import '../../data/status_models.dart';
import '../data/story_share_launcher.dart';

sealed class StatusShareEvent extends Equatable {
  const StatusShareEvent();

  @override
  List<Object?> get props => const [];
}

/// Share tapped on the active card.
///
/// [boundaryKey] identifies the on-screen `RepaintBoundary` wrapping the
/// media + overlay — it is captured ONLY after entitlement passes, so a free
/// user never triggers a render (PRD §8 `render_before_paywall: false`).
///
/// [target] is the destination the user picked from the story-share sheet.
/// Defaults to [StoryShareTarget.moreApps] so callers (and existing tests)
/// that don't need story routing keep going through the OS share sheet.
/// [shareSessionId] correlates every event of ONE share attempt. It is minted
/// in the widget layer at the Share CTA tap — BEFORE this event exists — and
/// handed down here so the pre-tile events (`status_share_cta_clicked`,
/// `status_share_sheet_viewed`) and the four the bloc fires all carry the
/// same id. The bloc must never mint its own; a null id means the caller
/// predates the funnel wiring and those events simply go unjoined.
class StatusShareRequested extends StatusShareEvent {
  const StatusShareRequested({
    required this.item,
    required this.profile,
    required this.boundaryKey,
    this.target = StoryShareTarget.moreApps,
    this.shareSessionId,
  });

  final StatusFeedItem item;
  final StatusProfileData profile;
  final GlobalKey boundaryKey;
  final StoryShareTarget target;
  final String? shareSessionId;

  @override
  List<Object?> get props =>
      [item.id, profile.activeProfileType, target, shareSessionId];
}

/// Dismiss a transient render/share message.
class StatusShareMessageCleared extends StatusShareEvent {
  const StatusShareMessageCleared();
}
