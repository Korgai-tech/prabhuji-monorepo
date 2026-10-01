import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';
import '../../audio/domain/audio_item.dart';

/// Domain models for Aarti & Bhajans (TAM-64), mapped from the generated
/// api-client types (TAM-63 contract) — never raw `dynamic`. The generated
/// `AartiSectionItemsInner` union is unusable (openapi-generator flattens the
/// `oneOf` into one all-required class whose asserts trip on any single
/// variant), so section items are branched on their `kind` discriminator in the
/// repository and mapped here from the clean per-variant models
/// (`AartiAudioPreview` / `AartiDeityCard` / `AartiCategoryCard`).

/// The main-page section types, in server `sortOrder`. [curated] is CMS-authored
/// (TAM-160): unlimited such sections per page, each identified by its
/// [AartiSectionData.sectionId] — never by its (editor-rewritable) title.
enum AartiSectionType {
  recentlyPlayed,
  deities,
  browseCategories,
  newlyAdded,
  mostPlayed,
  curated;

  /// Wire → enum. Unknown strings return `null` (forward-compatible).
  static AartiSectionType? fromWire(String wire) {
    switch (wire) {
      case 'recently_played':
        return AartiSectionType.recentlyPlayed;
      case 'deities':
        return AartiSectionType.deities;
      case 'browse_categories':
        return AartiSectionType.browseCategories;
      case 'newly_added':
        return AartiSectionType.newlyAdded;
      case 'most_played':
        return AartiSectionType.mostPlayed;
      case 'curated':
        return AartiSectionType.curated;
      default:
        return null;
    }
  }
}

/// A single Aarti audio item as it appears in sections + listings. `audioStreamUrl`
/// is `null` for free users (server-side gate, TAM-63) — the client NEVER
/// synthesizes a URL, so a null here always routes to the paywall on tap.
@immutable
class AartiAudio {
  const AartiAudio({
    required this.id,
    required this.title,
    required this.coverImageUrl,
    required this.singerName,
    required this.audioStreamUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    this.composerNames,
    this.isPrabhujiOriginal = false,
  });

  final String id;
  final String title;
  final String coverImageUrl;
  final String? singerName;
  final String? composerNames;
  final bool isPrabhujiOriginal;

  /// Server-provided resolved stream URL; `null` == not entitled (free user).
  final String? audioStreamUrl;
  final int likeCount;
  final int shareCount;
  final bool likedByMe;

  /// `true` when playback needs Pro AND the server withheld a URL — i.e. the tap
  /// must go through the paywall. A Pro user gets a non-null [audioStreamUrl].
  bool get isPlayableNow => (audioStreamUrl ?? '').trim().isNotEmpty;

  factory AartiAudio.fromPreview(AartiAudioPreview p) => AartiAudio(
        id: p.id,
        title: p.title,
        coverImageUrl: p.coverImageUrl,
        singerName: p.singerName,
        isPrabhujiOriginal: p.isPrabhujiOriginal,
        audioStreamUrl: p.audioStreamUrl,
        likeCount: p.likeCount,
        shareCount: p.shareCount,
        likedByMe: p.likedByMe,
      );

  factory AartiAudio.fromListItem(AartiAudioListItem i) => AartiAudio(
        id: i.id,
        title: i.title,
        coverImageUrl: i.coverImageUrl,
        singerName: i.singerName,
        composerNames: i.composerNames,
        isPrabhujiOriginal: i.isPrabhujiOriginal,
        audioStreamUrl: i.audioStreamUrl,
        likeCount: i.likeCount,
        shareCount: i.shareCount,
        likedByMe: i.likedByMe,
      );

  factory AartiAudio.fromDetail(AartiAudioDetail d) => AartiAudio(
        id: d.id,
        title: d.title,
        coverImageUrl: d.coverImageUrl,
        singerName: d.singerName,
        composerNames: d.composerNames,
        isPrabhujiOriginal: d.isPrabhujiOriginal,
        audioStreamUrl: d.audioStreamUrl,
        likeCount: d.likeCount,
        shareCount: d.shareCount,
        likedByMe: d.likedByMe,
      );

  /// Bridge to the TAM-59 audio engine. Only ever built with a resolved URL —
  /// the player refuses to construct one for a free/gated item. Tagged with
  /// [AudioModule.aarti] so the shared mini-player reopens the AARTI full
  /// player (not the mantras one) on tap.
  AudioItem toAudioItem() => AudioItem(
        id: id,
        title: title,
        audioUrl: audioStreamUrl ?? '',
        subtitle: singerName,
        artworkUrl: coverImageUrl,
        module: AudioModule.aarti,
      );

  AartiAudio copyWith({
    bool? likedByMe,
    int? likeCount,
    int? shareCount,
    String? audioStreamUrl,
  }) =>
      AartiAudio(
        id: id,
        title: title,
        coverImageUrl: coverImageUrl,
        singerName: singerName,
        composerNames: composerNames,
        isPrabhujiOriginal: isPrabhujiOriginal,
        audioStreamUrl: audioStreamUrl ?? this.audioStreamUrl,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
        likedByMe: likedByMe ?? this.likedByMe,
      );
}

