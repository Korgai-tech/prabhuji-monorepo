// Named fields kept explicit — see the equivalent note on
// OnboardingOrchestratorBloc.
// ignore_for_file: prefer_initializing_formals

import 'package:dio/dio.dart';
// `AartiLikeResult` exists BOTH as a generated DTO (the TAM-63 like/unlike route
// now emits one) and as Aarti's hand-written domain type. The fakes implement the
// repository interface, which speaks the DOMAIN type — so hide the DTO here.
import 'package:mobile/api/api_client.dart';
import 'package:mobile/api/generated/openapi.dart' hide AartiLikeResult;
import 'package:mobile/features/aarti/data/aarti_models.dart';
import 'package:mobile/features/aarti/data/aarti_repository.dart';
import 'package:mobile/features/mantras/data/mantras_models.dart';
import 'package:mobile/features/mantras/data/mantras_repository.dart';
import 'package:mobile/features/ringtone/data/ringtone_models.dart';
import 'package:mobile/features/ringtone/data/ringtone_repository.dart';
import 'package:mobile/features/status/data/status_models.dart';
import 'package:mobile/features/status/data/status_repository.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_repository.dart';
import 'package:mobile/features/deities/data/deity_repository.dart';
import 'package:mobile/features/onboarding/data/languages_repository.dart';
import 'package:mobile/features/onboarding/profile/bloc/name_language_state.dart';
import 'package:mobile/features/onboarding/data/auth_repository.dart';
import 'package:mobile/features/onboarding/data/users_repository.dart';
import 'package:mobile/features/paywall/data/paywall_repository.dart';
import 'package:mobile/features/paywall/data/subscription_repository.dart';

/// Repository doubles used by orchestrator + router tests.
///
/// Each fake takes a canned response (or a factory for repeat-callable
/// variants) and records the number of invocations so tests can assert on
/// re-check behavior (e.g. `SubscriptionRefreshed` should re-hit the
/// subscription repo).

class FakeUsersRepository implements UsersRepository {
  FakeUsersRepository({
    MeResult? result,
    Future<MeResult> Function()? onGetMe,
    MeUser? updatedUser,
  })  : _result = result,
        _onGetMe = onGetMe,
        _updatedUser = updatedUser;

  final MeResult? _result;
  final Future<MeResult> Function()? _onGetMe;
  final MeUser? _updatedUser;

  int getMeCalls = 0;
  int updateMeCalls = 0;

  @override
  Future<MeResult> getMe() async {
    getMeCalls++;
    if (_onGetMe != null) return _onGetMe();
    return _result ?? const MeResult();
  }

  @override
  Future<MeUser> updateMe({String? name, String? selectedLanguage}) async {
    updateMeCalls++;
    if (_updatedUser != null) return _updatedUser;
    throw UnimplementedError('FakeUsersRepository.updateMe has no seeded user');
  }
}

/// The `GET /languages` catalogue double.
///
/// Defaults to the eight Phase-1 languages so existing onboarding tests read
/// naturally. This is TEST DATA, not a second source of truth — production
/// holds no client-side copy (see `languages_repository.dart`). Pass [onFetch]
/// to exercise the failure/retry path.
class FakeLanguagesRepository implements LanguagesRepository {
  FakeLanguagesRepository({
    List<LanguageOption>? languages,
    String defaultCode = 'hi',
    Future<LanguageCatalog> Function()? onFetch,
  })  : _languages = languages ?? defaultLanguages,
        _defaultCode = defaultCode,
        _onFetch = onFetch;

  static const defaultLanguages = <LanguageOption>[
    LanguageOption(code: 'hi', nativeLabel: 'हिंदी', englishLabel: 'Hindi'),
    LanguageOption(code: 'mr', nativeLabel: 'मराठी', englishLabel: 'Marathi'),
    LanguageOption(code: 'gu', nativeLabel: 'ગુજરાતી', englishLabel: 'Gujarati'),
    LanguageOption(code: 'bn', nativeLabel: 'বাংলা', englishLabel: 'Bengali'),
    LanguageOption(code: 'or', nativeLabel: 'ଓଡ଼ିଆ', englishLabel: 'Odia'),
    LanguageOption(code: 'ta', nativeLabel: 'தமிழ்', englishLabel: 'Tamil'),
    LanguageOption(code: 'te', nativeLabel: 'తెలుగు', englishLabel: 'Telugu'),
    LanguageOption(code: 'kn', nativeLabel: 'ಕನ್ನಡ', englishLabel: 'Kannada'),
  ];

  final List<LanguageOption> _languages;
  final String _defaultCode;
  final Future<LanguageCatalog> Function()? _onFetch;

  int fetchCalls = 0;

  @override
  Future<LanguageCatalog> fetchLanguages() async {
    fetchCalls++;
    if (_onFetch != null) return _onFetch();
    return LanguageCatalog(languages: _languages, defaultCode: _defaultCode);
  }
}

class FakeSubscriptionRepository implements SubscriptionRepository {
  FakeSubscriptionRepository({
    SubscriptionSnapshot? snapshot,
    Future<SubscriptionSnapshot> Function()? onGetStatus,
  })  : _snapshot = snapshot,
        _onGetStatus = onGetStatus;

  final SubscriptionSnapshot? _snapshot;
  final Future<SubscriptionSnapshot> Function()? _onGetStatus;

  int getStatusCalls = 0;

  @override
  Future<SubscriptionSnapshot> getStatus() async {
    getStatusCalls++;
    if (_onGetStatus != null) return _onGetStatus();
    if (_snapshot != null) return _snapshot;
    throw UnimplementedError('FakeSubscriptionRepository.getStatus not seeded');
  }
}

