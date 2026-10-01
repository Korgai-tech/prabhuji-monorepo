import 'package:equatable/equatable.dart';

import '../../data/books_models.dart';

enum BookContentsStatus {
  loading,
  ready,

  /// `403` — the server refused the hierarchy. The screen renders NOTHING and
  /// routes to the paywall (#EXPORT_CRITICAL: never a preview).
  proRequired,
  failure,
}

/// State of Book Contents (Figma 639:3947) — major books only, Pro-gated
/// server-side.
class BookContentsState extends Equatable {
  const BookContentsState({
    this.status = BookContentsStatus.loading,
    this.contents,
    this.offline = false,
  });

  final BookContentsStatus status;

  /// `null` until loaded — and always `null` on the [BookContentsStatus.proRequired]
  /// path, because the server serialized no payload to hold.
  final BookContents? contents;

  final bool offline;

  /// A major book with NO sub-books is legal (loose chapters only): Contents
  /// renders the chapter list directly instead of a kanda list.
  bool get hasSubBooks => (contents?.subBooks.isNotEmpty) ?? false;

  BookContentsState copyWith({
    BookContentsStatus? status,
    BookContents? contents,
    bool? offline,
  }) {
    return BookContentsState(
      status: status ?? this.status,
      contents: contents ?? this.contents,
      offline: offline ?? this.offline,
    );
  }

  @override
  List<Object?> get props => [status, contents?.contentId, contents, offline];
}
