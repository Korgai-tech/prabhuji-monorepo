import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import 'analytics_transport_config.dart';
import 'constants.dart' hide LogLevel;
import 'event_storage.dart';
import 'events/base_event.dart';
import 'local_state_store.dart';
import 'session_manager.dart';
import 'session_transition.dart';

/// The collector rejected the batch — surface with the HTTP status so the
/// per-item fallback can walk the batch and evict repeat offenders.
class _RejectedBatchException implements Exception {
  final String message;
  final int statusCode;

  const _RejectedBatchException(this.message, this.statusCode);

  @override
  String toString() =>
      'RejectedBatchException(status: $statusCode, message: $message)';
}

/// HTTP transport speaking Amplitude's HTTP V2 wire contract.
///
/// Request:
///   `POST` `config.serverUrl`
///   `Content-Type: application/json`
///   `{ "api_key": "...", "client_upload_time": <epoch ms>,`
///   `  "events": [ {event_type, user_id, device_id, pseudo_id, insert_id, time,`
///   `               session_id, event_id, event_properties, user_properties,`
///   `               groups, group_properties, platform, os_name, os_version,`
///   `               device_brand, device_model, device_manufacturer,`
///   `               version_name, language, adid, library, country, ...}, ... ] }`
///
/// Response (V2-shaped): 200 on accept, 400 on invalid. The endpoint is
/// pre-auth (api_key rides in the body — that's the V2 contract) — no Bearer
/// header, so this stays deliberately decoupled from the app's Dio +
/// auth-interceptor stack.
///
/// Preserves the public surface of the previous gRPC transport (initialize,
/// trackEvent, trackIdentify, trackGroup, flush, dispose, onForegroundResumed,
/// onBackgroundEntered, getSessionId, resetSession, clearQueuedEvents) so the
/// `Amplitude` façade is transport-agnostic.
class HttpNetworkService {
  final AnalyticsTransportConfig config;

  final SessionManager _sessionManager;
  final EventStorage _eventStorage;
  final http.Client _httpClient;
  Timer? _flushTimer;
  bool _isInitialized = false;
  bool _isFlushing = false;

  /// Reasons that MUST NOT be dropped when [_flush] is entered while
  /// another flush is in flight OR before [initialize] has completed.
  /// If any of these arrive during a busy/uninit window, the reason is
  /// stashed in [_pendingDeferredReason] and replayed once the in-flight
  /// flush's `finally` runs or [initialize] finishes. Precedence rule
  /// (`_setDeferredReason`): `pre_logout` / `pre_clear_pending` are
  /// stickier than `identity_change` — losing a pre_logout to a later
  /// identity_change would let the ambient full-drain ship null-stamped
  /// rows to the next signed-in user without the stamped-only filter.
  static const _deferrableReasons = <String>{
    'pre_logout',
    'pre_clear_pending',
    'identity_change',
  };

  /// Set at most once between the moment a deferrable reason arrives
  /// while busy/uninit and the moment [_replayPendingDeferredReason]
  /// consumes it. Nullable — normal (non-deferrable) reasons never
  /// touch this field.
  String? _pendingDeferredReason;

  /// Last pseudo id seen on a tracked event, mirrored to [LocalStateStore] so
  /// it survives a cold start. Used as the send-time fallback for events that
  /// carry none of their own — `session_start` / `session_end` are built
  /// inside this class with no [EventOptions], and anything queued before
  /// Firebase resolved its `app_instance_id` froze a null at enqueue time.
  /// Safe to backfill because the id is install-scoped and never rotates.
  String? _pseudoUserId;
  late final LocalStateStore _pseudoIdStore =
      LocalStateStore(config.instanceName);

  HttpNetworkService(this.config, {http.Client? httpClient})
      : _httpClient = httpClient ?? http.Client(),
        _sessionManager = SessionManager(
          config.minTimeBetweenSessionsMillis,
          instanceName: config.instanceName,
        ),
        _eventStorage = EventStorage(config.instanceName);

