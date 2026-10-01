import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';

/// Thin wrapper over `GET /paywall/config`. Returns the generated
/// [PaywallConfigData] DTO as-is — no caching in this pass (TAM-53 will layer a
/// SharedPrefs cache once the paywall screen ships).
class PaywallRepository {
  PaywallRepository(this._dio);
  final Dio _dio;

  Future<PaywallConfigData> getConfig({required String locale}) async {
    final res = await _dio.get<dynamic>(
      '/paywall/config',
      queryParameters: {'locale': locale},
    );
    final envelope = _envelope(res);
    final data = PaywallConfigData.fromJson(envelope['data']);
    if (data == null) throw ApiException('Malformed response');
    return data;
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    return body;
  }
}
