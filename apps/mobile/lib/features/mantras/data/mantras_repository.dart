import 'package:dio/dio.dart';
import 'package:meta/meta.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import 'mantras_models.dart';

/// Result of a like toggle (server-authoritative, TAM-65 `/like`).
@immutable
class MantraLikeOutcome {
  const MantraLikeOutcome({required this.liked, required this.likeCount});
  final bool liked;
  final int likeCount;
}

/// `GET /mantras/counter-preference` — the user's persisted japa target plus the
/// SERVER-OWNED list of selectable targets.
///
/// [availableTargets] is content: the counter sheet renders exactly this list, in
/// this order. The client used to ship `RepeatCounter.options` (`[7, 11, 21, 108,
/// 1008]`) and render that instead — the server now serves it from the same
/// constant its `PUT` validates against, so the picker and the validator can no
/// longer drift apart.
@immutable
class MantraCounterPreference {
  const MantraCounterPreference({
    required this.repeatTarget,
    required this.availableTargets,
  });

  final int repeatTarget;

  /// Every selectable target, in display order. MAY be empty if the server sent
  /// nothing usable — the sheet then offers no options rather than inventing a
  /// list (see `showMantrasCounterSheet`).
  final List<int> availableTargets;
}

/// Data seam for Mantras & Stutis (TAM-66). Concrete impl maps the TAM-65
/// contract through the generated api-client types (no `dynamic`); a
/// deterministic `FakeMantrasRepository` (in test support) swaps in so every UI
/// surface + bloc test runs offline.
abstract interface class MantrasRepository {
  /// `GET /mantras/sections` → the ordered main-page sections.
  Future<List<MantraSectionData>> fetchSections();

  /// `GET /mantras/items` → one keyset-paginated listing page for [query].
  Future<MantraListPage> fetchItems(
    MantraListQuery query, {
    String? cursor,
    int limit,
  });

  /// `GET /mantras/items/{id}` → full detail incl. the (Pro-gated) stream URL,
  /// Devanagari text and share payload. [source]/[sourceId] let the server pick
  /// the accompanying playlist (server-authoritative order).
  Future<MantraDetailData> fetchDetail(
    String id, {
    String? source,
    String? sourceId,
  });

  /// `GET /mantras/deities/{deityId}/playlist` → first item + queue.
  Future<MantraPlaylist> fetchDeityPlaylist(String deityId);

  /// `GET /mantras/categories/{categoryId}/playlist` → first item + queue.
  Future<MantraPlaylist> fetchCategoryPlaylist(String categoryId);

  /// `POST /mantras/items/{id}/recently-played` → records a play (Pro-only).
  Future<void> recordRecentlyPlayed(String id, {int? lastProgressSeconds});

  /// `POST /mantras/items/{id}/like` → toggles + returns the new like state.
  Future<MantraLikeOutcome> toggleLike(String id);

  /// `GET /mantras/counter-preference` → the persisted repeat target AND the
  /// server-owned list of selectable targets.
  Future<MantraCounterPreference> fetchCounterPreference();

  /// `PUT /mantras/counter-preference` → persist the repeat target.
  Future<int> saveCounterPreference(int repeatTarget);
}

/// Dio-backed implementation over the TAM-65 contract.
class DioMantrasRepository implements MantrasRepository {
  DioMantrasRepository(this._dio);
  final Dio _dio;

  static const int defaultLimit = 20;

  @override
  Future<List<MantraSectionData>> fetchSections() async {
    final res = await _dio.get<dynamic>('/mantras/sections');
    final body = _envelope(res);
    final data = body['data'];
    if (data is! Map<String, dynamic>) throw ApiException('Malformed response');
    final rawSections = data['sections'];
    if (rawSections is! List) throw ApiException('Malformed response');

    final sections = <MantraSectionData>[];
    for (final raw in rawSections) {
      if (raw is! Map) continue;
      final map = raw.cast<String, dynamic>();
      final type = MantraSectionType.fromWire(map['sectionType']?.toString() ?? '');
      if (type == null) continue; // unknown section type — skip forward-compatibly
      sections.add(_section(type, map));
    }
    sections.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return sections;
  }