/// Deity card (`AartiDeityCard`) — feeds the shared TAM-58 DeityFilterRow.
@immutable
class AartiDeity {
  const AartiDeity({
    required this.slug,
    required this.displayName,
    required this.iconUrl,
  });

  final String slug;
  final String displayName;
  final String iconUrl;

  factory AartiDeity.fromCard(AartiDeityCard c) => AartiDeity(
        slug: c.slug,
        displayName: c.displayName,
        iconUrl: c.iconUrl,
      );

  /// The shared DeityFilterRow consumes the generated [DeityView] shape.
  DeityView toDeityView(int sortOrder) => DeityView(
        slug: slug,
        displayName: displayName,
        iconUrl: iconUrl,
        sortOrder: sortOrder,
      );
}

/// CMS-driven browse category (`AartiCategoryCard`).
@immutable
class AartiCategory {
  const AartiCategory({
    required this.id,
    required this.slug,
    required this.name,
    required this.imageUrl,
  });

  final String id;
  final String slug;
  final String name;
  final String? imageUrl;

  factory AartiCategory.fromCard(AartiCategoryCard c) => AartiCategory(
        id: c.id,
        slug: c.slug,
        name: c.name,
        imageUrl: c.imageUrl,
      );
}

/// One main-page section. Exactly one of [audios]/[deities]/[categories] is
/// populated per [type]; the others stay empty.
@immutable
class AartiSectionData {
  const AartiSectionData({
    required this.sectionId,
    required this.type,
    required this.title,
    required this.sortOrder,
    this.audios = const [],
    this.deities = const [],
    this.categories = const [],
  });

  /// Server section id — present on EVERY section (TAM-160), and the only stable
  /// handle on a curated one (many can exist and titles are editor-rewritable).
  final String sectionId;
  final AartiSectionType type;
  final String title;
  final int sortOrder;
  final List<AartiAudio> audios;
  final List<AartiDeity> deities;
  final List<AartiCategory> categories;

  bool get isEmpty =>
      audios.isEmpty && deities.isEmpty && categories.isEmpty;
}

/// One page of a listing (`GET /aarti/audios`) with keyset pagination.
@immutable
class AartiListPage {
  const AartiListPage({required this.items, required this.nextCursor});

  final List<AartiAudio> items;
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// Full audio detail (`GET /aarti/audios/{id}`) backing the player.
@immutable
class AartiDetail {
  const AartiDetail({
    required this.audio,
    required this.deity,
  });

  final AartiAudio audio;

  /// The single deity this aarti belongs to — one deity per asset (TAM-108),
  /// nullable because a recording may be uncategorised. Shows one deity chip or
  /// nothing.
  final AartiDeity? deity;

  factory AartiDetail.fromDetail(AartiAudioDetail d) => AartiDetail(
        audio: AartiAudio.fromDetail(d),
        deity: d.deity == null ? null : AartiDeity.fromCard(d.deity!),
      );
}

/// The `sectionType` filter for a listing query.
enum AartiListSection {
  recentlyPlayed('recently_played'),
  newlyAdded('newly_added'),
  mostPlayed('most_played');

  const AartiListSection(this.wire);
  final String wire;
}

/// A fully-parameterized listing query — ONE screen backs category / deity /
/// Show-all / recently-played / newly-added / most-played (AC). Also carries the
/// `title` (dynamic top-nav) and `sourceListType` (analytics `source_list_type`).
@immutable
class AartiListQuery {
  const AartiListQuery({
    required this.title,
    required this.sourceListType,
    this.categoryId,
    this.deityId,
    this.section,
    this.sectionId,
    this.filterLabel,
  });

  /// Dynamic top-nav title (e.g. "Aarti", a deity/category name, "Newly Added").
  final String title;

  /// Analytics `source_list_type` (e.g. `category`, `deity`, `newly_added`).
  final String sourceListType;

  final String? categoryId;
  final String? deityId;

  /// The `sectionType` FILTER only. `recentlyPlayed` selects the caller's history;
  /// the other values no longer drive ordering (the flat list is a stable shuffle,
  /// server-side) — the `sort` param was removed with the user-facing sort.
  final AartiListSection? section;

  /// A CURATED section's id (TAM-160) — its own primary filter, never combined
  /// with `sectionType`/`categoryId`/`deityId` (the server 400s on that).
  final String? sectionId;

  /// Analytics `source_filter` (category slug / deity slug / curated section id).
  final String? filterLabel;

  Map<String, dynamic> toQueryParameters({String? cursor, int? limit}) => {
        'categoryId': ?categoryId,
        'deityId': ?deityId,
        'sectionType': ?section?.wire,
        'sectionId': ?sectionId,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': ?limit,
      };
}
