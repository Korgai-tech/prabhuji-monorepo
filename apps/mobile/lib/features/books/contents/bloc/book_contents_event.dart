import 'package:equatable/equatable.dart';

sealed class BookContentsEvent extends Equatable {
  const BookContentsEvent();

  @override
  List<Object?> get props => const [];
}

class BookContentsLoadRequested extends BookContentsEvent {
  const BookContentsLoadRequested();
}

class BookContentsRetried extends BookContentsEvent {
  const BookContentsRetried();
}
