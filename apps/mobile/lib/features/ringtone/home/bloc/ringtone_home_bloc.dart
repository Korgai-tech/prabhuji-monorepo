// Named params kept explicit (public API) — see the MantrasListingBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/ringtone_repository.dart';
import '../../ringtone_analytics.dart';
import 'ringtone_home_event.dart';
import 'ringtone_home_state.dart';

/// Ringtone Home bloc (TAM-68 — Figma 670:4481). Owns the 3-column grid load,
/// the in-place deity filter (`deityId` query, never leaves the screen, never
/// paywalls), and keyset pagination. Discovery is FREE — no gating here; a card
/// tap gates elsewhere via the tap handler.
///
/// Analytics: only Sheet 1 row 114 (`ringtone_deity_selected`) fires from
/// here. Row 113 (`ringtone_page_viewed`) fires from the screen's `initState`
/// since the sheet keys off "module becomes visible" (a bloc load is a data
/// concern, not a screen-visible signal). Empty-state / load-failure / retry
/// analytics were dropped as orphans — the sheet has no matching rows.
class RingtoneHomeBloc extends Bloc<RingtoneHomeEvent, RingtoneHomeState> {
  RingtoneHomeBloc({
    required RingtoneRepository repository,
    Analytics? analytics,
  })  : _repository = repository,
        _analytics = analytics,
        super(const RingtoneHomeState()) {
    on<RingtoneHomeLoadRequested>(_onLoad);
    on<RingtoneHomeDeitySelected>(_onDeitySelected);
    on<RingtoneHomeNextPageRequested>(_onNextPage);
    on<RingtoneHomeRetryRequested>(_onRetry);
  }

  final RingtoneRepository _repository;
  final Analytics? _analytics;

  Future<void> _onLoad(
    RingtoneHomeLoadRequested event,
    Emitter<RingtoneHomeState> emit,
  ) =>
      _load(emit, deityId: null, deityName: null);

  Future<void> _onRetry(
    RingtoneHomeRetryRequested event,
    Emitter<RingtoneHomeState> emit,
  ) =>
      _load(emit,
          deityId: state.selectedDeityId, deityName: state.selectedDeityName);

  Future<void> _onDeitySelected(
    RingtoneHomeDeitySelected event,
    Emitter<RingtoneHomeState> emit,
  ) {
    // Row 114 — `ringtone_deity_selected`. `position_index` isn't tracked on
    // the DeityFilterRow (the shared widget doesn't surface it); the sheet
    // marks it optional in that context.
    unawaited(_analytics?.trackEvent(
      RingtoneEvents.deitySelected,
      properties: {
        RingtoneEventProps.deityId: event.deityId,
        RingtoneEventProps.deityName: event.deityName,
      },
    ));
    return _load(emit, deityId: event.deityId, deityName: event.deityName);
  }

  Future<void> _load(
    Emitter<RingtoneHomeState> emit, {
    required String? deityId,
    required String? deityName,
  }) async {
    emit(RingtoneHomeState(
      status: RingtoneHomeStatus.loading,
      selectedDeityId: deityId,
      selectedDeityName: deityName,
    ));
    try {
      final page = await _repository.fetchGrid(deityId: deityId);
      if (page.items.isEmpty) {
        emit(RingtoneHomeState(
          status: RingtoneHomeStatus.empty,
          selectedDeityId: deityId,
          selectedDeityName: deityName,
        ));
        return;
      }
      emit(RingtoneHomeState(
        status: RingtoneHomeStatus.loaded,
        items: page.items,
        nextCursor: page.nextCursor,
        selectedDeityId: deityId,
        selectedDeityName: deityName,
      ));
    } catch (error) {
      emit(RingtoneHomeState(
        status: RingtoneHomeStatus.error,
        selectedDeityId: deityId,
        selectedDeityName: deityName,
        message: error.toString(),
      ));
    }
  }

  Future<void> _onNextPage(
    RingtoneHomeNextPageRequested event,
    Emitter<RingtoneHomeState> emit,
  ) async {
    final current = state;
    if (current.status != RingtoneHomeStatus.loaded) return;
    if (!current.hasMore || current.loadingMore) return;

    emit(current.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchGrid(
        deityId: current.selectedDeityId,
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