class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository();

  int sendCalls = 0;
  int verifyCalls = 0;
  int resendCalls = 0;

  @override
  Future<SendOtpResult> sendOtp({
    required String phoneCountryCode,
    required String phoneNumber,
    String? appSignatureHash,
  }) async {
    sendCalls++;
    return const SendOtpResult(
      otpSessionId: 'session-fake',
      resendAvailableAfterSeconds: 30,
      otpLength: 4,
    );
  }

  @override
  Future<VerifyOtpResult> verifyOtp({
    required String otpSessionId,
    required String otp,
  }) async {
    verifyCalls++;
    return const VerifyOtpResult(
      token: 'tok',
      userId: 'user-1',
      phoneCountryCode: '+91',
      phoneNumber: '9876543210',
      isNewUser: false,
    );
  }

  @override
  Future<ResendOtpResult> resendOtp({required String otpSessionId}) async {
    resendCalls++;
    return const ResendOtpResult(resendAvailableAfterSeconds: 30);
  }
}

class FakePaywallRepository implements PaywallRepository {
  FakePaywallRepository({this.config});
  final PaywallConfigData? config;

  int getConfigCalls = 0;

  @override
  Future<PaywallConfigData> getConfig({required String locale}) async {
    getConfigCalls++;
    if (config != null) return config!;
    throw UnimplementedError('FakePaywallRepository.getConfig not seeded');
  }
}

class FakeDeityRepository implements DeityRepository {
  FakeDeityRepository({
    List<DeityView>? deities,
    Future<List<DeityView>> Function()? onList,
  })  : _deities = deities,
        _onList = onList;

  final List<DeityView>? _deities;
  final Future<List<DeityView>> Function()? _onList;

  int listCalls = 0;
  String? lastLocale;

  @override
  Future<List<DeityView>> list({required String locale}) async {
    listCalls++;
    lastLocale = locale;
    if (_onList != null) return _onList();
    return _deities ?? const [];
  }
}

/// Convenience builder for a [DeityView] fixture.
DeityView fakeDeity(String slug, {String? name, String iconUrl = '', int order = 0}) =>
    DeityView(
      slug: slug,
      displayName: name ?? slug,
      iconUrl: iconUrl,
      sortOrder: order,
    );

// ---------------------------------------------------------------------------
// Aarti & Bhajans (TAM-64)
// ---------------------------------------------------------------------------

/// Deterministic Aarti data double. Seeds sections/listing/detail; `pro`
/// simulates the server-side stream-URL gate (a free user gets a null URL);
/// `fail*` flags exercise the error paths; `pageSize` drives keyset pagination.
class FakeAartiRepository implements AartiRepository {
  FakeAartiRepository({
    List<AartiSectionData>? sections,
    List<AartiAudio>? listing,
    this.pro = true,
    this.failMain = false,
    this.failListing = false,
    this.failDetail = false,
    this.pageSize = 2,
    this.deitySlug = 'hanuman',
  })  : _sections = sections ?? aartiSectionFixtures(),
        _listing = listing ?? aartiListingFixture();

  final List<AartiSectionData> _sections;
  final List<AartiAudio> _listing;
  bool pro;
  bool failMain;
  bool failListing;
  bool failDetail;
  final int pageSize;

  /// The deity `fetchDetail` attaches — `null` models an uncategorised
  /// recording (`aarti_audio_completed` then reports `deity_slug: null`).
  final String? deitySlug;

  int fetchMainCalls = 0;
  int fetchAudiosCalls = 0;
  int fetchDetailCalls = 0;
  int recordPlayCalls = 0;
  int toggleLikeCalls = 0;

  @override
  Future<List<AartiSectionData>> fetchMain() async {
    fetchMainCalls++;
    if (failMain) throw Exception('main failed');
    return _sections;
  }

  @override
  Future<AartiListPage> fetchAudios(
    AartiListQuery query, {
    String? cursor,
    int limit = 20,
  }) async {
    fetchAudiosCalls++;
    if (failListing) throw Exception('listing failed');
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, _listing.length);
    final items = _listing.sublist(start.clamp(0, _listing.length), end);
    final next = end < _listing.length ? end.toString() : null;
    return AartiListPage(items: items, nextCursor: next);
  }

  @override
  Future<AartiDetail> fetchDetail(String id) async {
    fetchDetailCalls++;
    if (failDetail) throw Exception('detail failed');
    final base = _listing.firstWhere(
      (a) => a.id == id,
      orElse: () => aartiAudioFixture(id),
    );
    // The Pro gate: free users never receive a stream URL.
    final audio = base.copyWith(audioStreamUrl: pro ? 'https://stream/$id.mp3' : null);
    return AartiDetail(
      audio: audio,
      deity: deitySlug == null
          ? null
          : AartiDeity(
              slug: deitySlug!,
              displayName: 'Hanuman',
              iconUrl: 'https://cdn/deity/$deitySlug.png',
            ),
    );
  }

  @override
  Future<AartiPlayResult> recordPlay(String id, {int? lastPositionSeconds}) async {
    recordPlayCalls++;
    return AartiPlayResult(
      audioId: id,
      playCount: 1,
      lastPlayedAt: DateTime.utc(2026),
      lastPositionSeconds: lastPositionSeconds,
    );
  }

  @override
  Future<AartiLikeResult> toggleLike(
    String id, {
    required bool liked,
    required int likeCount,
  }) async {
    toggleLikeCalls++;
    return AartiLikeResult(
      liked: liked,
      likeCount: liked ? likeCount + 1 : likeCount - 1,
    );
  }
}

