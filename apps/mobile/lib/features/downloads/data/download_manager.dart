// Named ctor kept explicit — see the equivalent note on analytics.dart.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:collection';

import 'package:dio/dio.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

import '../domain/content_type.dart';
import '../domain/download_manifest.dart';
import '../domain/download_state.dart';
import 'downloads_repository.dart';
import 'encrypted_store.dart';

/// A single enqueued download's specification. Carries enough metadata to
/// re-render the library row (title / artwork / subtitle) once the download
/// completes without a second fetch.
class DownloadRequest {
  const DownloadRequest({
    required this.contentId,
    required this.contentType,
    required this.title,
    this.subtitle,
    this.artworkUrl,
    this.sourceUrl,
  });

  final String contentId;
  final DownloadContentType contentType;
  final String title;
  final String? subtitle;
  final String? artworkUrl;

  /// Optional direct audio URL (the Pro-gated `audioStreamUrl` the caller
  /// already has from the play flow). When present and non-empty, the manager
  /// downloads it directly and SKIPS the `/content/:type/:id/download`
  /// manifest fetch — a client-side unblock for the stage bug where the
  /// server-minted S3 presigned URL points at a non-existent key. When null,
  /// the manager falls back to the manifest endpoint.
  final String? sourceUrl;
}

/// Snapshot the library bloc + play-page `DownloadButton` render off.
class DownloadManagerSnapshot {
  const DownloadManagerSnapshot({
    required this.states,
    required this.items,
  });

  const DownloadManagerSnapshot.empty()
      : states = const <String, DownloadState>{},
        items = const <String, DownloadItem>{};

  /// Live state per contentId — every enqueued OR completed item is here.
  final Map<String, DownloadState> states;

  /// Completed / downloading / failed / queued items, keyed by contentId.
  /// Playable rows in the library iterate this map.
  final Map<String, DownloadItem> items;
}

/// Callback fired on every transition — used by the analytics wiring in
/// `application/downloads_analytics_wiring.dart` (spec §Frontend Task 17).
typedef DownloadManagerListener = void Function(
  DownloadManagerEvent event,
);

sealed class DownloadManagerEvent {
  const DownloadManagerEvent(this.contentId, this.contentType);
  final String contentId;
  final DownloadContentType contentType;
}

class DownloadEnqueued extends DownloadManagerEvent {
  const DownloadEnqueued(super.contentId, super.contentType,
      {required this.queuePosition});
  final int queuePosition;
}

class DownloadStarted extends DownloadManagerEvent {
  const DownloadStarted(super.contentId, super.contentType,
      {required this.sizeBytes, required this.queuePosition});
  final int sizeBytes;
  final int queuePosition;
}

class DownloadProgress extends DownloadManagerEvent {
  const DownloadProgress(super.contentId, super.contentType,
      {required this.progress, required this.bytesDownloaded});
  final double progress;
  final int bytesDownloaded;
}

class DownloadCompleted$ extends DownloadManagerEvent {
  const DownloadCompleted$(super.contentId, super.contentType,
      {required this.sizeBytes, required this.durationMs});
  final int sizeBytes;
  final int? durationMs;
}

class DownloadFailedEvent extends DownloadManagerEvent {
  const DownloadFailedEvent(super.contentId, super.contentType,
      {required this.reason, required this.bytesDownloaded, required this.retryCount});
  final DownloadFailureReason reason;
  final int bytesDownloaded;
  final int retryCount;
}

class DownloadCancelled extends DownloadManagerEvent {
  const DownloadCancelled(super.contentId, super.contentType,
      {required this.percentComplete});
  final double percentComplete;
}

class DownloadRemoved extends DownloadManagerEvent {
  const DownloadRemoved(super.contentId, super.contentType,
      {required this.playCount, required this.downloadedAt});
  final int playCount;
  final DateTime? downloadedAt;
}

