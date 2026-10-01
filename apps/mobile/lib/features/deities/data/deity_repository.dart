import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';

/// Fetches the deity catalogue from `GET /deities` (TAM-57) and maps it through
/// the generated [DeityView] model — no hand-written deity JSON (secondary
/// pattern: contract-codegen-chain).
///
/// Concrete (not abstract) so a `FakeDeityRepository implements DeityRepository`
/// can be swapped in tests, mirroring [SubscriptionRepository].
class DeityRepository {
  DeityRepository(this._dio);
  final Dio _dio;

  /// Returns the deity list, sorted by the server's `sortOrder`. Throws
  /// [ApiException] on a malformed envelope so the provider can surface the
  /// error state (the DeityFilterRow degrades to "All Gods" only).
  ///
  /// `locale` is required by the server (`GET /deities?locale=<code>`) — the
  /// wire schema rejects the request with 400 if it's missing.
  Future<List<DeityView>> list({required String locale}) async {
    final res = await _dio.get<dynamic>(
      '/deities',
      queryParameters: {'locale': locale},
    );
    final envelope = _envelope(res);
    final data = envelope['data'];
    if (data is! Map<String, dynamic>) {
      throw ApiException('Malformed response');
    }
    final items = DeityView.listFromJson(data['items']);
    items.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return items;
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
