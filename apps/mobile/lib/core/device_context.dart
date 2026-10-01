import 'dart:io' show Platform;
import 'dart:math' show Random;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'carrier_service.dart';

/// Device + app metadata bag stamped on every outbound HTTP request by
/// [deviceHeaderInterceptor].
///
/// Resolved ONCE at cold start (from `package_info_plus` + `device_info_plus`
/// + `Platform` + `flutter_secure_storage` for the install-scoped [deviceId])
/// and held as immutable synchronous getters — the dio interceptor's
/// `onRequest` runs on the event loop, so any async resolve there would either
/// block the send or race the first call. Same pattern as [AnalyticsEnricher].
///
/// Every field degrades to `''` on unresolvable state (test binding without
/// a platform channel, unsupported platform, missing plugin). The interceptor
/// still stamps the header — empty strings are legible at the backend as
/// "unknown", nulls would look like the client forgot to send.
class DeviceContext {
  const DeviceContext({
    required this.appVersion,
    required this.deviceModel,
    required this.deviceBrand,
    required this.deviceManufacturer,
    required this.androidVersion,
    required this.osVersion,
    required this.deviceId,
    required this.networkOperator,
    required this.deviceLanguage,
  });

  /// `PackageInfo.version` — the marketing/app version (e.g. `1.4.2`).
  final String appVersion;

  /// `AndroidDeviceInfo.model` / `IosDeviceInfo.utsname.machine` — the device
  /// hardware model (e.g. `Pixel 8`, `iPhone15,3`).
  final String deviceModel;

  /// `AndroidDeviceInfo.brand` on Android (e.g. `google`, `samsung`). On iOS
  /// the manufacturer is always Apple — we send `Apple` as the constant.
  final String deviceBrand;

  /// `AndroidDeviceInfo.manufacturer` on Android (e.g. `Google`, `OnePlus`).
  /// Frequently identical to [deviceBrand] on consumer devices but can differ
  /// on white-label / carrier-branded hardware — the referral backend records
  /// both so downstream can pick whichever is more meaningful. Hardcoded to
  /// `Apple` on iOS.
  final String deviceManufacturer;

  /// `AndroidDeviceInfo.version.release` — the OS version on Android (e.g.
  /// `14`). Empty on iOS by design; iOS OS version rides the User-Agent.
  /// Retained for the existing [deviceHeaderInterceptor] header vocabulary;
  /// new consumers should prefer [osVersion] which is cross-platform.
  final String androidVersion;

  /// Cross-platform OS release string — `AndroidDeviceInfo.version.release`
  /// on Android (e.g. `15`), `IosDeviceInfo.systemVersion` on iOS (e.g.
  /// `17.4`). Sits alongside [androidVersion] rather than replacing it so
  /// the existing `android_version` header on the main api dio keeps its
  /// exact wire semantics — referral / any new integration should use this.
  final String osVersion;

  /// Install-scoped device identifier — stable across app restarts, wiped on
  /// uninstall. Resolved lazily on first cold start and cached in
  /// `flutter_secure_storage` under [_deviceIdStorageKey]:
  ///
  ///   * iOS: `IosDeviceInfo.identifierForVendor` (Apple's canonical IDFV,
  ///     already install-scoped-per-vendor). Falls back to a generated UUID
  ///     if `identifierForVendor` is null (rare — happens before first
  ///     unlock on some restore paths).
  ///   * Android: a UUIDv4 minted on first launch and persisted — the
  ///     `device_info_plus` package does not expose `ANDROID_ID` and adding
  ///     a plugin for it isn't warranted for this single integration. If we
  ///     later want the real `Settings.Secure.ANDROID_ID`, swap the writer
  ///     without touching consumers.
  ///
  /// Empty string on total resolve failure (test binding, unsupported
  /// platform, secure-storage error) — the referral header is still stamped
  /// so the backend sees explicit absence.
  final String deviceId;

  /// The mobile carrier / SIM operator name (e.g. `Jio`, `Airtel`, `Vi`).
  /// Resolved by [CarrierService] via the `prabhuji/carrier` MethodChannel —
  /// Android reads `TelephonyManager.networkOperatorName` (needs no
  /// permission); iOS deliberately has no handler (Apple deprecated
  /// `CTCarrier.carrierName` in iOS 16). Empty when no telephony /
  /// unregistered SIM / iOS.
  final String networkOperator;

  /// `Platform.localeName` — the device UI locale (e.g. `en_IN`, `hi_IN`).
  /// Distinct from the user's selected CONTENT language, which lives in
  /// [SessionContext.selectedLanguage] and rides the `?locale=` query param.
  final String deviceLanguage;

