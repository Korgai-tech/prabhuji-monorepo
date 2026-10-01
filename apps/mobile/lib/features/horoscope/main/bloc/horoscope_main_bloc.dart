// Function-typed ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/horoscope_models.dart';
import '../../data/horoscope_repository.dart';
import '../../horoscope_analytics.dart';
import 'horoscope_main_event.dart';
import 'horoscope_main_state.dart';

/// Drives the FREE zodiac grid (TAM-74 §6.1–6.2).
///
/// No Pro gate lives here — the tab, the grid and every label are free (PRD §5);
/// the gate fires on a zodiac TAP (see `HoroscopeTapHandler`). This bloc never
/// touches `/horoscope/daily`, so a free user's device never even requests a
/// result payload.
class HoroscopeMainBloc extends Bloc<HoroscopeMainEvent, HoroscopeMainState> {
  HoroscopeMainBloc({
    required HoroscopeRepository repository,
    required String locale,
    Analytics? analytics,
    DateTime Function()? clock,
  })  : _repository = repository,
        _locale = locale,
        _analytics = analytics,
        _clock = clock ?? DateTime.now,
        super(const HoroscopeMainState()) {
    on<HoroscopeMainRequested>(_onRequested);
    on<HoroscopeMainRetried>(_onRetried);
  }

  final HoroscopeRepository _repository;
  final String _locale;
  final Analytics? _analytics;
  final DateTime Function() _clock;

  Future<void> _onRequested(
    HoroscopeMainRequested event,
    Emitter<HoroscopeMainState> emit,
  ) async {
    // Sheet 1 row 102 — `horoscope_page_viewed`. Fires when the zodiac grid
    // becomes visible. `previous_screen` is null — this screen sits inside the
    // TAM-58 shell (bottom nav), which has no router observer to hand us the
    // previous route; a shell-level observer would be the proper source. The
    // `entry_source` mirrors that: null for the tab-tap case (the only entry).
    unawaited(_analytics?.trackEvent(
      HoroscopeEvents.pageViewed,
      properties: const {
        HoroscopeProps.previousScreen: null,
        HoroscopeProps.entrySource: null,
      },
    ));
    await _load(emit);
  }

  Future<void> _onRetried(
    HoroscopeMainRetried event,
    Emitter<HoroscopeMainState> emit,
  ) async {
    await _load(emit);
  }

  Future<void> _load(Emitter<HoroscopeMainState> emit) async {
    emit(state.copyWith(status: HoroscopeMainStatus.loading, clearError: true));
    try {
      final signs = await _repository.fetchZodiacSigns(locale: _locale);
      emit(state.copyWith(
        status: HoroscopeMainStatus.ready,
        signs: signs,
        // The grid's date is client-derived: zodiac-signs serves no date_ist
        // (only the Pro-gated daily does). See istCivilDateNow.
        dateIst: istCivilDateNow(now: _clock()),
      ));
    } catch (error) {
      // Sheet 1 rows 102–112 cover the RESULT page's reliability
      // (`horoscope_result_failed`) — there is no dedicated event for a
      // zodiac-grid load failure. The UI still surfaces the error + Retry;
      // it just doesn't emit an analytics event for it.
      emit(state.copyWith(
        status: HoroscopeMainStatus.failure,
        dateIst: istCivilDateNow(now: _clock()),
        errorMessage: _errorMessageFor(error),
      ));
    }
  }

  static String _errorMessageFor(Object error) {
    final kind = error is HoroscopeException
        ? error.kind
        : HoroscopeErrorKind.unknown;
    return kind == HoroscopeErrorKind.offline
        ? 'You seem to be offline. Please check your connection.'
        : 'Could not load horoscope. Please try again.';
  }
}