  /// Initialize the transport.
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      await _sessionManager.initialize();
      await _eventStorage.initialize();
      // Warm the pseudo-id fallback from the previous launch so the
      // `session_start` this cold start is about to enqueue carries one
      // without waiting for Firebase to resolve.
      _pseudoUserId ??= await _pseudoIdStore.getPseudoId();
      _startFlushTimer();
      _isInitialized = true;
      _log('HTTP transport initialized (serverUrl=${config.serverUrl})',
          LogLevel.info);
      // Cold-start race: `Amplitude.setUserId(restoredJwtSub)` inside
      // `signIn(token)` fires `identity_change` concurrently with this
      // `initialize()`. If it arrived before we flipped `_isInitialized`,
      // the deferred reason is sitting in `_pendingDeferredReason` — replay
      // it now so pre-login events retro-attribute on the very first
      // logged-in event, not on the next timer tick.
      _replayPendingDeferredReason(source: 'initialize');
    } catch (e) {
      _log('Failed to initialize HTTP transport: $e', LogLevel.error);
      rethrow;
    }
  }

  /// Precedence-aware pending-reason setter. `pre_logout` and
  /// `pre_clear_pending` win over `identity_change` — the pre-logout
  /// drain is a strict subset of what the full drain would do, so
  /// overwriting a pending pre_logout with a later identity_change
  /// would let null-stamped rows ship attributed to the wrong user
  /// (queue-time stamped rows still ship correctly either way; the
  /// concern is only the null-stamped tail the pre_logout drain
  /// deliberately parks). Identical reasons collapse.
  void _setDeferredReason(String incoming) {
    final current = _pendingDeferredReason;
    if (current == null) {
      _pendingDeferredReason = incoming;
      return;
    }
    if (current == incoming) return;
    const preLogout = <String>{'pre_logout', 'pre_clear_pending'};
    if (preLogout.contains(current) && !preLogout.contains(incoming)) {
      // current wins — do not downgrade to identity_change
      return;
    }
    _pendingDeferredReason = incoming;
  }

  /// Consume and dispatch any pending deferred reason. Called from the
  /// `_flush` finally (a busy window just ended) and from the tail of
  /// [initialize] (the pre-init window just ended). `source` is for the
  /// log line only.
  void _replayPendingDeferredReason({required String source}) {
    final pending = _pendingDeferredReason;
    if (pending == null) return;
    _pendingDeferredReason = null;
    _log('Replaying deferred flush reason=$pending source=$source',
        LogLevel.info);
    unawaited(_flush(reason: pending));
  }

  void _startFlushTimer() {
    _flushTimer?.cancel();
    _flushTimer = Timer.periodic(
      Duration(milliseconds: config.flushIntervalMillis),
      (_) => _flush(reason: 'timer'),
    );
  }

  /// Add event to local storage and flush if queue is full.
  Future<void> trackEvent(BaseEvent event) async {
    if (!_isInitialized || config.optOut) {
      _log(
          'Event "${event.eventType}" SKIPPED '
          '(initialized=$_isInitialized optOut=${config.optOut})',
          LogLevel.info);
      return;
    }
    _log('Event "${event.eventType}" queued', LogLevel.debug);

    try {
      // Latch before the session-transition check below: the session events
      // it enqueues carry no EventOptions of their own and fall back to this.
      final eventPseudoId = event.pseudoUserId;
      if (eventPseudoId != null &&
          eventPseudoId.isNotEmpty &&
          eventPseudoId != _pseudoUserId) {
        _pseudoUserId = eventPseudoId;
        unawaited(_pseudoIdStore.setPseudoId(eventPseudoId));
      }

      final timestamp =
          event.timestamp ?? DateTime.now().millisecondsSinceEpoch;
      if (config.defaultTracking.sessions) {
        final transition = await _sessionManager.onTrackEvent(timestamp);
        await _enqueueSessionEvents(transition, timestamp);
      }
      event.sessionId ??= _sessionManager.sessionId;

      await _eventStorage.addEvent(event);

      final queueSize = await _eventStorage.getEventCount();
      if (queueSize >= config.flushQueueSize) {
        await _flush(reason: 'queue_threshold_events');
      }
    } catch (e) {
      _log('Error storing event: $e', LogLevel.error);
      rethrow;
    }
  }

  /// Add identify event to local storage.
  Future<void> trackIdentify(Map<String, dynamic> identifyData) async {
    if (!_isInitialized || config.optOut) return;

    try {
      final timestamp =
          identifyData['timestamp'] ?? DateTime.now().millisecondsSinceEpoch;
      if (config.defaultTracking.sessions) {
        final transition = await _sessionManager.onTrackEvent(timestamp);
        await _enqueueSessionEvents(transition, timestamp);
      }
      identifyData['session_id'] ??= _sessionManager.sessionId;

      await _eventStorage.addIdentify(identifyData);

      final queueSize = await _eventStorage.getIdentifyCount();
      if (queueSize >= config.flushQueueSize) {
        await _flush(reason: 'queue_threshold_identifies');
      }
    } catch (e) {
      _log('Error storing identify: $e', LogLevel.error);
    }
  }

  /// Add group event to local storage.
  Future<void> trackGroup(Map<String, dynamic> groupData) async {
    if (!_isInitialized || config.optOut) return;

    try {
      final timestamp =
          groupData['timestamp'] ?? DateTime.now().millisecondsSinceEpoch;
      if (config.defaultTracking.sessions) {
        final transition = await _sessionManager.onTrackEvent(timestamp);
        await _enqueueSessionEvents(transition, timestamp);
      }
      groupData['session_id'] ??= _sessionManager.sessionId;

      await _eventStorage.addGroup(groupData);

      final queueSize = await _eventStorage.getGroupCount();
      if (queueSize >= config.flushQueueSize) {
        await _flush(reason: 'queue_threshold_groups');
      }
    } catch (e) {
      _log('Error storing group: $e', LogLevel.error);
    }
  }

  /// Manual flush — exposed so the façade can drive it from `flush()`.
  Future<void> flush({String reason = 'manual'}) async {
    if (config.optOut) return;
    await _flush(reason: reason);
  }

  /// Reasons that MUST flush even without a resolved user identity. Everything
  /// else (timer tick, queue-threshold) waits for `config.userId` to be set so
  /// pre-login events accumulate on disk and ship attributed to whoever logs
  /// in (send-time falls back to `config.userId` — see `_sendEventsViaHttp`).
  ///
  /// - `lifecycle_background` / `dispose`: app is going away; ship whatever we
  ///   have (anonymous device_id-only send is preferable to losing them).
  /// - `pre_logout` / `pre_clear_pending`: seam is about to null the id, so
  ///   drain the queue while the outgoing id is still active — attribution
  ///   would flip to null (or a next user) otherwise.
  /// - `identity_change`: fired inside `setUserId` when a real id lands; kicks
  ///   the backlog to ship immediately instead of waiting for the next tick.
  static const _identityBypassReasons = <String>{
    'lifecycle_background',
    'dispose',
    'pre_logout',
    'pre_clear_pending',
    'identity_change',
  };

  /// Reasons that route through [_preLogoutFlush] instead of the normal
  /// full-drain path. Pre-logout drains ONLY rows already stamped with the
  /// outgoing user_id (at queue time by `_applyPersistentIdentity`); rows
  /// with null user_id — likely queued during the logout-redirect window,
  /// e.g. `phone_input_screen_viewed` fired by the new phone screen mounting
  /// while `reset()` is still running — stay on disk so the next
  /// `identity_change` flush retro-attributes them to the new user.
  static const _preLogoutReasons = <String>{
    'pre_logout',
    'pre_clear_pending',
  };

  /// Flush all stored events / identifies / groups to the collector.
  Future<void> _flush({String reason = 'unspecified'}) async {
    if (_isFlushing) {
      // Deferrable reasons (pre_logout / pre_clear_pending / identity_change)
      // are user-driven and rare; dropping them would either miss the
      // "immediate flush on identity change" guarantee (identity_change) or
      // let null-stamped rows ship to the wrong user (pre_logout). Stash the
      // reason and let the in-flight flush's finally replay it. Non-deferrable
      // reasons (timer, queue_threshold, lifecycle_background, dispose) keep
      // the pre-existing drop-on-busy behaviour — the next tick / lifecycle
      // event will retry them naturally.
      if (_deferrableReasons.contains(reason)) {
        _setDeferredReason(reason);
      }
      _log(
          'Flush skipped reason=$reason status=already_flushing '
          'pending=$_pendingDeferredReason',
          LogLevel.info);
      return;
    }
    if (!_isInitialized) {
      // Same rationale: cold-start `signIn(restoredJwt)` can fire
      // `identity_change` before `initialize()` finishes. Stash so
      // [initialize]'s tail can replay.
      if (_deferrableReasons.contains(reason)) {
        _setDeferredReason(reason);
      }
      _log(
          'Flush skipped reason=$reason status=not_initialized '
          'pending=$_pendingDeferredReason',
          LogLevel.info);
      return;
    }
    if (config.optOut) {
      _log('Flush skipped reason=$reason status=opt_out', LogLevel.info);
      return;
    }
    if (_preLogoutReasons.contains(reason)) {
      _isFlushing = true;
      try {
        await _preLogoutFlush(reason: reason);
      } finally {
        _isFlushing = false;
        _replayPendingDeferredReason(source: 'pre_logout_finally');
      }
      return;
    }
    // Identity gate: hold background/threshold flushes until a user_id lands
    // so pre-login events don't ship anonymously and lose retro-attribution.
    // Bypass list above covers app-close, logout, and explicit identity-change
    // triggers where we deliberately want the queue drained.
    final userId = config.userId;
    if ((userId == null || userId.isEmpty) &&
        !_identityBypassReasons.contains(reason)) {
      _log('Flush skipped reason=$reason status=no_identity', LogLevel.info);
      return;
    }

    _isFlushing = true;

    try {
      final pendingEvents = await _eventStorage.getEventCount();
      final pendingIdentifies = await _eventStorage.getIdentifyCount();
      final pendingGroups = await _eventStorage.getGroupCount();

      _log(
        'Flush start reason=$reason pending ${_formatFlushCounts(
          events: pendingEvents,
          identifies: pendingIdentifies,
          groups: pendingGroups,
        )}',
        LogLevel.info,
      );

      await _flushAllBatches<BaseEvent>(
        fetchBatch: () => _eventStorage.getEvents(limit: config.flushQueueSize),
        sendBatch: _sendEventsViaHttp,
        getId: (event) => event.eventId,
        deleteByIds: _eventStorage.removeEventsByIds,
        incrementRetryCount: _eventStorage.incrementEventRetryCount,
        label: 'events',
      );

      await _flushAllBatches<Map<String, dynamic>>(
        fetchBatch: () =>
            _eventStorage.getIdentifies(limit: config.flushQueueSize),
        sendBatch: _sendIdentifiesViaHttp,
        getId: (identify) => identify['event_id'] as int?,
        deleteByIds: _eventStorage.removeIdentifiesByIds,
        incrementRetryCount: _eventStorage.incrementIdentifyRetryCount,
        label: 'identifies',
      );

      await _flushAllBatches<Map<String, dynamic>>(
        fetchBatch: () => _eventStorage.getGroups(limit: config.flushQueueSize),
        sendBatch: _sendGroupsViaHttp,
        getId: (group) => group['event_id'] as int?,
        deleteByIds: _eventStorage.removeGroupsByIds,
        incrementRetryCount: _eventStorage.incrementGroupRetryCount,
        label: 'groups',
      );

      final remainingEvents = await _eventStorage.getEventCount();
      final remainingIdentifies = await _eventStorage.getIdentifyCount();
      final remainingGroups = await _eventStorage.getGroupCount();

      _log(
        'Flush end reason=$reason remaining ${_formatFlushCounts(
          events: remainingEvents,
          identifies: remainingIdentifies,
          groups: remainingGroups,
        )}',
        LogLevel.info,
      );
    } catch (e) {
      _log('Error flushing events reason=$reason: $e', LogLevel.error);
    } finally {
      _isFlushing = false;
      _replayPendingDeferredReason(source: 'full_flush_finally');
    }
  }

  String _formatFlushCounts({
    required int events,
    required int identifies,
    required int groups,
  }) {
    return 'events=$events identifies=$identifies groups=$groups '
        'total=${events + identifies + groups}';
  }

  /// Ships only rows whose queue-time-stamped `user_id` matches an outgoing
  /// user, leaving null-stamped rows on disk. Callers (`reset()`,
  /// `clearPendingUser()`) run this AFTER nulling the tracker's active
  /// user_id, so events queued during the logout redirect window (e.g.
  /// `phone_input_screen_viewed` fired when the phone screen mounts as the
  /// router redirects) arrive here with `event.userId=null` and stay parked
  /// on disk for the next `identity_change` flush to retro-attribute to the
  /// new user.
  Future<void> _preLogoutFlush({required String reason}) async {
    _log('Pre-logout flush start reason=$reason', LogLevel.info);
    await _drainStamped<BaseEvent>(
      label: 'events',
      fetchBatch: (afterId) =>
          _eventStorage.getEvents(limit: config.flushQueueSize, afterId: afterId),
      getUserId: (e) => e.userId,
      getId: (e) => e.eventId,
      sendBatch: _sendEventsViaHttp,
      deleteByIds: _eventStorage.removeEventsByIds,
    );
    await _drainStamped<Map<String, dynamic>>(
      label: 'identifies',
      fetchBatch: (afterId) => _eventStorage.getIdentifies(
          limit: config.flushQueueSize, afterId: afterId),
      getUserId: (m) => m['user_id'] as String?,
      getId: (m) => m['event_id'] as int?,
      sendBatch: _sendIdentifiesViaHttp,
      deleteByIds: _eventStorage.removeIdentifiesByIds,
    );
    await _drainStamped<Map<String, dynamic>>(
      label: 'groups',
      fetchBatch: (afterId) =>
          _eventStorage.getGroups(limit: config.flushQueueSize, afterId: afterId),
      getUserId: (m) => m['user_id'] as String?,
      getId: (m) => m['event_id'] as int?,
      sendBatch: _sendGroupsViaHttp,
      deleteByIds: _eventStorage.removeGroupsByIds,
    );
    _log('Pre-logout flush end reason=$reason', LogLevel.info);
  }

  /// Partition-and-send: pulls rows in batches using a cursor (`afterId`),
  /// ships the ones already stamped with a user_id (delete on success),
  /// skips null-stamped rows (leave on disk). The cursor advances past
  /// null-stamped rows so a large null-stamped head can't hide stamped
  /// rows queued behind it — the previous implementation used a
  /// `seenIds`-set + un-cursored LIMIT fetch, which would loop back on the
  /// same null head forever until `fresh` was empty, breaking out before
  /// reaching stamped rows further in.
  Future<void> _drainStamped<T>({
    required String label,
    required Future<List<T>> Function(int? afterId) fetchBatch,
    required String? Function(T) getUserId,
    required int? Function(T) getId,
    required Future<void> Function(List<T>) sendBatch,
    required Future<void> Function(List<int>) deleteByIds,
  }) async {
    int? cursor;
    var sent = 0;
    var parked = 0;
    while (true) {
      final batch = await fetchBatch(cursor);
      if (batch.isEmpty) break;

      // Advance the cursor past every id in this batch BEFORE partition/send,
      // so a mid-drain re-fetch (or the next iteration) never re-visits rows
      // we just processed. If any row lacks an id (shouldn't happen — SQLite
      // autoincrement PK), stop defensively rather than risk an infinite loop.
      int? maxId;
      for (final item in batch) {
        final id = getId(item);
        if (id == null) {
          _log('Pre-logout $label row has null id — stopping drain',
              LogLevel.warn);
          return;
        }
        if (maxId == null || id > maxId) maxId = id;
      }
      cursor = maxId;

      final stamped = <T>[];
      final unstamped = <T>[];
      for (final item in batch) {
        final uid = getUserId(item);
        if (uid != null && uid.isNotEmpty) {
          stamped.add(item);
        } else {
          unstamped.add(item);
        }
      }

      if (stamped.isNotEmpty) {
        try {
          await sendBatch(stamped);
          final ids = stamped.map(getId).whereType<int>().toList();
          if (ids.isNotEmpty) await deleteByIds(ids);
          sent += stamped.length;
        } catch (e) {
          _log('Pre-logout $label send failed: $e — leaving batch on disk',
              LogLevel.error);
          return;
        }
      }
      parked += unstamped.length;
    }
    _log('Pre-logout $label sent=$sent parked=$parked', LogLevel.info);
  }

  Future<void> onForegroundResumed(int timestamp) async {
    if (!_isInitialized || !config.defaultTracking.sessions) return;
    final transition = await _sessionManager.onForegroundResumed(timestamp);
    await _enqueueSessionEvents(transition, timestamp);
  }

  Future<void> onBackgroundEntered(int timestamp) async {
    if (!_isInitialized || !config.defaultTracking.sessions) return;
    final transition = await _sessionManager.onBackgroundEntered(timestamp);
    await _enqueueSessionEvents(transition, timestamp);
  }

  Future<void> _enqueueSessionEvents(
    SessionTransition transition,
    int timestamp,
  ) async {
    if (transition.endPrevious && transition.endedSessionId != null) {
      await _eventStorage.addEvent(
        BaseEvent(
          Constants.sessionEndEvent,
          timestamp: timestamp,
          sessionId: transition.endedSessionId,
        ),
      );
    }
    if (transition.startNew) {
      await _eventStorage.addEvent(
        BaseEvent(
          Constants.sessionStartEvent,
          timestamp: timestamp,
          sessionId: _sessionManager.sessionId,
        ),
      );
    }
  }

  Future<void> _flushAllBatches<T>({
    required Future<List<T>> Function() fetchBatch,
    required Future<void> Function(List<T>) sendBatch,
    required int? Function(T item) getId,
    required Future<void> Function(List<int>) deleteByIds,
    required Future<void> Function(int id) incrementRetryCount,
    required String label,
  }) async {
    while (true) {
      final items = await fetchBatch();
      if (items.isEmpty) return;
      await _flushCollectionWithFallback<T>(
        items: items,
        sendBatch: sendBatch,
        getId: getId,
        deleteByIds: deleteByIds,
        incrementRetryCount: incrementRetryCount,
        label: label,
      );
    }
  }

  Future<void> _flushCollectionWithFallback<T>({
    required List<T> items,
    required Future<void> Function(List<T>) sendBatch,
    required int? Function(T item) getId,
    required Future<void> Function(List<int>) deleteByIds,
    required Future<void> Function(int id) incrementRetryCount,
    required String label,
  }) async {
    if (items.isEmpty) return;

    final ids = items.map(getId).whereType<int>().toList();

    try {
      await sendBatch(items);
      if (ids.isNotEmpty) {
        await deleteByIds(ids);
      }
      return;
    } on _RejectedBatchException catch (e) {
      _log(
        'Server rejected $label batch (status=${e.statusCode}). '
        'Falling back to individual sends.',
        LogLevel.warn,
      );
    } on SocketException catch (e) {
      _log('Transport error sending $label batch: $e', LogLevel.error);
      return;
    } on HttpException catch (e) {
      _log('Transport error sending $label batch: $e', LogLevel.error);
      return;
    } on TimeoutException catch (e) {
      _log('Timeout sending $label batch: $e', LogLevel.error);
      return;
    } catch (e) {
      _log('Unexpected error sending $label batch: $e', LogLevel.error);
      return;
    }

    for (final item in items) {
      final id = getId(item);
      try {
        await sendBatch([item]);
        if (id != null) {
          await deleteByIds([id]);
        }
      } on _RejectedBatchException catch (e) {
        if (id != null) {
          await incrementRetryCount(id);
        }
        _log(
          'Rejected $label item ${id ?? 'unknown'} (status=${e.statusCode}): '
          '${e.message}',
          LogLevel.warn,
        );
      } on SocketException catch (e) {
        _log(
          'Transport error while retrying $label item ${id ?? 'unknown'}: $e',
          LogLevel.error,
        );
        break;
      } on HttpException catch (e) {
        _log(
          'Transport error while retrying $label item ${id ?? 'unknown'}: $e',
          LogLevel.error,
        );
        break;
      } on TimeoutException catch (e) {
        _log(
          'Timeout while retrying $label item ${id ?? 'unknown'}: $e',
          LogLevel.error,
        );
        break;
      } catch (e) {
        _log(
          'Unexpected error while retrying $label item ${id ?? 'unknown'}: $e',
          LogLevel.error,
        );
        break;
      }
    }

    await _eventStorage.removeFailedEvents(maxRetries: config.flushMaxRetries);
  }

  /// Send [events] in one POST, bypassing the SQLite queue, timers and
  /// session bookkeeping — none of which need [initialize]. Throws on any
  /// transport failure or non-2xx; the caller owns the retry. Used by
  /// [DirectEventSender] from isolates that must not open the queue.
  Future<void> sendNow(List<BaseEvent> events) => _sendEventsViaHttp(events);

  /// Send events over HTTP.
  Future<void> _sendEventsViaHttp(List<BaseEvent> events) async {
    final deviceContext = await _buildUserContext();
    final clientUploadTime = _istClientUploadTime();

    final eventsArray = events.map((event) {
      final eventMap = event.toMap();
      final eventProperties =
          eventMap['event_properties'] as Map<String, dynamic>? ?? {};

      // adid can arrive at either level — prefer top-level, fall back to props.
      final adidValue = eventMap['adid'] ?? eventProperties['adid'] ?? '';

      return _stripNulls({
        'event_type': eventMap['event_type'] ?? '',
        'user_id': _firstNonEmptyOrNull([
          eventMap['user_id'],
          config.userId,
        ]),
        'device_id': _firstNonEmptyOrNull([
          eventMap['device_id'],
          config.deviceId,
          deviceContext['android_id'],
          deviceContext['device_id'],
        ]),
        'time': eventMap['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
        'session_id': eventMap['session_id'],
        'insert_id': eventMap['insert_id'] ?? '',
        'event_id': event.eventId ?? 0,
        'event_properties': eventProperties,
        'user_properties': eventMap['user_properties'] ?? {},
        'groups': eventMap['groups'] ?? {},
        'group_properties': eventMap['group_properties'] ?? {},
        'platform': _canonicalPlatform(deviceContext['platform'] as String?),
        'os_name': _canonicalPlatform(deviceContext['os_name'] as String?),
        'os_version': deviceContext['os_version'] ?? '',
        'device_brand': deviceContext['device_brand'] ?? '',
        'device_manufacturer': deviceContext['device_manufacturer'] ?? '',
        'device_model': deviceContext['device_model'] ?? '',
        'version_name':
            deviceContext['version_name'] ?? eventMap['version_name'] ?? '',
        'language': deviceContext['language'] ?? 'en',
        'adid': adidValue,
        // carrier flows in from BaseEvent.carrier (populated at the app
        // seam from CarrierService — Android TelephonyManager.
        // getNetworkOperatorName). Absent on iOS / Wi-Fi-only devices /
        // unregistered modem — falls through to '' and gets stripped.
        'carrier': eventMap['carrier'] ?? eventProperties['carrier'] ?? '',
        'country': _firstNonEmptyOrNull([
              eventMap['country'],
              eventProperties['country'],
            ]) ??
            '',
        'library': eventMap['library'] ?? 'custom-analytics-flutter/1.0.0',
        // Same fallback shape as user_id / device_id above. Without it a null
        // captured at enqueue time is frozen forever, because the offline
        // queue replays the stored map verbatim.
        'pseudo_id': _firstNonEmptyOrNull([
          eventMap['pseudo_id'],
          _pseudoUserId,
        ]),
        // client-side delivery diagnostics — bounded server-side to UInt16
        'attempts': (eventMap['attempts'] as int?) ?? 0,
        'retry_count': (eventMap['retry_count'] as int?) ?? 0,
      });
    }).toList();

    await _sendBatch(eventsArray, clientUploadTime);
    _log('Sent ${events.length} events via HTTP', LogLevel.debug);
  }

  /// Send identify payloads over HTTP.
  Future<void> _sendIdentifiesViaHttp(
      List<Map<String, dynamic>> identifies) async {
    final deviceContext = await _buildUserContext();
    final clientUploadTime = _istClientUploadTime();

    final identifiesArray = identifies.map((identify) {
      return _stripNulls({
        'event_type': Constants.identifyEvent,
        'user_id': _firstNonEmptyOrNull([
          identify['user_id'],
          config.userId,
        ]),
        'device_id': _firstNonEmptyOrNull([
          identify['device_id'],
          config.deviceId,
          deviceContext['android_id'],
          deviceContext['device_id'],
        ]),
        'pseudo_id': _firstNonEmptyOrNull([
          identify['pseudo_id'],
          _pseudoUserId,
        ]),
        'time':
            identify['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
        'session_id': identify['session_id'],
        'insert_id': identify['insert_id'] ?? '',
        'event_id': identify['event_id'] ?? 0,
        'event_properties': const <String, dynamic>{},
        'user_properties': identify['user_properties'] ?? {},
        'groups': const <String, dynamic>{},
        'group_properties': const <String, dynamic>{},
        'platform': _canonicalPlatform(deviceContext['platform'] as String?),
        'os_name': _canonicalPlatform(deviceContext['os_name'] as String?),
        'os_version': deviceContext['os_version'] ?? '',
        'device_brand': deviceContext['device_brand'] ?? '',
        'device_manufacturer': deviceContext['device_manufacturer'] ?? '',
        'device_model': deviceContext['device_model'] ?? '',
        'version_name': deviceContext['version_name'] ?? '',
        'language': deviceContext['language'] ?? 'en',
        'adid': identify['adid'] ?? '',
        'carrier': identify['carrier'] ?? '',
        'country': (identify['country'] as String?) ?? '',
        'library': identify['library'] ?? 'custom-analytics-flutter/1.0.0',
      });
    }).toList();

    await _sendBatch(identifiesArray, clientUploadTime);
    _log('Sent ${identifies.length} identifies via HTTP', LogLevel.debug);
  }

  /// Send group payloads over HTTP.
  Future<void> _sendGroupsViaHttp(List<Map<String, dynamic>> groups) async {
    final deviceContext = await _buildUserContext();
    final clientUploadTime = _istClientUploadTime();

    final groupsArray = groups.map((group) {
      return _stripNulls({
        'event_type': Constants.groupIdentifyEvent,
        'user_id': _firstNonEmptyOrNull([
          group['user_id'],
          config.userId,
        ]),
        'device_id': _firstNonEmptyOrNull([
          group['device_id'],
          config.deviceId,
          deviceContext['android_id'],
          deviceContext['device_id'],
        ]),
        'pseudo_id': _firstNonEmptyOrNull([
          group['pseudo_id'],
          _pseudoUserId,
        ]),
        'time': group['timestamp'] ?? DateTime.now().millisecondsSinceEpoch,
        'session_id': group['session_id'],
        'insert_id': group['insert_id'] ?? '',
        'event_id': group['event_id'] ?? 0,
        'event_properties': const <String, dynamic>{},
        'user_properties': const <String, dynamic>{},
        'groups': group['groups'] ?? {},
        'group_properties': group['group_properties'] ?? {},
        'platform': _canonicalPlatform(deviceContext['platform'] as String?),
        'os_name': _canonicalPlatform(deviceContext['os_name'] as String?),
        'os_version': deviceContext['os_version'] ?? '',
        'device_brand': deviceContext['device_brand'] ?? '',
        'device_manufacturer': deviceContext['device_manufacturer'] ?? '',
        'device_model': deviceContext['device_model'] ?? '',
        'version_name': deviceContext['version_name'] ?? '',
        'language': deviceContext['language'] ?? 'en',
        'adid': group['adid'] ?? '',
        'carrier': group['carrier'] ?? '',
        'country': (group['country'] as String?) ?? '',
        'library': group['library'] ?? 'custom-analytics-flutter/1.0.0',
      });
    }).toList();

    await _sendBatch(groupsArray, clientUploadTime);
    _log('Sent ${groups.length} groups via HTTP', LogLevel.debug);
  }

  /// POST a batch to the collector using Amplitude V2 shape.
  ///
  /// `clientUploadTime` is an ISO-8601 string in IST (`+05:30`) produced by
  /// [_istClientUploadTime]. The collector's schema
  /// (`amplitude.schemas.ts::client_upload_time`) accepts either a number or
  /// a string, so no wire-contract change is needed.
  Future<void> _sendBatch(
    List<Map<String, dynamic>> eventsArray,
    String clientUploadTime,
  ) async {
    final body = <String, dynamic>{
      'api_key': config.apiKey,
      'client_upload_time': clientUploadTime,
      'events': eventsArray,
    };

    final encoded = jsonEncode(body);

    _debugLog('=== HTTP request → ${config.serverUrl} '
        '(count: ${eventsArray.length}) ===');
    _debugLogChunked('request_body', encoded);

    // customHeaders is spread FIRST so tenantId (a first-class config field)
    // wins if both set the same key — treat tenantId as the source of truth.
    final tenantId = config.tenantId;
    final headers = <String, String>{
      HttpHeaders.contentTypeHeader: 'application/json',
      ...config.customHeaders,
      if (tenantId != null && tenantId.isNotEmpty) 'x-tenant-id': tenantId,
    };

    final http.Response response;
    try {
      response = await _httpClient
          .post(
            Uri.parse(config.serverUrl),
            headers: headers,
            body: encoded,
          )
          .timeout(Duration(milliseconds: config.requestTimeoutMillis));
    } catch (e) {
      _log('HTTP POST failed: $e', LogLevel.error);
      rethrow;
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      _debugLog('HTTP response ${response.statusCode}: ${response.body}');
      return;
    }

    // 4xx: the collector explicitly rejected the batch (Amplitude V2 returns
    // 400 for a malformed payload / bad api_key). Fall through to per-item
    // fallback so the batch can be walked and repeat offenders evicted.
    // 5xx: keep the batch on disk for the next tick to retry — throw a
    // generic exception so `_flushCollectionWithFallback` reroutes to
    // "transport error" and doesn't touch storage.
    if (response.statusCode >= 400 && response.statusCode < 500) {
      throw _RejectedBatchException(response.body, response.statusCode);
    }
    throw HttpException(
      'Collector returned ${response.statusCode}: ${response.body}',
      uri: Uri.parse(config.serverUrl),
    );
  }

  /// Get the current session id.
  int? getSessionId() => _sessionManager.sessionId;

  Future<void> resetSession() => _sessionManager.resetSession();

  Future<void> clearQueuedEvents() async {
    await _eventStorage.initialize();
    await _eventStorage.clearEvents();
    await _eventStorage.clearIdentifies();
    await _eventStorage.clearGroups();
  }

  /// Dispose resources.
  Future<void> dispose() async {
    _flushTimer?.cancel();
    if (_isInitialized) {
      await _flush(reason: 'dispose');
      _isInitialized = false;
    }
    _httpClient.close();
    await _eventStorage.dispose();
  }

  /// Canonical platform id (`android`/`ios`; lowercased pass-through
  /// otherwise). Falls back to the current OS when [raw] is empty.
  static String _canonicalPlatform([String? raw]) {
    final value = (raw == null || raw.trim().isEmpty)
        ? Platform.operatingSystem
        : raw.trim();
    final normalized = value.toLowerCase();
    if (normalized.contains('android')) return 'android';
    if (normalized.contains('ios')) return 'ios';
    return normalized;
  }

  /// Build device context (platform, os, model, app version, language) that
  /// rides on every batched event as top-level Amplitude fields.
  Future<Map<String, dynamic>> _buildUserContext() async {
    try {
      final deviceInfo = DeviceInfoPlugin();
      final packageInfo = await PackageInfo.fromPlatform();

      final context = <String, dynamic>{
        'platform': _canonicalPlatform(),
        'version_name': packageInfo.version,
        'language': Platform.localeName.split('_').first,
      };

      if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        context.addAll({
          'os_name': 'android',
          'os_version': androidInfo.version.release,
          'device_brand': androidInfo.brand,
          'device_manufacturer': androidInfo.manufacturer,
          'device_model': androidInfo.model,
          'android_id': androidInfo.id,
        });
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        context.addAll({
          'os_name': 'ios',
          'os_version': iosInfo.systemVersion,
          'device_brand': 'Apple',
          'device_manufacturer': 'Apple',
          'device_model': iosInfo.model,
          'device_id': iosInfo.identifierForVendor,
        });
      }

      context.addAll(config.customHeaders);
      return context;
    } catch (e) {
      _log('Error building user context: $e', LogLevel.error);
      return {
        'platform': _canonicalPlatform(),
        'os_name': _canonicalPlatform(),
        'version_name': 'unknown',
        'language': 'en',
      };
    }
  }

  void _log(String message, LogLevel level) {
    if (level.index >= config.logLevel.index && kDebugMode) {
      debugPrint('[HTTP Analytics] $message');
    }
  }

  void _debugLog(String message) {
    if (!kDebugMode) return;
    debugPrint('[HTTP Analytics] $message');
  }

  /// Log a long value in ~100k chunks so Android's `debugPrint` doesn't
  /// truncate it. Uses `print` for a single blob when it fits.
  void _debugLogChunked(String label, String value) {
    if (!kDebugMode) return;
    const chunkSize = 100000;
    if (value.length <= chunkSize) {
      // ignore: avoid_print
      print('[HTTP Analytics] $label: $value');
      return;
    }
    final totalChunks = (value.length / chunkSize).ceil();
    for (var i = 0; i < totalChunks; i++) {
      final start = i * chunkSize;
      final end =
          start + chunkSize < value.length ? start + chunkSize : value.length;
      // ignore: avoid_print
      print('[HTTP Analytics] $label [${i + 1}/$totalChunks]: '
          '${value.substring(start, end)}');
    }
  }

  /// Returns the first non-empty string in [values], or null if none.
  static String? _firstNonEmptyOrNull(Iterable<dynamic> values) {
    for (final value in values) {
      final stringValue = value?.toString();
      if (stringValue != null && stringValue.isNotEmpty) {
        return stringValue;
      }
    }
    return null;
  }

  /// Drop keys with null values so the wire payload stays lean — the
  /// collector treats a missing field as absent.
  static Map<String, dynamic> _stripNulls(Map<String, dynamic> m) {
    final out = <String, dynamic>{};
    for (final entry in m.entries) {
      if (entry.value == null) continue;
      out[entry.key] = entry.value;
    }
    return out;
  }

  /// The batch's `client_upload_time` field, formatted as an ISO-8601 string
  /// in **Indian Standard Time** (`UTC+05:30`, no DST):
  /// `"2026-08-11T18:30:00.000+05:30"`.
  ///
  /// Why IST and not the device's local time: the ClickHouse warehouse
  /// partitions by `toYYYYMM(server_time, 'Asia/Kolkata')` (see
  /// `docs/ARCHITECTURE.md`), and all product logic downstream — feed
  /// rotation, billing scheduler, daily sign counters — reasons in IST.
  /// Emitting the client stamp in the same timezone keeps client and server
  /// clocks describing the same wall-clock day for the same event, even when
  /// the device is offline in a different zone.
  ///
  /// The collector schema accepts either a number or a string
  /// (`amplitude.schemas.ts::client_upload_time`), so no wire change is
  /// required. Formatted by hand rather than via `toIso8601String()` so the
  /// `+05:30` suffix is explicit and independent of Dart's UTC-only
  /// serialization behaviour.
  static String _istClientUploadTime() {
    final ist = DateTime.now().toUtc().add(const Duration(
          hours: 5,
          minutes: 30,
        ));
    String two(int n) => n.toString().padLeft(2, '0');
    String three(int n) => n.toString().padLeft(3, '0');
    return '${ist.year}-${two(ist.month)}-${two(ist.day)}'
        'T${two(ist.hour)}:${two(ist.minute)}:${two(ist.second)}'
        '.${three(ist.millisecond)}+05:30';
  }
}