  /// Placeholder used before [resolve] returns. Every field is empty; the
  /// interceptor still stamps headers so the backend sees explicit absence.
  static const DeviceContext empty = DeviceContext(
    appVersion: '',
    deviceModel: '',
    deviceBrand: '',
    deviceManufacturer: '',
    androidVersion: '',
    osVersion: '',
    deviceId: '',
    networkOperator: '',
    deviceLanguage: '',
  );

  /// Secure-storage key for the persisted install-scoped [deviceId]. Kept
  /// distinct from `firebase_token_sync`'s `firebase_device_id` — the two
  /// serve different backends, and coupling them would tie the referral
  /// vendor's id space to Firebase installation lifecycle.
  static const String _deviceIdStorageKey = 'install_device_id';

  /// One-shot async resolver. Called ONCE from `main()` before `buildDio`.
  /// Every underlying plugin call is guarded — a failure in any one field
  /// degrades to `''` rather than throwing, so a broken platform channel in
  /// tests never breaks the app boot.
  static Future<DeviceContext> resolve({
    CarrierService? carrierService,
    FlutterSecureStorage? secureStorage,
  }) async {
    final appVersion = await _resolveAppVersion();
    final (androidVersion, osVersion, deviceModel, deviceBrand,
            deviceManufacturer, nativeDeviceId) =
        await _resolveDeviceInfo();
    final deviceLanguage = _resolveDeviceLanguage();
    // Reuse the existing carrier reader (Android MethodChannel, no permission
    // required; iOS returns null by design — see `CarrierService`). A null
    // resolve becomes `''` so the header is still stamped as explicit absence.
    final carrier = await (carrierService ?? CarrierService()).resolve();
    final deviceId = await _resolveDeviceId(
      nativeDeviceId,
      secureStorage ?? const FlutterSecureStorage(),
    );
    return DeviceContext(
      appVersion: appVersion,
      deviceModel: deviceModel,
      deviceBrand: deviceBrand,
      deviceManufacturer: deviceManufacturer,
      androidVersion: androidVersion,
      osVersion: osVersion,
      deviceId: deviceId,
      networkOperator: carrier ?? '',
      deviceLanguage: deviceLanguage,
    );
  }

  static Future<String> _resolveAppVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      return info.version;
    } catch (_) {
      return '';
    }
  }

  /// (androidVersion, osVersion, deviceModel, deviceBrand,
  ///  deviceManufacturer, nativeDeviceId). All degrade to `''` when the
  /// platform channel is unavailable (flutter test, unsupported OS).
  /// `nativeDeviceId` is the platform's best-available install-stable id —
  /// `identifierForVendor` on iOS, `''` on Android (see [deviceId] doc for
  /// why Android falls back to a generated UUID).
  static Future<(String, String, String, String, String, String)>
      _resolveDeviceInfo() async {
    try {
      final plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await plugin.androidInfo;
        final release = info.version.release;
        return (release, release, info.model, info.brand, info.manufacturer, '');
      }
      if (Platform.isIOS) {
        final info = await plugin.iosInfo;
        return (
          '',
          info.systemVersion,
          info.utsname.machine,
          'Apple',
          'Apple',
          info.identifierForVendor ?? '',
        );
      }
      return ('', '', '', '', '', '');
    } catch (_) {
      return ('', '', '', '', '', '');
    }
  }

  /// Resolve a stable install-scoped id. Prefer the platform's native value
  /// (iOS IDFV) when present; otherwise read/mint a UUIDv4 in secure storage.
  /// Any storage failure degrades to `''` — an empty header is preferable
  /// to crashing the app boot for a single analytics field.
  static Future<String> _resolveDeviceId(
    String nativeDeviceId,
    FlutterSecureStorage storage,
  ) async {
    if (nativeDeviceId.isNotEmpty) return nativeDeviceId;
    try {
      final existing = await storage.read(key: _deviceIdStorageKey);
      if (existing != null && existing.isNotEmpty) return existing;
      final fresh = _uuidV4();
      await storage.write(key: _deviceIdStorageKey, value: fresh);
      return fresh;
    } catch (_) {
      return '';
    }
  }

  static String _resolveDeviceLanguage() {
    try {
      return Platform.localeName;
    } catch (_) {
      return '';
    }
  }

  static String _uuidV4() {
    final rand = Random.secure();
    final b = List<int>.generate(16, (_) => rand.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    String hex(int v) => v.toRadixString(16).padLeft(2, '0');
    return '${hex(b[0])}${hex(b[1])}${hex(b[2])}${hex(b[3])}-'
        '${hex(b[4])}${hex(b[5])}-'
        '${hex(b[6])}${hex(b[7])}-'
        '${hex(b[8])}${hex(b[9])}-'
        '${hex(b[10])}${hex(b[11])}${hex(b[12])}${hex(b[13])}${hex(b[14])}${hex(b[15])}';
  }
}
