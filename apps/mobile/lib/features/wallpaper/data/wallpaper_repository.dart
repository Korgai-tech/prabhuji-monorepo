import 'package:dio/dio.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import 'wallpaper_models.dart';

/// Data seam for the Wallpaper module (TAM-70). The concrete impl maps the
/// TAM-69 contract through the generated api-client types (no `dynamic`); a
/// deterministic `FakeWallpaperRepository` (test support) swaps in so every UI
/// surface + bloc test runs offline.
abstract interface class WallpaperRepository {
  /// `GET /wallpaper/home` → deity filters + CMS rows, optionally filtered by
  /// [deityId] (`null` == All Gods, no filter).
  Future<WallpaperHomeData> fetchHome({String? deityId});

  /// `GET /wallpaper/list` → one cursor-paginated page for a deity ([deityId])
  /// or a home row ([rowId]).
  Future<WallpaperListPage> fetchList({
    String? deityId,
    String? rowId,
    String? cursor,
    int limit,
  });

  /// `GET /wallpaper/{id}` → full detail incl. the apply/live asset URLs.
  Future<WallpaperDetailData> fetchDetail(String id);

  /// `POST /wallpaper/{id}/like` → toggles + returns the new like state.
  Future<WallpaperLikeOutcome> toggleLike(String id);

  /// `POST /wallpaper/{id}/count` → increments the share OR set count and
  /// returns the new value. Set is fired ONLY after a confirmed native set.
  Future<int> incrementCount(String id, WallpaperCountType type);
}

/// Dio-backed implementation over the TAM-69 contract.
class DioWallpaperRepository implements WallpaperRepository {
  DioWallpaperRepository(this._dio);
  final Dio _dio;

  static const int defaultLimit = 20;

  @override
  Future<WallpaperHomeData> fetchHome({String? deityId}) async {
    final res = await _dio.get<dynamic>(
      '/wallpaper/home',
      queryParameters: {'deityId': ?deityId},
    );
    final response = WallpaperHomeResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return WallpaperHomeData(
      rows: response.data.rows
          .map(WallpaperHomeRowData.fromRow)
          .toList(growable: false),
    );
  }

  @override
  Future<WallpaperListPage> fetchList({
    String? deityId,
    String? rowId,
    String? cursor,
    int limit = defaultLimit,
  }) async {
    final res = await _dio.get<dynamic>(
      '/wallpaper/list',
      queryParameters: {
        'deityId': ?deityId,
        'rowId': ?rowId,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': limit,
      },
    );
    final response = WallpaperListResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return WallpaperListPage(
      items: response.data.items
          .map(WallpaperCardItem.fromCard)
          .toList(growable: false),
      nextCursor: response.data.nextCursor,
    );
  }

  @override
  Future<WallpaperDetailData> fetchDetail(String id) async {
    final res = await _dio.get<dynamic>('/wallpaper/$id');
    final response = WallpaperDetailResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return WallpaperDetailData.fromDetail(response.data);
  }

  @override
  Future<WallpaperLikeOutcome> toggleLike(String id) async {
    final res = await _dio.post<dynamic>('/wallpaper/$id/like');
    final response = WallpaperLikeResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return WallpaperLikeOutcome(
      liked: response.data.liked,
      likeCount: response.data.likeCount,
    );
  }

  @override
  Future<int> incrementCount(String id, WallpaperCountType type) async {
    final res = await _dio.post<dynamic>(
      '/wallpaper/$id/count',
      data: WallpaperCountBody(type: type.wire).toJson(),
    );
    final response = WallpaperCountResponse.fromJson(_envelope(res));
    if (response == null) throw ApiException('Malformed response');
    return response.data.count;
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
