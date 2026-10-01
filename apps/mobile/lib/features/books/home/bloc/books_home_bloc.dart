// Function-typed / private-field ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/books_repository.dart';
import 'books_home_event.dart';
import 'books_home_state.dart';

/// Drives the FREE Books Home (TAM-76 AC "Books Home").
///
/// No Pro gate lives here — the tab and every discovery surface are free; the
/// gate fires on a card TAP (see `BooksTapHandler`). This bloc never touches a
/// reading endpoint, so a free user's device never even requests book text.
///
/// Analytics: Books is out of scope for the current analytics contract
/// (Sheet 1 has zero Books events), so this bloc emits no tracking. The
/// [Analytics] ctor param is retained so existing call sites don't break
/// and so re-adding events later is a one-line change.
class BooksHomeBloc extends Bloc<BooksHomeEvent, BooksHomeState> {
  BooksHomeBloc({
    required BooksRepository repository,
    // ignore: avoid_unused_constructor_parameters -- see class dartdoc
    Analytics? analytics,
  })  : _repository = repository,
        super(const BooksHomeState()) {
    on<BooksHomeLoadRequested>(_onRequested);
    on<BooksHomeRetried>(_onRetried);
  }

  final BooksRepository _repository;

  Future<void> _onRequested(
    BooksHomeLoadRequested event,
    Emitter<BooksHomeState> emit,
  ) =>
      _load(emit);

  Future<void> _onRetried(
    BooksHomeRetried event,
    Emitter<BooksHomeState> emit,
  ) =>
      _load(emit);

  Future<void> _load(Emitter<BooksHomeState> emit) async {
    emit(state.copyWith(status: BooksHomeStatus.loading, offline: false));
    try {
      final home = await _repository.fetchHome();
      emit(state.copyWith(
        status: home.isEmpty ? BooksHomeStatus.empty : BooksHomeStatus.ready,
        // Only the sections that actually have something to show; their ORDER
        // and HEADINGS are the server's.
        sections: home.visibleSections,
        offline: false,
      ));
    } catch (error) {
      final kind =
          error is BooksException ? error.kind : BooksErrorKind.unknown;
      emit(state.copyWith(
        status: BooksHomeStatus.failure,
        offline: kind == BooksErrorKind.offline,
      ));
    }
  }
}