/// A single audio fixture. `pro`-independent — the stream URL is resolved by the
/// repo's `fetchDetail`, matching the real free/Pro gate.
AartiAudio aartiAudioFixture(String id, {String? title, String? singer}) => AartiAudio(
      id: id,
      title: title ?? 'Aarti $id',
      coverImageUrl: '',
      singerName: singer ?? 'Ajay Gosh',
      composerNames: 'Ajay Gosh, Tanmay Gupta',
      isPrabhujiOriginal: true,
      audioStreamUrl: null,
      likeCount: 24987,
      shareCount: 1200,
      likedByMe: false,
    );

/// Ten-item listing fixture (drives pagination across multiple pages).
List<AartiAudio> aartiListingFixture() =>
    List.generate(10, (i) => aartiAudioFixture('a$i', title: 'Aarti ${i + 1}'));

/// The five ordered main-page sections with seeded content.
///
/// The section TITLES are parameterised because they are CMS content: the
/// screen renders `section.title` and holds no copy of its own. The defaults are
/// what the real server serves (= the Figma copy), so goldens/cross-checks stay
/// a picture of the design; behavioural tests pass their own strings to prove
/// nothing is bundled.
List<AartiSectionData> aartiSectionFixtures({
  bool withRecentlyPlayed = true,
  String recentlyPlayedTitle = 'Recently Played',
  String newlyAddedTitle = 'Newly Added',
  String mostPlayedTitle = 'Most Played on Prabhuji',
}) =>
    [
      if (withRecentlyPlayed)
        AartiSectionData(
          sectionId: 'sec-aarti-recently-played',
          type: AartiSectionType.recentlyPlayed,
          title: recentlyPlayedTitle,
          sortOrder: 0,
          audios: [aartiAudioFixture('r0'), aartiAudioFixture('r1')],
        ),
      AartiSectionData(
        sectionId: 'sec-aarti-deities',
        type: AartiSectionType.deities,
        title: 'Deities',
        sortOrder: 1,
        deities: const [
          AartiDeity(slug: 'ganesh', displayName: 'Ganesh', iconUrl: ''),
          AartiDeity(slug: 'hanuman', displayName: 'Hanuman', iconUrl: ''),
        ],
      ),
      AartiSectionData(
        sectionId: 'sec-aarti-browse-categories',
        type: AartiSectionType.browseCategories,
        title: 'Browse Categories',
        sortOrder: 2,
        categories: const [
          AartiCategory(id: 'c1', slug: 'aarti', name: 'Aarti', imageUrl: null),
          AartiCategory(id: 'c2', slug: 'stotram', name: 'Stotram', imageUrl: null),
        ],
      ),
      AartiSectionData(
        sectionId: 'sec-aarti-newly-added',
        type: AartiSectionType.newlyAdded,
        title: newlyAddedTitle,
        sortOrder: 3,
        audios: [aartiAudioFixture('n0'), aartiAudioFixture('n1')],
      ),
      AartiSectionData(
        sectionId: 'sec-aarti-most-played',
        type: AartiSectionType.mostPlayed,
        title: mostPlayedTitle,
        sortOrder: 4,
        audios: [aartiAudioFixture('m0'), aartiAudioFixture('m1')],
      ),
    ];

// ---------------------------------------------------------------------------
// Mantras & Stutis (TAM-66)
// ---------------------------------------------------------------------------

/// Deterministic Mantras data double. Seeds sections/listing/detail/playlists;
/// `pro` simulates the server-side stream-URL gate (a free user gets a null
/// URL); `fail*` flags exercise the error paths; `pageSize` drives keyset
/// pagination; `savedTarget` backs the counter preference.
class FakeMantrasRepository implements MantrasRepository {
  FakeMantrasRepository({
    List<MantraSectionData>? sections,
    List<MantraAudio>? listing,
    this.pro = true,
    this.failSections = false,
    this.failListing = false,
    this.failDetail = false,
    this.failLike = false,
    this.failCounterPreference = false,
    this.pageSize = 2,
    this.savedTarget = 7,
    this.availableTargets = const [7, 11, 21, 108, 1008],
    this.deitySlug = 'hanuman',
  })  : _sections = sections ?? mantraSectionFixtures(),
        _listing = listing ?? mantraListingFixture();

  final List<MantraSectionData> _sections;
  final List<MantraAudio> _listing;
  bool pro;
  bool failSections;
  bool failListing;
  bool failDetail;
  bool failLike;

  /// Drives the "server option list unavailable" path — the sheet must then
  /// offer nothing rather than a client-side list.
  bool failCounterPreference;

  final int pageSize;
  int savedTarget;

  /// `GET /mantras/counter-preference` → `availableTargets`. This list lives in
  /// the FAKE because the app no longer owns it.
  List<int> availableTargets;

  /// The deity `fetchDetail` attaches — `null` models an uncategorised mantra
  /// (`mantras_repetition_completed` then reports `deity_slug: null`).
  final String? deitySlug;

  int fetchSectionsCalls = 0;
  int fetchItemsCalls = 0;
  int fetchDetailCalls = 0;
  int fetchDeityPlaylistCalls = 0;
  int fetchCategoryPlaylistCalls = 0;
  int recordRecentlyPlayedCalls = 0;
  int toggleLikeCalls = 0;
  int fetchCounterCalls = 0;
  int saveCounterCalls = 0;

  @override
  Future<List<MantraSectionData>> fetchSections() async {
    fetchSectionsCalls++;
    if (failSections) throw Exception('sections failed');
    return _sections;
  }

