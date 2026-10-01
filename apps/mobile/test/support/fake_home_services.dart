import 'package:flutter/widgets.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/data/home_repository.dart';
import 'package:mobile/features/home/home_banner_video_port.dart';

/// Seeded, deterministic [HomeRepository] double (TAM-62, flutter-feed-screen.md
/// decision 1). Latency + per-section failure flags let a test drive every
/// independent-failure branch without a network.
class FakeHomeRepository implements HomeRepository {
  FakeHomeRepository({
    List<HomeBannerView>? banners,
    List<HomeShortcutView>? shortcuts,
    List<HomeFeedItemView>? items,
    this.latency = Duration.zero,
    this.failBanners = false,
    this.failShortcuts = false,
    this.failFeed = false,
    this.failLike = false,
    this.failView = false,
    this.failShare = false,
    this.pageSize = 3,
  })  : _banners = banners ?? homeBannerFixtures(),
        _shortcuts = shortcuts ?? homeShortcutFixtures(),
        _items = items ?? homeFeedFixtures();

  final List<HomeBannerView> _banners;
  final List<HomeShortcutView> _shortcuts;
  final List<HomeFeedItemView> _items;

  final Duration latency;
  bool failBanners;
  bool failShortcuts;
  bool failFeed;
  bool failLike;
  bool failView;
  bool failShare;

  /// Items per cursor page — drives the infinite-scroll tests.
  final int pageSize;

  // Recorded calls.
  int bannerCalls = 0;
  int shortcutCalls = 0;
  final List<String?> feedCursors = [];
  final List<String> likeCalls = [];
  final List<String> viewCalls = [];
  final List<String> shareCalls = [];

  /// Per-item liked state, so a toggle round-trips like the server's.
  final Map<String, bool> _liked = {};

  @override
  Future<List<HomeBannerView>> fetchBanners() async {
    bannerCalls++;
    await _wait();
    if (failBanners) throw const HomeException(HomeErrorKind.unknown);
    return _banners;
  }

  @override
  Future<List<HomeShortcutView>> fetchShortcuts() async {
    shortcutCalls++;
    await _wait();
    if (failShortcuts) throw const HomeException(HomeErrorKind.unknown);
    return _shortcuts;
  }

  @override
  Future<HomeFeedPage> fetchFeed({String? cursor, int limit = 10}) async {
    feedCursors.add(cursor);
    await _wait();
    if (failFeed) throw const HomeException(HomeErrorKind.unknown);
    final start = cursor == null ? 0 : int.tryParse(cursor) ?? 0;
    final end = (start + pageSize).clamp(0, _items.length);
    return HomeFeedPage(
      items: _items.sublist(start.clamp(0, _items.length), end),
      nextCursor: end >= _items.length ? null : '$end',
    );
  }

  @override
  Future<HomeLikeOutcome> toggleLike(String itemId) async {
    likeCalls.add(itemId);
    await _wait();
    if (failLike) throw const HomeException(HomeErrorKind.unknown);
    final seed = _items.firstWhere((i) => i.id == itemId);
    final now = !(_liked[itemId] ?? seed.likedByMe);
    _liked[itemId] = now;
    return HomeLikeOutcome(
      liked: now,
      likeCount: now ? seed.likeCount + 1 : seed.likeCount,
    );
  }

  @override
  Future<int> recordView(String itemId) async {
    viewCalls.add(itemId);
    await _wait();
    if (failView) throw const HomeException(HomeErrorKind.unknown);
    return _items.firstWhere((i) => i.id == itemId).viewCount + 1;
  }

  @override
  Future<int> recordShare(String itemId, {String? channel}) async {
    shareCalls.add(itemId);
    await _wait();
    if (failShare) throw const HomeException(HomeErrorKind.unknown);
    return _items.firstWhere((i) => i.id == itemId).shareCount + 1;
  }

  Future<void> _wait() =>
      latency == Duration.zero ? Future.value() : Future.delayed(latency);
}

