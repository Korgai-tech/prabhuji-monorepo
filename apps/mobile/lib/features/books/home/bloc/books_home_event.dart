import 'package:equatable/equatable.dart';

sealed class BooksHomeEvent extends Equatable {
  const BooksHomeEvent();

  @override
  List<Object?> get props => const [];
}

/// Tab entry — loads `/books/home` and fires `books_tab_opened` +
/// `books_home_viewed`.
class BooksHomeLoadRequested extends BooksHomeEvent {
  const BooksHomeLoadRequested();
}

/// Error-state retry — reloads WITHOUT re-firing the entry events.
class BooksHomeRetried extends BooksHomeEvent {
  const BooksHomeRetried();
}
