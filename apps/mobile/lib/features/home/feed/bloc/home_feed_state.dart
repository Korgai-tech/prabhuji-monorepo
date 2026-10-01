import 'package:meta/meta.dart';

import '../../data/home_models.dart';

/// Per-section load status. Home's sections fail INDEPENDENTLY (pattern §2), so
/// banners and feed each carry their own.
enum HomeSectionStatus { initial, loading, ready, failure }

/// State for [HomeFeedBloc] (TAM-62).
///
/// Carries no entitlement field: Home renders identically for free and Pro users
/// (PRD §5), so there is nothing for a card to branch on. The Pro-adjacent
/// decisions (a pro-discovery banner tap) read the LIVE entitlement at the tap
/// site through `PaywallGate`, never from cached state.
@immutable
class HomeFeedState {
  const HomeFeedState({
    this.bannerStatus = HomeSectionStatus.initial,
    this.banners = const <HomeBannerView>[],
    this.shortcutStatus = HomeSectionStatus.initial,
    this.shortcuts = const <HomeShortcutView>[],
    this.feedStatus = HomeSectionStatus.initial,
    this.items = const <HomeFeedItemView>[],
    this.nextCursor,
    this.loadingMore = false,
    this.viewedIds = const <String>{},
    this.impressedIds = const <String>{},
    this.errorMessage,
  });

  final HomeSectionStatus bannerStatus;

  /// Banners that loaded. Empty + [bannerStatus] failure/ready ⇒ the whole
  /// section HIDES (§8/§16) — never an error state, never a broken image.
  final List<HomeBannerView> banners;

  final HomeSectionStatus shortcutStatus;

  /// The CMS feature-shortcut grid, in the server's `sortOrder`. Empty +
  /// failure/ready ⇒ the grid HIDES: the labels, the order and which tiles exist
  /// are content now, and the client has no fallback copy to fall back TO.
  final List<HomeShortcutView> shortcuts;

  final HomeSectionStatus feedStatus;

  /// The mixed feed in SERVER order (never grouped/re-sorted).
  final List<HomeFeedItemView> items;

  final String? nextCursor;
  final bool loadingMore;

  /// Items already counted as viewed — dedup is per session, in the bloc
  /// (pattern §5), so a card scrolling back into view never double-counts.
  final Set<String> viewedIds;

  /// Items whose `home_feed_item_impression` already fired.
  final Set<String> impressedIds;

  /// Transient, user-facing message (e.g. a reverted like). Never a raw error.
  final String? errorMessage;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;

  /// The banner section renders only when it actually has art (§16).
  bool get showBanners =>
      bannerStatus == HomeSectionStatus.ready && banners.isNotEmpty;

  /// The shortcut grid renders only when the server actually sent tiles.
  bool get showShortcuts =>
      shortcutStatus == HomeSectionStatus.ready && shortcuts.isNotEmpty;

  /// Feed failed with nothing on screen → the retry CTA (§16). A failure DURING
  /// pagination keeps the loaded feed and stays silent.
  bool get showFeedRetry =>
      feedStatus == HomeSectionStatus.failure && items.isEmpty;

  /// Empty feed → hide the section entirely (§16). Shortcut cards stay.
  bool get showFeed =>
      feedStatus == HomeSectionStatus.ready && items.isNotEmpty;

  HomeFeedState copyWith({
    HomeSectionStatus? bannerStatus,
    List<HomeBannerView>? banners,
    HomeSectionStatus? shortcutStatus,
    List<HomeShortcutView>? shortcuts,
    HomeSectionStatus? feedStatus,
    List<HomeFeedItemView>? items,
    String? nextCursor,
    bool clearCursor = false,
    bool? loadingMore,
    Set<String>? viewedIds,
    Set<String>? impressedIds,
    String? errorMessage,
    bool clearError = false,
  }) {
    return HomeFeedState(
      bannerStatus: bannerStatus ?? this.bannerStatus,
      banners: banners ?? this.banners,
      shortcutStatus: shortcutStatus ?? this.shortcutStatus,
      shortcuts: shortcuts ?? this.shortcuts,
      feedStatus: feedStatus ?? this.feedStatus,
      items: items ?? this.items,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      loadingMore: loadingMore ?? this.loadingMore,
      viewedIds: viewedIds ?? this.viewedIds,
      impressedIds: impressedIds ?? this.impressedIds,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}
