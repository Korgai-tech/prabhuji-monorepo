import 'dart:io';

import 'package:dio/dio.dart';

import '../../../api/generated/openapi.dart';
import '../../../core/locale_interceptor.dart';
import 'horoscope_models.dart';

/// Data seam for the Horoscope module (TAM-74). The concrete impl maps the
/// TAM-73 contract through the generated api-client types (no `dynamic`); a
/// deterministic `FakeHoroscopeRepository` (test support) swaps in so every UI
/// surface + bloc test runs offline.
abstract interface class HoroscopeRepository {
  /// `GET /horoscope/zodiac-signs` → the 12 FREE discovery cards, server-ordered.
  Future<List<HoroscopeZodiacSign>> fetchZodiacSigns({String? locale});

  /// `GET /horoscope/daily` → the Pro-gated daily result for [zodiacId].
  ///
  /// Throws [HoroscopeException] with a typed [HoroscopeErrorKind] — notably
  /// `proRequired` on 403 (the caller routes to the paywall) and `emptyConfig`
  /// on 409.
  Future<HoroscopeDailyResultData> fetchDaily({
    required String zodiacId,
    String? locale,
  });
}

/// Dio-backed implementation over the TAM-73 contract.
class DioHoroscopeRepository implements HoroscopeRepository {
  DioHoroscopeRepository(this._dio);
  final Dio _dio;

  @override
  Future<List<HoroscopeZodiacSign>> fetchZodiacSigns({String? locale}) async {
    try {
      final res = await _dio.get<dynamic>(
        '/horoscope/zodiac-signs',
        queryParameters: {'locale': ?locale},
        // Horoscope owns its locale (`horoscopeLocaleProvider`, which defaults
        // to `hi` — a voice locale must always be picked). Opt out so a null
        // here can't silently pick up the CONTENT language instead.
        options: Options(extra: const {kSkipLocale: true}),
      );
      final response = HoroscopeZodiacSignsResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const HoroscopeException(HoroscopeErrorKind.unknown, 'Malformed response');
      }
      final signs = response.data.signs.map(HoroscopeZodiacSign.fromWire).toList()
        ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
      return List<HoroscopeZodiacSign>.unmodifiable(signs);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<HoroscopeDailyResultData> fetchDaily({
    required String zodiacId,
    String? locale,
  }) async {
    try {
      final res = await _dio.get<dynamic>(
        '/horoscope/daily',
        queryParameters: {'zodiac': zodiacId, 'locale': ?locale},
        // See `fetchZodiacSigns` — horoscope's locale is its own.
        options: Options(extra: const {kSkipLocale: true}),
      );
      final response = HoroscopeDailyResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const HoroscopeException(HoroscopeErrorKind.unknown, 'Malformed response');
      }
      return HoroscopeDailyResultData.fromWire(response.data);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// Maps transport/status failures onto the typed kinds the UI branches on.
  static HoroscopeException _mapDioError(DioException e) {
    if (e.error is SocketException ||
        e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const HoroscopeException(HoroscopeErrorKind.offline);
    }
    final status = e.response?.statusCode;
    final body = e.response?.data;
    final message = body is Map && body['message'] is String
        ? body['message'] as String
        : null;
    switch (status) {
      case 403:
        // Server-side Pro gate — no step payload was serialized (TAM-73).
        return HoroscopeException(HoroscopeErrorKind.proRequired, message);
      case 409:
        return HoroscopeException(HoroscopeErrorKind.emptyConfig, message);
      case 404:
        return HoroscopeException(HoroscopeErrorKind.notFound, message);
      default:
        return HoroscopeException(HoroscopeErrorKind.unknown, message);
    }
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw const HoroscopeException(HoroscopeErrorKind.unknown, 'Malformed response');
    }
    if (body['success'] != true) {
      throw HoroscopeException(
        HoroscopeErrorKind.unknown,
        body['message']?.toString() ?? 'Request failed',
      );
    }
    return body;
  }
}