  @override
  Future<MantraListPage> fetchItems(
    MantraListQuery query, {
    String? cursor,
    int limit = 20,
  }) async {
    fetchItemsCalls++;
    if (failListing) throw Exception('listing failed');
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, _listing.length);
    final items = _listing.sublist(start.clamp(0, _listing.length), end);
    final next = end < _listing.length ? end.toString() : null;
    return MantraListPage(items: items, nextCursor: next);
  }

  @override
  Future<MantraDetailData> fetchDetail(
    String id, {
    String? source,
    String? sourceId,
  }) async {
    fetchDetailCalls++;
    if (failDetail) throw Exception('detail failed');
    final base = _listing.firstWhere(
      (a) => a.id == id,
      orElse: () => mantraAudioFixture(id),
    );
    // The Pro gate: free users never receive a stream URL.
    final audio = base.copyWith(audioStreamUrl: pro ? 'https://stream/$id.mp3' : null);
    return MantraDetailData(
      audio: audio,
      mantraText:
          'मनोजवं मारुततुल्यवेगं,\nजितेन्द्रियं बुद्धिमतां वरिष्ठम् ।\nवातात्मजं वानरयूथमुख्यं,\nश्रीरामदूतं शरणं प्रपद्ये ॥',
      transliterationText: 'Manojavam maruta-tulya-vegam',
      deepLinkUrl: 'prabhuji://mantras/player/$id',
      playlist: _listing,
      playlistSource: source ?? 'listing',
      deitySlug: deitySlug,
    );
  }

  @override
  Future<MantraPlaylist> fetchDeityPlaylist(String deityId) async {
    fetchDeityPlaylistCalls++;
    final items = _listing.take(3).toList();
    return MantraPlaylist(
      firstItem: items.isEmpty ? null : items.first,
      items: items,
      source: 'deity',
    );
  }

  @override
  Future<MantraPlaylist> fetchCategoryPlaylist(String categoryId) async {
    fetchCategoryPlaylistCalls++;
    final items = _listing.skip(1).take(3).toList();
    return MantraPlaylist(
      firstItem: items.isEmpty ? null : items.first,
      items: items,
      source: 'category',
    );
  }

  @override
  Future<void> recordRecentlyPlayed(String id, {int? lastProgressSeconds}) async {
    recordRecentlyPlayedCalls++;
  }

  @override
  Future<MantraLikeOutcome> toggleLike(String id) async {
    toggleLikeCalls++;
    if (failLike) throw Exception('like failed');
    return const MantraLikeOutcome(liked: true, likeCount: 24988);
  }

  @override
  Future<MantraCounterPreference> fetchCounterPreference() async {
    fetchCounterCalls++;
    if (failCounterPreference) throw Exception('counter preference failed');
    return MantraCounterPreference(
      repeatTarget: savedTarget,
      availableTargets: availableTargets,
    );
  }

  @override
  Future<int> saveCounterPreference(int repeatTarget) async {
    saveCounterCalls++;
    savedTarget = repeatTarget;
    return repeatTarget;
  }
}

/// A single mantra fixture. `pro`-independent — the stream URL is resolved by
/// the repo's `fetchDetail`, matching the real free/Pro gate.
MantraAudio mantraAudioFixture(String id, {String? title, String? singer}) =>
    MantraAudio(
      id: id,
      title: title ?? 'Mantra $id',
      artworkUrl: '',
      singerName: singer ?? 'Ajay Gosh',
      audioStreamUrl: null,
      likeCount: 24987,
      shareCount: 1200,
      likedByMe: false,
    );

/// Ten-item listing fixture (drives pagination across multiple pages).
List<MantraAudio> mantraListingFixture() =>
    List.generate(10, (i) => mantraAudioFixture('m$i', title: 'Mantra ${i + 1}'));

/// The four ordered main-page sections with seeded content.
List<MantraSectionData> mantraSectionFixtures({bool withRecentlyPlayed = true}) => [
      if (withRecentlyPlayed)
        MantraSectionData(
          sectionId: 'sec-mantra-recently-played',
          type: MantraSectionType.recentlyPlayed,
          title: 'Recently Played Mantras',
          sortOrder: 0,
          showAllEnabled: true,
          audios: [mantraAudioFixture('r0'), mantraAudioFixture('r1')],
        ),
      MantraSectionData(
        sectionId: 'sec-mantra-deities',
        type: MantraSectionType.deities,
        title: 'Mantras of Deities',
        sortOrder: 1,
        showAllEnabled: false,
        deities: const [
          MantraDeity(slug: 'hanuman', displayName: 'Hanuman ji', iconUrl: ''),
          MantraDeity(slug: 'ram', displayName: 'Ram ji', iconUrl: ''),
        ],
      ),
      MantraSectionData(
        sectionId: 'sec-mantra-categories',
        type: MantraSectionType.categories,
        title: 'Browse Categories',
        sortOrder: 2,
        showAllEnabled: false,
        categories: const [
          MantraCategory(id: 'c1', slug: 'peace', name: 'Peace', imageUrl: null),
          MantraCategory(id: 'c2', slug: 'wealth', name: 'Wealth', imageUrl: null),
        ],
      ),
      MantraSectionData(
        sectionId: 'sec-mantra-newly-added',
        type: MantraSectionType.newlyAdded,
        title: 'Newly Added Mantras',
        sortOrder: 3,
        showAllEnabled: true,
        audios: [mantraAudioFixture('n0'), mantraAudioFixture('n1')],
      ),
    ];