/// One banner per destination type — the exact set the carousel AC enumerates.
List<HomeBannerView> homeBannerFixtures() => [
      homeBanner(
        id: 'b-module',
        destinationType: HomeDestinationType.linkedModule,
        destinationValue: 'wallpaper',
        sortOrder: 0,
      ),
      homeBanner(
        id: 'b-content',
        destinationType: HomeDestinationType.contentDetail,
        destinationValue: 'ringtone',
        sortOrder: 1,
      ),
      homeBanner(
        id: 'b-paywall',
        destinationType: HomeDestinationType.proPaywall,
        destinationValue: 'prabhuji-pro-annual',
        isProFeatureDiscovery: true,
        sortOrder: 2,
      ),
      homeBanner(
        id: 'b-info',
        destinationType: HomeDestinationType.informational,
        destinationValue: null,
        sortOrder: 3,
      ),
    ];

HomeBannerView homeBanner({
  required String id,
  required HomeDestinationType destinationType,
  String? destinationValue,
  bool isProFeatureDiscovery = false,
  int sortOrder = 0,
  // Non-empty so the bloc's "drop a banner with no media" filter keeps it; the
  // WIDGET still renders AppNetworkImage's branded fallback because tests never
  // touch the network.
  String mediaUrl = 'https://cdn.example.com/banner.png',
  String? title = 'Sample banner',
  HomeBannerMediaType mediaType = HomeBannerMediaType.image,
  String? thumbnailUrl,
}) =>
    HomeBannerView(
      id: id,
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      // Mirrors the server contract: a video row always carries a still, an
      // image row never does. A caller can still pass either explicitly to
      // exercise a malformed CMS row.
      thumbnailUrl: thumbnailUrl ??
          (mediaType == HomeBannerMediaType.video
              ? 'https://cdn.example.com/banner-thumb.png'
              : null),
      destinationType: destinationType,
      destinationValue: destinationValue,
      isProFeatureDiscovery: isProFeatureDiscovery,
      sortOrder: sortOrder,
    );

/// A `video` banner fixture — `mediaUrl` is the clip, `thumbnailUrl` the still.
HomeBannerView homeVideoBanner({
  required String id,
  HomeDestinationType destinationType = HomeDestinationType.linkedModule,
  String? destinationValue = 'wallpaper',
  bool isProFeatureDiscovery = false,
  int sortOrder = 0,
  String mediaUrl = 'https://cdn.example.com/banner.mp4',
  String? thumbnailUrl = 'https://cdn.example.com/banner-thumb.png',
}) =>
    HomeBannerView(
      id: id,
      mediaType: HomeBannerMediaType.video,
      mediaUrl: mediaUrl,
      // Built directly rather than through [homeBanner] so an explicit `null`
      // stays null — the malformed "video row with no still" case.
      thumbnailUrl: thumbnailUrl,
      destinationType: destinationType,
      destinationValue: destinationValue,
      isProFeatureDiscovery: isProFeatureDiscovery,
      sortOrder: sortOrder,
    );

/// Deterministic [HomeBannerVideoPort] fake — no codec, no network. Records
/// play/pause per instance so "only the banner on screen plays" is assertable,
/// and [failInitialize] drives the thumbnail-stays-up failure branch.
class FakeHomeBannerVideoPort implements HomeBannerVideoPort {
  FakeHomeBannerVideoPort({this.failInitialize = false});

  /// Simulates an undecodable clip → the banner keeps its thumbnail.
  final bool failInitialize;

  /// Every port built during a test, so the "at most one plays" rule can be
  /// asserted across the whole carousel.
  static final List<FakeHomeBannerVideoPort> created = [];

  /// The ports that actually started. The invariant is that at most ONE is
  /// PLAYING at a time — not that `play()` was called exactly once, since a
  /// rebuild may idempotently re-issue it on the already-playing port.
  static List<FakeHomeBannerVideoPort> get playing =>
      created.where((p) => p.isPlaying).toList();

  static void resetCounters() => created.clear();

  bool _initialized = false;
  bool _error = false;
  bool isPlaying = false;
  int playCalls = 0;
  int pauseCalls = 0;
  int disposeCalls = 0;
  String? lastUrl;

  @override
  Future<void> initialize(String url) async {
    created.add(this);
    lastUrl = url;
    if (failInitialize) {
      // The real port SWALLOWS failures — it never throws, it just reports
      // hasError. The fake mirrors that exactly.
      _error = true;
      return;
    }
    _initialized = true;
  }

  @override
  Future<void> play() async {
    if (_error) return;
    playCalls++;
    isPlaying = true;
  }

