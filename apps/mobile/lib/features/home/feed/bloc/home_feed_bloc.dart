// Function-typed ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../../../core/session_context.dart';
import '../../../../core/theme.dart';
import '../../data/home_models.dart';
import '../../data/home_repository.dart';
import '../../home_analytics.dart';
import 'home_feed_event.dart';
import 'home_feed_state.dart';

/// Drives Home's two remote sections (TAM-62): the CMS banner carousel and the
/// mixed, cursor-paginated infinite feed — plus impression/view analytics and
/// optimistic engagement.
///
/// #PATH_DECISION — **no Pro gate lives here.** Home never gates on load, module
/// entry, or feed browsing (PRD §5). The single Home-origin paywall trigger is a
/// pro-feature-discovery banner tap, which the widget routes through TAM-58's
/// `PaywallGate` against LIVE entitlement — this bloc never sees, caches, or
/// branches on subscription status.
///
/// Sections fail INDEPENDENTLY (pattern §2): a banner failure hides the carousel
/// and a feed failure shows a retry CTA, but neither can stop the other or the
/// static chrome (header + shortcut cards) from rendering.
class HomeFeedBloc extends Bloc<HomeFeedEvent, HomeFeedState> {
  HomeFeedBloc({
    required HomeRepository repository,
    Analytics? analytics,
    SessionContext? sessionContext,
    Duration viewThreshold = AppHome.viewThreshold,
  })  : _repository = repository,
        _analytics = analytics,
        _sessionContext = sessionContext,
        _viewThreshold = viewThreshold,
        super(const HomeFeedState()) {
    on<HomeStarted>(_onStarted);
    on<HomeFeedRetryRequested>(_onRetry);
    on<HomeFeedRefreshRequested>(_onPullToRefresh);
    on<HomeBannersRefreshRequested>(_onBannersRefresh);
    on<HomeFeedMoreRequested>(_onMoreRequested);
    on<HomeFeedItemImpressed>(_onImpressed);
    on<HomeFeedItemVisibilityChanged>(_onVisibilityChanged);
    on<HomeFeedViewThresholdReached>(_onViewThreshold);
    on<HomeFeedLikeToggled>(_onLikeToggled);
    on<HomeFeedShared>(_onShared);
    on<HomeFeedErrorCleared>(
      (_, emit) => emit(state.copyWith(clearError: true)),
    );
  }

  final HomeRepository _repository;
  final Analytics? _analytics;
  final SessionContext? _sessionContext;
  final Duration _viewThreshold;

  /// One dwell timer per visible card. A card that scrolls out cancels its own
  /// timer without disturbing its neighbours' (pattern §5).
  final Map<String, Timer> _viewTimers = <String, Timer>{};

  /// Rolling count of feed-retry taps in this session. Feeds into the
  /// `retry_count` property on `home_content_load_failed` (Sheet 1 row 40)
  /// so the funnel can see how many attempts a user made before the failure.
  int _retryCount = 0;

  @override
  Future<void> close() {
    for (final t in _viewTimers.values) {
      t.cancel();
    }
    _viewTimers.clear();
    return super.close();
  }

  Future<void> _onStarted(HomeStarted event, Emitter<HomeFeedState> emit) async {
    // Sheet 1 row 27 `home_page_viewed` — fires AFTER the three loaders
    // resolve so `load_time_ms` reflects actual time-to-viewable, not
    // time-to-mount. `entry_source` mirrors the app-wide session-level
    // signal (`cold_start` on first launch, flipped to `resume` by the
    // lifecycle observer on foregrounding).
    final startedAt = DateTime.now();
    emit(state.copyWith(
      bannerStatus: HomeSectionStatus.loading,
      shortcutStatus: HomeSectionStatus.loading,
      feedStatus: HomeSectionStatus.loading,
      clearError: true,
    ));
    // Parallel: the three sections are declared independent (§2), so the sum
    // of their fetch times had no reason to be the user's wait. Each `_load*`
    // emits via `state.copyWith(...)` which reads the LIVE bloc state at emit
    // time — safe with concurrent Futures because Dart is single-threaded
    // and every emit sees the up-to-date state left by the previous one. The
    // handler awaits `Future.wait`, so the Emitter stays open for the whole
    // duration and every section gets to emit.
    await Future.wait<void>([
      _loadBanners(emit),
      _loadShortcuts(emit),
      _loadFeed(emit),
    ]);

    final elapsedMs = DateTime.now().difference(startedAt).inMilliseconds;
    unawaited(_analytics?.trackEvent(
      HomeEvents.pageViewed,
      properties: {
        HomeEventProps.entrySource:
            _sessionContext?.entrySource ?? HomeEntrySource.coldStart,
        HomeEventProps.loadTimeMs: elapsedMs < 0 ? 0 : elapsedMs,
      },
    ));
  }