/// Builds a matching-shape network error the way dio would surface a 500.
DioException fakeServerError() => DioException(
      requestOptions: RequestOptions(path: '/'),
      type: DioExceptionType.badResponse,
      response: Response<dynamic>(
        requestOptions: RequestOptions(path: '/'),
        statusCode: 500,
      ),
    );

// ---------------------------------------------------------------------------
// Ringtone (TAM-68)
// ---------------------------------------------------------------------------

/// Deterministic Ringtone data double. `pro` simulates the server-side
/// stream-URL gate (a free caller gets a null `audioUrl`); `fail*` flags
/// exercise the error paths; `emptyDeityId`/`emptyQuery` drive the empty
/// states; `pageSize` drives keyset pagination; `counted` drives the
/// server-side play-count decision.
class FakeRingtoneRepository implements RingtoneRepository {
  FakeRingtoneRepository({
    List<RingtoneCardItem>? grid,
    this.pro = true,
    this.failGrid = false,
    this.failSearch = false,
    this.failDetail = false,
    this.failLike = false,
    this.failShareCount = false,
    this.emptyDeityId,
    this.emptyQuery = 'zzzznone',
    this.pageSize = 12,
    this.counted = true,
    this.setCount = 1500,
  }) : _grid = grid ?? ringtoneGridFixture();

  final List<RingtoneCardItem> _grid;
  bool pro;
  bool failGrid;
  bool failSearch;
  bool failDetail;
  bool failLike;
  bool failShareCount;
  final String? emptyDeityId;
  final String emptyQuery;
  final int pageSize;
  final bool counted;
  int setCount;

  int fetchGridCalls = 0;
  int searchCalls = 0;
  int fetchDetailCalls = 0;
  int toggleLikeCalls = 0;
  int reportPlayCountCalls = 0;
  int incrementSetCountCalls = 0;
  int incrementShareCountCalls = 0;
  String? lastGridDeityId;
  String? lastSearchQuery;

  @override
  Future<RingtoneGridPage> fetchGrid({
    String? deityId,
    String? cursor,
    int limit = 30,
  }) async {
    fetchGridCalls++;
    lastGridDeityId = deityId;
    if (failGrid) throw Exception('grid failed');
    if (deityId != null && deityId == emptyDeityId) {
      return const RingtoneGridPage(items: [], nextCursor: null);
    }
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, _grid.length);
    final items = _grid.sublist(start.clamp(0, _grid.length), end);
    final next = end < _grid.length ? end.toString() : null;
    return RingtoneGridPage(items: items, nextCursor: next);
  }

  @override
  Future<RingtoneSearchPage> search(
    String query, {
    String? cursor,
    int limit = 30,
  }) async {
    searchCalls++;
    lastSearchQuery = query;
    if (failSearch) throw Exception('search failed');
    if (query == emptyQuery) {
      return const RingtoneSearchPage(items: [], nextCursor: null, resultCount: 0);
    }
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, _grid.length);
    final items = _grid.sublist(start.clamp(0, _grid.length), end);
    final next = end < _grid.length ? end.toString() : null;
    return RingtoneSearchPage(
      items: items,
      nextCursor: next,
      resultCount: _grid.length,
    );
  }

  @override
  Future<RingtoneDetailData> fetchDetail(String id) async {
    fetchDetailCalls++;
    if (failDetail) throw Exception('detail failed');
    return ringtoneDetailFixture(id, pro: pro, setCount: setCount);
  }

  @override
  Future<RingtoneLikeOutcome> toggleLike(String id) async {
    toggleLikeCalls++;
    if (failLike) throw Exception('like failed');
    return const RingtoneLikeOutcome(liked: true, likeCount: 24988);
  }

  @override
  Future<RingtonePlayCountOutcome> reportPlayCount(
    String id, {
    required String sessionToken,
    required num playbackPositionSeconds,
  }) async {
    reportPlayCountCalls++;
    return RingtonePlayCountOutcome(counted: counted, playCount: 40001);
  }

  @override
  Future<int> incrementSetCount(String id) async {
    incrementSetCountCalls++;
    setCount += 1;
    return setCount;
  }

  @override
  Future<int> incrementShareCount(String id) async {
    incrementShareCountCalls++;
    if (failShareCount) throw Exception('share-count failed');
    return 1201;
  }
}

/// A single ringtone card fixture.
RingtoneCardItem ringtoneCardFixture(String id, {String? title, int? play, int? set}) =>
    RingtoneCardItem(
      id: id,
      title: title ?? 'Gurur Brahma Mantra',
      thumbnailImageUrl: '',
      playCount: play ?? 580000,
      setCount: set ?? 150000,
      deityId: 'krishna',
      deityName: 'Shri Krishna',
    );

/// Twelve-card grid fixture (drives pagination across multiple pages).
List<RingtoneCardItem> ringtoneGridFixture() =>
    List.generate(15, (i) => ringtoneCardFixture('rt$i', title: 'Ringtone ${i + 1}'));

/// Detail fixture. `pro` resolves the Pro-gated stream URL (null for free).
RingtoneDetailData ringtoneDetailFixture(
  String id, {
  bool pro = true,
  int setCount = 1500,
}) =>
    RingtoneDetailData(
      id: id,
      title: 'Gurur Brahma Mantra',
      thumbnailImageUrl: '',
      audioUrl: pro ? 'https://stream/$id.mp3' : null,
      playCount: 40000,
      setCount: setCount,
      likeCount: 24987,
      shareCount: 1200,
      likedByMe: false,
      deityId: 'krishna',
      deityName: 'Shri Krishna',
      languages: const ['hi'],
    );

