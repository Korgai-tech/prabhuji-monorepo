import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Reads the mobile-network operator name (e.g. "Jio", "Airtel", "Vi") from
/// Android's `TelephonyManager.getNetworkOperatorName()` via the
/// `prabhuji/carrier` MethodChannel implemented in
/// `android/app/src/main/kotlin/com/prabhuji/ai/CarrierPlugin.kt`.
///
/// Resolved once at `Analytics.init` — the value is stable for the app's
/// lifetime (a SIM swap requires re-launching the app anyway) so we skip the
/// per-event platform-channel round-trip and rely on the cached
/// [current] getter inside `Analytics._sharedEventOptions`.
///
/// **iOS** — deliberately no handler on the native side. Apple deprecated
/// `CTCarrier.carrierName` in iOS 16 and it now returns `"--"` on every
/// device, which would just ship a hardcoded placeholder to the warehouse.
/// The `MissingPluginException` we get on iOS is caught here and treated as
/// null so the wire simply omits the `carrier` field.
class CarrierService {
  CarrierService({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('prabhuji/carrier');

  final MethodChannel _channel;

  String? _cached;
  bool _resolved = false;

  /// Last resolved carrier name, or `null` if we haven't resolved yet, if the
  /// device has no telephony (Wi-Fi tablet, emulator without a modem image,
  /// iOS) or the modem is unregistered. Safe to call synchronously per event.
  String? get current => _cached;

  /// Ask the native side for the current carrier name and cache it. Idempotent:
  /// once resolved, further calls return the cached value without hitting the
  /// platform channel.
  Future<String?> resolve() async {
    if (_resolved) return _cached;

    // Fast path — no telephony on desktop / web. Kotlin plugin only runs on
    // Android; anything else is a `MissingPluginException` we treat as null.
    if (!Platform.isAndroid) {
      _resolved = true;
      return null;
    }

    try {
      final name = await _channel.invokeMethod<String>('getCarrierName');
      _cached = (name != null && name.isNotEmpty) ? name : null;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[CarrierService] resolve failed: $e');
      }
      _cached = null;
    }
    _resolved = true;
    return _cached;
  }
}
