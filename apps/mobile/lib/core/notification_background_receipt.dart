import 'dart:async';
import 'dart:convert';
import 'dart:isolate';
import 'dart:ui' show IsolateNameServer;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:notification_state/notification_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'analytics.dart';
import 'analytics_enricher.dart';
import 'app_config.dart';
import 'auth_store.dart';
import 'jwt.dart';
import 'notification_analytics.dart';
import 'secrets.dart';
import 'session_context.dart';
import 'uuid.dart';

/// `notification_received` for deliveries that land while the app is NOT in
/// the foreground.
///
/// FCM runs `firebaseBackgroundHandler` in its own isolate, where nothing
/// from `main()` exists: no [Analytics], no service locator. Three routes,
/// tried in order:
///
///  1. **App in background** — the main isolate is alive in the same
///     process. Hand it the event over [kNotificationReceiptPortName]; it
///     tracks through the normal [Analytics] seam (full enrichment, every
///     sink, durable queue) and acks. `app_state = background`.
///  2. **App killed** — no ack inside [_ackTimeout]. Send straight to the
///     collector with [Analytics.sendDirect]. `app_state = killed`.
///  3. **Send failed** (offline, init error) — park the event in
///     SharedPreferences; the main isolate replays it on the next open via
///     [drainPendingNotificationReceipts].
///
/// Data-only messages are silent by design and are not tracked.
const String kNotificationReceiptPortName = 'prabhuji.notification_receipts';

const String _pendingKey = 'notification_received.pending';
const int _maxPending = 50;
const Duration _ackTimeout = Duration(milliseconds: 800);

/// Entry point from the FCM background handler. Never throws.
Future<void> handleBackgroundNotificationReceipt(
  RemoteMessage message, {
  NotificationStateReader stateReader = const NotificationStateReader(),
}) async {
  if (message.notification == null) return;
  try {
    final state = await stateReader.read(
      channelId: message.notification?.android?.channelId ??
          kDefaultNotificationChannelId,
    );
    final receivedAt = DateTime.now().toUtc();
    final props = <String, Object?>{
      'event_id': newUuidV4(),
      'event_timestamp': receivedAt.toIso8601String(),
      ...notificationIdentityProps(message.data),
      NotificationEventProps.suppressedReason: suppressedReasonFor(state),
      // The FCM background handler never runs while the app is on screen.
      NotificationEventProps.isForeground: false,
    };

    final forwarded = await _forwardToMainIsolate({
      ...props,
      NotificationEventProps.appState: NotificationAppState.background,
    });
    if (forwarded) return;

    props[NotificationEventProps.appState] = NotificationAppState.killed;
    await _sendOrPark(props, receivedAt);
  } catch (e) {
    if (kDebugMode) debugPrint('[FCM background] receipt tracking failed: $e');
  }
}

Future<bool> _forwardToMainIsolate(Map<String, Object?> props) async {
  final port = IsolateNameServer.lookupPortByName(kNotificationReceiptPortName);
  if (port == null) return false;
  final reply = ReceivePort();
  try {
    port.send(<Object?>[reply.sendPort, props]);
    // A mapping can outlive its isolate (engine torn down, process kept), so
    // only an ack proves the main isolate took the event.
    return await reply.first.timeout(_ackTimeout, onTimeout: () => false) ==
        true;
  } finally {
    reply.close();
  }
}

Future<void> _sendOrPark(Map<String, Object?> props, DateTime receivedAt) async {
  final preferences = await SharedPreferences.getInstance();
  try {
    await _ensureConfigLoaded();
    final enriched = <String, Object?>{
      ...await _backgroundEnrichment(preferences),
      ...props,
    };
    await Analytics.sendDirect(
      NotificationEvents.received,
      properties: enriched,
      time: receivedAt,
    );
  } catch (e) {
    if (kDebugMode) debugPrint('[FCM background] direct send failed, parked: $e');
    await _park(preferences, props);
  }
}

Future<void> _ensureConfigLoaded() async {
  try {
    AppConfig.instance;
  } on StateError {
    await AppConfig.initialize();
  }
  try {
    Secrets.instance;
  } on StateError {
    await Secrets.initialize();
  }
}

/// What [AnalyticsEnricher] would stamp, minus the state only a running app
/// knows (chat arm, profile flags report their "unknown" defaults).
Future<Map<String, Object?>> _backgroundEnrichment(
  SharedPreferences preferences,
) async {
  final session = SessionContext();
  try {
    final auth = AuthStore();
    await auth.hydrate();
    final token = auth.read();
    if (token != null) session.userId = decodeJwtClaims(token)?['sub'] as String?;
  } catch (_) {/* anonymous is fine — device_id still identifies */}
  final enricher = await AnalyticsEnricher.init(
    sessionContext: session,
    preferences: preferences,
  );
  return enricher.enrich();
}

Future<void> _park(
  SharedPreferences preferences,
  Map<String, Object?> props,
) async {
  await preferences.reload();
  final pending = preferences.getStringList(_pendingKey) ?? <String>[];
  pending.add(jsonEncode(props));
  final trimmed = pending.length > _maxPending
      ? pending.sublist(pending.length - _maxPending)
      : pending;
  await preferences.setStringList(_pendingKey, trimmed);
}

/// Main-isolate side of route 1. Call once from `main()` after [Analytics]
/// is up; returns a disposer.
VoidCallback listenForBackgroundNotificationReceipts(Analytics analytics) {
  final port = ReceivePort();
  IsolateNameServer.removePortNameMapping(kNotificationReceiptPortName);
  IsolateNameServer.registerPortWithName(
    port.sendPort,
    kNotificationReceiptPortName,
  );
  final sub = port.listen((message) {
    if (message is! List || message.length != 2) return;
    final reply = message[0];
    final props = message[1];
    if (reply is! SendPort || props is! Map) return;
    unawaited(analytics.trackEvent(
      NotificationEvents.received,
      properties: props.cast<String, Object?>(),
    ));
    reply.send(true);
  });
  return () {
    unawaited(sub.cancel());
    IsolateNameServer.removePortNameMapping(kNotificationReceiptPortName);
    port.close();
  };
}

/// Route 3 replay: track every parked receipt through [analytics]. The
/// parked `event_id` / `event_timestamp` ride along, so the row keeps the
/// real delivery time. Call on cold start and on resume.
Future<void> drainPendingNotificationReceipts({
  required Analytics analytics,
  required SharedPreferences preferences,
}) async {
  try {
    // The background isolate wrote through its own instance; this isolate's
    // cache doesn't see that until reloaded.
    await preferences.reload();
    final pending = preferences.getStringList(_pendingKey);
    if (pending == null || pending.isEmpty) return;
    await preferences.remove(_pendingKey);
    for (final raw in pending) {
      try {
        final props = (jsonDecode(raw) as Map).cast<String, Object?>();
        unawaited(analytics.trackEvent(
          NotificationEvents.received,
          properties: props,
        ));
      } catch (_) {/* one corrupt row must not block the rest */}
    }
  } catch (e) {
    if (kDebugMode) debugPrint('[notifications] pending receipt drain failed: $e');
  }
}