  /// TAM-122 §3 — pull-to-refresh. Re-runs all three loaders but PRESERVES
  /// `impressedIds` / `viewedIds` (dedupe is per session, not per refresh):
  /// a card that stays in view through the refresh must not re-fire its
  /// impression or view analytics. Completes `event.completer` when the
  /// three-loader dance is done so the `RefreshIndicator` awaits it.
  ///
  /// Deliberately does NOT emit a `loading` status the way `_onStarted` does —
  /// keeping the previous items visible during the fetch avoids a skeleton
  /// flash. The `RefreshIndicator`'s own spinner IS the user-visible progress.
  Future<void> _onPullToRefresh(
    HomeFeedRefreshRequested event,
    Emitter<HomeFeedState> emit,
  ) async {
    // `home_feed_refresh_pulled` was removed from the analytics contract
    // (Sheet 1 has no refresh event). Refresh behaviour is unchanged;
    // only the tracking call is dropped.
    //
    // Parallel for the same reason as `_onStarted` — the RefreshIndicator's
    // completer resolves ~3x sooner because the pull spinner now awaits the
    // slowest section, not the sum.
    try {
      await Future.wait<void>([
        _loadBanners(emit),
        _loadShortcuts(emit),
        _loadFeed(emit),
      ]);
    } finally {
      if (!event.completer.isCompleted) event.completer.complete();
    }
  }

  Future<void> _onRetry(
    HomeFeedRetryRequested event,
    Emitter<HomeFeedState> emit,
  ) async {
    // `home_feed_retry_tapped` was removed from the contract — retry
    // behaviour is captured indirectly via `home_content_load_failed`'s
    // `retry_count` property when the retry itself fails again.
    //
    // Deliberately sequential (unlike `_onStarted` / `_onPullToRefresh`) —
    // banners and shortcuts run ONLY if the feed recovers first, because
    // they have no retry CTAs of their own and a fresh silent retry only
    // makes sense once we know the network blip is over. Do NOT parallelize.
    _retryCount += 1;
    emit(state.copyWith(
      feedStatus: HomeSectionStatus.loading,
      clearError: true,
    ));
    await _loadFeed(emit);
    // The blip that killed the feed probably killed the banners too — give the
    // carousel the same second chance, silently (banners have no retry CTA).
    if (state.feedStatus == HomeSectionStatus.ready && !state.showBanners) {
      await _loadBanners(emit);
    }
    // Same second chance for the shortcut grid, for the same reason: it has no
    // retry CTA of its own, and it is now remote, so a blip can empty it.
    if (state.feedStatus == HomeSectionStatus.ready && !state.showShortcuts) {
      await _loadShortcuts(emit);
    }
  }

  Future<void> _onBannersRefresh(
    HomeBannersRefreshRequested event,
    Emitter<HomeFeedState> emit,
  ) =>
      _loadBanners(emit);

  /// Banner failure is NEVER fatal and never user-visible: the section simply
  /// hides (§8/§16).
  Future<void> _loadBanners(Emitter<HomeFeedState> emit) async {
    try {
      final banners = await _repository.fetchBanners();
      // A banner with NOTHING paintable is dropped; the rest still show (§8).
      // For a VIDEO banner that is the thumbnail, not the clip: a video whose
      // `mediaUrl` is blank (or that later fails to decode) still renders as
      // its still, which is the documented never-look-broken fallback — so
      // only a row with no still AND no clip is genuinely unrenderable.
      final usable = banners
          .where((b) =>
              b.stillUrl.trim().isNotEmpty || b.playableVideoUrl != null)
          .toList(growable: false);
      emit(state.copyWith(
        bannerStatus: HomeSectionStatus.ready,
        banners: usable,
      ));
    } catch (_) {
      emit(state.copyWith(
        bannerStatus: HomeSectionStatus.failure,
        banners: const <HomeBannerView>[],
      ));
    }
  }

