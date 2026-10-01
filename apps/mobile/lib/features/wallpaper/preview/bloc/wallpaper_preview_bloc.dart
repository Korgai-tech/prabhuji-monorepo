// Named params kept explicit (public API).
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../../../core/deep_link_parser.dart';
import '../../../../core/share_url_builder.dart';
import '../../../../core/share_service.dart';
import '../../data/wallpaper_models.dart';
import '../../data/wallpaper_repository.dart';
import '../../wallpaper_analytics.dart';
import '../../wallpaper_routes.dart';
import 'wallpaper_preview_event.dart';
import 'wallpaper_preview_state.dart';

/// The reels-preview bloc (TAM-70 — Figma 282:2812 static / 712:6622 live).
/// Owns the source-context feed (seeded from the originating list so vertical
/// swipe continues that exact context — PRD §6.8), lazily resolves per-item
/// detail (the apply/live asset URLs the set flow needs), paginates the same
/// feed, and handles the FREE like + share actions. The Pro-gated SET action is
/// a SEPARATE state machine ([SetWallpaperBloc]).
class WallpaperPreviewBloc
    extends Bloc<WallpaperPreviewEvent, WallpaperPreviewState> {
  WallpaperPreviewBloc({
    required WallpaperRepository repository,
    required ShareService shareService,
    Analytics? analytics,
    int paginateThreshold = 3,
  })  : _repository = repository,
        _shareService = shareService,
        _analytics = analytics,
        _paginateThreshold = paginateThreshold,
        super(const WallpaperPreviewState.initial()) {
    on<WallpaperPreviewStarted>(_onStarted);
    on<WallpaperPreviewIndexChanged>(_onIndexChanged);
    on<WallpaperPreviewLikeToggled>(_onLikeToggled);
    on<WallpaperPreviewShareRequested>(_onShareRequested);
    on<WallpaperPreviewSetCountUpdated>(_onSetCountUpdated);
    on<WallpaperPreviewErrorCleared>(
      (event, emit) => emit(state.copyWith(clearError: true)),
    );
  }

  final WallpaperRepository _repository;
  final ShareService _shareService;
  final Analytics? _analytics;
  final int _paginateThreshold;

  WallpaperListQuery? _query;

  /// The originating list's source_context (`row_<rowType>`, `listing`,
  /// `deity_grid`, etc.) carried across every preview event that Sheet 1
  /// asks for it on (rows 131/132/134/135).
  String _sourceContext = '';

  Future<void> _onStarted(
    WallpaperPreviewStarted event,
    Emitter<WallpaperPreviewState> emit,
  ) async {
    _query = event.args.query;
    _sourceContext = event.args.sourceContext;
    final start = event.args.startIndex.clamp(0, event.args.items.length - 1);
    emit(WallpaperPreviewState(
      items: List<WallpaperCardItem>.of(event.args.items),
      activeIndex: start < 0 ? 0 : start,
      nextCursor: event.args.nextCursor,
    ));
    final item = state.activeItem;
    if (item != null) {
      // Sheet 1 row 131 — `wallpaper_preview_viewed`.
      unawaited(_analytics?.trackEvent(
        WallpaperEvents.previewViewed,
        properties: {
          WallpaperEventProps.wallpaperId: item.id,
          WallpaperEventProps.mediaType: item.mediaType.name,
          WallpaperEventProps.sourceContext: _sourceContext,
        },
      ));
      await _ensureDetail(emit, item);
    }
  }

  Future<void> _onIndexChanged(
    WallpaperPreviewIndexChanged event,
    Emitter<WallpaperPreviewState> emit,
  ) async {
    if (event.index < 0 || event.index >= state.items.length) return;
    if (event.index == state.activeIndex && state.activeDetail != null) return;

    final previousIndex = state.activeIndex;
    final previousItem = state.activeItem;
    final item = state.items[event.index];

    // Sheet 1 row 132 — `wallpaper_swiped`. Direction is derived from the
    // delta between previous and new index (forward = next page, backward =
    // previous page). `from_wallpaper_id` may be null if the previous active
    // slot was somehow empty (guarded by the caller — index must be valid).
    unawaited(_analytics?.trackEvent(
      WallpaperEvents.swiped,
      properties: {
        WallpaperEventProps.fromWallpaperId: previousItem?.id,
        WallpaperEventProps.toWallpaperId: item.id,
        WallpaperEventProps.direction: event.index > previousIndex
            ? WallpaperEventProps.directionForward
            : WallpaperEventProps.directionBackward,
        WallpaperEventProps.sourceContext: _sourceContext,
      },
    ));
    emit(state.copyWith(activeIndex: event.index));

    await _ensureDetail(emit, item);

    // Paginate the source feed as we near the end (same context).
    if (state.hasMore &&
        !state.loadingMore &&
        event.index >= state.items.length - _paginateThreshold) {
      await _paginate(emit);
    }
  }

  Future<void> _ensureDetail(
    Emitter<WallpaperPreviewState> emit,
    WallpaperCardItem item,
  ) async {
    if (state.details.containsKey(item.id)) return;
    try {
      final detail = await _repository.fetchDetail(item.id);
      emit(state.copyWith(
        details: {...state.details, item.id: detail},
      ));
    } catch (_) {
      // Detail unavailable — the preview still shows the card image; the Set CTA
      // stays disabled until detail resolves (asset missing → can't set).
    }
  }

  Future<void> _paginate(Emitter<WallpaperPreviewState> emit) async {
    final query = _query;
    if (query == null) return;
    emit(state.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchList(
        deityId: query.deityId,
        rowId: query.rowId,
        cursor: state.nextCursor,
      );
      // De-dupe by id (a row seed can overlap the list feed's first page).
      final existing = state.items.map((e) => e.id).toSet();
      final added =
          page.items.where((e) => !existing.contains(e.id)).toList();
      emit(state.copyWith(
        items: [...state.items, ...added],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      emit(state.copyWith(loadingMore: false));
    }
  }

  Future<void> _onLikeToggled(
    WallpaperPreviewLikeToggled event,
    Emitter<WallpaperPreviewState> emit,
  ) async {
    final index = state.activeIndex;
    final item = state.activeItem;
    if (item == null) return;

    final willLike = !item.likedByMe;
    // Sheet 1 row 134 — `wallpaper_like_changed`. `action` is like|unlike.
    unawaited(_analytics?.trackEvent(
      WallpaperEvents.likeChanged,
      properties: {
        WallpaperEventProps.wallpaperId: item.id,
        WallpaperEventProps.mediaType: item.mediaType.name,
        WallpaperEventProps.action: willLike
            ? WallpaperEventProps.actionLike
            : WallpaperEventProps.actionUnlike,
        WallpaperEventProps.sourceContext: _sourceContext,
      },
    ));

    // Optimistic toggle.
    final optimistic = item.copyWith(
      likedByMe: willLike,
      likeCount: (item.likeCount + (willLike ? 1 : -1)).clamp(0, 1 << 62),
    );
    emit(state.copyWith(items: _replace(index, optimistic), clearError: true));

    try {
      final outcome = await _repository.toggleLike(item.id);
      emit(state.copyWith(
        items: _replace(
          index,
          optimistic.copyWith(
            likedByMe: outcome.liked,
            likeCount: outcome.likeCount,
          ),
        ),
      ));
    } catch (_) {
      // Revert + surface a simple error (PRD §6.9).
      emit(state.copyWith(
        items: _replace(index, item),
        errorMessage: "Couldn't update like. Please try again.",
      ));
    }
  }

  Future<void> _onShareRequested(
    WallpaperPreviewShareRequested event,
    Emitter<WallpaperPreviewState> emit,
  ) async {
    final index = state.activeIndex;
    final item = state.activeItem;
    if (item == null) return;

    // Sheet 1 row 135 — `wallpaper_share_clicked`.
    unawaited(_analytics?.trackEvent(
      WallpaperEvents.shareClicked,
      properties: {
        WallpaperEventProps.wallpaperId: item.id,
        WallpaperEventProps.mediaType: item.mediaType.name,
        WallpaperEventProps.sourceContext: _sourceContext,
      },
    ));

    ShareOutcome? outcome;
    Object? shareError;
    try {
      // Share carries a deep link + PUBLIC thumbnail only — NEVER the
      // full-resolution / apply asset (PRD §6.10, §6.13). The ShareService
      // interface has no media-file field, so this is enforced by construction.
      outcome = await _shareService.share(ShareContent(
        text: '🙏 ${item.title} — a devotional wallpaper on Prabhuji',
        deepLink: buildShareUrl(WallpaperDeepLink(id: item.id)),
        thumbnailUrl: item.thumbnailUrl,
      ));
    } catch (e) {
      shareError = e;
    }

    // Sheet 1 row 136 — `wallpaper_share_result`. Reports the platform's
    // outcome (success/cancelled/pending) + the chosen target when the OS
    // gave us one (Android component id; null on iOS/web + when the platform
    // returns the `unavailable` sentinel).
    unawaited(_analytics?.trackEvent(
      WallpaperEvents.shareResult,
      properties: {
        WallpaperEventProps.wallpaperId: item.id,
        WallpaperEventProps.result: _shareResultWireValue(outcome, shareError),
        WallpaperEventProps.destinationApp: outcome?.destination,
        if (shareError != null)
          WallpaperEventProps.errorCode: 'share_threw',
      },
    ));

    // If share_plus threw, the sheet never opened — do NOT increment the
    // share count (same guard the pre-rewrite code had).
    if (shareError != null) return;

    // Increment share count on share-intent launch (PRD §6.11).
    try {
      final count = await _repository.incrementCount(
        item.id,
        WallpaperCountType.share,
      );
      emit(state.copyWith(
        items: _replace(index, item.copyWith(shareCount: count)),
      ));
    } catch (_) {
      // Best-effort — the share already launched.
    }
  }

  static String _shareResultWireValue(ShareOutcome? outcome, Object? error) {
    if (error != null) return WallpaperEventProps.resultFailure;
    switch (outcome?.status) {
      case ShareOutcomeStatus.success:
        return WallpaperEventProps.resultSuccess;
      case ShareOutcomeStatus.dismissed:
        return WallpaperEventProps.resultCancelled;
      case ShareOutcomeStatus.unavailable:
      case null:
        return 'pending';
    }
  }

  void _onSetCountUpdated(
    WallpaperPreviewSetCountUpdated event,
    Emitter<WallpaperPreviewState> emit,
  ) {
    final idx =
        state.items.indexWhere((e) => e.id == event.wallpaperId);
    if (idx < 0) return;
    emit(state.copyWith(
      items: _replace(idx, state.items[idx].copyWith(setCount: event.setCount)),
    ));
  }

  List<WallpaperCardItem> _replace(int index, WallpaperCardItem item) {
    final list = List<WallpaperCardItem>.of(state.items);
    if (index >= 0 && index < list.length) list[index] = item;
    return list;
  }
}
