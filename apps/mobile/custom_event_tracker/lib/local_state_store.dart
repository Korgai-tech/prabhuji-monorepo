import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

class LocalStateSnapshot {
  final String? userId;
  final String deviceId;
  final bool optOut;

  const LocalStateSnapshot({
    required this.userId,
    required this.deviceId,
    required this.optOut,
  });
}

class LocalStateStore {
  static const String _userIdKeyPrefix = 'custom_analytics_user_id';
  static const String _deviceIdKeyPrefix = 'custom_analytics_device_id';
  static const String _optOutKeyPrefix = 'custom_analytics_opt_out';

  /// Firebase's install-scoped `app_instance_id`, mirrored here so the
  /// transport can stamp it on events the app seam never touches —
  /// `session_start` / `session_end` are built inside this SDK and so carry
  /// no [EventOptions]. Cached across launches because those session events
  /// fire before the first `trackEvent` of a cold start can supply one.
  static const String _pseudoIdKeyPrefix = 'custom_analytics_pseudo_id';
  static const Uuid _uuid = Uuid();

  final String instanceName;

  const LocalStateStore(this.instanceName);

  String _scopedKey(String prefix) => '${prefix}_$instanceName';

  Future<LocalStateSnapshot> hydrate({
    String? initialUserId,
    String? initialDeviceId,
    required bool initialOptOut,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final userIdKey = _scopedKey(_userIdKeyPrefix);
    final deviceIdKey = _scopedKey(_deviceIdKeyPrefix);
    final optOutKey = _scopedKey(_optOutKeyPrefix);

    final hasPersistedUserId = prefs.containsKey(userIdKey);
    final resolvedUserId =
        hasPersistedUserId ? prefs.getString(userIdKey) : initialUserId;
    final resolvedDeviceId =
        prefs.getString(deviceIdKey) ?? initialDeviceId ?? _uuid.v4();
    final resolvedOptOut = prefs.getBool(optOutKey) ?? initialOptOut;

    if (!hasPersistedUserId && initialUserId != null) {
      await prefs.setString(userIdKey, initialUserId);
    }
    if (prefs.getString(deviceIdKey) != resolvedDeviceId) {
      await prefs.setString(deviceIdKey, resolvedDeviceId);
    }
    if (prefs.getBool(optOutKey) != resolvedOptOut) {
      await prefs.setBool(optOutKey, resolvedOptOut);
    }

    return LocalStateSnapshot(
      userId: resolvedUserId,
      deviceId: resolvedDeviceId,
      optOut: resolvedOptOut,
    );
  }

  Future<String?> getUserId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_scopedKey(_userIdKeyPrefix));
  }

  Future<void> setUserId(String? userId) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _scopedKey(_userIdKeyPrefix);
    if (userId == null || userId.isEmpty) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, userId);
  }

  Future<String> getOrCreateDeviceId({String? fallbackDeviceId}) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _scopedKey(_deviceIdKeyPrefix);
    final existing = prefs.getString(key);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final resolvedDeviceId =
        (fallbackDeviceId != null && fallbackDeviceId.isNotEmpty)
            ? fallbackDeviceId
            : _uuid.v4();
    await prefs.setString(key, resolvedDeviceId);
    return resolvedDeviceId;
  }

  Future<String> setDeviceId(String? deviceId) async {
    final prefs = await SharedPreferences.getInstance();
    final resolvedDeviceId =
        (deviceId != null && deviceId.isNotEmpty) ? deviceId : _uuid.v4();
    await prefs.setString(_scopedKey(_deviceIdKeyPrefix), resolvedDeviceId);
    return resolvedDeviceId;
  }

  Future<String?> getPseudoId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_scopedKey(_pseudoIdKeyPrefix));
  }

  Future<void> setPseudoId(String? pseudoId) async {
    final prefs = await SharedPreferences.getInstance();
    final key = _scopedKey(_pseudoIdKeyPrefix);
    if (pseudoId == null || pseudoId.isEmpty) {
      await prefs.remove(key);
      return;
    }
    await prefs.setString(key, pseudoId);
  }

  Future<bool> setOptOut(bool optOut) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_scopedKey(_optOutKeyPrefix), optOut);
    return optOut;
  }

  /// Clears the signed-in identity and rotates `device_id`.
  ///
  /// Deliberately PRESERVES the cached pseudo id: it mirrors Firebase's
  /// install-scoped `app_instance_id`, which does not rotate on logout (see
  /// `Analytics.reset` in the app). Clearing it here would make one physical
  /// install look like N anonymous users across logouts.
  Future<LocalStateSnapshot> reset({required bool optOut}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_scopedKey(_userIdKeyPrefix));

    final deviceId = _uuid.v4();
    await prefs.setString(_scopedKey(_deviceIdKeyPrefix), deviceId);
    await prefs.setBool(_scopedKey(_optOutKeyPrefix), optOut);

    return LocalStateSnapshot(
      userId: null,
      deviceId: deviceId,
      optOut: optOut,
    );
  }
}