  /// The shortcut grid is CMS content now (TAM-61 `GET /home/shortcuts`), not
  /// static chrome: labels, order and membership all come from the server.
  ///
  /// A failure therefore HIDES the grid rather than falling back to bundled copy
  /// — there is no client-side list left to fall back to, and inventing one is
  /// exactly what this change removed. It stays independent (pattern §2): the
  /// banners and the feed neither wait on it nor fail with it.
  Future<void> _loadShortcuts(Emitter<HomeFeedState> emit) async {
    try {
      final shortcuts = await _repository.fetchShortcuts();
      emit(state.copyWith(
        shortcutStatus: HomeSectionStatus.ready,
        shortcuts: shortcuts,
      ));
    } catch (_) {
      emit(state.copyWith(
        shortcutStatus: HomeSectionStatus.failure,
        shortcuts: const <HomeShortcutView>[],
      ));
    }
  }

  Future<void> _loadFeed(Emitter<HomeFeedState> emit) async {
    try {
      final page = await _repository.fetchFeed();
      emit(state.copyWith(
        feedStatus: HomeSectionStatus.ready,
        // Server order, verbatim — mixed, never grouped (#EXPORT_CRITICAL).
        items: page.items,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
      ));
    } catch (error) {
      emit(state.copyWith(
        feedStatus: HomeSectionStatus.failure,
        items: const <HomeFeedItemView>[],
      ));
      // Sheet 1 row 40 — `home_content_load_failed`. Fires after the
      // failed load returns; `retry_count` reflects how many manual
      // retries preceded this failure (0 on the first cold-start load).
      unawaited(_analytics?.trackEvent(
        HomeEvents.contentLoadFailed,
        properties: {
          HomeEventProps.failureArea: 'feed',
          HomeEventProps.errorCode: error.toString(),
          HomeEventProps.retryCount: _retryCount,
        },
      ));
    }
  }

