// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../aarti_analytics.dart';
import '../../data/aarti_models.dart';
import '../../data/aarti_repository.dart';
import 'aarti_listing_event.dart';
import 'aarti_listing_state.dart';

/// Reusable 2-column listing bloc (TAM-64 §6.8). ONE bloc backs category / deity
/// / Show-all / recently-played / newly-added / most-played, parameterized by
/// the injected [AartiListQuery]. Keyset pagination via `nextCursor`; an empty
/// first page → calm empty state.
///
/// Scroll-position preservation on return from paywall-cancel / player-back is a
/// property of push-navigation (the screen + its ScrollController stay mounted),
/// reinforced by the bloc retaining its accumulated [items] across the round-trip.
///
/// Analytics: fires `aarti_browse_page_viewed` (Sheet 1 row 46) with
/// `browse_type` + `browse_id` + `result_count` once the load resolves
/// (ready or empty). `aarti_recently_played_page_viewed` (Sheet 1 row 43)
/// is emitted alongside for the recently-played listing since Sheet 1
/// lists it as a distinct event.
class AartiListingBloc extends Bloc<AartiListingEvent, AartiListingState> {
  AartiListingBloc({
    required AartiRepository repository,
    required this.query,
    Analytics? analytics,
  })  : _repository = repository,
        _analytics = analytics,
        super(const AartiListingState()) {
    on<AartiListingLoadRequested>(_onLoad);
    on<AartiListingNextPageRequested>(_onNextPage);
    on<AartiListingRetryRequested>(_onLoad);
  }

  final AartiRepository _repository;
  final AartiListQuery query;
  final Analytics? _analytics;

  Future<void> _onLoad(
    AartiListingEvent event,
    Emitter<AartiListingState> emit,
  ) async {
    emit(const AartiListingState(status: AartiListingStatus.loading));
    try {
      final page = await _repository.fetchAudios(query);
      if (page.items.isEmpty) {
        emit(const AartiListingState(status: AartiListingStatus.empty));
        _trackBrowsePageViewed(resultCount: 0);
        return;
      }
      emit(AartiListingState(
        status: AartiListingStatus.loaded,
        items: page.items,
        nextCursor: page.nextCursor,
      ));
      _trackBrowsePageViewed(resultCount: page.items.length);
    } catch (error) {
      emit(AartiListingState(
        status: AartiListingStatus.error,
        message: error.toString(),
      ));
    }
  }

  /// Derives `browse_type` + `browse_id` from [query] and fires the sheet's
  /// row-46 event (+ the row-43 event for recently-played). Never blocks the
  /// UI — `unawaited` fire-and-forget.
  void _trackBrowsePageViewed({required int resultCount}) {
    final (browseType, browseId) = _classifyQuery();
    unawaited(_analytics?.trackEvent(
      AartiEvents.browsePageViewed,
      properties: {
        AartiEventProps.browseType: browseType,
        AartiEventProps.browseId: ?browseId,
        AartiEventProps.resultCount: resultCount,
      },
    ));
    if (browseType == 'recently_played') {
      unawaited(_analytics?.trackEvent(
        AartiEvents.recentlyPlayedPageViewed,
        properties: {
          AartiEventProps.resultCount: resultCount,
        },
      ));
    }
  }

  (String, String?) _classifyQuery() {
    if (query.deityId != null) return ('deity', query.deityId);
    if (query.categoryId != null) return ('category', query.categoryId);
    if (query.sourceListType == 'recently_played') {
      return ('recently_played', null);
    }
    return ('show_all', null);
  }

  Future<void> _onNextPage(
    AartiListingNextPageRequested event,
    Emitter<AartiListingState> emit,
  ) async {
    final current = state;
    if (current.status != AartiListingStatus.loaded) return;
    if (!current.hasMore || current.loadingMore) return;

    emit(current.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchAudios(query, cursor: current.nextCursor);
      emit(current.copyWith(
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      // Keep the loaded page; a failed "load more" just stops paging (no crash).
      emit(current.copyWith(loadingMore: false));
    }
  }
}