  @override
  Future<void> pause() async {
    pauseCalls++;
    isPlaying = false;
  }

  @override
  bool get isInitialized => _initialized;

  @override
  bool get hasError => _error;

  @override
  Size get intrinsicSize =>
      _initialized ? const Size(1920, 1080) : Size.zero;

  @override
  Widget buildView() => _initialized
      ? const SizedBox(key: Key('fake-banner-video-view'), width: 1920, height: 1080)
      : const SizedBox.shrink();

  @override
  Future<void> dispose() async {
    disposeCalls++;
    isPlaying = false;
  }
}

/// The four Phase-1 shortcut tiles as TAM-61 serves them (`home.seed.ts`).
///
/// The labels here are the SERVER's copy, not the app's: these fixtures exist so
/// a test can prove the grid renders what it was given. `sortOrder` is what the
/// repository sorts on — [homeShortcutFixtures] is returned already sorted, the
/// same as the real `DioHomeRepository` does.
List<HomeShortcutView> homeShortcutFixtures() => [
      homeShortcut(
        key: 'aarti_bhajans',
        label: 'Aarti & Bhajans',
        destinationValue: 'aarti',
        iconKey: 'aarti',
        sortOrder: 0,
      ),
      homeShortcut(
        key: 'mantras_stutis',
        label: 'Mantras & Stutis',
        destinationValue: 'mantras',
        iconKey: 'mantras',
        sortOrder: 1,
      ),
      homeShortcut(
        key: 'set_ringtone',
        label: 'Set Ringtone',
        destinationValue: 'ringtone',
        iconKey: 'ringtone',
        sortOrder: 2,
      ),
      homeShortcut(
        key: 'set_wallpaper',
        label: 'Set Wallpaper',
        destinationValue: 'wallpaper',
        iconKey: 'wallpaper',
        sortOrder: 3,
      ),
    ];

HomeShortcutView homeShortcut({
  required String key,
  required String label,
  String? destinationValue,
  HomeDestinationType destinationType = HomeDestinationType.linkedModule,
  String? iconKey,
  String? iconUrl,
  /// TAM-174 — null by default, i.e. the CONTROL arm. Pass [themedPalette] (or
  /// any palette) to render the gradient arm.
  HomeShortcutThemeView? theme,
  int sortOrder = 0,
  String? id,
}) =>
    HomeShortcutView(
      id: id ?? 's-$key',
      key: key,
      label: label,
      destinationType: destinationType,
      destinationValue: destinationValue,
      iconKey: iconKey,
      iconUrl: iconUrl,
      theme: theme,
      sortOrder: sortOrder,
    );

/// TAM-174 — the `set_status` palette from Figma node 3760:28483, for tests
/// that need the gradient arm to have something to paint.
const themedPalette = HomeShortcutThemeView(
  backgroundFrom: Color(0xFFEAF4FF),
  backgroundFromStop: 0.1,
  backgroundTo: Color(0xFF3896E9),
  backgroundToStop: 1,
  labelColor: Color(0xFF1261A8),
);

/// The `set_wallpaper` palette — the ONLY tile whose stops fall outside `0..1`
/// (0.14734 → 1.4734). Kept as a named fixture because it is the case that
/// would throw if the gradient were ever built with `LinearGradient.stops`.
const themedPaletteOutOfRangeStops = HomeShortcutThemeView(
  backgroundFrom: Color(0xFFE8F8F5),
  backgroundFromStop: 0.14734,
  backgroundTo: Color(0xFF1DC0AE),
  backgroundToStop: 1.4734,
  labelColor: Color(0xFF08776D),
);