// ---------------------------------------------------------------------------
// Wallpaper (TAM-70)
// ---------------------------------------------------------------------------

/// Deterministic Wallpaper data double. `fail*` flags exercise the error paths;
/// `emptyDeityId` drives the empty-home/listing states; `likedEmpty` drops the
/// personalized Liked row (to test hide-liked-when-empty); `pageSize` drives
/// cursor pagination. The wallpaper reads are NOT server-Pro-gated (only the
/// native set gates), so there is no `pro` flag here.
class FakeWallpaperRepository implements WallpaperRepository {
  FakeWallpaperRepository({
    List<WallpaperHomeRowData>? rows,
    List<WallpaperCardItem>? listing,
    this.failHome = false,
    this.failList = false,
    this.failDetail = false,
    this.failLike = false,
    this.likedEmpty = false,
    this.emptyDeityId,
    this.pageSize = 8,
    this.detailIsLive = false,
    this.previewVideoUrl = 'https://cdn/live.mp4',
  })  : _rows = rows ?? wallpaperHomeRowsFixture(likedEmpty: likedEmpty),
        _listing = listing ?? wallpaperListingFixture();

  final List<WallpaperHomeRowData> _rows;
  final List<WallpaperCardItem> _listing;
  bool failHome;
  bool failList;
  bool failDetail;
  bool failLike;
  bool likedEmpty;
  final String? emptyDeityId;
  final int pageSize;

  /// When a fetched detail should report `live` (with a preview video URL).
  bool detailIsLive;
  String? previewVideoUrl;

  int fetchHomeCalls = 0;
  int fetchListCalls = 0;
  int fetchDetailCalls = 0;
  int toggleLikeCalls = 0;
  int incrementCalls = 0;
  String? lastHomeDeityId;
  String? lastListDeityId;
  String? lastListRowId;
  int setCount = 560678;
  int shareCount = 3200;

  @override
  Future<WallpaperHomeData> fetchHome({String? deityId}) async {
    fetchHomeCalls++;
    lastHomeDeityId = deityId;
    if (failHome) throw Exception('home failed');
    if (deityId != null && deityId == emptyDeityId) {
      return const WallpaperHomeData(rows: []);
    }
    return WallpaperHomeData(rows: _rows);
  }

  @override
  Future<WallpaperListPage> fetchList({
    String? deityId,
    String? rowId,
    String? cursor,
    int limit = 20,
  }) async {
    fetchListCalls++;
    lastListDeityId = deityId;
    lastListRowId = rowId;
    if (failList) throw Exception('list failed');
    if (deityId != null && deityId == emptyDeityId) {
      return const WallpaperListPage(items: [], nextCursor: null);
    }
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, _listing.length);
    final items = _listing.sublist(start.clamp(0, _listing.length), end);
    final next = end < _listing.length ? end.toString() : null;
    return WallpaperListPage(items: items, nextCursor: next);
  }

  @override
  Future<WallpaperDetailData> fetchDetail(String id) async {
    fetchDetailCalls++;
    if (failDetail) throw Exception('detail failed');
    final live = detailIsLive || id.startsWith('live');
    return wallpaperDetailFixture(
      id,
      live: live,
      previewVideoUrl: live ? previewVideoUrl : null,
      setCount: setCount,
    );
  }

  @override
  Future<WallpaperLikeOutcome> toggleLike(String id) async {
    toggleLikeCalls++;
    if (failLike) throw Exception('like failed');
    return const WallpaperLikeOutcome(liked: true, likeCount: 12501);
  }

  @override
  Future<int> incrementCount(String id, WallpaperCountType type) async {
    incrementCalls++;
    if (type == WallpaperCountType.set) {
      setCount += 1;
      return setCount;
    }
    shareCount += 1;
    return shareCount;
  }
}

/// A single wallpaper card fixture.
WallpaperCardItem wallpaperCardFixture(
  String id, {
  String? title,
  WallpaperMediaType mediaType = WallpaperMediaType.static_,
  int like = 12500,
  int share = 3200,
  int set = 560678,
  bool liked = false,
}) =>
    WallpaperCardItem(
      id: id,
      title: title ?? 'Durga Wallpaper',
      mediaType: mediaType,
      thumbnailUrl: '',
      previewImageUrl: '',
      deitySlug: 'durga',
      setCount: set,
      likeCount: like,
      shareCount: share,
      likedByMe: liked,
    );

/// The four Phase-1 CMS rows (Top Live, New, Trending, Liked). Top Live carries
/// live cards; the rest are static. `likedEmpty` drops the Liked row's items so
/// the bloc hides it.
///
/// Every row carries an `iconKey`, exactly as the API serves it
/// (`wallpaper.seed.ts`: live | trending | new | festival | heart). Only `live`
/// has bundled Figma art, so only that row draws a glyph — which is the DESIGN's
/// rule (the icon is visible:false on the other rows), now expressed through the
/// server's key rather than a hardcoded `rowType == 'top_live'` test.
List<WallpaperHomeRowData> wallpaperHomeRowsFixture({bool likedEmpty = false}) =>
    [
      WallpaperHomeRowData(
        rowId: 'row-top-live',
        title: 'Top Live Wallpapers',
        rowType: 'top_live',
        iconKey: 'live',
        items: [
          wallpaperCardFixture('live0',
              title: 'Shiva Lingam', mediaType: WallpaperMediaType.live),
          wallpaperCardFixture('live1',
              title: 'Krishna Radha', mediaType: WallpaperMediaType.live),
        ],
      ),
      WallpaperHomeRowData(
        rowId: 'row-new',
        title: 'New Wallpapers',
        rowType: 'new',
        iconKey: 'new',
        items: [
          wallpaperCardFixture('new0', title: 'New 1'),
          wallpaperCardFixture('new1', title: 'New 2'),
          wallpaperCardFixture('new2', title: 'New 3'),
        ],
      ),
      WallpaperHomeRowData(
        rowId: 'row-trending',
        title: 'Trending Wallpaper',
        rowType: 'trending',
        iconKey: 'trending',
        items: [
          wallpaperCardFixture('trend0', title: 'Trending 1'),
          wallpaperCardFixture('trend1', title: 'Trending 2'),
        ],
      ),
      WallpaperHomeRowData(
        rowId: 'row-liked',
        title: 'Liked Wallpaper',
        rowType: 'liked',
        iconKey: 'heart',
        items: likedEmpty
            ? const []
            : [wallpaperCardFixture('liked0', title: 'Liked 1', liked: true)],
      ),
    ];