  /// Branch the polymorphic `items[]` on the `kind` discriminator into the clean
  /// per-variant generated models (the flattened union model is unusable).
  MantraSectionData _section(MantraSectionType type, Map<String, dynamic> map) {
    final items = map['items'];
    final audios = <MantraAudio>[];
    final deities = <MantraDeity>[];
    final categories = <MantraCategory>[];
    if (items is List) {
      for (final item in items) {
        if (item is! Map) continue;
        final json = item.cast<String, dynamic>();
        switch (json['kind']?.toString()) {
          case 'mantra':
            final p = MantraPreview.fromJson(json);
            if (p != null) audios.add(MantraAudio.fromPreview(p));
          case 'deity':
            final d = MantraDeityCard.fromJson(json);
            if (d != null) deities.add(MantraDeity.fromCard(d));
          case 'category':
            final c = MantraCategoryCard.fromJson(json);
            if (c != null) categories.add(MantraCategory.fromCard(c));
        }
      }
    }
    return MantraSectionData(
      sectionId: map['sectionId']?.toString() ?? '',
      type: type,
      title: map['title']?.toString() ?? '',
      sortOrder: (map['sortOrder'] as num?)?.toInt() ?? 0,
      showAllEnabled: map['showAllEnabled'] == true,
      audios: audios,
      deities: deities,
      categories: categories,
    );
  }

  @override
  Future<MantraListPage> fetchItems(
    MantraListQuery query, {
    String? cursor,
    int limit = defaultLimit,
  }) async {
    final res = await _dio.get<dynamic>(
      '/mantras/items',
      queryParameters: {
        ...query.toQueryParameters(cursor: cursor, limit: limit),
      },
    );
    final body = _envelope(res);
    final response = MantraListResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return MantraListPage(
      items: response.data.items
          .map(MantraAudio.fromListItem)
          .toList(growable: false),
      nextCursor: response.data.nextCursor,
    );
  }

  @override
  Future<MantraDetailData> fetchDetail(
    String id, {
    String? source,
    String? sourceId,
  }) async {
    // TAM-110: the server localizes category-tag labels from `locale`, which
    // `localeInterceptor` puts on every GET (see core/locale_interceptor.dart).
    final res = await _dio.get<dynamic>(
      '/mantras/items/$id',
      queryParameters: {
        'source': ?source,
        'sourceId': ?sourceId,
      },
    );
    final body = _envelope(res);
    final response = MantraDetailResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return MantraDetailData.fromResponse(response.data);
  }

  @override
  Future<MantraPlaylist> fetchDeityPlaylist(String deityId) =>
      _playlist('/mantras/deities/$deityId/playlist');

  @override
  Future<MantraPlaylist> fetchCategoryPlaylist(String categoryId) =>
      _playlist('/mantras/categories/$categoryId/playlist');

  Future<MantraPlaylist> _playlist(String path) async {
    final res = await _dio.get<dynamic>(path);
    final body = _envelope(res);
    final response = MantraPlaylistResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    final data = response.data;
    return MantraPlaylist(
      firstItem: data.firstItem == null
          ? null
          : MantraAudio.fromListItem(data.firstItem!),
      items: data.playlist.map(MantraAudio.fromListItem).toList(growable: false),
      source: data.playlistSource.value,
    );
  }

  @override
  Future<void> recordRecentlyPlayed(String id, {int? lastProgressSeconds}) async {
    await _dio.post<dynamic>(
      '/mantras/items/$id/recently-played',
      data: {'lastProgressSeconds': ?lastProgressSeconds},
    );
  }

  @override
  Future<MantraLikeOutcome> toggleLike(String id) async {
    final res = await _dio.post<dynamic>('/mantras/items/$id/like');
    final body = _envelope(res);
    final response = MantraLikeResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return MantraLikeOutcome(
      liked: response.data.liked,
      likeCount: response.data.likeCount,
    );
  }

  @override
  Future<MantraCounterPreference> fetchCounterPreference() async {
    final res = await _dio.get<dynamic>('/mantras/counter-preference');
    final body = _envelope(res);
    final response = MantraCounterPreferenceResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return MantraCounterPreference(
      repeatTarget: response.data.repeatTarget,
      // The option list is the server's (sourced from the same constant the PUT
      // validates against) — the sheet used to render a hardcoded one.
      availableTargets: response.data.availableTargets
          .where((t) => t >= 1)
          .toList(growable: false),
    );
  }

  @override
  Future<int> saveCounterPreference(int repeatTarget) async {
    final res = await _dio.put<dynamic>(
      '/mantras/counter-preference',
      data: {'repeatTarget': repeatTarget},
    );
    final body = _envelope(res);
    final response = MantraCounterPreferenceResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return response.data.repeatTarget;
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
