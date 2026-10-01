import 'dart:async';

import 'package:meta/meta.dart';

/// Events for [HomeFeedBloc] (TAM-62).
@immutable
sealed class HomeFeedEvent {
  const HomeFeedEvent();
}

/// Screen mounted — load banners + the first feed page. The two are INDEPENDENT
/// sections: either can fail without taking the other (or the static chrome)
/// down (pattern §2, PRD §16).
class HomeStarted extends HomeFeedEvent {
  const HomeStarted();
}

/// Retry after a feed failure (the retry CTA under the shortcut cards).
class HomeFeedRetryRequested extends HomeFeedEvent {
  const HomeFeedRetryRequested();
}

/// User pulled the feed down to refresh (TAM-122 §3). Re-runs the three loaders
/// while preserving `impressedIds` / `viewedIds` dedupe so a card in view
/// through the refresh doesn't re-fire its impression/view events.
///
/// Carries a [Completer] so `RefreshIndicator.onRefresh` can await the whole
/// three-loader dance — the indicator disappears the moment the handler
/// completes, success or failure.
class HomeFeedRefreshRequested extends HomeFeedEvent {
  HomeFeedRefreshRequested({Completer<void>? completer})
      : completer = completer ?? Completer<void>();

  final Completer<void> completer;
}

/// Retry ONLY the banner section (silent — banners have no retry CTA; they hide
/// on failure per §8/§16). Fired when the feed retry succeeds, so a transient
/// blip doesn't hide the carousel for the whole session.
class HomeBannersRefreshRequested extends HomeFeedEvent {
  const HomeBannersRefreshRequested();
}

/// Infinite scroll — append the next cursor page.
class HomeFeedMoreRequested extends HomeFeedEvent {
  const HomeFeedMoreRequested();
}

/// A card became visible at all (first visible pixel) → `home_feed_item_impression`.
class HomeFeedItemImpressed extends HomeFeedEvent {
  const HomeFeedItemImpressed(this.itemId);
  final String itemId;
}

/// A card crossed (or fell below) the 50% visibility threshold. The 2s dwell
/// timer is armed/cancelled in the BLOC, not the widget, so dedup is per session
/// (pattern §5).
class HomeFeedItemVisibilityChanged extends HomeFeedEvent {
  const HomeFeedItemVisibilityChanged({
    required this.itemId,
    required this.visible,
  });

  final String itemId;

  /// `true` when ≥ `AppHome.viewVisibleFraction` of the card is on screen.
  final bool visible;
}

/// The 2s dwell timer elapsed for [itemId] → count the view.
class HomeFeedViewThresholdReached extends HomeFeedEvent {
  const HomeFeedViewThresholdReached(this.itemId);
  final String itemId;
}

/// Like tapped — optimistic toggle, reverts on repository failure.
class HomeFeedLikeToggled extends HomeFeedEvent {
  const HomeFeedLikeToggled(this.itemId);
  final String itemId;
}

/// The native share sheet was opened for [itemId] — record the server count.
class HomeFeedShared extends HomeFeedEvent {
  const HomeFeedShared(this.itemId, {this.channel});
  final String itemId;
  final String? channel;
}

/// Dismiss the transient error banner (e.g. a reverted like).
class HomeFeedErrorCleared extends HomeFeedEvent {
  const HomeFeedErrorCleared();
}
