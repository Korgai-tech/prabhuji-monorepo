// Named constructor parameters are kept explicit (not `this._field` initializing
// formals) so the public API reads `analytics:` etc. — the private field names
// would leak as parameter labels otherwise.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:notification_state/notification_state.dart';

import 'analytics.dart';
import 'notification_analytics.dart';

/// Owns the receive-side of FCM: foreground display, tap dispatch, permission
/// prompting, and the initial-message check on cold start.
///
/// The **send** side (token registration) is [FirebaseTokenSync] — kept
/// separate so a broken notification path can't stall token sync.
///
/// Lifecycle in `main()`:
///   1. `Firebase.initializeApp()` (already done for token sync).
///   2. `FirebaseNotifications.initialize()` — creates the local-notifications
///      channel, wires the foreground listener, wires the tap listeners, and
///      reads `getInitialMessage()` for the terminated → tap case.
///   3. The splash asks for the permission through `NotificationPermission`,
///      which falls back to [requestPermission] off Android.
///
/// Tap events fan out on the [taps] stream, one `NotificationTap` per user
/// action. The UI layer subscribes and routes based on the payload. The tap
/// that LAUNCHED the app is not on the stream — it happens before anything
/// subscribes — and is held for [takeInitialTap] instead.
///
/// Foreground deliveries fire `notification_received` from here; background /
/// killed ones from `notification_background_receipt.dart`.
///
/// Foreground display path (heads-up):
///   FirebaseMessaging.onMessage → _handleForegroundMessage
///     → FlutterLocalNotificationsPlugin.show(...)
///     → user taps → onDidReceiveNotificationResponse (this file)
///     → _tapsController.add(NotificationTap)
///
/// Background / terminated display path (system tray auto-shows):
///   FCM auto-displays the tray entry.
///   User taps while backgrounded → FirebaseMessaging.onMessageOpenedApp
///   User taps while terminated  → FirebaseMessaging.instance.getInitialMessage()
///   Both funnel into _tapsController.add(NotificationTap).
class FirebaseNotifications {
  FirebaseNotifications({
    FirebaseMessaging? messaging,
    FlutterLocalNotificationsPlugin? local,
    Analytics? analytics,
    NotificationStateReader stateReader = const NotificationStateReader(),
  })  : _messaging = messaging ?? FirebaseMessaging.instance,
        _local = local ?? FlutterLocalNotificationsPlugin(),
        _analytics = analytics,
        _stateReader = stateReader;

  final FirebaseMessaging _messaging;
  final FlutterLocalNotificationsPlugin _local;
  final Analytics? _analytics;
  final NotificationStateReader _stateReader;

  /// MUST match the value in AndroidManifest.xml under
  /// `com.google.firebase.messaging.default_notification_channel_id` so
  /// backgrounded pushes land on the same channel we configure at runtime.
  static const _channelId = kDefaultNotificationChannelId;
  static const _channelName = 'Prabhu Ji notifications';
  static const _channelDesc = 'General notifications from Prabhu Ji.';

  final _tapsController = StreamController<NotificationTap>.broadcast();
  StreamSubscription<RemoteMessage>? _onMessageSub;
  StreamSubscription<RemoteMessage>? _onOpenSub;
  bool _initialised = false;
  NotificationTap? _initialTap;

  /// Carries the FCM send time through the local notification's payload so a
  /// foreground-shown tap can still report `time_to_click_sec`.
  static const _sentAtPayloadKey = '_sent_at_ms';

  /// Broadcast stream of taps — MobileApp subscribes and routes.
  Stream<NotificationTap> get taps => _tapsController.stream;

  /// The tap that launched the app, without consuming it — `app_opened`
  /// reads this. Set once [initialize] completes.
  NotificationTap? get initialTap => _initialTap;

  /// Hand the launching tap to the router, once. Null afterwards.
  NotificationTap? takeInitialTap() {
    final tap = _initialTap;
    _initialTap = null;
    return tap;
  }

