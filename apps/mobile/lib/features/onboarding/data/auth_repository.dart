import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';

/// Result of `POST /auth/otp/send` — surfaces the session id + countdown so the
/// OTP screen (TAM-51) can seed its resend timer without another network call.
///
/// `userId` is the id of the (unverified) User row the send-time write mints
/// (TAM-154). Nullable because the OpenAPI schema doesn't yet declare it — old
/// server builds and the generated DTO both omit the field. Read straight off
/// the response envelope so we start consuming the id the moment the server
/// starts sending it, without waiting on a codegen refresh.
class SendOtpResult {
  const SendOtpResult({
    required this.otpSessionId,
    required this.resendAvailableAfterSeconds,
    required this.otpLength,
    this.userId,
  });

  final String otpSessionId;
  final int resendAvailableAfterSeconds;
  final int otpLength;
  final String? userId;
}

class VerifyOtpResult {
  const VerifyOtpResult({
    required this.token,
    required this.userId,
    required this.phoneCountryCode,
    required this.phoneNumber,
    required this.isNewUser,
  });

  final String token;
  final String userId;

  /// The verified number, echoed back. Replaces an `email` field that only ever
  /// held the server's synthetic `otp-<id>@prabhuji.internal` placeholder — a
  /// phone account has no email, and this is the identity the user just proved.
  final String? phoneCountryCode;
  final String? phoneNumber;

  final bool isNewUser;
}

class ResendOtpResult {
  const ResendOtpResult({required this.resendAvailableAfterSeconds});
  final int resendAvailableAfterSeconds;
}

/// Thin wrapper over `dio` for the OTP endpoints. Uses the regenerated Dart
/// DTOs from `lib/api/generated/**` for request bodies and response parsing —
/// no untyped map access leaks out.
///
/// The generated openapi package emits DTOs only (no client class), so we call
/// dio directly and hand-parse the `{success, message, data}` envelope through
/// the existing shared parser.
class AuthRepository {
  // Named constructor params can't be private; assigning to a `_field` in the
  // initializer list keeps the public API label (`pseudoIdProvider:`) readable
  // while the field itself stays private. Same rationale as the other blocs
  // in this feature (see phone_otp_bloc.dart).
  AuthRepository(this._dio, {Future<String?> Function()? pseudoIdProvider})
      // ignore: prefer_initializing_formals
      : _pseudoIdProvider = pseudoIdProvider;
  final Dio _dio;

  /// Firebase Analytics `app_instance_id` (GA4 `pseudo_id`), read fresh per
  /// send-otp call. Same seam the referral-sync flow uses so the server can
  /// join the (device, phone) pair back to the pre-verify install-attribution
  /// row. Null when Firebase Analytics is unavailable (tests, non-Firebase
  /// builds, or the platform channel failed) — the field is simply omitted
  /// from the wire in that case.
  final Future<String?> Function()? _pseudoIdProvider;

