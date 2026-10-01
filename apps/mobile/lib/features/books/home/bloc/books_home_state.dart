import 'package:equatable/equatable.dart';

import '../../data/books_models.dart';

enum BooksHomeStatus { loading, ready, empty, failure }

/// State of the FREE Books Home (Figma 534:5061).
///
/// There is no Pro/entitlement flag here on purpose: Home, the carousel, the
/// category cards and Newly Added are FREE for everyone and show no lock badges
/// (#EXPORT_CRITICAL "Discovery is free and inviting"). Gating happens on TAP —
/// see `BooksTapHandler`.
///
/// The three sections used to be three fixed fields (`carousel`/`categories`/
/// `newlyAdded`), which baked the page's SHAPE — and its headings — into the
/// client. `GET /books/home` serves `sections[]`, so the state carries whatever
/// the server sent, in the server's order: this bloc no longer knows how many
/// sections exist or what any of them is called.
class BooksHomeState extends Equatable {
  const BooksHomeState({
    this.status = BooksHomeStatus.loading,
    this.sections = const [],
    this.offline = false,
  });

  final BooksHomeStatus status;

  /// CMS-authored sections in `sortOrder`, already filtered to the non-empty
  /// ones: an individually empty section hides its own row rather than failing
  /// the page (screen-spec `states.empty`).
  final List<BooksHomeSectionView> sections;

  /// Drives the failure copy — offline vs a generic fetch error.
  final bool offline;

  BooksHomeState copyWith({
    BooksHomeStatus? status,
    List<BooksHomeSectionView>? sections,
    bool? offline,
  }) {
    return BooksHomeState(
      status: status ?? this.status,
      sections: sections ?? this.sections,
      offline: offline ?? this.offline,
    );
  }

  @override
  List<Object?> get props => [status, sections, offline];
}
