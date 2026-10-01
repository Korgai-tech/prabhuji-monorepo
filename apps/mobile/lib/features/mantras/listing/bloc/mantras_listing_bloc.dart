// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../data/mantras_models.dart';
import '../../data/mantras_repository.dart';
import 'mantras_listing_event.dart';
import 'mantras_listing_state.dart';

/// Reusable 2-column Show-all listing bloc (TAM-66). ONE bloc backs
/// recently-played / newly-added, parameterized by the injected
/// [MantraListQuery]. Keyset pagination via `nextCursor`; an empty first page →
/// calm empty state. Mirrors the Aarti listing pattern (TAM-64).
class MantrasListingBloc extends Bloc<MantrasListingEvent, MantrasListingState> {
  MantrasListingBloc({
    required MantrasRepository repository,
    required this.query,
  })  : _repository = repository,
        super(const MantrasListingState()) {
    on<MantrasListingLoadRequested>(_onLoad);
    on<MantrasListingNextPageRequested>(_onNextPage);
    on<MantrasListingRetryRequested>(_onLoad);
  }

  final MantrasRepository _repository;
  final MantraListQuery query;

  Future<void> _onLoad(
    MantrasListingEvent event,
    Emitter<MantrasListingState> emit,
  ) async {
    emit(const MantrasListingState(status: MantrasListingStatus.loading));
    try {
      final page = await _repository.fetchItems(query);
      if (page.items.isEmpty) {
        emit(const MantrasListingState(status: MantrasListingStatus.empty));
        return;
      }
      emit(MantrasListingState(
        status: MantrasListingStatus.loaded,
        items: page.items,
        nextCursor: page.nextCursor,
      ));
    } catch (error) {
      emit(MantrasListingState(
        status: MantrasListingStatus.error,
        message: error.toString(),
      ));
    }
  }

  Future<void> _onNextPage(
    MantrasListingNextPageRequested event,
    Emitter<MantrasListingState> emit,
  ) async {
    final current = state;
    if (current.status != MantrasListingStatus.loaded) return;
    if (!current.hasMore || current.loadingMore) return;

    emit(current.copyWith(loadingMore: true));
    try {
      final page = await _repository.fetchItems(query, cursor: current.nextCursor);
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
