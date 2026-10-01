import 'dart:io';

import 'package:dio/dio.dart';
import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';
import 'home_models.dart';

/// What went wrong, in the vocabulary the UI branches on. Home NEVER renders a
/// raw error string or a status code.
enum HomeErrorKind {
  /// No connectivity.
  offline,

  /// `401` — the session expired. TAM-61 requires a JWT on every call.
  unauthorized,

  /// Anything else (5xx, malformed envelope, …) → calm retry state.
  unknown,
}

/// Typed failure for every Home call.
@immutable
class HomeException implements Exception {
  const HomeException(this.kind, [this.message]);

  final HomeErrorKind kind;

  /// The server's `message`, when it sent a well-shaped envelope. Used for
  /// logging/analytics — never rendered verbatim.
  final String? message;

  @override
  String toString() =>
      'HomeException($kind)${message == null ? '' : ': $message'}';
}

/// Data seam for Home (TAM-62), over the TAM-61 contract mapped through the
/// generated api-client types (no `dynamic`). A deterministic
/// `FakeHomeRepository` (test support) swaps in so every UI + bloc test runs
/// offline.
///
/// Nothing here is Pro-gated: Home serves the identical banners + feed to free
/// and Pro users (PRD §5).
abstract interface class HomeRepository {
  /// `GET /home/banners` → the CMS hero carousel, in `sortOrder`.
  Future<List<HomeBannerView>> fetchBanners();

  /// `GET /home/shortcuts` → the CMS feature-shortcut grid, in `sortOrder`.
  Future<List<HomeShortcutView>> fetchShortcuts();

  /// `GET /home/feed` → one cursor-paginated page of the MIXED feed.
  Future<HomeFeedPage> fetchFeed({String? cursor, int limit});

  /// `POST /home/engagement/like` → toggle, returning the server's truth.
  Future<HomeLikeOutcome> toggleLike(String itemId);

  /// `POST /home/engagement/view` → record a view, returning the new count.
  Future<int> recordView(String itemId);

  /// `POST /home/engagement/share` → record a share, returning the new count.
  Future<int> recordShare(String itemId, {String? channel});
}

/// Dio-backed implementation over the TAM-61 contract.
class DioHomeRepository implements HomeRepository {
  DioHomeRepository(this._dio);
  final Dio _dio;

  /// The contract's own default (`limit` schema default = 10, max 30).
  static const int defaultLimit = 10;

