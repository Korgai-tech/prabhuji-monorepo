import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/analytics.dart';
import '../../core/service_locator.dart';
import '../../state/providers.dart';
import 'data/download_manager.dart';
import 'data/downloads_repository.dart';
import 'data/encrypted_store.dart';
import 'downloads_analytics.dart';

/// Downloads module composition root (TAM-125).
///
/// Every Downloads consumer (bloc, play-page `DownloadButton`, miniplayer
/// Offline chip, action sheets) reads from these providers — never
/// constructs its own `EncryptedStore` / `DownloadManager`. Overridden in
/// tests via `test/support/downloads_harness.dart`.

final encryptedStoreProvider = Provider<EncryptedStore>(
  (ref) => DefaultEncryptedStore(),
);

final downloadsRepositoryProvider = Provider<DownloadsRepository>((ref) {
  return DioDownloadsRepository(serviceLocator<Dio>());
});

/// The one long-lived [DownloadManager] instance. Wires an analytics
/// listener the first time it's constructed so all 11 events fire without
/// each widget re-plumbing the same forwarder.
final downloadManagerProvider = Provider<DownloadManager>((ref) {
  final manager = DownloadManager(
    repository: ref.watch(downloadsRepositoryProvider),
    store: ref.watch(encryptedStoreProvider),
  );
  final analytics = ref.watch(analyticsProvider);
  final connectivity = Connectivity();
  StreamSubscription<DownloadManagerEvent>? sub;
  if (analytics != null) {
    sub = manager.events.listen((event) {
      unawaited(_fireEvent(analytics, connectivity, event));
    });
  }
  ref.onDispose(() {
    unawaited(sub?.cancel());
    unawaited(manager.dispose());
  });
  return manager;
});

/// Map `connectivity_plus`'s current state to the `network_type` vocabulary
/// on `download_started` / `download_completed`. Fire-and-forget: any
/// exception (missing plugin platform channel, e.g. in a bare unit test)
/// resolves to `other` so analytics never fails an event over network
/// detection.
Future<String> _networkTypeNow(Connectivity connectivity) async {
  try {
    final results = await connectivity.checkConnectivity();
    if (results.isEmpty ||
        results.every((r) => r == ConnectivityResult.none)) {
      return DownloadsNetworkType.offline;
    }
    // Priority order — the "best" active connection wins when the plugin
    // reports multiple (e.g. wifi + cellular during a handoff).
    if (results.contains(ConnectivityResult.wifi)) {
      return DownloadsNetworkType.wifi;
    }
    if (results.contains(ConnectivityResult.mobile)) {
      return DownloadsNetworkType.mobile;
    }
    if (results.contains(ConnectivityResult.ethernet)) {
      return DownloadsNetworkType.ethernet;
    }
    return DownloadsNetworkType.other;
  } catch (_) {
    return DownloadsNetworkType.other;
  }
}

Future<void> _fireEvent(
  Analytics analytics,
  Connectivity connectivity,
  DownloadManagerEvent event,
) async {
  switch (event) {
    case DownloadEnqueued():
      // Pure queueing (no bytes yet). Per contract, `download_started`
      // fires only when the download ACTUALLY begins — the paired
      // `_startDownload` call emits `DownloadStarted` for the same
      // contentId when a slot frees. No analytics from enqueue itself.
      break;
    case DownloadStarted(:final contentId, :final contentType, :final sizeBytes, :final queuePosition):
      final networkType = await _networkTypeNow(connectivity);
      unawaited(analytics.trackEvent(
        DownloadsEvents.downloadStarted,
        properties: <String, Object?>{
          DownloadsEventProps.contentId: contentId,
          DownloadsEventProps.contentType: contentType.wire,
          DownloadsEventProps.fileSizeBytes: sizeBytes,
          DownloadsEventProps.networkType: networkType,
          DownloadsEventProps.queuePosition: queuePosition,
        },
      ));
    case DownloadCompleted$(:final contentId, :final contentType, :final sizeBytes, :final durationMs):
      final networkType = await _networkTypeNow(connectivity);
      unawaited(analytics.trackEvent(
        DownloadsEvents.downloadCompleted,
        properties: <String, Object?>{
          DownloadsEventProps.contentId: contentId,
          DownloadsEventProps.contentType: contentType.wire,
          DownloadsEventProps.fileSizeBytes: sizeBytes,
          DownloadsEventProps.durationMs: durationMs,
          DownloadsEventProps.networkType: networkType,
        },
      ));
    case DownloadFailedEvent(
        :final contentId,
        :final contentType,
        :final reason,
        :final bytesDownloaded,
        :final retryCount
      ):
      unawaited(analytics.trackEvent(
        DownloadsEvents.downloadFailed,
        properties: <String, Object?>{
          DownloadsEventProps.contentId: contentId,
          DownloadsEventProps.contentType: contentType.wire,
          DownloadsEventProps.failureReason: reason.wire,
          DownloadsEventProps.bytesDownloaded: bytesDownloaded,
          DownloadsEventProps.retryCount: retryCount,
        },
      ));
    case DownloadCancelled(:final contentId, :final contentType, :final percentComplete):
      unawaited(analytics.trackEvent(
        DownloadsEvents.downloadCancelled,
        properties: <String, Object?>{
          DownloadsEventProps.contentId: contentId,
          DownloadsEventProps.contentType: contentType.wire,
          DownloadsEventProps.percentComplete: percentComplete,
        },
      ));
    case DownloadRemoved(:final contentId, :final contentType, :final playCount, :final downloadedAt):
      unawaited(analytics.trackEvent(
        DownloadsEvents.downloadRemoved,
        properties: <String, Object?>{
          DownloadsEventProps.contentId: contentId,
          DownloadsEventProps.contentType: contentType.wire,
          DownloadsEventProps.playCount: playCount,
          DownloadsEventProps.daysSinceDownload: downloadedAt == null
              ? null
              : DateTime.now().difference(downloadedAt).inDays,
        },
      ));
    case DownloadProgress():
      // Not analytics-worthy on its own — the throttled progress ring drives
      // the UI, but per Sheet 1 only lifecycle transitions fire events.
      break;
  }
}