/// The queue + slot allocator + retry / cancel orchestrator.
///
/// - Concurrency: [slotCount] slots (default 3 per spec §5 / §PLAN_UNCERTAINTY).
/// - Queue: FIFO. Over-slot enqueues surface as [DownloadQueued] with a
///   1-based queue position; each queue slot free transitions the head to
///   [DownloadInProgress] and fires [DownloadStarted].
/// - Retry: 1 automatic retry on `DownloadFailureReason.network`; the row
///   action sheet's manual Retry re-enqueues the same [DownloadRequest].
/// - Cancel: `cancel(contentId)` — cancels an active token or drops a
///   queued row.
/// - Transport: a fresh `Dio` per manager instance so the download loop
///   never touches the app's auth interceptor (bearer is in the signed URL).
///
/// Persistence: keeps an in-memory index; on the [complete] transition
/// it also writes an entry to [EncryptedStore.writeIndex]. On construction,
/// [hydrate] reads that same index so the library survives cold restart.
class DownloadManager {
  DownloadManager({
    required DownloadsRepository repository,
    required EncryptedStore store,
    Dio? transport,
    this.slotCount = 3,
    this.autoRetryOnNetworkFailure = true,
  })  : _repository = repository,
        _store = store,
        _transport = transport ?? Dio();

  final DownloadsRepository _repository;
  final EncryptedStore _store;
  final Dio _transport;

  /// Max concurrent transfers. Read by analytics-wired `queue_position` too.
  final int slotCount;
  final bool autoRetryOnNetworkFailure;

  final Queue<DownloadRequest> _queue = Queue<DownloadRequest>();
  final Map<String, CancelToken> _active = <String, CancelToken>{};
  final Map<String, int> _retryCounts = <String, int>{};
  final Map<String, DownloadRequest> _requestsById =
      <String, DownloadRequest>{};

  /// Cap on mid-transfer manifest re-fetches per download (Q17 —
  /// security-audit-preimplementation.md). A slow user on a 5-min TTL can
  /// legitimately need one or two refreshes on a 4G re-connect; three
  /// consecutive 401/403s from S3 means the entitlement is genuinely
  /// revoked and we STOP re-fetching to avoid billing the manifest endpoint
  /// as a heartbeat.
  static const int _maxSignedUrlRefreshes = 3;

  final Map<String, DownloadState> _states = <String, DownloadState>{};
  final Map<String, DownloadItem> _items = <String, DownloadItem>{};

  final StreamController<DownloadManagerSnapshot> _snapshots =
      StreamController<DownloadManagerSnapshot>.broadcast();
  final StreamController<DownloadManagerEvent> _events =
      StreamController<DownloadManagerEvent>.broadcast();

  Stream<DownloadManagerSnapshot> get snapshots => _snapshots.stream;
  Stream<DownloadManagerEvent> get events => _events.stream;

  DownloadManagerSnapshot get snapshot => DownloadManagerSnapshot(
        states: Map<String, DownloadState>.unmodifiable(_states),
        items: Map<String, DownloadItem>.unmodifiable(_items),
      );

  /// Read the persisted `downloads/index.json` (if any) into memory. Call
  /// once at app start from the composition root.
  Future<void> hydrate() async {
    final entries = await _store.readIndex();
    for (final raw in entries) {
      try {
        final contentId = raw['contentId'] as String?;
        final typeWire = raw['contentType'] as String?;
        final type = DownloadContentType.fromWire(typeWire);
        if (contentId == null || type == null) continue;
        // Only surface entries whose ciphertext still exists on disk — the
        // OS may have evicted the file (rare on Android/iOS) or the user
        // manually cleared app storage.
        if (!await _store.exists(contentId)) continue;
        final item = DownloadItem(
          contentId: contentId,
          contentType: type,
          title: (raw['title'] as String?) ?? '',
          subtitle: raw['subtitle'] as String?,
          artworkUrl: raw['artworkUrl'] as String?,
          sizeBytes: (raw['sizeBytes'] as num?)?.toInt() ?? 0,
          durationMs: (raw['durationMs'] as num?)?.toInt(),
          downloadedAt: DateTime.tryParse(
            (raw['downloadedAt'] as String?) ?? '',
          ),
          playCount: (raw['playCount'] as num?)?.toInt() ?? 0,
          state: DownloadCompleted(
            completedAt: DateTime.tryParse(
              (raw['downloadedAt'] as String?) ?? '',
            ) ?? DateTime.now().toUtc(),
          ),
        );
        _items[contentId] = item;
        _states[contentId] = item.state;
      } catch (_) {
        // Skip malformed row; the whole index is best-effort.
      }
    }
    _publish();
  }

