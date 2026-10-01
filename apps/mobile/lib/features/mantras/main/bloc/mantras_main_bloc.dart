// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../mantras_analytics.dart';
import '../../data/mantras_repository.dart';
import 'mantras_main_event.dart';
import 'mantras_main_state.dart';

/// Main-page bloc (TAM-66 §6.1–6.5). Loads the ordered sections from
/// `GET /mantras/sections`; sections that come back empty are dropped by the
/// state so they hide independently. A full-page failure → retry state with the
/// nav visible and NO paywall (module entry NEVER shows a paywall).
class MantrasMainBloc extends Bloc<MantrasMainEvent, MantrasMainState> {
  MantrasMainBloc({
    required MantrasRepository repository,
    Analytics? analytics,
  })  : _repository = repository,
        _analytics = analytics,
        super(const MantrasMainLoading()) {
    on<MantrasMainLoadRequested>(_onLoad);
    on<MantrasMainRetryRequested>(_onRetry);
  }

  final MantrasRepository _repository;
  final Analytics? _analytics;

  Future<void> _onLoad(
    MantrasMainLoadRequested event,
    Emitter<MantrasMainState> emit,
  ) async {
    // Sheet 1 row 64 — `mantras_stutis_page_viewed`. Fired when the main page
    // becomes visible. `previous_screen` + `entry_source` are non-null when
    // the caller can supply them (deep-link/home-widget); otherwise omitted.
    unawaited(_analytics?.trackEvent(
      MantrasEvents.pageViewed,
      properties: {
        MantrasEventProps.previousScreen: ?event.previousScreen,
        MantrasEventProps.entrySource: ?event.entrySource,
      },
    ));
    await _fetch(emit);
  }

  Future<void> _onRetry(
    MantrasMainRetryRequested event,
    Emitter<MantrasMainState> emit,
  ) =>
      _fetch(emit);

  Future<void> _fetch(Emitter<MantrasMainState> emit) async {
    emit(const MantrasMainLoading());
    try {
      final sections = await _repository.fetchSections();
      emit(MantrasMainLoaded(sections));
    } catch (error) {
      emit(MantrasMainError(error.toString()));
    }
  }
}