  Future<SendOtpResult> sendOtp({
    required String phoneCountryCode,
    required String phoneNumber,
    String? appSignatureHash,
  }) async {
    final body = SendOtpBody(
      phoneCountryCode:
          SendOtpBodyPhoneCountryCodeEnumTypeTransformer().decode(
                phoneCountryCode,
                allowNull: false,
              ) ??
              SendOtpBodyPhoneCountryCodeEnum.plus91,
      phoneNumber: phoneNumber,
    );
    // TAM-123: `appSignatureHash` is a NEW optional field on the wire (spec
    // §Contract change). The generated `SendOtpBody` DTO doesn't yet carry
    // it — we augment the JSON directly so the client can start sending it
    // ahead of the codegen refresh. Backend accepts it as `.optional()`;
    // omitting it is fully backwards-compatible.
    final json = body.toJson();
    if (appSignatureHash != null && appSignatureHash.isNotEmpty) {
      json['appSignatureHash'] = appSignatureHash;
    }
    // Firebase `pseudoId` — resolved lazily via the injected provider (same
    // seam referral-sync uses). Fetch failures degrade to "omit the field"
    // rather than blocking OTP; the server treats the field as optional.
    // Not on the generated `SendOtpBody` DTO yet — augment the JSON like
    // `appSignatureHash` above, so we can start sending it ahead of a
    // codegen refresh.
    // Debug print to make it obvious in `flutter run` / `adb logcat` output
    // WHY the field is (or isn't) on the wire. Three states — pick the one
    // that shows up:
    //   * "provider null"    → firebaseAnalytics failed to init in main()
    //   * "id null/empty"    → Firebase up but appInstanceId returned nothing
    //   * "stamped: <id>"    → field is on the request body
    // Safe to leave in — no PII (Firebase's app_instance_id is device-scoped
    // and already sits in every analytics event we send). Remove after the
    // diagnostic pass if the noise annoys.
    try {
      if (_pseudoIdProvider == null) {
        debugPrint('[AuthRepository.sendOtp] pseudoId: provider null');
      } else {
        final pseudoId = await _pseudoIdProvider.call();
        if (pseudoId == null || pseudoId.isEmpty) {
          debugPrint('[AuthRepository.sendOtp] pseudoId: id null/empty');
        } else {
          json['pseudoId'] = pseudoId;
          debugPrint('[AuthRepository.sendOtp] pseudoId: stamped: $pseudoId');
        }
      }
    } catch (e) {
      debugPrint('[AuthRepository.sendOtp] pseudoId: provider threw: $e');
    }
    return _mapDioErrors(() async {
      final res =
          await _dio.post<dynamic>('/auth/otp/send', data: json);
      final envelope = _envelope(res);
      final data = SendOtpData.fromJson(envelope['data']);
      if (data == null) throw ApiException('Malformed response');
      // `userId` is not on the generated DTO yet — pull it off the raw envelope
      // so we can start attaching it to analytics events the moment the server
      // starts sending it. Read as `Object?` first so a wrong-typed value (e.g.
      // an int) degrades to null rather than crashing the parse.
      final rawData = envelope['data'];
      final Object? rawUserId =
          rawData is Map<String, dynamic> ? rawData['userId'] : null;
      final String? userId =
          rawUserId is String && rawUserId.isNotEmpty ? rawUserId : null;
      return SendOtpResult(
        otpSessionId: data.otpSessionId,
        resendAvailableAfterSeconds: data.resendAvailableAfterSeconds,
        otpLength: data.otpLength,
        userId: userId,
      );
    });
  }

  Future<VerifyOtpResult> verifyOtp({
    required String otpSessionId,
    required String otp,
  }) async {
    final body = VerifyOtpBody(otpSessionId: otpSessionId, otp: otp);
    return _mapDioErrors(() async {
      final res =
          await _dio.post<dynamic>('/auth/otp/verify', data: body.toJson());
      final envelope = _envelope(res);
      final data = VerifyOtpData.fromJson(envelope['data']);
      if (data == null) throw ApiException('Malformed response');
      return VerifyOtpResult(
        token: data.token,
        userId: data.user.id,
        phoneCountryCode: data.user.phoneCountryCode,
        phoneNumber: data.user.phoneNumber,
        isNewUser: data.isNewUser,
      );
    });
  }

  Future<ResendOtpResult> resendOtp({required String otpSessionId}) async {
    final body = ResendOtpBody(otpSessionId: otpSessionId);
    return _mapDioErrors(() async {
      final res =
          await _dio.post<dynamic>('/auth/otp/resend', data: body.toJson());
      final envelope = _envelope(res);
      final data = ResendOtpData.fromJson(envelope['data']);
      if (data == null) throw ApiException('Malformed response');
      return ResendOtpResult(
        resendAvailableAfterSeconds: data.resendAvailableAfterSeconds,
      );
    });
  }

  /// Rethrows non-2xx dio failures as [ApiException] with the envelope's
  /// `errorCode` attached so callers can distinguish invalid-OTP,
  /// exhausted-session and rate-limited paths.
  ///
  /// Transport errors (no response body) are surfaced as [ApiException] with
  /// [ApiException.errorCode] left null so the caller renders a generic message.
  static Future<T> _mapDioErrors<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on DioException catch (e) {
      final response = e.response;
      final data = response?.data;
      if (data is Map<String, dynamic>) {
        final message = data['message']?.toString() ?? 'Request failed';
        final errorCode = data['errorCode']?.toString();
        throw ApiException(
          message,
          errorCode: errorCode,
          statusCode: response?.statusCode,
        );
      }
      throw ApiException(
        e.message ?? 'Network error',
        statusCode: response?.statusCode,
      );
    }
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    if (body['success'] != true) {
      throw ApiException(
        body['message']?.toString() ?? 'Request failed',
        errorCode: body['errorCode']?.toString(),
      );
    }
    return body;
  }
}
