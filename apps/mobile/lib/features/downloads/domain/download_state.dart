import 'package:meta/meta.dart';

import 'content_type.dart';

/// Why a download ended up in the [DownloadFailed] state. Wire values mirror
/// the analytics contract's `failure_reason` vocabulary (Sheet 1 row 133):
/// `network | storage_full | server_error`. Kept as an enum so widgets can
/// switch on it without stringly-typed comparisons.
enum DownloadFailureReason {
  network('network'),
  storageFull('storage_full'),
  serverError('server_error');

  const DownloadFailureReason(this.wire);
  final String wire;
}

/// Sealed hierarchy for a single row's download state (Figma component set
/// `2632:21835`: Downloaded / Downloading / Queued / Failed). The
/// [DownloadsLibraryBloc] carries a `Map<String, DownloadState>` keyed by
/// `contentId`; the [DownloadButton] on a play page subscribes to the per-
/// item stream in [DownloadManager] and rebuilds off the sealed variant.
@immutable
sealed class DownloadState {
  const DownloadState();

  /// Cheap wire label used by widget tests + analytics debug logs — never
  /// user-facing (labels rendered by widgets are Figma-driven strings).
  String get kind;
}

/// Row is queued because all download slots are full.
class DownloadQueued extends DownloadState {
  const DownloadQueued({required this.queuePosition});

  /// 1-based FIFO position within the queue.
  final int queuePosition;

  @override
  String get kind => 'queued';
}

/// Actively downloading. [progress] is 0.0..1.0; the ring animates via
/// `TweenAnimationBuilder` (spec §Performance — target 60 fps).
class DownloadInProgress extends DownloadState {
  const DownloadInProgress({
    required this.progress,
    required this.bytesDownloaded,
    required this.sizeBytes,
  });

  final double progress;
  final int bytesDownloaded;
  final int sizeBytes;

  @override
  String get kind => 'downloading';
}

/// Fully downloaded and playable offline.
class DownloadCompleted extends DownloadState {
  const DownloadCompleted({required this.completedAt});
  final DateTime completedAt;

  @override
  String get kind => 'downloaded';
}

/// A failed download — surfaces via the row action sheet with Retry / Cancel.
class DownloadFailed extends DownloadState {
  const DownloadFailed({
    required this.reason,
    this.bytesDownloaded = 0,
    this.retryCount = 0,
  });

  final DownloadFailureReason reason;
  final int bytesDownloaded;
  final int retryCount;

  @override
  String get kind => 'failed';
}

/// Presented in the library list as the persisted metadata + last-known
/// state. Item-level manifest data (size/duration) is duplicated here so the
/// library row can render offline without a manifest refetch.
@immutable
class DownloadItem {
  const DownloadItem({
    required this.contentId,
    required this.contentType,
    required this.title,
    required this.sizeBytes,
    required this.state,
    this.artworkUrl,
    this.subtitle,
    this.durationMs,
    this.downloadedAt,
    this.playCount = 0,
  });

  final String contentId;
  final DownloadContentType contentType;
  final String title;
  final String? subtitle;
  final String? artworkUrl;
  final int sizeBytes;
  final int? durationMs;
  final DateTime? downloadedAt;
  final int playCount;
  final DownloadState state;

  DownloadItem copyWith({DownloadState? state, int? playCount}) => DownloadItem(
        contentId: contentId,
        contentType: contentType,
        title: title,
        subtitle: subtitle,
        artworkUrl: artworkUrl,
        sizeBytes: sizeBytes,
        durationMs: durationMs,
        downloadedAt: downloadedAt,
        playCount: playCount ?? this.playCount,
        state: state ?? this.state,
      );
}
