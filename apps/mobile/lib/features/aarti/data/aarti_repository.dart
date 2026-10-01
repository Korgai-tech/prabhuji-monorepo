import 'package:dio/dio.dart';
import 'package:meta/meta.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import 'aarti_models.dart';

/// Result of a like toggle (optimistic on the client; see [DioAartiRepository]).
@immutable
class AartiLikeResult {
  const AartiLikeResult({required this.liked, required this.likeCount});
  final bool liked;
  final int likeCount;
}

/// Data seam for Aarti & Bhajans (TAM-64). Concrete (not abstract) so a
/// deterministic [FakeAartiRepository] can be swapped in tests/harnesses — every
/// UI surface + bloc test runs offline. The dio-backed [DioAartiRepository] maps
/// the TAM-63 contract through the generated api-client types (no `dynamic`).
abstract interface class AartiRepository {
  /// `GET /aarti/main` → the ordered main-page sections.
  Future<List<AartiSectionData>> fetchMain();

  /// `GET /aarti/audios` → one keyset-paginated listing page for [query].
  Future<AartiListPage> fetchAudios(
    AartiListQuery query, {
    String? cursor,
    int limit,
  });

  /// `GET /aarti/audios/{id}` → full detail incl. the (Pro-gated) stream URL.
  Future<AartiDetail> fetchDetail(String id);

  /// `POST /aarti/audios/{id}/play` → records a play (Pro-only server-side).
  Future<AartiPlayResult> recordPlay(String id, {int? lastPositionSeconds});

  /// Toggle the caller's like on [id]. No `/aarti/.../like` route is committed in
  /// the TAM-63 contract (only `/mantras/items/{id}/like` exists), so the dio
  /// impl performs an OPTIMISTIC local toggle and does NOT invent an endpoint —
  /// see the class doc. Persistence lands when the aarti like route ships.
  Future<AartiLikeResult> toggleLike(String id, {required bool liked, required int likeCount});
}

/// Dio-backed implementation over the TAM-63 contract.
class DioAartiRepository implements AartiRepository {
  DioAartiRepository(this._dio);
  final Dio _dio;

  static const int defaultLimit = 20;

  @override
  Future<List<AartiSectionData>> fetchMain() async {
    final res = await _dio.get<dynamic>('/aarti/main');
    final body = _envelope(res);
    final data = body['data'];
    if (data is! Map<String, dynamic>) throw ApiException('Malformed response');
    final rawSections = data['sections'];
    if (rawSections is! List) throw ApiException('Malformed response');

    final sections = <AartiSectionData>[];
    for (final raw in rawSections) {
      if (raw is! Map) continue;
      final map = raw.cast<String, dynamic>();
      final type = AartiSectionType.fromWire(map['sectionType']?.toString() ?? '');
      if (type == null) continue; // unknown section type — skip forward-compatibly
      sections.add(_section(type, map));
    }
    sections.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return sections;
  }

  /// Branch the polymorphic `items[]` on the `kind` discriminator into the clean
  /// per-variant generated models (the flattened union model is unusable).
  AartiSectionData _section(AartiSectionType type, Map<String, dynamic> map) {
    final items = map['items'];
    final audios = <AartiAudio>[];
    final deities = <AartiDeity>[];
    final categories = <AartiCategory>[];
    if (items is List) {
      for (final item in items) {
        if (item is! Map) continue;
        switch (item['kind']?.toString()) {
          case 'audio':
            final p = AartiAudioPreview.fromJson(item);
            if (p != null) audios.add(AartiAudio.fromPreview(p));
          case 'deity':
            final d = AartiDeityCard.fromJson(item);
            if (d != null) deities.add(AartiDeity.fromCard(d));
          case 'category':
            final c = AartiCategoryCard.fromJson(item);
            if (c != null) categories.add(AartiCategory.fromCard(c));
        }
      }
    }
    return AartiSectionData(
      sectionId: map['sectionId']?.toString() ?? '',
      type: type,
      title: map['title']?.toString() ?? '',
      sortOrder: (map['sortOrder'] as num?)?.toInt() ?? 0,
      audios: audios,
      deities: deities,
      categories: categories,
    );
  }

  @override
  Future<AartiListPage> fetchAudios(
    AartiListQuery query, {
    String? cursor,
    int limit = defaultLimit,
  }) async {
    final res = await _dio.get<dynamic>(
      '/aarti/audios',
      queryParameters: {
        ...query.toQueryParameters(cursor: cursor, limit: limit),
      },
    );
    final body = _envelope(res);
    final response = AartiListResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return AartiListPage(
      items: response.data.items
          .map(AartiAudio.fromListItem)
          .toList(growable: false),
      nextCursor: response.data.nextCursor,
    );
  }

  @override
  Future<AartiDetail> fetchDetail(String id) async {
    // TAM-109: the server localizes category-tag labels from `locale`, which
    // `localeInterceptor` puts on every GET (see core/locale_interceptor.dart).
    final res = await _dio.get<dynamic>('/aarti/audios/$id');
    final body = _envelope(res);
    final response = AartiDetailResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return AartiDetail.fromDetail(response.data);
  }

  @override
  Future<AartiPlayResult> recordPlay(String id, {int? lastPositionSeconds}) async {
    final res = await _dio.post<dynamic>(
      '/aarti/audios/$id/play',
      data: {'lastPositionSeconds': ?lastPositionSeconds},
    );
    final body = _envelope(res);
    final response = AartiPlayResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return response.data;
  }

  @override
  Future<AartiLikeResult> toggleLike(
    String id, {
    required bool liked,
    required int likeCount,
  }) async {
    // No aarti like route is committed (TAM-63 exposes /main, /audios, detail,
    // /play only). We do NOT invent an endpoint (STRICT gate): the toggle is
    // optimistic and local until the like route ships. The UI already applied
    // the optimistic count; we just echo it back.
    final next = liked ? likeCount + 1 : (likeCount - 1).clamp(0, 1 << 31);
    return AartiLikeResult(liked: liked, likeCount: next);
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) throw ApiException('Malformed response');
    if (body['success'] != true) {
      throw ApiException(body['message']?.toString() ?? 'Request failed');
    }
    return body;
  }
}
