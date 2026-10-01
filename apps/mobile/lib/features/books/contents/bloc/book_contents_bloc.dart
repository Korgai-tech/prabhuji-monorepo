// Private-field ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/books_repository.dart';
import 'book_contents_event.dart';
import 'book_contents_state.dart';

/// Drives Book Contents (TAM-76 AC "Book Contents") — the major-book hierarchy.
///
/// Reading is Pro-gated SERVER-side (TAM-75): a `403` never carries a payload,
/// so this bloc simply surfaces [BookContentsStatus.proRequired] and the screen
/// routes to the paywall. There is no client-side preview to leak.
///
/// Analytics: Books is out of scope for the current analytics contract
/// (Sheet 1 has zero Books events), so no tracking is emitted. Ctor param
/// retained to preserve the wiring shape.
class BookContentsBloc extends Bloc<BookContentsEvent, BookContentsState> {
  BookContentsBloc({
    required BooksRepository repository,
    required String contentId,
    // ignore: avoid_unused_constructor_parameters -- see class dartdoc
    Analytics? analytics,
  })  : _repository = repository,
        _contentId = contentId,
        super(const BookContentsState()) {
    on<BookContentsLoadRequested>((event, emit) => _load(emit));
    on<BookContentsRetried>((event, emit) => _load(emit));
  }

  final BooksRepository _repository;
  final String _contentId;

  String get contentId => _contentId;

  Future<void> _load(Emitter<BookContentsState> emit) async {
    emit(state.copyWith(status: BookContentsStatus.loading, offline: false));
    try {
      final contents = await _repository.fetchContents(_contentId);
      emit(state.copyWith(
        status: BookContentsStatus.ready,
        contents: contents,
        offline: false,
      ));
    } catch (error) {
      final kind =
          error is BooksException ? error.kind : BooksErrorKind.unknown;
      emit(state.copyWith(
        status: kind == BooksErrorKind.proRequired
            ? BookContentsStatus.proRequired
            : BookContentsStatus.failure,
        offline: kind == BooksErrorKind.offline,
      ));
    }
  }
}
