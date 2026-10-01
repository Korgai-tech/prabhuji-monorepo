import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/data/home_repository.dart';

/// [DioHomeRepository] tests, driven through a stubbed dio adapter — the real
/// generated parsers run, which is the whole point of the pruning tests below.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);
  final ResponseBody Function(RequestOptions options) handler;

  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async =>
      handler(options);
}

Dio _dioReturning(Map<String, dynamic> body, {int status = 200}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://test'))
    ..httpClientAdapter = _StubAdapter(
      (options) => ResponseBody.fromString(
        jsonEncode(body),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    );
  return dio;
}

Map<String, dynamic> _banner({
  String id = 'b1',
  String mediaType = 'image',
  String mediaUrl = 'https://cdn.example.com/b.png',
  String? thumbnailUrl,
  String destinationType = 'linked_module',
  String? destinationValue = 'wallpaper',
  int sortOrder = 0,
}) =>
    {
      'id': id,
      'mediaType': mediaType,
      'mediaUrl': mediaUrl,
      'thumbnailUrl': thumbnailUrl,
      'title': 'Banner',
      'destinationType': destinationType,
      'destinationValue': destinationValue,
      'isProFeatureDiscovery': false,
      'sortOrder': sortOrder,
    };

Map<String, dynamic> _shortcut({
  String key = 'aarti_bhajans',
  String label = 'Aarti & Bhajans',
  String destinationType = 'linked_module',
  String? destinationValue = 'aarti',
  String? iconKey = 'aarti',
  // TAM-132: the generated HomeShortcut.fromJson asserts iconUrl is present in
  // the JSON envelope (nullable → the required key still has to exist). Default
  // to null so pre-TAM-132 fixtures stay wire-compatible.
  String? iconUrl,
  int sortOrder = 0,
}) =>
    {
      'id': 's-$key',
      'key': key,
      'label': label,
      'destinationType': destinationType,
      'destinationValue': destinationValue,
      'iconKey': iconKey,
      'iconUrl': iconUrl,
      'sortOrder': sortOrder,
    };

Map<String, dynamic> _item({
  String id = 'i1',
  String contentType = 'wallpaper',
  String? badge,
  // The contract's rule: `badgeLabel` is non-null EXACTLY when `badge` is.
  String? badgeLabel,
}) =>
    {
      'id': id,
      'contentType': contentType,
      'module': 'wallpaper',
      'title': 'Item',
      'subtitle': null,
      'mediaUrl': 'https://cdn.example.com/m.png',
      'audioPreviewUrl': null,
      'ctaLabel': 'Set Wallpaper',
      'ctaDestinationType': 'content_detail',
      'ctaDestinationValue': 'slug',
      // Nullable UUID side-car — the by-id deep-link resolver for aarti/mantra
      // uses this; other content types treat it as ignored/null.
      'ctaContentId': null,
      'headerDestinationModule': 'wallpaper',
      'label': null,
      'badge': badge,
      'badgeLabel': badgeLabel,
      'likeCount': 1,
      'viewCount': 2,
      'shareCount': 3,
      'likedByMe': false,
      'shareMetadata': {
        'title': 'Item',
        'text': 'text',
        'deepLink': 'prabhuji://wallpaper/i1',
        'thumbnailUrl': null,
      },
      'trendingScore': null,
    };

void main() {
  group('unknown enum pruning (forward compatibility)', () {
    test(
        'an unknown contentType is SKIPPED — it must never crash the Home tab',
        () async {
      // The generated HomeFeedItem.fromJson force-unwraps the contentType enum,
      // so without pruning this payload throws and blacks out Home for every
      // older client. This is the regression that guard exists for.
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'items': [
            _item(id: 'known-1'),
            _item(id: 'future', contentType: 'hologram'),
            _item(id: 'known-2', contentType: 'aarti'),
          ],
          'nextCursor': null,
        },
      });

      final page = await DioHomeRepository(dio).fetchFeed();

      expect(page.items.map((i) => i.id), ['known-1', 'known-2']);
    });

    test('an unknown badge is scrubbed but the CARD still renders', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'items': [
            _item(id: 'i1', badge: 'brand_new_badge', badgeLabel: 'BRAND NEW'),
          ],
          'nextCursor': null,
        },
      });

      final page = await DioHomeRepository(dio).fetchFeed();

      // Dropping a good card over a cosmetic pill would be the wrong trade.
      expect(page.items, hasLength(1));
      expect(page.items.single.badge, isNull);
      // Its COPY drops with it: an unclassifiable badge must not paint its text
      // into a pill this build can't style.
      expect(page.items.single.badgeLabel, isNull);
      expect(page.items.single.hasBadge, isFalse);
    });

    test('a known badge carries the SERVER copy, not client copy', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          // Deliberately not 'TRENDING' — the app must render whatever the CMS
          // authored, and it no longer knows any badge copy of its own.
          'items': [_item(badge: 'trending', badgeLabel: 'HOT RIGHT NOW')],
          'nextCursor': null,
        },
      });
      final page = await DioHomeRepository(dio).fetchFeed();
      expect(page.items.single.badge, HomeBadge.trending);
      expect(page.items.single.badgeLabel, 'HOT RIGHT NOW');
      expect(page.items.single.hasBadge, isTrue);
    });

    test('a badge with no authored label renders NO pill (never invented copy)',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          // The server nulls BOTH when the CMS authored no label; this asserts
          // the client is safe even if only the label goes missing.
          'items': [_item(badge: 'trending', badgeLabel: null)],
          'nextCursor': null,
        },
      });
      final page = await DioHomeRepository(dio).fetchFeed();
      expect(page.items.single.badgeLabel, isNull);
      expect(page.items.single.hasBadge, isFalse);
    });

    test('an unknown shortcut destinationType is SKIPPED, the rest render',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'shortcuts': [
            _shortcut(key: 'ok', sortOrder: 0),
            // The generator force-unwraps this enum: without the prune, ONE such
            // row throws and blanks the whole grid on every older client.
            _shortcut(key: 'future', destinationType: 'holo_portal'),
          ],
        },
      });

      final shortcuts = await DioHomeRepository(dio).fetchShortcuts();

      expect(shortcuts.map((s) => s.key), ['ok']);
    });

    test('a malformed (non-map) shortcut row is skipped rather than throwing',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'shortcuts': ['garbage', _shortcut(key: 'ok')],
        },
      });

      final shortcuts = await DioHomeRepository(dio).fetchShortcuts();

      expect(shortcuts.map((s) => s.key), ['ok']);
    });

    test('an unknown banner destinationType is SKIPPED, the rest render',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'banners': [
            _banner(id: 'ok'),
            _banner(id: 'future', destinationType: 'holo_portal'),
            _banner(id: 'info', destinationType: 'informational', destinationValue: null),
          ],
        },
      });

      final banners = await DioHomeRepository(dio).fetchBanners();

      expect(banners.map((b) => b.id), ['ok', 'info']);
    });

    test(
        'a banner payload with NO thumbnailUrl key still renders (old API)',
        () async {
      // Backward compatibility with an API that predates video banners. The
      // generated parser asserts the REQUIRED-but-nullable `thumbnailUrl` key
      // is present; without the backfill this throws an AssertionError, the
      // bloc catches it as a banner failure, and the whole carousel disappears
      // on every debug/profile build pointed at a not-yet-deployed API.
      final legacy = _banner(id: 'legacy')..remove('thumbnailUrl');
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'banners': [legacy, _banner(id: 'current')],
        },
      });

      final banners = await DioHomeRepository(dio).fetchBanners();

      expect(banners.map((b) => b.id), ['legacy', 'current']);
      expect(banners.first.thumbnailUrl, isNull);
      // An image banner still paints its own mediaUrl — the still IS the media.
      expect(banners.first.stillUrl, 'https://cdn.example.com/b.png');
      expect(banners.first.mediaType, HomeBannerMediaType.image);
    });

    test('an unknown mediaType degrades to image — the banner still renders',
        () async {
      // The generator force-unwraps this enum too, so an unknown value would
      // otherwise take the entire carousel down instead of just this row's
      // playback path. HomeBannerMediaType documents the degrade-to-image rule;
      // this asserts it actually gets to run.
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'banners': [
            _banner(id: 'ok'),
            _banner(id: 'future', mediaType: 'lottie'),
          ],
        },
      });

      final banners = await DioHomeRepository(dio).fetchBanners();

      expect(banners.map((b) => b.id), ['ok', 'future']);
      final future = banners.last;
      expect(future.mediaType, HomeBannerMediaType.image);
      // Degraded to image ⇒ nothing to decode, and the media URL is the still.
      expect(future.playableVideoUrl, isNull);
      expect(future.stillUrl, 'https://cdn.example.com/b.png');
    });

    test('a video banner keeps its thumbnail as the still', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'banners': [
            _banner(
              id: 'v1',
              mediaType: 'video',
              mediaUrl: 'https://cdn.example.com/b.mp4',
              thumbnailUrl: 'https://cdn.example.com/b-still.png',
            ),
          ],
        },
      });

      final banner = (await DioHomeRepository(dio).fetchBanners()).single;

      expect(banner.mediaType, HomeBannerMediaType.video);
      expect(banner.stillUrl, 'https://cdn.example.com/b-still.png');
      expect(banner.playableVideoUrl, 'https://cdn.example.com/b.mp4');
    });

    test('a malformed (non-map) row is skipped rather than throwing', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'items': ['garbage', _item(id: 'ok')],
          'nextCursor': null,
        },
      });
      final page = await DioHomeRepository(dio).fetchFeed();
      expect(page.items.map((i) => i.id), ['ok']);
    });
  });

  group('feed', () {
    test('preserves SERVER order — no client-side sort or grouping', () async {
      // Deliberately interleave content types: the server owns ordering (a
      // stable id shuffle + the optional trending-first pass), so re-sorting or
      // grouping by type here would silently undo it.
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'items': [
            _item(id: 'a', contentType: 'wallpaper'),
            _item(id: 'b', contentType: 'aarti'),
            _item(id: 'c', contentType: 'wallpaper'),
          ],
          'nextCursor': 'next-page',
        },
      });

      final page = await DioHomeRepository(dio).fetchFeed();

      expect(page.items.map((i) => i.id), ['a', 'b', 'c']);
      expect(page.hasMore, isTrue);
      expect(page.nextCursor, 'next-page');
    });
  });

  group('banners', () {
    test('honours the contract sortOrder', () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'banners': [
            _banner(id: 'third', sortOrder: 3),
            _banner(id: 'first', sortOrder: 1),
            _banner(id: 'second', sortOrder: 2),
          ],
        },
      });
      final banners = await DioHomeRepository(dio).fetchBanners();
      expect(banners.map((b) => b.id), ['first', 'second', 'third']);
    });
  });

  group('shortcuts', () {
    test('maps the CMS label/destination/icon key and honours sortOrder',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          // Wire order deliberately disagrees with sortOrder.
          'shortcuts': [
            _shortcut(
              key: 'set_wallpaper',
              label: 'Set Wallpaper',
              destinationValue: 'wallpaper',
              iconKey: 'wallpaper',
              sortOrder: 3,
            ),
            _shortcut(
              key: 'aarti_bhajans',
              label: 'Aarti & Bhajans',
              destinationValue: 'aarti',
              iconKey: 'aarti',
              sortOrder: 0,
            ),
          ],
        },
      });

      final shortcuts = await DioHomeRepository(dio).fetchShortcuts();

      expect(shortcuts.map((s) => s.key), ['aarti_bhajans', 'set_wallpaper']);
      expect(
        shortcuts.map((s) => s.label),
        ['Aarti & Bhajans', 'Set Wallpaper'],
      );
      expect(shortcuts.first.destinationType, HomeDestinationType.linkedModule);
      // A stable module KEY, never a path — the client resolves it via the
      // allowlist.
      expect(shortcuts.first.destinationValue, 'aarti');
      expect(shortcuts.first.iconKey, 'aarti');
    });

    test('an informational tile is never tappable (destinationValue dropped)',
        () async {
      final dio = _dioReturning({
        'success': true,
        'message': 'ok',
        'data': {
          'shortcuts': [
            // A CMS row that disagrees with the contract: informational rows are
            // non-navigable, so the value must not survive into the domain.
            _shortcut(
              key: 'info',
              destinationType: 'informational',
              destinationValue: 'wallpaper',
            ),
          ],
        },
      });

      final shortcuts = await DioHomeRepository(dio).fetchShortcuts();

      expect(shortcuts.single.destinationValue, isNull);
    });
  });

  group('errors', () {
    test('401 → unauthorized', () async {
      final dio = _dioReturning(
        {'success': false, 'message': 'Unauthorized', 'data': null},
        status: 401,
      );
      expect(
        () => DioHomeRepository(dio).fetchFeed(),
        throwsA(isA<HomeException>()
            .having((e) => e.kind, 'kind', HomeErrorKind.unauthorized)),
      );
    });

    test('500 → unknown', () async {
      final dio = _dioReturning(
        {'success': false, 'message': 'Boom', 'data': null},
        status: 500,
      );
      expect(
        () => DioHomeRepository(dio).fetchBanners(),
        throwsA(isA<HomeException>()
            .having((e) => e.kind, 'kind', HomeErrorKind.unknown)),
      );
    });

    test('a success:false envelope on a 200 is still a failure', () async {
      final dio = _dioReturning({
        'success': false,
        'message': 'Nope',
        'data': null,
      });
      expect(
        () => DioHomeRepository(dio).fetchFeed(),
        throwsA(isA<HomeException>()),
      );
    });
  });

  group('engagement forwarders', () {
    test('like/view/share all POST under contentType home_item', () async {
      final captured = <RequestOptions>[];
      final dio = Dio(BaseOptions(baseUrl: 'http://test'))
        ..httpClientAdapter = _StubAdapter((options) {
          captured.add(options);
          final body = switch (options.path) {
            '/home/engagement/like' => {'liked': true, 'likeCount': 5},
            '/home/engagement/view' => {'viewCount': 9},
            _ => {'shareCount': 4},
          };
          return ResponseBody.fromString(
            jsonEncode({'success': true, 'message': 'ok', 'data': body}),
            200,
            headers: {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
          );
        });

      final repo = DioHomeRepository(dio);
      final like = await repo.toggleLike('item-1');
      final views = await repo.recordView('item-1');
      final shares = await repo.recordShare('item-1', channel: 'whatsapp');

      expect(like.liked, isTrue);
      expect(like.likeCount, 5);
      expect(views, 9);
      expect(shares, 4);

      expect(captured.map((c) => c.path), [
        '/home/engagement/like',
        '/home/engagement/view',
        '/home/engagement/share',
      ]);
      for (final c in captured) {
        final data = c.data as Map<String, dynamic>;
        // The forwarder never claims to be "a wallpaper like" — the server
        // resolves the item's own module and fans the count out (TAM-61).
        expect(data['contentType'], 'home_item');
        expect(data['contentId'], 'item-1');
      }
      expect((captured.last.data as Map)['channel'], 'whatsapp');
    });
  });
}
