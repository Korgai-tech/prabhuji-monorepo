// Named params kept explicit (public API) — see the WallpaperListBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/wallpaper_repository.dart';
import '../../wallpaper_analytics.dart';
import 'wallpaper_home_event.dart';
import 'wallpaper_home_state.dart';

/// Wallpaper Home bloc (TAM-70 — Figma 704:5223). Loads `GET /wallpaper/home`,
/// keeps only the non-empty CMS rows (hide empty rows; hide the Liked row when
/// the user has no likes — PRD §6.2–6.4), and drives the in-place deity filter
/// (`deityId` query, never leaves the screen, never paywalls). Discovery is FREE
/// — no gating here; a card tap opens the preview, also free.
///
/// The home endpoint returns all rows in one call, so a "partial CMS failure"
/// on the client surfaces as empty rows being dropped (the loaded rows still
/// render); a total call failure surfaces the retry state.
class WallpaperHomeBloc extends Bloc<WallpaperHomeEvent, WallpaperHomeState> {
  WallpaperHomeBloc({
    required WallpaperRepository repository,
    Analytics? analytics,
  })  : _repository = repository,
        _analytics = analytics,
        super(const WallpaperHomeState()) {
    on<WallpaperHomeLoadRequested>(_onLoad);
    on<WallpaperHomeDeitySelected>(_onDeitySelected);
    on<WallpaperHomeRetryRequested>(_onRetry);
    on<WallpaperHomeRowViewed>(_onRowViewed);
  }

  final WallpaperRepository _repository;
  final Analytics? _analytics;

  /// Row ids already counted for the CURRENT row set — cleared on every load so
  /// a deity filter change re-counts impressions against the new result set.
  final Set<String> _viewedRowIds = <String>{};

  Future<void> _onLoad(
    WallpaperHomeLoadRequested event,
    Emitter<WallpaperHomeState> emit,
  ) {
    // Sheet 1 row 127 — `wallpaper_page_viewed`. Fires on module entry.
    unawaited(_analytics?.trackEvent(WallpaperEvents.pageViewed));
    return _load(emit, deityId: null, deityName: null);
  }

  Future<void> _onRetry(
    WallpaperHomeRetryRequested event,
    Emitter<WallpaperHomeState> emit,
  ) =>
      _load(
        emit,
        deityId: state.selectedDeityId,
        deityName: state.selectedDeityName,
      );

  Future<void> _onDeitySelected(
    WallpaperHomeDeitySelected event,
    Emitter<WallpaperHomeState> emit,
  ) {
    // Sheet 1 row 128 — `wallpaper_deity_selected`. Fires per filter change
    // (including deselect-back-to-All-Gods, which sends nulls).
    unawaited(_analytics?.trackEvent(
      WallpaperEvents.deitySelected,
      properties: {
        WallpaperEventProps.deityId: event.deityId,
        WallpaperEventProps.deityName: event.deityName,
      },
    ));
    return _load(emit, deityId: event.deityId, deityName: event.deityName);
  }

  void _onRowViewed(
    WallpaperHomeRowViewed event,
    Emitter<WallpaperHomeState> emit,
  ) {
    if (!_viewedRowIds.add(event.rowId)) return; // already counted this load
    // Sheet 1 row 129 — `wallpaper_row_viewed`. One-per-row-per-load (dedupe
    // is on `rowId` in [_viewedRowIds]).
    unawaited(_analytics?.trackEvent(
      WallpaperEvents.rowViewed,
      properties: {
        WallpaperEventProps.rowId: event.rowId,
        WallpaperEventProps.rowName: event.rowName,
        WallpaperEventProps.positionIndex: event.positionIndex,
        WallpaperEventProps.itemCount: event.itemCount,
      },
    ));
  }

  Future<void> _load(
    Emitter<WallpaperHomeState> emit, {
    required String? deityId,
    required String? deityName,
  }) async {
    _viewedRowIds.clear();
    emit(WallpaperHomeState(
      status: WallpaperHomeStatus.loading,
      selectedDeityId: deityId,
      selectedDeityName: deityName,
    ));
    try {
      final home = await _repository.fetchHome(deityId: deityId);
      final rows = home.visibleRows;
      emit(WallpaperHomeState(
        status: rows.isEmpty
            ? WallpaperHomeStatus.empty
            : WallpaperHomeStatus.loaded,
        rows: rows,
        selectedDeityId: deityId,
        selectedDeityName: deityName,
      ));
    } catch (error) {
      emit(WallpaperHomeState(
        status: WallpaperHomeStatus.error,
        selectedDeityId: deityId,
        selectedDeityName: deityName,
        message: error.toString(),
      ));
    }
  }
}
