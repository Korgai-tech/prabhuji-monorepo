import 'package:equatable/equatable.dart';

sealed class BookReaderEvent extends Equatable {
  const BookReaderEvent();

  @override
  List<Object?> get props => const [];
}

/// Open the reader: restores the global font size, then loads the opening
/// chapter (major) or the scripture body (direct).
class BookReaderStarted extends BookReaderEvent {
  const BookReaderStarted();
}

/// Retry after an error / offline-miss.
class BookReaderRetried extends BookReaderEvent {
  const BookReaderRetried();
}

/// Previous chapter — ignored on the first chapter (q5).
class BookReaderPreviousRequested extends BookReaderEvent {
  const BookReaderPreviousRequested();
}

/// Next chapter — ignored on the last chapter (q5).
class BookReaderNextRequested extends BookReaderEvent {
  const BookReaderNextRequested();
}

/// Jump to a chapter from the drawer.
class BookReaderChapterSelected extends BookReaderEvent {
  const BookReaderChapterSelected(this.chapterId);
  final String chapterId;

  @override
  List<Object?> get props => [chapterId];
}

class BookReaderDrawerToggled extends BookReaderEvent {
  const BookReaderDrawerToggled({required this.open});
  final bool open;

  @override
  List<Object?> get props => [open];
}

class BookReaderFontOverlayToggled extends BookReaderEvent {
  const BookReaderFontOverlayToggled({required this.open});
  final bool open;

  @override
  List<Object?> get props => [open];
}

/// Slider moved — persists globally (q4/r10).
class BookReaderFontSizeChanged extends BookReaderEvent {
  const BookReaderFontSizeChanged(this.size);
  final double size;

  @override
  List<Object?> get props => [size];
}

/// Listen Audio / Pause tapped.
class BookReaderListenToggled extends BookReaderEvent {
  const BookReaderListenToggled();
}
