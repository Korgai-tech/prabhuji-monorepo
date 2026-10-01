import 'package:meta/meta.dart';

import 'data/aarti_models.dart';

/// go_router paths for the Aarti & Bhajans module (TAM-64). The module opens
/// full-screen OVER the shell (its own back-nav + title, no bottom tabs), like
/// `/paywall`.
class AartiRoutes {
  AartiRoutes._();

  /// Module entry (sectioned main page).
  static const String main = '/aarti-bhajans';

  /// Reusable 2-column listing — the [AartiListQuery] rides as the route extra.
  static const String listing = '/aarti-bhajans/listing';

  /// Full Pro-only player — the [AartiPlayerArgs] ride as the route extra.
  static const String player = '/aarti-bhajans/player';

  /// Deep link `prabhuji://aarti-bhajans/audio/{audio_id}` (q4). Registered as a
  /// path param route so the app's deep-link handler resolves it.
  static const String deepLinkPattern = '/aarti-bhajans/audio/:audioId';
  static String deepLink(String audioId) => '/aarti-bhajans/audio/$audioId';
}

/// Route extra for the full player. Carries the originally-tapped item + its
/// source queue + analytics context so post-purchase continuation can restore
/// EXACTLY the tapped item and its queue after the paywall round-trip
/// (#PATH_DECISION — persisted in the passed extra, never ephemeral widget state).
@immutable
class AartiPlayerArgs {
  const AartiPlayerArgs({
    required this.audioId,
    required this.queue,
    required this.index,
    required this.sourceListType,
    this.sourceFilter,
    this.autoStart = true,
  });

  /// The tapped audio id — what the player opens on and auto-plays.
  final String audioId;

  /// The ordered source list the player's prev/next walk (may be empty for a
  /// deep-link with no browsing context → single-item playback).
  final List<AartiAudio> queue;

  /// Index of [audioId] within [queue] (`0` when queue is a single item).
  final int index;

  /// Analytics `source_list_type` (e.g. `newly_added`, `category`).
  final String sourceListType;

  /// Analytics `source_filter` (category/deity slug), when applicable.
  final String? sourceFilter;

  /// `false` when re-opening the player for an already-active item (mini-player
  /// tap / deep link into ongoing playback) — attach to playback, don't restart.
  final bool autoStart;
}
