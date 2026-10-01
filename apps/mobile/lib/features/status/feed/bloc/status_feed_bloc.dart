// Function-typed ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/status_models.dart';
import '../../data/status_repository.dart';
import '../../status_analytics.dart';
import 'status_feed_event.dart';
import 'status_feed_state.dart';

/// Drives the Status feed (TAM-72 §6.2–6.4, §6.9): deity filter, the vertical
/// one-active-card feed, the 2s view threshold (q5), and the FREE optimistic
/// like. No Pro gate lives here — only Share gates (see `StatusShareBloc`).
///
/// Independent-section failure (flutter-feed-screen.md decision 2): the overlay
/// template and the profile are best-effort side loads — if either fails the
/// feed still renders (the overlay degrades to the Figma default template /
/// the "add your details" prompt). Only a feed failure is a screen failure.
class StatusFeedBloc extends Bloc<StatusFeedEvent, StatusFeedState> {
  StatusFeedBloc({
    required StatusRepository repository,
    Analytics? analytics,
    Duration viewThreshold = kStatusViewThreshold,
  })  : _repository = repository,
        _analytics = analytics,
        _viewThreshold = viewThreshold,
        super(const StatusFeedState()) {
    on<StatusFeedStarted>(_onStarted);
    on<StatusFeedDeitySelected>(_onDeitySelected);
    on<StatusFeedIndexChanged>(_onIndexChanged);
    on<StatusFeedViewThresholdReached>(_onViewThreshold);
    on<StatusFeedLikeToggled>(_onLikeToggled);
    on<StatusFeedMoreRequested>(_onMoreRequested);
    on<StatusFeedProfileRefreshed>(_onProfileRefreshed);
    on<StatusFeedRefreshRequested>(_onRefreshRequested);
    on<StatusFeedErrorCleared>(
      (_, emit) => emit(state.copyWith(clearError: true)),
    );
  }

  /// q5 — a card counts as viewed after 2 seconds in view.
  static const Duration kStatusViewThreshold = Duration(seconds: 2);

  final StatusRepository _repository;
  final Analytics? _analytics;
  final Duration _viewThreshold;

  Timer? _viewTimer;

  /// Bumped whenever the first page is reloaded by a refresh, so a load-more
  /// page fetched against the OLD cursor can't be appended onto the fresh list.
  int _feedGeneration = 0;

  @override
  Future<void> close() {
    _viewTimer?.cancel();
    return super.close();
  }

  Future<void> _onStarted(
    StatusFeedStarted event,
    Emitter<StatusFeedState> emit,
  ) async {
    // Sheet 1 row 86 — `status_page_viewed`. Fires on module entry, tagged
    // with the entry source so the funnel can attribute launches (Home
    // widget vs deep link vs bottom nav). `previous_screen` is null here
    // because the bloc doesn't have that context — a global router observer
    // would be the proper source once we add one.
    unawaited(_analytics?.trackEvent(
      StatusEvents.pageViewed,
      properties: {
        StatusEventProps.entrySource: event.entrySource,
        StatusEventProps.previousScreen: null,
      },
    ));
    emit(state.copyWith(
      status: StatusFeedStatus.loading,
      clearError: true,
      pinnedStatusId: event.pinnedStatusId,
      // A pin arriving on an already-used feed (chat → Status tab) drops any
      // deity filter — the backend ignores a pinned id the filter excludes.
      clearDeity: event.pinnedStatusId != null,
    ));

    // Side load first (best-effort, never fatal) so the very first card can
    // paint its overlay immediately.
    final profile = await _loadProfile();

    try {
      // TAM-166 — carry `pinnedId` on the FIRST page ONLY. Subsequent
      // `_onLoadMore` / refresh calls omit it (backend also ignores it on
      // cursor pages, but the client stays defensive).
      final page = await _repository.fetchFeed(
        deityId: state.deitySlug,
        pinnedId: event.pinnedStatusId,
      );
      emit(state.copyWith(
        status: StatusFeedStatus.ready,
        items: page.items,
        activeIndex: 0,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        profile: profile,
      ));
      _armViewTimer();
    } catch (_) {
      emit(state.copyWith(
        status: StatusFeedStatus.failure,
        profile: profile,
        errorMessage: 'Could not load status. Please try again.',
      ));
    }
  }