  /// Add a download to the queue. If there's a free slot, starts immediately.
  Future<void> enqueue(DownloadRequest request) async {
    // Idempotent: skip if we already have this item downloaded or in-flight.
    final existing = _states[request.contentId];
    if (existing is DownloadCompleted ||
        existing is DownloadInProgress ||
        existing is DownloadQueued) {
      return;
    }
    _requestsById[request.contentId] = request;
    if (_active.length < slotCount) {
      unawaited(_startDownload(request));
    } else {
      _queue.addLast(request);
      final position = _queue.length; // 1-based within queue (excludes active).
      _states[request.contentId] =
          DownloadQueued(queuePosition: position);
      _emit(DownloadEnqueued(
        request.contentId,
        request.contentType,
        queuePosition: position,
      ));
      _publish();
    }
  }

  /// Cancel an active OR queued download. Fires `download_cancelled`.
  Future<void> cancel(String contentId) async {
    final token = _active[contentId];
    if (token != null) {
      final state = _states[contentId];
      final percent = state is DownloadInProgress ? state.progress : 0.0;
      token.cancel('user cancelled');
      _active.remove(contentId);
      _states.remove(contentId);
      _requestsById.remove(contentId);
      final type =
          _items[contentId]?.contentType ?? _guessType(contentId);
      _emit(DownloadCancelled(contentId, type,
          percentComplete: percent * 100));
      _pumpQueue();
      _publish();
      return;
    }
    _queue.removeWhere((r) => r.contentId == contentId);
    if (_states[contentId] is DownloadQueued) {
      _states.remove(contentId);
      final type =
          _requestsById.remove(contentId)?.contentType ?? _guessType(contentId);
      _emit(DownloadCancelled(contentId, type, percentComplete: 0));
      _publish();
    }
  }

  /// Manually retry a `failed` row.
  Future<void> retry(String contentId) async {
    final request = _requestsById[contentId];
    if (request == null) return;
    _states.remove(contentId);
    await enqueue(request);
  }

  /// Remove a completed download. Fires `download_removed` + deletes the
  /// ciphertext + trims the index.
  Future<void> remove(String contentId) async {
    final item = _items.remove(contentId);
    _states.remove(contentId);
    _requestsById.remove(contentId);
    if (item != null) {
      _emit(DownloadRemoved(
        contentId,
        item.contentType,
        playCount: item.playCount,
        downloadedAt: item.downloadedAt,
      ));
    }
    try {
      await _store.delete(contentId);
      await _persistIndex();
    } catch (_) {
      // Persistence failures are best-effort; the row is already gone from UI.
    }
    _publish();
  }

  /// Increment the play counter for [contentId]. Called when the audio
  /// controller begins playback of a downloaded item — used by both the
  /// index + `downloaded_content_played` analytics.
  Future<void> notePlay(String contentId) async {
    final item = _items[contentId];
    if (item == null) return;
    _items[contentId] = item.copyWith(playCount: item.playCount + 1);
    await _persistIndex();
    _publish();
  }

  /// Called from the composition root on logout — wipes memory + files.
  Future<void> shutdown() async {
    for (final t in _active.values) {
      try {
        t.cancel('shutdown');
      } catch (_) {/* ignore */}
    }
    _active.clear();
    _queue.clear();
    _requestsById.clear();
    _states.clear();
    _items.clear();
    try {
      await _store.deleteAll();
    } catch (_) {/* ignore */}
    _publish();
  }