  /// Idempotent. Safe to call from a `try/catch` in main().
  Future<void> initialize() async {
    if (_initialised) return;
    _initialised = true;

    // 1) Set up the local-notifications channel + tap callback.
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const init = InitializationSettings(android: androidInit);
    await _local.initialize(
      settings: init,
      onDidReceiveNotificationResponse: (response) {
        final tap = _tapFromLocalPayload(response.payload);
        if (tap != null) _tapsController.add(tap);
      },
    );

    // 2) Create the Android channel explicitly. Idempotent — Android upserts.
    final androidPlugin = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(const AndroidNotificationChannel(
      _channelId,
      _channelName,
      description: _channelDesc,
      importance: Importance.high,
    ));

    // 3) Foreground: FCM won't display the tray entry itself while the app is
    // in front — we render a local notification so the user sees a heads-up.
    // (`onMessage` and `onMessageOpenedApp` are static on FirebaseMessaging.)
    _onMessageSub = FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // 4) Backgrounded → tap: app is alive but hidden. FCM opens the app + fires
    // this stream with the RemoteMessage.
    _onOpenSub = FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      _tapsController.add(NotificationTap(
        data: _dataOf(msg),
        source: TapSource.messageOpened,
        sentAt: msg.sentTime,
      ));
    });

    // 5) Terminated → tap: getInitialMessage() returns the RemoteMessage that
    // launched the app, or null. A broadcast stream drops events nobody is
    // listening to yet, so this is held for [takeInitialTap].
    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      _initialTap = NotificationTap(
        data: _dataOf(initial),
        source: TapSource.initialMessage,
        sentAt: initial.sentTime,
      );
      return;
    }

    // 6) Terminated → tap on a heads-up WE rendered while in foreground (the
    // user left it in the tray and the app was killed since).
    final launch = await _local.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp ?? false) {
      _initialTap = _tapFromLocalPayload(
        launch!.notificationResponse?.payload,
        source: TapSource.initialLocal,
      );
    }
  }

  /// Prompt the user for POST_NOTIFICATIONS (Android 13+) / APNS (iOS).
  /// Called from the auth-stream listener after a successful login so the ask
  /// lands when the user has already signalled intent.
  ///
  /// Idempotent — if permission was already granted/denied, Android returns
  /// the existing state and no dialog is shown.
  Future<NotificationSettings> requestPermission() async {
    return _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  /// Best-effort disposal for tests / hot restart.
  Future<void> dispose() async {
    await _onMessageSub?.cancel();
    await _onOpenSub?.cancel();
    _onMessageSub = null;
    _onOpenSub = null;
    _initialised = false;
    await _tapsController.close();
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final notif = message.notification;
    if (notif == null) {
      // Data-only message → silent by design. If a future data-only payload
      // needs a visible heads-up, add a rule here.
      return;
    }
    final data = _dataOf(message);
    unawaited(_trackForegroundReceived(data));
    await _local.show(
      // Use hashCode so repeated messages replace, not stack, in the tray —
      // still safe because Android tolerates a signed-int id.
      id: notif.hashCode,
      title: notif.title,
      body: notif.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription: _channelDesc,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      payload: jsonEncode({
        ...data,
        _sentAtPayloadKey: ?message.sentTime?.millisecondsSinceEpoch,
      }),
    );
  }

  Future<void> _trackForegroundReceived(Map<String, dynamic> data) async {
    final analytics = _analytics;
    if (analytics == null) return;
    final state = await _stateReader.read(channelId: _channelId);
    await analytics.trackEvent(NotificationEvents.received, properties: {
      ...notificationIdentityProps(data),
      NotificationEventProps.appState: NotificationAppState.foreground,
      NotificationEventProps.isForeground: true,
      NotificationEventProps.suppressedReason: suppressedReasonFor(state),
    });
  }

  NotificationTap? _tapFromLocalPayload(
    String? payload, {
    TapSource source = TapSource.foregroundLocal,
  }) {
    if (payload == null) return null;
    try {
      final data = (jsonDecode(payload) as Map).cast<String, dynamic>();
      final sentAtMs = data.remove(_sentAtPayloadKey);
      return NotificationTap(
        data: data,
        source: source,
        sentAt: sentAtMs is int
            ? DateTime.fromMillisecondsSinceEpoch(sentAtMs)
            : null,
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[FirebaseNotifications] payload parse failed: $e');
      }
      return null;
    }
  }

  Map<String, dynamic> _dataOf(RemoteMessage m) =>
      m.data.map((k, v) => MapEntry(k, v));
}

/// One tap event, whatever the trigger.
///
/// `data` is the FCM `data` payload — expected to carry `type` and `id` per
/// the convention documented in `firebase_notifications_router.dart`. Empty
/// map is legal (a notification with no routing intent).
class NotificationTap {
  const NotificationTap({required this.data, required this.source, this.sentAt});

  final Map<String, dynamic> data;
  final TapSource source;

  /// When FCM accepted the message — the start of `time_to_click_sec`.
  /// Null when the platform didn't report it.
  final DateTime? sentAt;
}

enum TapSource {
  /// The local heads-up notification we rendered while the app was in
  /// foreground. Payload came from the JSON-encoded `data` we stashed at
  /// `_local.show()` time.
  foregroundLocal,

  /// FCM.onMessageOpenedApp — app was backgrounded, tray tap brought it back.
  messageOpened,

  /// FCM.getInitialMessage — app was terminated, tray tap launched it.
  initialMessage,

  /// A heads-up we rendered in foreground, tapped after the app was killed.
  initialLocal,
}
