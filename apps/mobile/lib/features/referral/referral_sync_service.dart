// Public-named constructor params with underscored private fields — the
// same rationale as `deep_link_service.dart`: switching to `this._foo`
// initializing formals would leak the leading underscore into every call
// site (`ReferralSyncService(_authStore: …)`), which is a worse trade.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/advertising_id_service.dart';
import '../../core/app_config.dart';
import '../../core/auth_store.dart';
import '../../core/dev_flags.dart';
import '../../core/device_context.dart';
import '../../core/install_referrer_reader.dart';
import '../../core/jwt.dart';
import '../../core/secrets.dart';
import 'data/referral_repository.dart';
import 'data/session_info_request.dart';

/// Fires once per (userId, referrer-value) tuple: POST the install referrer
/// + device/user context to the referral backend as soon as we have any
/// server-issued userId. The endpoint is auth-less (skipAuth + tenant
/// headers) so no JWT is required — see PhoneOtpBloc which fires this
/// straight after `POST /auth/otp/send` with the mint-on-send userId
/// (TAM-154).
///
/// **Per-userId, value-aware dedupe.** SharedPreferences stores the
/// referrer signature we last successfully POSTed for each userId at
/// `referral_sync_v2:<userId>`. On every trigger we compute the current
/// signature and:
///   * Same signature → already attributed, skip.
///   * Different signature (or absent) → POST + persist the new signature.
///
/// This means:
///   * Same user + same referrer → one POST per install (deduped).
///   * Different user → independent POST (all users on the device get
///     attributed — the referrer is install-scoped, not user-scoped).
///   * Same user but referrer changed → re-POST (defensive; the Play
///     Install Referrer API is documented as install-time-fixed, but a
///     re-read that surfaces different data still gets shipped rather
///     than silently dropped).
///
/// **Silent no-op gates** (all of these skip the POST without erroring):
///   * Same (userId, signature) already recorded (see above)
///   * No userId available (nothing passed AND JWT has no sub claim)
///   * [AppConfig.isRealReferralConfig] is false (placeholder URL / key)
///   * [Secrets.tenantIdEnabled] is false (placeholder / missing secret)
///   * Install-referrer plugin errored (retry next launch)
///
/// The signature is only persisted on a successful POST — a network
/// failure leaves the stored value unchanged so the next trigger retries.
class ReferralSyncService {
  ReferralSyncService({
    required AuthStore authStore,
    required SharedPreferences preferences,
    required InstallReferrerReader installReferrerReader,
    required AdvertisingIdService? advertisingIdService,
    required DeviceContext deviceContext,
    required AppConfig config,
    required Secrets secrets,
    required ReferralRepository repository,
    Future<String?> Function()? pseudoIdProvider,
  })  : _authStore = authStore,
        _preferences = preferences,
        _installReferrerReader = installReferrerReader,
        _advertisingIdService = advertisingIdService,
        _deviceContext = deviceContext,
        _config = config,
        _secrets = secrets,
        _repository = repository,
        _pseudoIdProvider = pseudoIdProvider ?? _nullPseudoId;

  final AuthStore _authStore;
  final SharedPreferences _preferences;
  final InstallReferrerReader _installReferrerReader;
  final AdvertisingIdService? _advertisingIdService;
  final DeviceContext _deviceContext;
  final AppConfig _config;
  final Secrets _secrets;
  final ReferralRepository _repository;
  final Future<String?> Function() _pseudoIdProvider;

  /// Coalesces concurrent triggers PER userId — main.dart fires this from
  /// BOTH the cold-start-if-logged-in path AND the auth-change listener,
  /// and PhoneOtpBloc fires it right after send-otp with the pending
  /// userId. Same-userId concurrent triggers share the in-flight future
  /// (avoids duplicate POSTs); DIFFERENT-userId triggers run independently
  /// (a fast change-number keeps both attribution attempts alive).
  final Map<String, Future<void>> _inflight = {};

  // Per-userId signature store. Format: `referral_sync_v2:<userId>` → the
  // string signature of the last successfully-POSTed referrer for that
  // userId. On every trigger we recompute the current signature and
  // compare — a mismatch (including an absent entry) fires a new POST.
  //
  // The v2 name distinguishes from the earlier v1 boolean flag scheme;
  // existing installs upgrading past v1 will re-sync once for each user
  // that logs in (the referral backend should dedupe on its own
  // (install_id, user_id, referrer) key if that concerns you).
  static const _syncStatePrefix = 'referral_sync_v2:';
  static String _syncStateKey(String userId) => '$_syncStatePrefix$userId';

  /// Deterministic string that uniquely identifies an attribution payload
  /// for change detection. Empty string for a null/organic-install
  /// referrer; sorted `k=v&k=v` for a non-empty map (sort is why we don't
  /// just JSON — Dart's Map preserves insertion order but Play could hand
  /// keys in any order). Never includes the raw referrer path since we
  /// only ship attribution to the server — signature must reflect what's
  /// on the wire.
  static String _referrerSignature(Map<String, String>? attribution) {
    if (attribution == null || attribution.isEmpty) return '';
    final keys = attribution.keys.toList()..sort();
    return keys
        .map((k) => '$k=${Uri.encodeQueryComponent(attribution[k] ?? '')}')
        .join('&');
  }

  static Future<String?> _nullPseudoId() async => null;