  Future<void> _startDownload(
    DownloadRequest request, {
    int refreshesUsed = 0,
  }) async {
    final token = CancelToken();
    _active[request.contentId] = token;
    _states[request.contentId] = const DownloadInProgress(
      progress: 0,
      bytesDownloaded: 0,
      sizeBytes: 0,
    );
    _publish();

    // Client-side short-circuit: if the caller handed us the Pro-gated audio
    // URL directly (from the play flow), skip the manifest endpoint and
    // download the URL as-is. The server-side entitlement gate is already
    // enforced upstream — the caller only has `audioStreamUrl` because the
    // aarti/mantras play endpoint served it (null for non-Pro), so this
    // bypass does not leak Pro content. Signed-URL refresh retries are
    // disabled on this path — the URL doesn't expire.
    final directUrl = request.sourceUrl;
    final useDirectUrl = directUrl != null && directUrl.trim().isNotEmpty;

    DownloadManifest manifest;
    if (useDirectUrl) {
      manifest = DownloadManifest(
        signedUrl: directUrl,
        sizeBytes: 0,
        durationMs: null,
        checksum: null,
        expiresAt: DateTime.now().toUtc().add(const Duration(hours: 24)),
      );
    } else {
      try {
        manifest = await _repository.fetchManifest(
          type: request.contentType,
          contentId: request.contentId,
        );
      } on DownloadsRepositoryPaywallException {
        _handleFailure(request, DownloadFailureReason.serverError, 0);
        return;
      } on DownloadsRepositoryNotFoundException {
        _handleFailure(request, DownloadFailureReason.serverError, 0);
        return;
      } catch (_) {
        _handleFailure(request, DownloadFailureReason.network, 0);
        return;
      }
    }

    // Only emit `DownloadStarted` on the first attempt — a mid-transfer
    // signed-URL refresh (Q17) is invisible to analytics; the download is
    // conceptually the same one, just with a fresh S3 URL.
    if (refreshesUsed == 0) {
      _emit(DownloadStarted(
        request.contentId,
        request.contentType,
        sizeBytes: manifest.sizeBytes,
        queuePosition: _active.length - 1,
      ));
    }

    var bytesDownloaded = 0;
    final controller = StreamController<List<int>>();
    // Kick off the ciphertext write in parallel with the network read.
    final writeFuture = _store.writeStream(
      request.contentId,
      controller.stream,
    );

    try {
      final response = await _transport.get<ResponseBody>(
        manifest.signedUrl,
        options: Options(
          responseType: ResponseType.stream,
          headers: const <String, dynamic>{},
        ),
        cancelToken: token,
      );
      final body = response.data;
      if (body == null) {
        await controller.close();
        _handleFailure(request, DownloadFailureReason.network, 0);
        return;
      }
      await for (final chunk in body.stream) {
        controller.add(chunk);
        bytesDownloaded += chunk.length;
        final progress = manifest.sizeBytes == 0
            ? 0.0
            : bytesDownloaded / manifest.sizeBytes;
        _states[request.contentId] = DownloadInProgress(
          progress: progress.clamp(0.0, 1.0),
          bytesDownloaded: bytesDownloaded,
          sizeBytes: manifest.sizeBytes,
        );
        _emit(DownloadProgress(
          request.contentId,
          request.contentType,
          progress: progress.clamp(0.0, 1.0),
          bytesDownloaded: bytesDownloaded,
        ));
        _publish();
      }
      await controller.close();
      await writeFuture;
    } on DioException catch (e) {
      await controller.close();
      if (CancelToken.isCancel(e)) return; // cancel() already emitted the event.
      final status = e.response?.statusCode;
      // Q17: signed URL expired (S3 returns 403 on expired presign; 401 is
      // a defensive add for buckets fronted by CloudFront trusted-signers).
      // Re-fetch the manifest and restart from byte 0, capped at
      // `_maxSignedUrlRefreshes` to keep a genuinely revoked entitlement
      // from spinning the endpoint. Discard the partial ciphertext so the
      // re-attempt writes a clean file.
      //
      // Direct-URL path (`useDirectUrl`) skips this — the URL is fixed and a
      // re-attempt would just re-fail against the same URL.
      if (!useDirectUrl &&
          (status == 401 || status == 403) &&
          refreshesUsed < _maxSignedUrlRefreshes) {
        _active.remove(request.contentId);
        try {
          await _store.delete(request.contentId);
        } catch (_) {/* best-effort */}
        return _startDownload(request, refreshesUsed: refreshesUsed + 1);
      }
      // Storage-full presents as a low-level `os error 28` from writeStream
      // above (bubbles up from the RandomAccessFile). Dio errors are
      // network-side.
      _handleFailure(request, DownloadFailureReason.network, bytesDownloaded);
      return;
    } catch (e) {
      await controller.close();
      if (e is DownloadStoreException) {
        final message = e.cause?.toString() ?? e.message;
        if (message.contains('No space left') ||
            message.contains('ENOSPC') ||
            message.contains('errno = 28')) {
          _handleFailure(
              request, DownloadFailureReason.storageFull, bytesDownloaded);
          return;
        }
      }
      _handleFailure(request, DownloadFailureReason.serverError, bytesDownloaded);
      return;
    }

    // Completed — record + persist.
    //
    // Post-TAM-125: the manifest's `sizeBytes` may be 0 when the backfill
    // script has not yet populated the row on stage/prod. We ALWAYS know
    // the real size after the stream drains (`bytesDownloaded` is the
    // authoritative count) so prefer that when the manifest was unknown.
    final now = DateTime.now().toUtc();
    final int effectiveSizeBytes =
        manifest.sizeBytes > 0 ? manifest.sizeBytes : bytesDownloaded;
    final item = DownloadItem(
      contentId: request.contentId,
      contentType: request.contentType,
      title: request.title,
      subtitle: request.subtitle,
      artworkUrl: request.artworkUrl,
      sizeBytes: effectiveSizeBytes,
      durationMs: manifest.durationMs,
      downloadedAt: now,
      state: DownloadCompleted(completedAt: now),
    );
    _items[request.contentId] = item;
    _states[request.contentId] = item.state;
    _active.remove(request.contentId);
    _retryCounts.remove(request.contentId);
    _emit(DownloadCompleted$(
      request.contentId,
      request.contentType,
      sizeBytes: manifest.sizeBytes,
      durationMs: manifest.durationMs,
    ));
    await _persistIndex();
    // Pre-warm the artwork thumbnail into the AppNetworkImage disk cache
    // (backed by flutter_cache_manager) so it renders offline even if the
    // user never visits the Downloads screen while online.
    if (request.artworkUrl != null && request.artworkUrl!.isNotEmpty) {
      unawaited(_precacheArtwork(request.artworkUrl!));
    }
    _pumpQueue();
    _publish();
  }