/// A 15-item listing fixture (drives pagination across multiple pages). Every
/// 4th card is live (so the grid renders LIVE badges).
List<WallpaperCardItem> wallpaperListingFixture() => List.generate(
      15,
      (i) => wallpaperCardFixture(
        i % 4 == 0 ? 'live$i' : 'wp$i',
        title: 'Durga Ma ${i + 1}',
        mediaType:
            i % 4 == 0 ? WallpaperMediaType.live : WallpaperMediaType.static_,
      ),
    );

/// Detail fixture. `live` resolves the preview video + live asset URLs + the
/// live fallback frame; the static apply image is now the merged
/// `previewImageUrl` (default empty → `AppNetworkImage` fallback path, as every
/// widget-test consumer relies on; pass a URL to exercise
/// `staticApplyUrl`/`heroImageUrl` in a pure-Dart test).
WallpaperDetailData wallpaperDetailFixture(
  String id, {
  bool live = false,
  String? previewVideoUrl,
  String previewImageUrl = '',
  int setCount = 560678,
}) =>
    WallpaperDetailData(
      id: id,
      title: 'Durga Ma Wallpaper',
      mediaType: live ? WallpaperMediaType.live : WallpaperMediaType.static_,
      thumbnailUrl: '',
      previewImageUrl: previewImageUrl,
      previewVideoUrl: previewVideoUrl,
      liveWallpaperAssetUrl: live ? 'https://cdn/live/$id.mp4' : null,
      liveWallpaperPackage: live ? 'com.prabhuji.live' : null,
      fallbackStaticThumbnailUrl: live ? 'https://cdn/frame/$id.jpg' : null,
      setCount: setCount,
      likeCount: 12500,
      shareCount: 3200,
      likedByMe: false,
    );

// ---------------------------------------------------------------------------
// Status (TAM-72)
// ---------------------------------------------------------------------------

/// Deterministic Status data double. `fail*` flags exercise the error paths;
/// `emptyDeityId` drives the empty-filter state; `pageSize` drives cursor
/// pagination. Status reads are NOT server-Pro-gated (only the Share render
/// gates, client-side), so there is no `pro` flag here.
class FakeStatusRepository implements StatusRepository {
  FakeStatusRepository({
    List<StatusFeedItem>? feed,
    StatusProfileData? profile,
    this.failFeed = false,
    this.failProfile = false,
    this.failSave = false,
    this.failLike = false,
    this.failView = false,
    this.emptyDeityId,
    this.pageSize = 6,
  })  : _feed = feed ?? statusFeedFixture(),
        _profile = profile ?? StatusProfileData.empty;

  final List<StatusFeedItem> _feed;
  StatusProfileData _profile;

  bool failFeed;
  bool failProfile;
  bool failSave;
  bool failLike;
  bool failView;
  final String? emptyDeityId;
  final int pageSize;

  int fetchFeedCalls = 0;
  int fetchDetailCalls = 0;
  int fetchProfileCalls = 0;
  int saveProfileCalls = 0;
  int toggleLikeCalls = 0;
  int recordViewCalls = 0;
  String? lastFeedDeityId;
  String? lastFeedPinnedId;
  String? lastDetailId;
  StatusProfileData? lastSaved;
  bool failDetail = false;

  /// Every `pinnedId` value seen across `fetchFeed` calls, in order — lets
  /// tests assert "only the first page carried it, cursor pages did not".
  final List<String?> pinnedIdCalls = [];

  /// What `toggleLike` reports back (server-authoritative).
  bool likedResult = true;
  int likeCountResult = 24001;
  int viewCountResult = 140001;

  @override
  Future<StatusFeedPage> fetchFeed({
    String? deityId,
    String? cursor,
    int limit = 20,
    String? pinnedId,
  }) async {
    fetchFeedCalls++;
    lastFeedDeityId = deityId;
    lastFeedPinnedId = pinnedId;
    pinnedIdCalls.add(pinnedId);
    if (failFeed) throw Exception('feed failed');
    if (deityId != null && deityId == emptyDeityId) {
      return const StatusFeedPage(items: [], nextCursor: null);
    }
    final start = int.tryParse(cursor ?? '0') ?? 0;
    final end = (start + pageSize).clamp(0, _feed.length);
    final items = _feed.sublist(start.clamp(0, _feed.length), end);
    final next = end < _feed.length ? end.toString() : null;
    return StatusFeedPage(items: items, nextCursor: next);
  }


  @override
  Future<StatusFeedItem> fetchDetail(String id) async {
    fetchDetailCalls++;
    lastDetailId = id;
    if (failDetail) throw Exception('detail failed');
    return _feed.firstWhere(
      (item) => item.id == id,
      orElse: () => statusItemFixture(id),
    );
  }

