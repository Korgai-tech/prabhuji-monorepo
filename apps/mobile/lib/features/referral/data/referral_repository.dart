// Public-named constructor params with underscored private fields — matches
// the codebase's deep_link_service / analytics convention. Initializing
// formals would leak underscores into every call site.
// ignore_for_file: prefer_initializing_formals

import 'dart:io' show Platform;

import 'package:chucker_flutter/chucker_flutter.dart';
import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../core/app_config.dart';
import '../../../core/dev_flags.dart';
import '../../../core/device_context.dart';
import '../../../core/secrets.dart';
import 'session_info_request.dart';

/// Talks to the referral backend — a SEPARATE host from our main api
/// ([AppConfig.apiUrl]), so it owns its own Dio pointed at
/// [AppConfig.referralBaseUrl]. The request is auth-skipped (the caller
/// isn't a user of this backend; the tenant headers carry authorisation).
///
/// A construction-time null (either config or tenantId absent — placeholder
/// build, missing secrets file) leaves the repository unusable; consumers
/// gate on [ReferralSyncService] which reads the same flags before calling.
class ReferralRepository {
  ReferralRepository({
    required AppConfig config,
    required Secrets secrets,
    required DeviceContext deviceContext,
    Dio? dio,
  })  : _config = config,
        _secrets = secrets,
        _deviceContext = deviceContext,
        _dio = dio ?? _buildReferralDio(config.referralBaseUrl);

  /// Dedicated Dio for the referral host — different base URL from
  /// [AppConfig.apiUrl] so we can't reuse the shared [buildDio]. Attaches
  /// [ChuckerDioInterceptor] when [kEnableChucker] is on so the same
  /// diagnostic build that enables Chucker for the main api also sees
  /// referral traffic (previously the referral POST was invisible in the
  /// inspector even in debug because this Dio had zero interceptors).
  /// No auth interceptor needed — endpoint is auth-less by design.
  static Dio _buildReferralDio(String baseUrl) {
    final dio = Dio(BaseOptions(baseUrl: baseUrl));
    if (kEnableChucker) {
      dio.interceptors.add(ChuckerDioInterceptor());
    }
    return dio;
  }

  final AppConfig _config;
  final Secrets _secrets;
  final DeviceContext _deviceContext;
  final Dio _dio;

  /// POST the session info to `/referral/v1/save`.
  ///
  /// Header set (all sourced — none hardcoded):
  ///   * `x-tenant-key` — [AppConfig.referralTenantKey] (per-env)
  ///   * `x-tenant-id` / `x-app-id` — [Secrets.tenantId] / [Secrets.referralAppId]
  ///     (vendor-issued, same across envs)
  ///   * `x-app-version` — [DeviceContext.appVersion] (`PackageInfo.version`,
  ///     the marketing string e.g. `1.0.8` — the vendor keys install cohorts
  ///     on this, not the underlying build number)
  ///   * `platform` / `os_name` — derived from `Platform.isAndroid`. Uppercase
  ///     for `platform` (`ANDROID`/`IOS`), title-case for `os_name`
  ///     (`Android`/`iOS`) — matches the referral vendor's spec exactly.
  ///   * `device_id` — [DeviceContext.deviceId] (IDFV on iOS,
  ///     secure-storage-persisted UUID on Android — see [DeviceContext.deviceId])
  ///   * `os_version` — [DeviceContext.osVersion] (cross-platform OS release)
  ///   * `device_brand` / `device_model` / `device_manufacturer` — from
  ///     [DeviceContext] (`device_info_plus` + Apple constant on iOS)
  ///
  /// `skipAuth` opts the request out of the main dio's bearer-token
  /// interceptor — this dio has no auth interceptor, but keeping the flag
  /// makes the intent explicit if the dio ever gets consolidated later.
  ///
  /// Rethrows dio failures as [ApiException] so the caller can log without
  /// coupling to the transport.
  Future<void> saveSession(SessionInfoRequest request) async {
    try {
      await _dio.post<dynamic>(
        '/referral/v1/save',
        data: request.toJson(),
        options: Options(
          extra: const {'skipAuth': true},
          headers: _buildHeaders(),
        ),
      );
    } on DioException catch (e) {
      final response = e.response;
      final data = response?.data;
      if (data is Map<String, dynamic>) {
        throw ApiException(
          data['message']?.toString() ?? 'Referral sync failed',
          errorCode: data['errorCode']?.toString(),
          statusCode: response?.statusCode,
        );
      }
      throw ApiException(
        e.message ?? 'Referral sync network error',
        statusCode: response?.statusCode,
      );
    }
  }

  Map<String, String> _buildHeaders() {
    return {
      'x-tenant-key': _config.referralTenantKey,
      'x-tenant-id': _secrets.tenantId ?? '',
      'x-app-id': _secrets.referralAppId ?? '',
      'x-app-version': _deviceContext.appVersion,
      'platform': _platformUpper(),
      'device_id': _deviceContext.deviceId,
      'os_name': _osName(),
      'os_version': _deviceContext.osVersion,
      'device_brand': _deviceContext.deviceBrand,
      'device_model': _deviceContext.deviceModel,
      'device_manufacturer': _deviceContext.deviceManufacturer,
    };
  }

  /// Vendor spec: `ANDROID` / `IOS` (uppercase). Distinct from the
  /// `os_name` casing below — same information, two different formats
  /// because that's what the referral backend contract demands.
  static String _platformUpper() {
    try {
      if (Platform.isAndroid) return 'ANDROID';
      if (Platform.isIOS) return 'IOS';
      return 'UNKNOWN';
    } catch (_) {
      return 'UNKNOWN';
    }
  }

  static String _osName() {
    try {
      if (Platform.isAndroid) return 'Android';
      if (Platform.isIOS) return 'iOS';
      return 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }
}
