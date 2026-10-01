// Named params kept explicit (public API).
// ignore_for_file: prefer_initializing_formals, unused_field

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/wallpaper_repository.dart';
import '../../wallpaper_routes.dart';
import 'wallpaper_list_event.dart';
import 'wallpaper_list_state.dart';

/// Wallpaper Listing bloc (TAM-70 — Figma 707:6427). Owns the 2-column grid load
/// + cursor pagination for a fixed [query] (a deity or a home row). Discovery is
/// FREE; a grid tap opens the preview (also free).
///
/// The listing screen intentionally emits NO analytics event on open (Sheet 1
/// rows 127–140 have no such row — funnel is read from
/// `wallpaper_preview_viewed`). The [analytics] param is kept on the
/// constructor for symmetry with the other blocs; the field is currently
/// unused.
class WallpaperListBloc extends Bloc<WallpaperListEvent, WallpaperListState> {
  WallpaperListBloc({
    required WallpaperRepository repository,
    required WallpaperListQuery query,
    Analytics? analytics,
  })  : _repository = repository,
        _query = query,
        _analytics = analytics,
        super(const WallpaperListState()) {
    on<WallpaperListLoadRequested>(_onLoad);
    on<WallpaperListNextPageRequested>(_onNextPage);
    on<WallpaperListRetryRequested>(_onRetry);
  }

  final WallpaperRepository _repository;
  final WallpaperListQuery _query;
  final Analytics? _analytics;

  Future<void> _onLoad(
    WallpaperListLoadRequested event,
    Emitter<WallpaperListState> emit,
  ) {
    // No listing-open event on Sheet 1 for Wallpaper — the module opens the
    // preview directly from row taps too, so listing-vs-preview funnel is
    // read from `wallpaper_preview_viewed`. See rows 127–140.
    return _load(emit);
  }

  Future<void> _onRetry(
    WallpaperListRetryRequested event,
    Emitter<WallpaperListState> emit,
  ) =>
      _load(emit);

  Future<void> _load(Emitter<WallpaperListState> emit) async {
    emit(const WallpaperListState(status: WallpaperListStatus.loading));
    try {
      final page = await _repository.fetchList(
        deityId: _query.deityId,
        rowId: _query.rowId,
      );
      emit(WallpaperListState(
        status: page.items.isEmpty
            ? WallpaperListStatus.empty
            : WallpaperListStatus.loaded,
        items: page.items,
        nextCursor: page.nextCursor,
      ));
    } catch (error) {
      emit(WallpaperListState(
        status: WallpaperListStatus.error,
        message: error.toString(),
      ));
    }
  }

  Future<void> _onNextPage(
    WallpaperListNextPageRequested event,
    Emitter<WallpaperListState> emit,
  ) async {
    final current = state;
    if (current.status != WallpaperListStatus.loaded) return;
    if (!current.hasMore || current.loadingMore) return;

    emit(current.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchList(
        deityId: _query.deityId,
        rowId: _query.rowId,
        cursor: current.nextCursor,
      );
      emit(current.copyWith(
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      // Keep the loaded page; a failed "load more" just stops paging.
      emit(current.copyWith(loadingMore: false));
    }
  }
}