  /// Trigger the sync. Silently no-ops when any of the gates fail.
  /// Never throws — every branch swallows and logs.
  ///
  /// [userId] — pass explicitly when the caller has a userId that isn't
  /// yet in the JWT store (e.g. `PhoneOtpBloc` after `POST /auth/otp/send`
  /// returns the mint-on-send userId per TAM-154). When null, we fall
  /// back to decoding the JWT stored in [AuthStore]. This lets the sync
  /// fire the moment we have ANY server-issued userId — no need to wait
  /// for OTP verification. The endpoint is auth-less (skipAuth + tenant
  /// headers) so no bearer token is required.
  Future<void> syncIfNeeded({String? userId}) {
    // Resolve userId synchronously (JWT decode is sync) so we can key the
    // in-flight map correctly BEFORE _run starts its awaits. A caller with
    // no userId + no hydrated JWT gets an immediate no-op.
    final resolvedId = _resolveUserId(userId);
    if (resolvedId == null) return Future.value();
    final existing = _inflight[resolvedId];
    if (existing != null) return existing;
    final future = _run(resolvedId).whenComplete(
      () => _inflight.remove(resolvedId),
    );
    _inflight[resolvedId] = future;
    return future;
  }

  Future<void> _run(String userId) async {
    try {
      if (!_config.isRealReferralConfig) {
        if (kEnableChucker) {
          debugPrint('[referral] skip: referral config is placeholder');
        }
        return;
      }
      if (!_secrets.tenantIdEnabled) {
        if (kEnableChucker) {
          debugPrint('[referral] skip: tenantId secret is placeholder');
        }
        return;
      }

      final referrerData = await _installReferrerReader.read();
      // If the Play Install Referrer plugin errored (not "empty referrer" —
      // an actual read failure), do NOT persist a signature. Next trigger
      // retries. Prevents attribution loss on a transient Play Services
      // hiccup that happens to land on the exact launch the user logged in.
      if (_installReferrerReader.lastReadFailed) {
        if (kEnableChucker) {
          debugPrint('[referral] skip: install referrer read failed, will retry');
        }
        return;
      }

      // Value-aware dedupe — compare the signature of what we're about
      // to send against what we last successfully sent for this userId.
      // Same → skip; different (or first time) → POST.
      final currentSignature = _referrerSignature(referrerData?.attribution);
      final storedSignature = _preferences.getString(_syncStateKey(userId));
      if (storedSignature != null && storedSignature == currentSignature) {
        if (kEnableChucker) {
          debugPrint('[referral] skip: userId=$userId already synced with '
              'same referrer (signature="$currentSignature")');
        }
        return;
      }

      final pseudoId = await _pseudoIdProvider();

      final request = SessionInfoRequest(
        userId: userId,
        referralInfo: referrerData?.attribution,
        countryCode: _resolveCountryCode(),
        locale: _resolveLocale(),
        // TODO(referral): VPN detection package not currently in pubspec —
        // ship `false` for v1. Server treats null==false either way.
        isVpnActive: false,
        gaAdid: _advertisingIdService?.current ??
            AdvertisingIdService.emptyAdId,
        deviceInfo: _buildDeviceInfo(),
        pseudoId: pseudoId,
      );

      await _repository.saveSession(request);
      await _preferences.setString(_syncStateKey(userId), currentSignature);
      if (kEnableChucker) {
        debugPrint('[referral] synced userId=$userId utm=${referrerData?.attribution} '
            'signature="$currentSignature"');
      }
    } catch (e, st) {
      // Never break the app. Leave the flag unset so a retry happens on
      // the next login / cold-start.
      if (kEnableChucker) debugPrint('[referral] sync failed: $e\n$st');
    }
  }

  /// Resolve userId — explicit arg wins, else decode from stored JWT.
  /// Returns null when neither source yields a non-empty string.
  String? _resolveUserId(String? explicit) {
    if (explicit != null && explicit.isNotEmpty) return explicit;
    final token = _authStore.read();
    if (token == null) return null;
    final claims = decodeJwtClaims(token);
    final sub = claims?['sub'];
    if (sub is String && sub.isNotEmpty) return sub;
    if (kEnableChucker) debugPrint('[referral] skip: no userId available');
    return null;
  }

  Map<String, dynamic> _buildDeviceInfo() {
    return <String, dynamic>{
      'app_version': _deviceContext.appVersion,
      'device_model': _deviceContext.deviceModel,
      'device_brand': _deviceContext.deviceBrand,
      'android_version': _deviceContext.androidVersion,
      'network_operator': _deviceContext.networkOperator,
      'device_language': _deviceContext.deviceLanguage,
      'platform': _resolvePlatform(),
    };
  }

  static String _resolvePlatform() {
    try {
      if (Platform.isAndroid) return 'android';
      if (Platform.isIOS) return 'ios';
      return 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  /// Best-effort country from the device locale (`en_IN` → `IN`).
  /// Returns empty string when the locale has no country segment; the
  /// backend can derive from request IP as a fallback.
  String _resolveCountryCode() {
    try {
      final locale = Platform.localeName;
      final parts = locale.split(RegExp(r'[_-]'));
      if (parts.length < 2) return '';
      final region = parts[1];
      // Strip any trailing `.UTF-8`-style modifier some POSIX-shaped
      // locales include (`en_US.UTF-8`).
      final dot = region.indexOf('.');
      return dot >= 0 ? region.substring(0, dot) : region;
    } catch (_) {
      return '';
    }
  }

  String _resolveLocale() {
    try {
      return Platform.localeName;
    } catch (_) {
      return '';
    }
  }
}