/// A MIXED feed covering all five content types, deliberately INTERLEAVED (not
/// grouped) so a test can prove the client preserves server order.
List<HomeFeedItemView> homeFeedFixtures() => [
      homeFeedItem(
        id: 'f-wallpaper',
        contentType: HomeContentType.wallpaper,
        module: 'wallpaper',
        ctaLabel: 'Set Wallpaper',
        ctaDestinationValue: 'ganesha-golden-static-sample',
        badge: HomeBadge.trending,
        label: 'New this week',
      ),
      homeFeedItem(
        id: 'f-aarti',
        contentType: HomeContentType.aarti,
        module: 'aarti',
        ctaLabel: 'Listen to more',
        ctaDestinationValue: 'hanuman-chalisa',
        audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
        badge: HomeBadge.suggested,
      ),
      homeFeedItem(
        id: 'f-status',
        contentType: HomeContentType.status,
        module: 'status',
        ctaLabel: 'View Status',
        ctaDestinationValue: 'krishna-murli-video-sample',
      ),
      homeFeedItem(
        id: 'f-ringtone',
        contentType: HomeContentType.ringtone,
        module: 'ringtone',
        ctaLabel: 'Set Ringtone',
        ctaDestinationValue: 'gayatri-mantra-ringtone-sample',
        audioPreviewUrl: 'https://cdn.example.com/ringtone.mp3',
      ),
      homeFeedItem(
        id: 'f-mantra',
        contentType: HomeContentType.mantra,
        module: 'mantras',
        ctaLabel: 'Play Mantra',
        ctaDestinationValue: 'ganesha-mool-mantra-sample',
        audioPreviewUrl: 'https://cdn.example.com/mantra.mp3',
      ),
      homeFeedItem(
        id: 'f-wallpaper-2',
        contentType: HomeContentType.wallpaper,
        module: 'wallpaper',
        ctaLabel: 'Set Wallpaper',
        ctaDestinationValue: 'shiva-kailash-live-sample',
      ),
    ];

/// Sentinel for "caller didn't say" — distinct from an explicit `null`, which
/// means "the CMS authored no label" and must suppress the pill.
const String _kDefaultBadgeLabel = '__default__';
const String _kDefaultCtaContentId = '__default__';

/// The copy TAM-61 seeds per badge kind. It lives HERE, in a fake, precisely
/// because the app must not know it.
String _badgeCopy(HomeBadge badge) => switch (badge) {
      HomeBadge.trending => 'TRENDING',
      HomeBadge.suggested => 'SUGGESTED',
    };

HomeFeedItemView homeFeedItem({
  required String id,
  required HomeContentType contentType,
  required String module,
  String ctaLabel = 'Open',
  String ctaDestinationType = 'content_detail',
  String ctaDestinationValue = 'sample-slug',
  // Defaults to `id`, mirroring how the server's auto-feed sync populates the
  // side-car UUID for aarti/mantra rows. Pass `ctaContentId: null` to
  // reproduce a manually-authored admin card the auto-sync never touched.
  String? ctaContentId = _kDefaultCtaContentId,
  String? headerDestinationModule,
  String? audioPreviewUrl,
  HomeBadge? badge,
  // Defaults to the CMS copy the server ships for each badge kind, so a fixture
  // reads like a real row. Pass `badgeLabel: null` WITH a `badge` to reproduce
  // the "authored badge, no label" row the server nulls both fields on — the
  // client must then draw no pill.
  String? badgeLabel = _kDefaultBadgeLabel,
  String? label,
  String title = 'Sample title',
  String? subtitle = 'Sample subtitle',
  // Empty ⇒ AppNetworkImage's branded fallback: the deterministic no-network
  // media path every widget test relies on.
  String mediaUrl = '',
  int likeCount = 24000,
  int viewCount = 140000,
  int shareCount = 120,
  bool likedByMe = false,
  double? trendingScore,
}) =>
    HomeFeedItemView(
      id: id,
      contentType: contentType,
      module: module,
      title: title,
      subtitle: subtitle,
      mediaUrl: mediaUrl,
      audioPreviewUrl: audioPreviewUrl,
      ctaLabel: ctaLabel,
      ctaDestinationType: ctaDestinationType,
      ctaDestinationValue: ctaDestinationValue,
      ctaContentId:
          ctaContentId == _kDefaultCtaContentId ? id : ctaContentId,
      headerDestinationModule: headerDestinationModule ?? module,
      label: label,
      badge: badge,
      badgeLabel: badge == null
          ? null
          : (badgeLabel == _kDefaultBadgeLabel
              ? _badgeCopy(badge)
              : badgeLabel),
      likeCount: likeCount,
      viewCount: viewCount,
      shareCount: shareCount,
      likedByMe: likedByMe,
      shareMetadata: HomeShareMetadataView(
        title: title,
        text: 'Check out $title on Prabhuji',
        deepLink: 'prabhuji://$module/$id',
        thumbnailUrl: 'https://cdn.example.com/$id-thumb.png',
      ),
    );