  Future<void> _onDeitySelected(
    StatusFeedDeitySelected event,
    Emitter<StatusFeedState> emit,
  ) async {
    // Sheet 1 row 88 — `status_deity_selected`. `deity_id` uses the deity
    // slug (the stable identifier the API filters by); All Gods (no
    // filter) is reported as `all` so the funnel can count "cleared filter"
    // as its own bucket. `deity_name` + `position_index` are best-effort
    // and null when the caller doesn't supply them.
    unawaited(_analytics?.trackEvent(
      StatusEvents.deitySelected,
      properties: {
        StatusEventProps.deityId: event.deitySlug ?? 'all',
        StatusEventProps.deityName: event.deityName,
        StatusEventProps.positionIndex: event.positionIndex,
      },
    ));
    _viewTimer?.cancel();
    emit(state.copyWith(
      status: StatusFeedStatus.loading,
      deitySlug: event.deitySlug,
      clearDeity: event.deitySlug == null,
      clearError: true,
    ));
    try {
      final page = await _repository.fetchFeed(deityId: event.deitySlug);
      emit(state.copyWith(
        status: StatusFeedStatus.ready,
        items: page.items,
        activeIndex: 0,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
      ));
      _armViewTimer();
    } catch (_) {
      emit(state.copyWith(
        status: StatusFeedStatus.failure,
        items: const [],
        errorMessage: 'Could not load status. Please try again.',
      ));
    }
  }

  Future<void> _onIndexChanged(
    StatusFeedIndexChanged event,
    Emitter<StatusFeedState> emit,
  ) async {
    if (event.index < 0 || event.index >= state.items.length) return;
    // No `status_next_tapped` analytics fire here — Sheet 1 rows 86–101 have
    // no corresponding row (the previous local event was dropped as an
    // orphan). `viaNext` remains on the event so the router / page-view
    // wiring can still branch on tap-vs-swipe without a new event.
    emit(state.copyWith(activeIndex: event.index));
    _armViewTimer();

    // Prefetch the next page as the user approaches the tail.
    if (state.hasMore && event.index >= state.items.length - 2) {
      add(const StatusFeedMoreRequested());
    }
  }

  /// Restart the 2s dwell timer for the newly-active card. A card that has
  /// already counted never re-fires (q5).
  void _armViewTimer() {
    _viewTimer?.cancel();
    final item = state.activeItem;
    if (item == null || state.viewedIds.contains(item.id)) return;
    _viewTimer = Timer(_viewThreshold, () {
      if (isClosed) return;
      add(StatusFeedViewThresholdReached(item.id));
    });
  }

  Future<void> _onViewThreshold(
    StatusFeedViewThresholdReached event,
    Emitter<StatusFeedState> emit,
  ) async {
    if (state.viewedIds.contains(event.statusId)) return;
    // Only count if it's STILL the active card (a fast swipe must not count).
    if (state.activeItem?.id != event.statusId) return;

    emit(state.copyWith(viewedIds: {...state.viewedIds, event.statusId}));
    // Sheet 1 row 89 — `status_viewed`. `filter_id` = the active deity
    // filter (or `all` when cleared); `position_index` = the item's index
    // in the current feed so ranking analyses can weight by slot.
    final positionIndex = state.items.indexWhere((i) => i.id == event.statusId);
    unawaited(_analytics?.trackEvent(
      StatusEvents.viewed,
      properties: {
        StatusEventProps.statusId: event.statusId,
        StatusEventProps.mediaType: state.activeItem?.mediaType.name,
        StatusEventProps.filterId: state.deitySlug ?? 'all',
        StatusEventProps.positionIndex:
            positionIndex >= 0 ? positionIndex : null,
      },
    ));

    // Best-effort server count — a failed view POST never surfaces to the user.
    try {
      final viewCount = await _repository.recordView(event.statusId);
      final items = state.items
          .map((i) => i.id == event.statusId ? i.copyWith(viewCount: viewCount) : i)
          .toList(growable: false);
      emit(state.copyWith(items: items));
    } catch (_) {
      // swallow — the local threshold already fired
    }
  }

