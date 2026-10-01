import 'package:equatable/equatable.dart';

import '../domain/content_type.dart';
import '../domain/download_state.dart';
import '../domain/downloads_filter.dart';

/// Library-screen state. Renders one of three surfaces:
///
///  * `isEmpty(all counts == 0)` → the empty-state screen (Figma `2639:22432`).
///  * `filteredItems.isEmpty` and total > 0 → "no results for this filter"
///     (currently reuses the populated list frame with an inline hint —
///     spec kept this quiet; not yet a distinct Figma frame).
///  * Otherwise → the populated list.
class DownloadsLibraryState extends Equatable {
  const DownloadsLibraryState({
    required this.items,
    required this.counts,
    required this.filter,
    required this.isOffline,
  });

  const DownloadsLibraryState.empty()
      : items = const <DownloadItem>[],
        counts = const DownloadsFilterCounts.zero(),
        filter = null,
        isOffline = false;

  /// The full (unfiltered) list of DownloadItems the manager currently
  /// knows about. Filtering is a pure `where` at render time.
  final List<DownloadItem> items;
  final DownloadsFilterCounts counts;
  final DownloadsFilter filter;
  final bool isOffline;

  List<DownloadItem> get filteredItems {
    final f = filter;
    if (f == null) return items;
    return items.where((i) => i.contentType == f).toList(growable: false);
  }

  bool get isTotalEmpty => items.isEmpty;

  DownloadsLibraryState copyWith({
    List<DownloadItem>? items,
    DownloadsFilterCounts? counts,
    Object? filter = _sentinel,
    bool? isOffline,
  }) {
    return DownloadsLibraryState(
      items: items ?? this.items,
      counts: counts ?? this.counts,
      filter: identical(filter, _sentinel)
          ? this.filter
          : filter as DownloadContentType?,
      isOffline: isOffline ?? this.isOffline,
    );
  }

  static const Object _sentinel = Object();

  @override
  List<Object?> get props => <Object?>[items.length, counts.all, filter, isOffline];
}