  @override
  Future<StatusProfileData> fetchProfile() async {
    fetchProfileCalls++;
    if (failProfile) throw Exception('profile failed');
    return _profile;
  }

  @override
  Future<StatusProfileData> saveProfile(StatusProfileData profile) async {
    saveProfileCalls++;
    lastSaved = profile;
    if (failSave) throw Exception('save failed');
    // Mirrors TAM-71: the save flips the active type and echoes the row back.
    _profile = profile;
    return profile;
  }

  @override
  Future<StatusLikeOutcome> toggleLike(String id) async {
    toggleLikeCalls++;
    if (failLike) throw Exception('like failed');
    return StatusLikeOutcome(liked: likedResult, likeCount: likeCountResult);
  }

  @override
  Future<int> recordView(String id) async {
    recordViewCalls++;
    if (failView) throw Exception('view failed');
    return viewCountResult;
  }

  @override
  Future<AvatarPresignResult> presignAvatar({
    required String contentType,
    required int sizeBytes,
  }) async {
    presignAvatarCalls++;
    if (failPresignAvatar) throw Exception('presign failed');
    return const AvatarPresignResult(
      uploadUrl: 'https://s3.example/upload',
      publicUrl: 'https://cdn.example/status/user-status-profile/fixture.jpg',
      headers: {'Content-Type': 'image/jpeg'},
    );
  }

  @override
  Future<void> submitReport({
    required String statusId,
    required String type,
    required String reporterEmail,
    required String reason,
  }) async {
    submittedReports.add(
      FakeSubmittedReport(
        statusId: statusId,
        type: type,
        reporterEmail: reporterEmail,
        reason: reason,
      ),
    );
    if (failSubmitReport) throw ApiException('report failed');
  }

  int presignAvatarCalls = 0;
  bool failPresignAvatar = false;

  /// Every report this fake was asked to file, in order.
  final List<FakeSubmittedReport> submittedReports = [];
  bool failSubmitReport = false;
}

/// What `FakeStatusRepository.submitReport` recorded.
class FakeSubmittedReport {
  const FakeSubmittedReport({
    required this.statusId,
    required this.type,
    required this.reporterEmail,
    required this.reason,
  });

  final String statusId;
  final String type;
  final String reporterEmail;
  final String reason;
}

/// The seeded safe area from TAM-71 (`prisma/seeds/status.seed.ts`).
const StatusSafeArea kSeedSafeArea =
    StatusSafeArea(top: 0.1, bottom: 0.14, left: 0.05, right: 0.05);

/// A single status card fixture.
///
/// Image/thumbnail URLs default to EMPTY, which `AppNetworkImage` short-circuits
/// to its branded fallback — the deterministic media path for widget tests (a
/// real-looking URL would sit on an infinite shimmer and hang `pumpAndSettle`).
/// Pass `withUrls: true` for model tests that assert URL resolution.
StatusFeedItem statusItemFixture(
  String id, {
  String? title,
  StatusMediaType mediaType = StatusMediaType.image,
  StatusSafeArea safeArea = kSeedSafeArea,
  String? deitySlug = 'hanuman',
  int like = 24000,
  int view = 140000,
  bool liked = false,
  bool withUrls = false,
  /// `null` mimics an item synthesized from another contract (the Home feed),
  /// which carries no attributable account and therefore shows no credit chip.
  StatusCreatorInfo? creator = const StatusCreatorInfo(
    id: 'creator-1',
    name: 'Amit',
    avatarUrl: null,
  ),
}) =>
    StatusFeedItem(
      id: id,
      slug: 'status-$id',
      title: title ?? 'Status $id',
      mediaType: mediaType,
      imageUrl: mediaType == StatusMediaType.image
          ? (withUrls ? 'https://cdn/$id.jpg' : '')
          : null,
      // The video port is always faked, so a URL here never hits the network.
      videoUrl: mediaType == StatusMediaType.video ? 'https://cdn/$id.mp4' : null,
      thumbnailUrl: withUrls ? 'https://cdn/$id-thumb.jpg' : '',
      overlaySafeArea: safeArea,
      deitySlug: deitySlug,
      deityName: 'Hanuman',
      languages: const ['hi'],
      shareCaption: 'Share the blessings 🙏',
      creator: creator,
      likeCount: like,
      viewCount: view,
      likedByMe: liked,
    );

/// An 8-item feed fixture; every 3rd card is a video (image/video alternation).
List<StatusFeedItem> statusFeedFixture() => List.generate(
      8,
      (i) => statusItemFixture(
        's$i',
        title: 'Status ${i + 1}',
        mediaType: i % 3 == 2 ? StatusMediaType.video : StatusMediaType.image,
      ),
    );


/// A saved PERSONAL profile fixture (Figma: "Aditya Nath").
StatusProfileData statusPersonalProfileFixture({String? avatar}) =>
    StatusProfileData(
      activeProfileType: StatusProfileType.personal,
      personalDisplayName: 'Aditya Nath',
      avatarImageUrl: avatar,
    );

/// A saved BUSINESS profile fixture (Figma: "Srinath Builders • 9876543210").
StatusProfileData statusBusinessProfileFixture({String? avatar}) =>
    StatusProfileData(
      activeProfileType: StatusProfileType.business,
      personalDisplayName: 'Aditya Nath',
      businessName: 'Srinath Builders',
      businessDetails: 'Own your Dream Home',
      businessMobileNumber: '9876543210',
      avatarImageUrl: avatar,
    );