  @override
  Future<List<HomeBannerView>> fetchBanners() async {
    try {
      final res = await _dio.get<dynamic>('/home/banners');
      final body = _envelope(res);
      final data = body['data'];
      if (data is Map) _pruneUnknownBanners(data['banners']);
      final response = HomeBannersResponse.fromJson(body);
      if (response == null) {
        throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
      }
      final banners = response.data.banners
          .map(HomeBannerView.fromBanner)
          .nonNulls
          .toList(growable: false);
      // The server already sorts, but the contract makes sortOrder explicit —
      // honour it rather than trusting array order.
      return (banners..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)))
          .toList(growable: false);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<List<HomeShortcutView>> fetchShortcuts() async {
    try {
      final res = await _dio.get<dynamic>('/home/shortcuts');
      final body = _envelope(res);
      final data = body['data'];
      if (data is Map) _pruneUnknownShortcuts(data['shortcuts']);
      final response = HomeShortcutsResponse.fromJson(body);
      if (response == null) {
        throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
      }
      final shortcuts = response.data.shortcuts
          .map(HomeShortcutView.fromShortcut)
          .nonNulls
          .toList(growable: false);
      // CMS-owned order — honour `sortOrder` explicitly rather than trusting
      // array order (the grid's order is now content, not layout).
      return (shortcuts..sort((a, b) => a.sortOrder.compareTo(b.sortOrder)))
          .toList(growable: false);
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<HomeFeedPage> fetchFeed({String? cursor, int limit = defaultLimit}) async {
    try {
      final res = await _dio.get<dynamic>(
        '/home/feed',
        queryParameters: {'cursor': ?cursor, 'limit': limit},
      );
      final body = _envelope(res);
      final data = body['data'];
      if (data is Map) _pruneUnknownFeedItems(data['items']);
      final response = HomeFeedResponse.fromJson(body);
      if (response == null) {
        throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
      }
      return HomeFeedPage(
        // SERVER ORDER IS PRESERVED VERBATIM — the feed is mixed by design and
        // the client must never group or re-sort it (#EXPORT_CRITICAL, PRD §10).
        // `sortOrder` (and the optional trending-first pass) is applied
        // server-side; re-sorting here would silently undo it.
        items: response.data.items
            .map(HomeFeedItemView.fromItem)
            .nonNulls
            .toList(growable: false),
        nextCursor: response.data.nextCursor,
      );
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<HomeLikeOutcome> toggleLike(String itemId) async {
    try {
      final res = await _dio.post<dynamic>(
        '/home/engagement/like',
        data: _engagementBody(itemId),
      );
      final response = HomeLikeResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
      }
      return HomeLikeOutcome(
        liked: response.data.liked,
        likeCount: response.data.likeCount,
      );
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<int> recordView(String itemId) async {
    try {
      final res = await _dio.post<dynamic>(
        '/home/engagement/view',
        data: _engagementBody(itemId),
      );
      final response = HomeViewResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
      }
      return response.data.viewCount;
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  @override
  Future<int> recordShare(String itemId, {String? channel}) async {
    try {
      final res = await _dio.post<dynamic>(
        '/home/engagement/share',
        data: {..._engagementBody(itemId), 'channel': ?channel},
      );
      final response = HomeShareResponse.fromJson(_envelope(res));
      if (response == null) {
        throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
      }
      return response.data.shareCount;
    } on DioException catch (e) {
      throw _mapDioError(e);
    }
  }

  /// Every Home engagement call forwards under the SINGLE `home_item` content
  /// type (TAM-61) — the server resolves the item's own module and fans the
  /// count out. The client never claims to be "a wallpaper like".
  static Map<String, dynamic> _engagementBody(String itemId) => {
        'contentType': EngagementContentType.homeItem.value,
        'contentId': itemId,
      };

  /// Make a raw `banners` payload safe for the generated parser, BEFORE it sees
  /// it. Three separate hazards, all of them "one bad row blacks out the whole
  /// carousel", all of them only fixable on the raw JSON because hand-editing
  /// generated code is forbidden.
  ///
  /// 1. **Unknown `destinationType` → drop the row.** `HomeBanner.fromJson`
  ///    does `HomeBannerDestinationTypeEnum.fromJson(json['destinationType'])!`,
  ///    so ONE unknown value throws and takes the entire banner call down — a
  ///    future CMS adding a fifth destination type would black out the carousel
  ///    for every older client. The unknown row is skipped and the rest still
  ///    render (route-allowlist rule, flutter-feed-screen.md §3).
  ///
  /// 2. **Missing `thumbnailUrl` key → backfill `null`.** The video-banner
  ///    change made `thumbnailUrl` a REQUIRED (though nullable) contract field,
  ///    and the generator asserts the key is *present* — a nullable value still
  ///    has to be there. Any payload from an API that predates video banners has
  ///    no such key, so the assert fires, `fetchBanners` throws an
  ///    `AssertionError`, and `HomeFeedBloc._loadBanners` hides the section
  ///    entirely: a new APK against a not-yet-deployed API shows NO banners at
  ///    all. (Asserts are stripped in release, so this reproduces only in
  ///    debug/profile — which is exactly where it was found.) Backfilling the
  ///    key keeps old and new servers both parseable.
  ///
  /// 3. **Unknown/absent `mediaType` → rewrite to `image`.** Same force-unwrap
  ///    trap as (1): `HomeBannerMediaTypeEnum.fromJson(json['mediaType'])!`
  ///    throws on anything that isn't `image`/`video`. [HomeBannerMediaType]
  ///    already documents "an unknown media kind degrades to image rather than
  ///    dropping the banner" — but that intent never gets a chance to run unless
  ///    the wire value is normalised here first.
  static void _pruneUnknownBanners(Object? list) {
    if (list is! List) return;
    list.removeWhere((row) =>
        row is! Map ||
        HomeDestinationType.fromWire(row['destinationType']?.toString()) ==
            null);
    for (final row in list) {
      if (row is! Map) continue;
      // (2) presence, not value — `null` is a legal thumbnailUrl.
      if (!row.containsKey('thumbnailUrl')) row['thumbnailUrl'] = null;
      // (3) degrade to the paintable default; `fromWire` agrees.
      final mediaType = row['mediaType'];
      if (mediaType != 'image' && mediaType != 'video') {
        row['mediaType'] = 'image';
      }
    }
  }

  /// Same guard for `HomeShortcut.fromJson`, whose `destinationType` enum the
  /// generator ALSO force-unwraps — one unknown value would throw and blank the
  /// entire shortcut grid on every older client. The unknown tile is dropped and
  /// its siblings still render.
  static void _pruneUnknownShortcuts(Object? list) {
    if (list is! List) return;
    list.removeWhere((row) =>
        row is! Map ||
        HomeDestinationType.fromWire(row['destinationType']?.toString()) ==
            null);
  }

  /// Same guard for `HomeFeedItem.fromJson`, whose `contentType` enum the
  /// generator also force-unwraps (`...fromJson(json['contentType'])!`) — so an
  /// unknown contentType MUST be dropped here or it takes the whole Home tab
  /// down. It is skipped and the rest of the page renders (AC / PRD §10).
  ///
  /// `badge` is NOT force-unwrapped by the generator (it is nullable, so an
  /// unknown value already decodes to `null`). The scrub below is therefore
  /// belt-and-braces, and encodes the deliberate asymmetry: an unknown *badge*
  /// must never cost us a good card — only the cosmetic pill is dropped.
  static void _pruneUnknownFeedItems(Object? list) {
    if (list is! List) return;
    list.removeWhere((row) =>
        row is! Map ||
        HomeContentType.fromWire(row['contentType']?.toString()) == null);
    for (final row in list) {
      if (row is! Map) continue;
      final badge = row['badge'];
      if (badge != null && HomeBadge.fromWire(badge.toString()) == null) {
        row['badge'] = null;
      }
    }
  }

  /// Maps transport/status failures onto the typed kinds the UI branches on.
  static HomeException _mapDioError(DioException e) {
    if (e.error is SocketException ||
        e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const HomeException(HomeErrorKind.offline);
    }
    final body = e.response?.data;
    final message = body is Map && body['message'] is String
        ? body['message'] as String
        : null;
    if (e.response?.statusCode == 401) {
      return HomeException(HomeErrorKind.unauthorized, message);
    }
    return HomeException(HomeErrorKind.unknown, message);
  }

  static Map<String, dynamic> _envelope(Response<dynamic> res) {
    final body = res.data;
    if (body is! Map<String, dynamic>) {
      throw const HomeException(HomeErrorKind.unknown, 'Malformed response');
    }
    if (body['success'] != true) {
      throw HomeException(
        HomeErrorKind.unknown,
        body['message']?.toString() ?? 'Request failed',
      );
    }
    return body;
  }
}