  Future<void> _onLikeToggled(
    StatusFeedLikeToggled event,
    Emitter<StatusFeedState> emit,
  ) async {
    final item = state.activeItem;
    if (item == null) return;

    final optimistic = item.copyWith(
      likedByMe: !item.likedByMe,
      likeCount: item.likedByMe ? item.likeCount - 1 : item.likeCount + 1,
    );
    emit(state.copyWith(items: _replace(state.items, optimistic)));
    // Sheet 1 row 90 — `status_like_changed`. `action` uses the sheet's
    // canonical wire values (`like` | `unlike`), mirroring Home's
    // `home_content_like_changed`.
    final positionIndex = state.items.indexWhere((i) => i.id == item.id);
    unawaited(_analytics?.trackEvent(
      StatusEvents.likeChanged,
      properties: {
        StatusEventProps.statusId: item.id,
        StatusEventProps.action: optimistic.likedByMe ? 'like' : 'unlike',
        StatusEventProps.positionIndex:
            positionIndex >= 0 ? positionIndex : null,
      },
    ));

    try {
      final outcome = await _repository.toggleLike(item.id);
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
      // Revert to the pre-tap truth (PRD §6.4).
      emit(state.copyWith(
        items: _replace(state.items, item),
        errorMessage: 'Could not update like. Please try again.',
      ));
    }
  }

  Future<void> _onMoreRequested(
    StatusFeedMoreRequested event,
    Emitter<StatusFeedState> emit,
  ) async {
    if (state.loadingMore || !state.hasMore) return;
    final generation = _feedGeneration;
    emit(state.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchFeed(
        deityId: state.deitySlug,
        cursor: state.nextCursor,
      );
      if (generation != _feedGeneration) return; // a refresh replaced the feed
      emit(state.copyWith(
        items: [...state.items, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      if (generation != _feedGeneration) return;
      // Pagination failure is silent — the loaded feed keeps working (§7).
      emit(state.copyWith(loadingMore: false));
    }
  }

  /// Tab re-tap refresh: reload page 1 (current deity filter kept) and the
  /// profile, back on the first card. Shows the same loading state as entry.
  Future<void> _onRefreshRequested(
    StatusFeedRefreshRequested event,
    Emitter<StatusFeedState> emit,
  ) async {
    if (state.isLoading) return;
    _feedGeneration++;
    _viewTimer?.cancel();
    emit(state.copyWith(
      status: StatusFeedStatus.loading,
      activeIndex: 0,
      loadingMore: false,
      clearError: true,
    ));
    final profileFuture = _loadProfile();
    try {
      final page = await _repository.fetchFeed(deityId: state.deitySlug);
      emit(state.copyWith(
        status: StatusFeedStatus.ready,
        items: page.items,
        activeIndex: 0,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        profile: await profileFuture,
      ));
      _armViewTimer();
    } catch (_) {
      emit(state.copyWith(
        status: StatusFeedStatus.failure,
        items: const [],
        profile: await profileFuture,
        errorMessage: 'Could not load status. Please try again.',
      ));
    }
  }

  Future<void> _onProfileRefreshed(
    StatusFeedProfileRefreshed event,
    Emitter<StatusFeedState> emit,
  ) async {
    final profile = await _loadProfile();
    emit(state.copyWith(profile: profile));
  }


  Future<StatusProfileData> _loadProfile() async {
    try {
      return await _repository.fetchProfile();
    } catch (_) {
      return StatusProfileData.empty;
    }
  }

  static List<StatusFeedItem> _replace(
    List<StatusFeedItem> items,
    StatusFeedItem updated,
  ) =>
      items
          .map((i) => i.id == updated.id ? updated : i)
          .toList(growable: false);
}
