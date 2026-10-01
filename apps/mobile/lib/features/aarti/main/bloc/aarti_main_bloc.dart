// Explicit named params (some are functions) — see PaywallBloc note.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../../../core/session_context.dart';
import '../../aarti_analytics.dart';
import '../../data/aarti_repository.dart';
import 'aarti_main_event.dart';
import 'aarti_main_state.dart';

/// Main-page bloc (TAM-64 §6.1–6.7). Loads the ordered sections from
/// `GET /aarti/main`; sections that come back empty are dropped by the state so
/// they hide independently (§7.5). A full-page failure → retry state with the
/// nav visible and NO paywall (§7.6).
class AartiMainBloc extends Bloc<AartiMainEvent, AartiMainState> {
  AartiMainBloc({
    required AartiRepository repository,
    Analytics? analytics,
    SessionContext? sessionContext,
  })  : _repository = repository,
        _analytics = analytics,
        _sessionContext = sessionContext,
        super(const AartiMainLoading()) {
    on<AartiMainLoadRequested>(_onLoad);
    on<AartiMainRetryRequested>(_onRetry);
  }

  final AartiRepository _repository;
  final Analytics? _analytics;
  final SessionContext? _sessionContext;

  Future<void> _onLoad(
    AartiMainLoadRequested event,
    Emitter<AartiMainState> emit,
  ) async {
    // Sheet 1 row 41 — `aarti_bhajans_page_viewed`. `entry_source` mirrors
    // the app-wide session-level signal (`cold_start` on first launch,
    // flipped to `resume` on foregrounding).
    unawaited(_analytics?.trackEvent(
      AartiEvents.pageViewed,
      properties: {
        AartiEventProps.entrySource:
            _sessionContext?.entrySource ?? AartiEntrySource.coldStart,
      },
    ));
    await _fetch(emit);
  }

  Future<void> _onRetry(
    AartiMainRetryRequested event,
    Emitter<AartiMainState> emit,
  ) =>
      _fetch(emit);

  Future<void> _fetch(Emitter<AartiMainState> emit) async {
    emit(const AartiMainLoading());
    try {
      final sections = await _repository.fetchMain();
      emit(AartiMainLoaded(sections));
    } catch (error) {
      emit(AartiMainError(error.toString()));
    }
  }
}