  /// Fire-and-forget artwork prefetch — same cache dir the row's
  /// `AppNetworkImage` reads on later renders. Best-effort: any failure
  /// (network drop, 404, corrupt image) falls back to the branded
  /// placeholder when the row renders offline.
  Future<void> _precacheArtwork(String url) async {
    try {
      await DefaultCacheManager().downloadFile(url);
    } catch (_) {
      // ignore — offline row will show the branded fallback
    }
  }

  void _handleFailure(
    DownloadRequest request,
    DownloadFailureReason reason,
    int bytesDownloaded,
  ) {
    _active.remove(request.contentId);
    final retries = _retryCounts.update(
      request.contentId,
      (v) => v + 1,
      ifAbsent: () => 0,
    );
    _states[request.contentId] = DownloadFailed(
      reason: reason,
      bytesDownloaded: bytesDownloaded,
      retryCount: retries,
    );
    _emit(DownloadFailedEvent(
      request.contentId,
      request.contentType,
      reason: reason,
      bytesDownloaded: bytesDownloaded,
      retryCount: retries,
    ));
    _pumpQueue();
    _publish();

    if (autoRetryOnNetworkFailure &&
        reason == DownloadFailureReason.network &&
        retries == 1) {
      // One automatic retry per spec §5.
      unawaited(Future<void>.delayed(const Duration(milliseconds: 300), () {
        if (!_states.containsKey(request.contentId)) return;
        enqueue(request);
      }));
    }
  }

  void _pumpQueue() {
    while (_active.length < slotCount && _queue.isNotEmpty) {
      final next = _queue.removeFirst();
      unawaited(_startDownload(next));
    }
    // Rewrite queue-position labels on remaining queued rows so the row UI
    // shows the correct 1-based number as slots free.
    var idx = 0;
    for (final req in _queue) {
      idx += 1;
      _states[req.contentId] = DownloadQueued(queuePosition: idx);
    }
  }

  Future<void> _persistIndex() async {
    final entries = _items.values
        .map((i) => <String, Object?>{
              'contentId': i.contentId,
              'contentType': i.contentType.wire,
              'title': i.title,
              'subtitle': i.subtitle,
              'artworkUrl': i.artworkUrl,
              'sizeBytes': i.sizeBytes,
              'durationMs': i.durationMs,
              'downloadedAt': i.downloadedAt?.toIso8601String(),
              'playCount': i.playCount,
            })
        .toList(growable: false);
    try {
      await _store.writeIndex(entries);
    } catch (_) {/* best-effort */}
  }

  void _emit(DownloadManagerEvent event) {
    if (_events.isClosed) return;
    _events.add(event);
  }

  void _publish() {
    if (_snapshots.isClosed) return;
    _snapshots.add(snapshot);
  }

  DownloadContentType _guessType(String contentId) {
    return _items[contentId]?.contentType ??
        _requestsById[contentId]?.contentType ??
        DownloadContentType.aarti;
  }

  Future<void> dispose() async {
    await _snapshots.close();
    await _events.close();
  }
}
