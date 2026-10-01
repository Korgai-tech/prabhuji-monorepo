import 'package:meta/meta.dart';

import 'data/mantras_models.dart';

/// go_router paths for the Mantras & Stutis module (TAM-66). The module opens
/// full-screen OVER the shell (its own back-nav + title, no bottom tabs), like
/// `/paywall` and the Aarti module.
class MantrasRoutes {
  MantrasRoutes._();

  /// Module entry (sectioned main page).
  static const String main = '/mantras';

  /// Reusable 2-column Show-all listing — the [MantraListQuery] rides as `extra`.
  static const String listing = '/mantras/show-all';

  /// Full Pro-only player — the [MantrasPlayerArgs] ride as `extra`.
  static const String player = '/mantras/player';

  /// Deep-link resolver — accepts a bare item id in the URL, refreshes
  /// entitlement, and routes Pro users into the full player / free users
  /// to the module home. Mirror of `AartiRoutes.deepLinkPattern` and
  /// consumed by `home_feed/destinations.dart` when a mantra content_detail
  /// CTA fires.
  static const String deepLinkPattern = '/mantras/audio/:itemId';
  static String deepLink(String itemId) => '/mantras/audio/$itemId';
}

/// Route extra for the full player. Carries the originally-resolved item + its
/// server-authoritative queue + analytics context so a post-purchase
/// continuation restores EXACTLY the tapped surface after the paywall round-trip.
@immutable
class MantrasPlayerArgs {
  const MantrasPlayerArgs({
    required this.itemId,
    required this.queue,
    required this.index,
    required this.playlistSource,
    this.autoStart = true,
  });

  /// The item the player opens on and auto-plays.
  final String itemId;

  /// The ordered, server-authoritative queue prev/next walk (may be empty for a
  /// mini-player re-open → seeded from the returned detail playlist).
  final List<MantraAudio> queue;

  /// Index of [itemId] within [queue] (`0` when a single item).
  final int index;

  /// Analytics `playlist_source` (e.g. `newly_added`, `deity`, `category`).
  final String playlistSource;

  /// `false` when re-opening the player for an already-active item (mini-player
  /// tap) — attach to playback, don't restart.
  final bool autoStart;
}
