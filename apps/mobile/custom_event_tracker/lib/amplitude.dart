import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'custom_configuration.dart';
import 'events/base_event.dart';
import 'events/event_options.dart';
import 'events/group_identify_event.dart';
import 'events/identify.dart';
import 'events/identify_event.dart';
import 'events/revenue.dart';
import 'http_network_service.dart';
import 'local_state_store.dart';
import 'session_lifecycle_observer.dart';

class Amplitude {
  static final Map<String, Amplitude> _instances = {};

  CustomConfiguration configuration;
  late final HttpNetworkService _networkService;
  late final LocalStateStore _localStateStore;
  SessionLifecycleObserver? _lifecycleObserver;
  late final Future<void> _stateReady;
  String? _userId;
  String? _deviceId;
  bool _optOut = false;

  /// Whether the Amplitude instance has been successfully initialized
  ///
  /// ```
  /// var amplitude = Amplitude(Configuration(apiKey: 'apiKey'));
  /// // If care about init complete
  /// await amplitude.isBuilt;
  /// ```
  late Future<bool> isBuilt;

  /// Returns an Amplitude instance
  ///
  /// ```
  /// final amplitude = Amplitude(CustomConfiguration(serverUrl: 'https://your-server.com/2/httpapi'));
  /// // If care about init complete
  /// await amplitude.isBuilt;
  /// ```
  Amplitude(this.configuration) {
    _localStateStore = LocalStateStore(configuration.instanceName);
    _stateReady = _hydrateLocalState();
    _networkService = HttpNetworkService(configuration);
    _instances[configuration.instanceName] = this;
    isBuilt = _init();
  }

  Future<void> _hydrateLocalState() async {
    final snapshot = await _localStateStore.hydrate(
      initialUserId: configuration.userId,
      initialDeviceId: configuration.deviceId,
      initialOptOut: configuration.optOut,
    );
    _applyStateSnapshot(snapshot);
  }

  void _applyStateSnapshot(LocalStateSnapshot snapshot) {
    _userId = snapshot.userId;
    _deviceId = snapshot.deviceId;
    _optOut = snapshot.optOut;
    configuration.userId = snapshot.userId;
    configuration.deviceId = snapshot.deviceId;
    configuration.optOut = snapshot.optOut;
  }

  void _applyPersistentIdentity(BaseEvent event) {
    event.userId ??= _userId ?? configuration.userId;
    event.deviceId ??= _deviceId ?? configuration.deviceId;
  }

  Future<void> _syncStateFromOptions(EventOptions? options) async {
    final userId = options?.userId;
    if (userId != null) {
      await setUserId(userId);
    }

    final deviceId = options?.deviceId;
    if (deviceId != null) {
      await setDeviceId(deviceId);
    }
  }

