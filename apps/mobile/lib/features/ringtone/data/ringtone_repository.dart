import 'package:dio/dio.dart';
import 'package:meta/meta.dart';

import '../../../api/api_client.dart';
import '../../../api/generated/openapi.dart';
import 'ringtone_models.dart';

/// Result of a like toggle (server-authoritative, TAM-67 `/like`).
@immutable
class RingtoneLikeOutcome {
  const RingtoneLikeOutcome({required this.liked, required this.likeCount});
  final bool liked;
  final int likeCount;
}

/// Result of a play-count report (server validates ≥3s / ≥25% → [counted]).
@immutable
class RingtonePlayCountOutcome {
  const RingtonePlayCountOutcome({required this.counted, required this.playCount});
  final bool counted;
  final int playCount;
}

/// Data seam for the Ringtone module (TAM-68). Concrete impl maps the TAM-67
/// contract through the generated api-client types (no `dynamic`); a
/// deterministic `FakeRingtoneRepository` (test support) swaps in so every UI
/// surface + bloc test runs offline.
abstract interface class RingtoneRepository {
  /// `GET /ringtones` → one keyset-paginated grid page, optionally filtered by
  /// [deityId] (`null` == All Gods, no filter).
  Future<RingtoneGridPage> fetchGrid({String? deityId, String? cursor, int limit});

  /// `GET /ringtones/search?q=` → one keyset-paginated search page.
  Future<RingtoneSearchPage> search(String query, {String? cursor, int limit});

  /// `GET /ringtones/{id}` → full detail incl. the (Pro-gated) stream URL.
  Future<RingtoneDetailData> fetchDetail(String id);

  /// `POST /ringtones/{id}/like` → toggles + returns the new like state.
  Future<RingtoneLikeOutcome> toggleLike(String id);

  /// `POST /ringtones/{id}/play-count` → reports playback position; the server
  /// decides whether it crosses the count threshold ([RingtonePlayCountOutcome.counted]).
  Future<RingtonePlayCountOutcome> reportPlayCount(
    String id, {
    required String sessionToken,
    required num playbackPositionSeconds,
  });

  /// `POST /ringtones/{id}/set-count` → increments the phone-ringtone set count
  /// (fired ONLY after the native channel reports a successful set).
  Future<int> incrementSetCount(String id);

  /// `POST /ringtones/{id}/share-count` → increments the share count.
  Future<int> incrementShareCount(String id);
}

/// Dio-backed implementation over the TAM-67 contract.
class DioRingtoneRepository implements RingtoneRepository {
  DioRingtoneRepository(this._dio);
  final Dio _dio;

  static const int defaultLimit = 30;

  @override
  Future<RingtoneGridPage> fetchGrid({
    String? deityId,
    String? cursor,
    int limit = defaultLimit,
  }) async {
    final res = await _dio.get<dynamic>(
      '/ringtones',
      queryParameters: {
        'deityId': ?deityId,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': limit,
      },
    );
    final body = _envelope(res);
    final response = RingtoneGridResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return RingtoneGridPage(
      items: response.data.items
          .map(RingtoneCardItem.fromCard)
          .toList(growable: false),
      nextCursor: response.data.nextCursor,
    );
  }

  @override
  Future<RingtoneSearchPage> search(
    String query, {
    String? cursor,
    int limit = defaultLimit,
  }) async {
    final res = await _dio.get<dynamic>(
      '/ringtones/search',
      queryParameters: {
        'q': query,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': limit,
      },
    );
    final body = _envelope(res);
    final response = RingtoneSearchResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return RingtoneSearchPage(
      items: response.data.items
          .map(RingtoneCardItem.fromCard)
          .toList(growable: false),
      nextCursor: response.data.nextCursor,
      resultCount: response.data.resultCount,
    );
  }

  @override
  Future<RingtoneDetailData> fetchDetail(String id) async {
    final res = await _dio.get<dynamic>('/ringtones/$id');
    final body = _envelope(res);
    final response = RingtoneDetailResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return RingtoneDetailData.fromDetail(response.data);
  }

  @override
  Future<RingtoneLikeOutcome> toggleLike(String id) async {
    final res = await _dio.post<dynamic>('/ringtones/$id/like');
    final body = _envelope(res);
    final response = RingtoneLikeResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return RingtoneLikeOutcome(
      liked: response.data.liked,
      likeCount: response.data.likeCount,
    );
  }

  @override
  Future<RingtonePlayCountOutcome> reportPlayCount(
    String id, {
    required String sessionToken,
    required num playbackPositionSeconds,
  }) async {
    final res = await _dio.post<dynamic>(
      '/ringtones/$id/play-count',
      data: {
        'sessionToken': sessionToken,
        'playbackPositionSeconds': playbackPositionSeconds,
      },
    );
    final body = _envelope(res);
    final response = RingtonePlayCountResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return RingtonePlayCountOutcome(
      counted: response.data.counted,
      playCount: response.data.playCount,
    );
  }

  @override
  Future<int> incrementSetCount(String id) async {
    final res = await _dio.post<dynamic>(
      '/ringtones/$id/set-count',
      data: {'setTarget': RingtoneSetCountBodySetTargetEnum.phoneRingtone.value},
    );
    final body = _envelope(res);
    final response = RingtoneSetCountResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return response.data.setCount;
  }

  @override
  Future<int> incrementShareCount(String id) async {
    final res = await _dio.post<dynamic>('/ringtones/$id/share-count');
    final body = _envelope(res);
    final response = RingtoneShareCountResponse.fromJson(body);
    if (response == null) throw ApiException('Malformed response');
    return response.data.shareCount;
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
