import 'package:dio/dio.dart';

import '../application/subscription_cancel_api.dart';
import '../application/subscription_cancel_types.dart';

/// Dio-backed [SubscriptionCancelApi] — the real production impl.
///
/// Talks to `POST /subscription/cancel-requests` and `GET
/// /subscription/cancel-requests/me` per TAM-125 §3. Parses the shared
/// `{success, message, data}` envelope, promotes the 409-existing branch to
/// [PendingRequestExistsException] (which the confirm-dialog cascade treats
/// as success per PO ruling #1), and maps every other non-2xx to a
/// [SubscriptionCancelApiException] whose `message` carries the envelope's
/// `body['message']` verbatim (§6, "show the API's `message` field").
///
/// Parses the wire JSON directly into the domain-facing types in
/// `subscription_cancel_types.dart` rather than through the generated
/// `CancellationRequestData` model — the placeholder shape mirrors the wire
/// exactly, and going through the generated `CancellationRequestStatusEnum`
/// would force a translation step at every consumer for no benefit.
class DioSubscriptionCancelApi implements SubscriptionCancelApi {
  DioSubscriptionCancelApi(this._dio);

  final Dio _dio;

  @override
  Future<CancellationRequestData> createCancelRequest({String? reason}) async {
    try {
      final res = await _dio.post<dynamic>(
        '/subscription/cancel-requests',
        // Server accepts an empty body on this endpoint; only send `reason`
        // when the caller supplied one (§3 — the field is optional).
        data: reason == null || reason.isEmpty ? const <String, dynamic>{} : {'reason': reason},
      );
      return _parseData(res.data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<CancellationRequestData?> getLatestCancelRequest() async {
    try {
      final res = await _dio.get<dynamic>('/subscription/cancel-requests/me');
      final body = _asMap(res.data);
      if (body['success'] != true) {
        throw SubscriptionCancelApiException(
          message: body['message']?.toString() ?? 'Request failed',
          reason: SubscriptionCancelFailedReason.unknown,
        );
      }
      final data = body['data'];
      if (data == null) return null;
      return _parseRow(data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// Envelope + row → domain type, for a successful create/read.
  static CancellationRequestData _parseData(dynamic raw) {
    final body = _asMap(raw);
    if (body['success'] != true) {
      throw SubscriptionCancelApiException(
        message: body['message']?.toString() ?? 'Request failed',
        reason: SubscriptionCancelFailedReason.unknown,
      );
    }
    final data = body['data'];
    if (data == null) {
      throw const SubscriptionCancelApiException(
        message: 'Malformed response',
        reason: SubscriptionCancelFailedReason.unknown,
      );
    }
    return _parseRow(data);
  }

  static CancellationRequestData _parseRow(dynamic row) {
    if (row is! Map) {
      throw const SubscriptionCancelApiException(
        message: 'Malformed response',
        reason: SubscriptionCancelFailedReason.unknown,
      );
    }
    final json = row.cast<String, dynamic>();
    return CancellationRequestData(
      id: json['id'] as String,
      status: CancellationRequestStatus.fromWire(json['status'] as String?),
      reason: json['reason'] as String?,
      requestedAt: DateTime.parse(json['requestedAt'] as String),
      processedAt: json['processedAt'] == null
          ? null
          : DateTime.parse(json['processedAt'] as String),
    );
  }

  static Map<String, dynamic> _asMap(dynamic body) {
    if (body is! Map<String, dynamic>) {
      throw const SubscriptionCancelApiException(
        message: 'Malformed response',
        reason: SubscriptionCancelFailedReason.unknown,
      );
    }
    return body;
  }

  /// Translates a Dio failure into the port's exception hierarchy.
  ///
  /// The 409 `PENDING_REQUEST_EXISTS` branch is elevated to
  /// [PendingRequestExistsException] because the confirm-dialog cascade
  /// treats it as SUCCESS (§6). Every other non-2xx becomes a
  /// [SubscriptionCancelApiException] whose `message` is the envelope's
  /// `body['message']` verbatim.
  static Exception _mapDioError(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    final envelopeMessage = data is Map
        ? (data.cast<String, dynamic>()['message']?.toString())
        : null;
    final errorCode = data is Map
        ? (data.cast<String, dynamic>()['errorCode']?.toString())
        : null;

    if (status == 409 && errorCode == 'PENDING_REQUEST_EXISTS') {
      return PendingRequestExistsException(
        message: envelopeMessage ?? 'A pending cancellation request already exists.',
      );
    }

    final reason = _reasonFor(e, status);
    // The § 6 "network / offline" copy is the caller's job to substitute
    // when reason == network — surface an honest string here so support can
    // read logs.
    final message = envelopeMessage ??
        (reason == SubscriptionCancelFailedReason.network
            ? "Couldn't reach the server. Please try again."
            : 'Request failed');
    return SubscriptionCancelApiException(message: message, reason: reason);
  }

  static String _reasonFor(DioException e, int? status) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return SubscriptionCancelFailedReason.network;
      default:
        break;
    }
    if (status == null) return SubscriptionCancelFailedReason.unknown;
    if (status == 401 || status == 403) {
      return SubscriptionCancelFailedReason.unauthorized;
    }
    if (status >= 400 && status < 500) {
      return SubscriptionCancelFailedReason.validation;
    }
    if (status >= 500 && status < 600) {
      return SubscriptionCancelFailedReason.server5xx;
    }
    return SubscriptionCancelFailedReason.unknown;
  }
}