  /// Private method to initialize and return a `Future<bool>`
  Future<bool> _init() async {
    try {
      await _stateReady;
      await _networkService.initialize();

      _lifecycleObserver = SessionLifecycleObserver(
        config: configuration,
        networkService: _networkService,
        flush: () => _networkService.flush(reason: 'lifecycle_background'),
      );
      _lifecycleObserver?.register();

      if (configuration.defaultTracking.sessions) {
        final lifecycleState = WidgetsBinding.instance.lifecycleState;
        if (lifecycleState == null ||
            lifecycleState == AppLifecycleState.resumed) {
          final now = DateTime.now().millisecondsSinceEpoch;
          await _networkService.onForegroundResumed(now);
        }
      }

      return true; // Initialization successful
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Error initializing CustomAnalytics: $e');
      }
      return false; // Initialization failed
    }
  }

  /// Tracks an event. Events are saved locally and sent to your server.
  ///
  /// Uploads are batched to occur every configured number of events or every configured interval
  /// (whichever comes first), as well as on app close.
  ///
  /// ```
  /// amplitude.track(BaseEvent('Button Clicked'))
  /// ```
  Future<void> track(
    BaseEvent event, [
    EventOptions? options,
  ]) async {
    if (!await isBuilt) {
      return;
    }

    if (options != null) {
      event.mergeEventOptions(options);
    }
    await _syncStateFromOptions(options);
    _applyPersistentIdentity(event);

    await _networkService.trackEvent(event);
  }

  /// Updates user properties using operations provided via Identify API.
  ///
  /// Note that this will only affect only future events, and don't update historical events.
  ///
  /// To update user properties, first create an Identify object.
  ///
  /// Example: if you wanted to set a user's gender, increment their karma count by 1, you would do:
  /// ```
  /// final Identify identify = Identify()
  ///   ..set('gender','male')
  ///   ..add('karma', 1);
  /// amplitude.identify(identify);
  /// ```
  Future<void> identify(Identify identify, [EventOptions? options]) async {
    if (!await isBuilt) {
      return;
    }

    final event = IdentifyEvent();
    event.userProperties = identify.properties;

    if (options != null) {
      event.mergeEventOptions(options);
    }
    await _syncStateFromOptions(options);
    _applyPersistentIdentity(event);

    await _networkService.trackIdentify(event.toMap());
  }

  /// Updates the properties of particular groups.
  ///
  /// Note that this will only affect future events, and don't update historical events.
  ///
  /// Accepts a [groupType], a [groupName], an [identify] object that's applied to the group,
  /// and an optional [eventOptions]
  ///
  /// Example: if you wanted to set a key-value pair as a group property to the enterprise group with group type to be plan, you would do:
  /// ```
  /// final groupIdentifyEvent = Identify()
  ///   ..set('key1', 'value1');
  /// amplitude.groupIdentify('plan', 'enterprise', identify);
  /// ```
  Future<void> groupIdentify(
      String groupType, String groupName, Identify identify,
      [EventOptions? options]) async {
    if (!await isBuilt) {
      return;
    }

    final event = GroupIdentifyEvent();
    final group = <String, dynamic>{};
    group[groupType] = groupName;
    event.groups = group;
    event.groupProperties = identify.properties;
    if (options != null) {
      event.mergeEventOptions(options);
    }
    await _syncStateFromOptions(options);
    _applyPersistentIdentity(event);

    await _networkService.trackGroup(event.toMap());
  }

  /// Adds a user to a group or groups. You need to specify a groupType and groupName(s).
  ///
  /// For example you can group people by their organization. In this case,
  /// groupType is 'orgId', and groupName would be the actual ID(s).
  /// groupName can be a string or an array of strings to indicate a user in multiple groups.
  ///
  /// ```
  /// amplitude.setGroup('orgId', '15');
  /// ```
  ///
  /// You can also call setGroup multiple times with different groupTypes to track
  /// multiple types of groups (up to 5 per app).
  /// Note: This will also set groupType: groupName as a user property.
  Future<void> setGroup(String groupType, dynamic groupName,
      [EventOptions? options]) async {
    if (!await isBuilt) {
      return;
    }
    if (groupName is! String && groupName is! List<String>) {
      return;
    }

    final identify = Identify().set(groupType, groupName);
    final event = IdentifyEvent()
      ..groups = {groupType: groupName}
      ..userProperties = identify.properties;

    if (options != null) {
      event.mergeEventOptions(options);
    }
    await _syncStateFromOptions(options);
    _applyPersistentIdentity(event);

    await _networkService.trackIdentify(event.toMap());
  }

  /// Tracks revenue generated by a user.
  ///
  /// Example:
  /// ```
  /// final revenue = Revenue()
  ///   ..price = 3.99
  ///   ..quantity = 3
  ///   ..productId = 'com.company.productId';
  /// amplitude.revenue(revenue);
  /// ```
  Future<void> revenue(Revenue revenue, [EventOptions? options]) async {
    if (!await isBuilt) {
      return;
    }
    if (!revenue.isValid()) {
      return;
    }
    final event = revenue.toRevenueEvent();
    if (options != null) {
      event.mergeEventOptions(options);
    }
    await _syncStateFromOptions(options);
    _applyPersistentIdentity(event);

    await _networkService.trackEvent(event);
  }

  /// Get the current user Id.
  /// ```
  /// final userId = await amplitude.getUserId();
  /// ```
  Future<String?> getUserId() async {
    await _stateReady;
    _userId ??= await _localStateStore.getUserId();
    configuration.userId = _userId;
    return _userId;
  }

  /// Set a custom user Id.
  ///
  /// If your app has its own login system that you want to track users with,
  /// you can set the userId.
  ///
  /// ```
  /// amplitude.setUserId('user Id');
  /// ```
  Future<void> setUserId(String? userId) async {
    await _stateReady;
    final previous = _userId;
    _userId = (userId != null && userId.isNotEmpty) ? userId : null;
    configuration.userId = _userId;
    await _localStateStore.setUserId(_userId);
    // Identity just landed (or switched to a new real user): kick the queued
    // backlog out now instead of waiting for the next timer tick. Paired with
    // the identity gate in HttpNetworkService — pre-login events waited on
    // disk precisely for this moment, and the send-time `user_id` fallback
    // stamps them with the newly-set id. `identity_change` is in the gate's
    // bypass list so this always runs even if the initializer's still warming.
    if (_userId != null && _userId != previous) {
      unawaited(_networkService.flush(reason: 'identity_change'));
    }
  }

  /// Synchronously null the in-memory user identity so subsequent
  /// [_applyPersistentIdentity] calls stamp `event.userId=null` immediately
  /// — no awaits, no microtask hop. Callers use this at the very TOP of a
  /// logout path (before any `await`) to close the race where events
  /// queued during the logout redirect (e.g. `phone_input_screen_viewed`
  /// fired by the phone screen mounting on the router's refresh) would
  /// otherwise pick up the outgoing `_userId`. The local-state-store write
  /// is fire-and-forget: the in-memory null is what governs stamping, and
  /// the on-disk state converges next tick.
  void clearUserIdSync() {
    _userId = null;
    configuration.userId = null;
    unawaited(() async {
      try {
        await _localStateStore.setUserId(null);
      } catch (_) {/* on-disk state is best-effort */}
    }());
  }

  /// Synchronous read of the current in-memory user id. Callers snapshot
  /// this BEFORE nulling the identity so they can stamp a specific event
  /// (e.g. `logout_result`) with the outgoing user id even though it fires
  /// after the identity has already been cleared. Returns null if no user
  /// id is set. Does NOT hit the on-disk state store — it's a pure in-mem
  /// read of the same field `_applyPersistentIdentity` uses at queue time,
  /// so callers see exactly what would be stamped on an event fired right
  /// now.
  String? get currentUserIdSync => _userId ?? configuration.userId;

  /// Get the current device ID.
  ///
  /// ```
  /// final deviceId = await amplitude.getDeviceId();
  /// ```
  Future<String?> getDeviceId() async {
    await _stateReady;
    _deviceId ??= await _localStateStore.getOrCreateDeviceId(
      fallbackDeviceId: configuration.deviceId,
    );
    configuration.deviceId = _deviceId;
    return _deviceId;
  }

  /// Sets a custom device ID.
  ///
  /// Make sure the value is sufficiently unique. Amplitude recommends using a UUID.
  ///
  /// ```
  /// amplitude.setDeviceId('device Id');
  /// ```
  Future<void> setDeviceId(String? deviceId) async {
    await _stateReady;
    final resolvedDeviceId = await _localStateStore.setDeviceId(deviceId);
    _deviceId = resolvedDeviceId;
    configuration.deviceId = resolvedDeviceId;
  }

  /// Get the current session ID.
  ///
  /// ```
  /// final sessionId = await amplitude.getSessionId();
  /// ```
  Future<int?> getSessionId() async {
    if (!await isBuilt) {
      return null;
    }
    return _networkService.getSessionId();
  }

  /// Disables tracking.
  ///
  /// Set setOptOut to true to disable logging for a specific user.
  /// Set setOptOut to false to re-enable logging.
  Future<void> setOptOut(bool enabled) async {
    await _stateReady;
    _optOut = await _localStateStore.setOptOut(enabled);
    configuration.optOut = _optOut;
    if (_optOut) {
      await _networkService.clearQueuedEvents();
    }
  }

  /// Resets userId to 'null' and deviceId to a random UUID.
  ///
  /// Note different devices on different platforms should have different device Ids.
  Future<void> reset() async {
    await _stateReady;
    final snapshot = await _localStateStore.reset(optOut: _optOut);
    _applyStateSnapshot(snapshot);
    await _networkService.resetSession();
  }

  /// Flush events in storage and send to your server.
  Future<void> flush({String reason = 'manual'}) async {
    if (!await isBuilt) {
      return;
    }
    await _networkService.flush(reason: reason);
  }

  /// Dispose the analytics instance and flush remaining events
  Future<void> dispose() async {
    _lifecycleObserver?.unregister();
    if (await isBuilt) {
      await _networkService.dispose();
    }
    _instances.remove(configuration.instanceName);
  }
}