  Future<void> _onMoreRequested(
    HomeFeedMoreRequested event,
    Emitter<HomeFeedState> emit,
  ) async {
    if (state.loadingMore || !state.hasMore) return;
    emit(state.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchFeed(cursor: state.nextCursor);
      emit(state.copyWith(
        items: [...state.items, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      // Pagination failure is SILENT — the already-loaded feed keeps working
      // (pattern §2). The tail simply stops growing; a later scroll retries.
      emit(state.copyWith(loadingMore: false));
    }
  }

  void _onImpressed(HomeFeedItemImpressed event, Emitter<HomeFeedState> emit) {
    if (state.impressedIds.contains(event.itemId)) return;
    final item = _itemById(event.itemId);
    if (item == null) return;
    final nextImpressed = {...state.impressedIds, event.itemId};
    emit(state.copyWith(impressedIds: nextImpressed));
    // `home_feed_item_impression` was removed from the contract; impressions
    // now aggregate into Sheet 1 row 39 `home_feed_depth_reached` checkpoints.
    _maybeFireDepthCheckpoint(nextImpressed.length);
  }

  static const List<int> _feedDepthCheckpoints = [10, 25, 50, 100];
  final Set<int> _firedDepthCheckpoints = <int>{};

  void _maybeFireDepthCheckpoint(int itemsSeen) {
    for (final threshold in _feedDepthCheckpoints) {
      if (itemsSeen >= threshold && !_firedDepthCheckpoints.contains(threshold)) {
        _firedDepthCheckpoints.add(threshold);
        unawaited(_analytics?.trackEvent(
          HomeEvents.feedDepthReached,
          properties: {HomeEventProps.itemsSeenCount: threshold},
        ));
      }
    }
  }

  /// Arm the 2s dwell timer when a card reaches 50% visibility; cancel it the
  /// moment it drops below. A card that already counted never re-arms.
  void _onVisibilityChanged(
    HomeFeedItemVisibilityChanged event,
    Emitter<HomeFeedState> emit,
  ) {
    if (!event.visible) {
      _viewTimers.remove(event.itemId)?.cancel();
      return;
    }
    if (state.viewedIds.contains(event.itemId)) return;
    if (_viewTimers.containsKey(event.itemId)) return; // already counting
    if (_itemById(event.itemId) == null) return;

    _viewTimers[event.itemId] = Timer(_viewThreshold, () {
      _viewTimers.remove(event.itemId);
      if (isClosed) return;
      add(HomeFeedViewThresholdReached(event.itemId));
    });
  }

  Future<void> _onViewThreshold(
    HomeFeedViewThresholdReached event,
    Emitter<HomeFeedState> emit,
  ) async {
    if (state.viewedIds.contains(event.itemId)) return;
    final positionIndex = state.items.indexWhere((i) => i.id == event.itemId);
    if (positionIndex < 0) return; // item was removed from the feed since dwell started
    final item = state.items[positionIndex];

    emit(state.copyWith(viewedIds: {...state.viewedIds, event.itemId}));
    unawaited(_analytics?.trackEvent(
      HomeEvents.contentViewed,
      properties: {
        ..._itemProps(item),
        HomeEventProps.positionIndex: positionIndex,
      },
    ));

    // Best-effort server count — a failed view POST never surfaces to the user.
    try {
      final viewCount = await _repository.recordView(event.itemId);
      emit(state.copyWith(
        items: _replace(state.items, item.copyWith(viewCount: viewCount)),
      ));
    } catch (_) {
      // swallow — the local threshold already fired
    }
  }

  Future<void> _onLikeToggled(
    HomeFeedLikeToggled event,
    Emitter<HomeFeedState> emit,
  ) async {
    final item = _itemById(event.itemId);
    if (item == null) return;

    // Optimistic: update immediately…
    final optimistic = item.copyWith(
      likedByMe: !item.likedByMe,
      likeCount: item.likedByMe ? item.likeCount - 1 : item.likeCount + 1,
    );
    emit(state.copyWith(items: _replace(state.items, optimistic)));
    unawaited(_analytics?.trackEvent(
      HomeEvents.contentLikeChanged,
      properties: {
        ..._itemProps(item),
        HomeEventProps.action: optimistic.likedByMe ? 'like' : 'unlike',
      },
    ));

    try {
      // …persist…
      final outcome = await _repository.toggleLike(event.itemId);
      emit(state.copyWith(
        items: _replace(
          state.items,
          optimistic.copyWith(
            likedByMe: outcome.liked,
            likeCount: outcome.likeCount,
          ),
        ),
      ));
    } catch (_) {
      // …and revert to the pre-tap truth on failure (AC).
      emit(state.copyWith(
        items: _replace(state.items, item),
        errorMessage: 'Could not update like. Please try again.',
      ));
    }
  }

  Future<void> _onShared(
    HomeFeedShared event,
    Emitter<HomeFeedState> emit,
  ) async {
    final item = _itemById(event.itemId);
    if (item == null) return;
    try {
      final shareCount =
          await _repository.recordShare(event.itemId, channel: event.channel);
      emit(state.copyWith(
        items: _replace(state.items, item.copyWith(shareCount: shareCount)),
      ));
    } catch (_) {
      // The OS sheet already opened — a failed count must never surface (§16).
    }
  }

  HomeFeedItemView? _itemById(String id) {
    for (final i in state.items) {
      if (i.id == id) return i;
    }
    return null;
  }

  Map<String, Object?> _itemProps(HomeFeedItemView item) => {
        HomeEventProps.contentId: item.id,
        HomeEventProps.contentType: item.contentType.wire,
      };

  static List<HomeFeedItemView> _replace(
    List<HomeFeedItemView> items,
    HomeFeedItemView updated,
  ) =>
      items
          .map((i) => i.id == updated.id ? updated : i)
          .toList(growable: false);
}
