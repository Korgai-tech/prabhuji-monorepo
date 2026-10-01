// Named params kept explicit (public API) — see the MantrasListingBloc note.
// ignore_for_file: prefer_initializing_formals

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/ringtone_repository.dart';
import 'ringtone_search_event.dart';
import 'ringtone_search_state.dart';

/// Ringtone Search bloc (TAM-68 — Figma 1073:3472). Runs `GET /ringtones/search`
/// for the submitted query; same 3-column grid + access rules as Home. Search
/// NEVER triggers the paywall and NEVER auto-plays; an empty query yields the
/// empty state (the screen keeps the unfiltered list). Zero results →
/// "No results found".
///
/// Analytics: no ringtone-specific search events in Sheet 1 rows 113–126, so
/// the bloc doesn't fire any events itself. The [Analytics] constructor
/// param is retained so screen wiring doesn't churn; the card tap at the top
/// of the results grid still runs through [RingtoneTapHandler], which fires
/// row 115 (`ringtone_selected`) with `selection_source: 'search'`.
class RingtoneSearchBloc extends Bloc<RingtoneSearchEvent, RingtoneSearchState> {
  RingtoneSearchBloc({
    required RingtoneRepository repository,
    // ignore: avoid_unused_constructor_parameters
    Analytics? analytics,
  })  : _repository = repository,
        super(const RingtoneSearchState()) {
    on<RingtoneSearchSubmitted>(_onSubmitted);
    on<RingtoneSearchNextPageRequested>(_onNextPage);
    on<RingtoneSearchRetryRequested>(_onRetry);
  }

  final RingtoneRepository _repository;

  Future<void> _onRetry(
    RingtoneSearchRetryRequested event,
    Emitter<RingtoneSearchState> emit,
  ) =>
      _run(emit, state.query);

  Future<void> _onSubmitted(
    RingtoneSearchSubmitted event,
    Emitter<RingtoneSearchState> emit,
  ) {
    final q = event.query.trim();
    return _run(emit, q);
  }

  Future<void> _run(Emitter<RingtoneSearchState> emit, String query) async {
    if (query.isEmpty) {
      emit(const RingtoneSearchState(status: RingtoneSearchStatus.idle));
      return;
    }
    emit(RingtoneSearchState(status: RingtoneSearchStatus.loading, query: query));
    try {
      final page = await _repository.search(query);
      if (page.items.isEmpty) {
        emit(RingtoneSearchState(
          status: RingtoneSearchStatus.empty,
          query: query,
          resultCount: 0,
        ));
        return;
      }
      emit(RingtoneSearchState(
        status: RingtoneSearchStatus.loaded,
        query: query,
        items: page.items,
        nextCursor: page.nextCursor,
        resultCount: page.resultCount,
      ));
    } catch (error) {
      emit(RingtoneSearchState(status: RingtoneSearchStatus.error, query: query));
    }
  }

  Future<void> _onNextPage(
    RingtoneSearchNextPageRequested event,
    Emitter<RingtoneSearchState> emit,
  ) async {
    final current = state;
    if (current.status != RingtoneSearchStatus.loaded) return;
    if (!current.hasMore || current.loadingMore) return;

    emit(current.copyWith(loadingMore: true));
    try {
      final page =
          await _repository.search(current.query, cursor: current.nextCursor);
      emit(current.copyWith(
        items: [...current.items, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      emit(current.copyWith(loadingMore: false));
    }
  }
}
