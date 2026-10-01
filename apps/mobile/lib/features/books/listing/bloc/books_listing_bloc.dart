// Private-field ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'package:bloc/bloc.dart';

import '../../../../core/analytics.dart';
import '../../data/books_models.dart';
import '../../data/books_repository.dart';
import 'books_listing_event.dart';
import 'books_listing_state.dart';

/// Drives the reusable 2-column listing (TAM-76 AC "All Books" / "Category").
/// One bloc serves both — [query] decides which endpoint to hit.
///
/// Analytics: Books is out of scope for the current analytics contract
/// (Sheet 1 has zero Books events), so no tracking is emitted. Ctor param
/// retained to preserve the wiring shape.
class BooksListingBloc extends Bloc<BooksListingEvent, BooksListingState> {
  BooksListingBloc({
    required BooksRepository repository,
    required BookListQuery query,
    // ignore: avoid_unused_constructor_parameters -- see class dartdoc
    Analytics? analytics,
  })  : _repository = repository,
        _query = query,
        super(const BooksListingState()) {
    on<BooksListingLoadRequested>(_onRequested);
    on<BooksListingNextPageRequested>(_onNextPage);
    on<BooksListingRetried>(_onRetried);
  }

  final BooksRepository _repository;
  final BookListQuery _query;

  BookListQuery get query => _query;

  Future<void> _onRequested(
    BooksListingLoadRequested event,
    Emitter<BooksListingState> emit,
  ) =>
      _loadFirst(emit);

  Future<void> _onRetried(
    BooksListingRetried event,
    Emitter<BooksListingState> emit,
  ) =>
      _loadFirst(emit);

  Future<void> _loadFirst(Emitter<BooksListingState> emit) async {
    emit(state.copyWith(
      status: BooksListingStatus.loading,
      loadingMore: false,
      offline: false,
    ));
    try {
      final page = await _fetch(cursor: null);
      emit(state.copyWith(
        status:
            page.items.isEmpty ? BooksListingStatus.empty : BooksListingStatus.ready,
        // The heading is the server's, for both endpoints this bloc serves.
        title: page.title,
        items: page.items,
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        offline: false,
      ));
    } catch (error) {
      emit(state.copyWith(
        status: BooksListingStatus.failure,
        offline: _isOffline(error),
      ));
    }
  }

  Future<void> _onNextPage(
    BooksListingNextPageRequested event,
    Emitter<BooksListingState> emit,
  ) async {
    // Guard: no cursor, already fetching, or the first page hasn't landed yet.
    if (!state.hasMore ||
        state.loadingMore ||
        state.status != BooksListingStatus.ready) {
      return;
    }
    emit(state.copyWith(loadingMore: true));
    try {
      final page = await _fetch(cursor: state.nextCursor);
      emit(state.copyWith(
        items: [...state.items, ...page.items],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        loadingMore: false,
      ));
    } catch (_) {
      // A failed NEXT page must never blow away the pages already on screen —
      // drop the spinner and keep the cursor so a later scroll can retry.
      emit(state.copyWith(loadingMore: false));
    }
  }

  Future<BookListPage> _fetch({required String? cursor}) {
    final category = _query.category;
    return category == null
        ? _repository.fetchAll(cursor: cursor)
        : _repository.fetchCategory(category, cursor: cursor);
  }

  static bool _isOffline(Object error) =>
      error is BooksException && error.kind == BooksErrorKind.offline;
}
