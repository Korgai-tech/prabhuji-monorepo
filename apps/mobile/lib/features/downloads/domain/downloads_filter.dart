import 'content_type.dart';

/// Filter chip selection on the Downloads library (Figma `2632:21376`).
/// `null` = "All"; a value narrows to that content type. Kept as an
/// extension over the closed enum to avoid another type just for "all".
typedef DownloadsFilter = DownloadContentType?;

/// Per-chip live count derived from the full (UNFILTERED) local state.
/// The filter chips display these regardless of the currently-active
/// filter (AC: "counts always reflect UNFILTERED totals").
class DownloadsFilterCounts {
  const DownloadsFilterCounts({
    required this.all,
    required this.aarti,
    required this.bhajan,
    required this.mantra,
  });

  const DownloadsFilterCounts.zero()
      : all = 0,
        aarti = 0,
        bhajan = 0,
        mantra = 0;

  final int all;
  final int aarti;
  final int bhajan;
  final int mantra;

  int forFilter(DownloadsFilter filter) {
    switch (filter) {
      case null:
        return all;
      case DownloadContentType.aarti:
        return aarti;
      case DownloadContentType.bhajan:
        return bhajan;
      case DownloadContentType.mantra:
        return mantra;
    }
  }
}
