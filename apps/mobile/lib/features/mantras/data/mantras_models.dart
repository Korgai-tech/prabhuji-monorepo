import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';
import '../../audio/domain/audio_item.dart';

/// Domain models for Mantras & Stutis (TAM-66), mapped from the generated
/// api-client types (TAM-65 contract) — never raw `dynamic`. The generated
/// `MantraSectionItemsInner` union is unusable (openapi-generator flattens the
/// `oneOf` into one all-required class whose asserts trip on any single
/// variant), so section items are branched on their `kind` discriminator in the
/// repository and mapped here from the clean per-variant models
/// (`MantraPreview` / `MantraDeityCard` / `MantraCategoryCard`).

/// The main-page section types, in server `sortOrder`. [curated] is CMS-authored
/// (TAM-160): unlimited such sections per page, each identified by its
/// [MantraSectionData.sectionId] — never by its (editor-rewritable) title.
enum MantraSectionType {
  recentlyPlayed,
  deities,
  categories,
  newlyAdded,
  curated;

  /// Wire → enum. Unknown strings return `null` (forward-compatible).
  static MantraSectionType? fromWire(String wire) {
    switch (wire) {
      case 'recently_played':
        return MantraSectionType.recentlyPlayed;
      case 'deities':
        return MantraSectionType.deities;
      case 'categories':
        return MantraSectionType.categories;
      case 'newly_added':
        return MantraSectionType.newlyAdded;
      case 'curated':
        return MantraSectionType.curated;
      default:
        return null;
    }
  }
}

/// A single mantra audio item as it appears in sections + listings + player.
/// `audioStreamUrl` is `null` for free users (server-side gate, TAM-65) — the
/// client NEVER synthesizes a URL, so a null here always routes to the paywall.
@immutable
class MantraAudio {
  const MantraAudio({
    required this.id,
    required this.title,
    required this.artworkUrl,
    required this.singerName,
    required this.audioStreamUrl,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  final String id;
  final String title;
  final String artworkUrl;
  final String? singerName;

  /// Server-provided resolved stream URL; `null` == not entitled (free user).
  final String? audioStreamUrl;
  final int likeCount;
  final int shareCount;
  final bool likedByMe;

  /// `true` when the server returned a stream URL — i.e. the user is entitled.
  bool get isPlayableNow => (audioStreamUrl ?? '').trim().isNotEmpty;

  factory MantraAudio.fromPreview(MantraPreview p) => MantraAudio(
        id: p.id,
        title: p.title,
        artworkUrl: p.artworkUrl,
        singerName: p.singerName,
        audioStreamUrl: p.audioUrl,
        likeCount: p.likeCount,
        shareCount: p.shareCount,
        likedByMe: p.likedByMe,
      );

  factory MantraAudio.fromListItem(MantraListItem i) => MantraAudio(
        id: i.id,
        title: i.title,
        artworkUrl: i.artworkUrl,
        singerName: i.singerName,
        audioStreamUrl: i.audioUrl,
        likeCount: i.likeCount,
        shareCount: i.shareCount,
        likedByMe: i.likedByMe,
      );

  factory MantraAudio.fromDetail(MantraDetail d) => MantraAudio(
        id: d.id,
        title: d.title,
        artworkUrl: d.artworkUrl,
        singerName: d.singerName,
        audioStreamUrl: d.audioUrl,
        likeCount: d.likeCount,
        shareCount: d.shareCount,
        likedByMe: d.likedByMe,
      );

  /// Bridge to the TAM-59 audio engine. Only ever built with a resolved URL —
  /// the player refuses to construct one for a free/gated item. Tagged with
  /// [AudioModule.mantras] so the shared mini-player reopens the MANTRAS
  /// full player (not the aarti one) on tap.
  AudioItem toAudioItem() => AudioItem(
        id: id,
        title: title,
        audioUrl: audioStreamUrl ?? '',
        subtitle: singerName,
        artworkUrl: artworkUrl,
        module: AudioModule.mantras,
      );

  MantraAudio copyWith({
    bool? likedByMe,
    int? likeCount,
    int? shareCount,
    String? audioStreamUrl,
  }) =>
      MantraAudio(
        id: id,
        title: title,
        artworkUrl: artworkUrl,
        singerName: singerName,
        audioStreamUrl: audioStreamUrl ?? this.audioStreamUrl,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
        likedByMe: likedByMe ?? this.likedByMe,
      );
}

/// Deity card (`MantraDeityCard`) — feeds the shared TAM-58 DeityFilterRow.
@immutable
class MantraDeity {
  const MantraDeity({
    required this.slug,
    required this.displayName,
    required this.iconUrl,
  });

  final String slug;
  final String displayName;
  final String iconUrl;

  factory MantraDeity.fromCard(MantraDeityCard c) => MantraDeity(
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

/// CMS-driven browse category (`MantraCategoryCard`).
@immutable
class MantraCategory {
  const MantraCategory({
    required this.id,
    required this.slug,
    required this.name,
    required this.imageUrl,
  });

  final String id;
  final String slug;
  final String name;
  final String? imageUrl;

  factory MantraCategory.fromCard(MantraCategoryCard c) => MantraCategory(
        id: c.id,
        slug: c.slug,
        name: c.name,
        imageUrl: c.imageUrl,
      );
}

/// One main-page section. Exactly one of [audios]/[deities]/[categories] is
/// populated per [type]; the others stay empty. [showAllEnabled] drives the
/// "Show all" action.
@immutable
class MantraSectionData {
  const MantraSectionData({
    required this.sectionId,
    required this.type,
    required this.title,
    required this.sortOrder,
    required this.showAllEnabled,
    this.audios = const [],
    this.deities = const [],
    this.categories = const [],
  });

  /// Server section id — present on EVERY section (TAM-160), and the only stable
  /// handle on a curated one (many can exist and titles are editor-rewritable).
  final String sectionId;
  final MantraSectionType type;
  final String title;
  final int sortOrder;
  final bool showAllEnabled;
  final List<MantraAudio> audios;
  final List<MantraDeity> deities;
  final List<MantraCategory> categories;

  bool get isEmpty =>
      audios.isEmpty && deities.isEmpty && categories.isEmpty;
}

/// One page of a listing (`GET /mantras/items`) with keyset pagination.
@immutable
class MantraListPage {
  const MantraListPage({required this.items, required this.nextCursor});

  final List<MantraAudio> items;
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// A resolved playlist (`GET /mantras/deities|categories/{id}/playlist`):
/// the [firstItem] the player opens on + the ordered [items] queue.
@immutable
class MantraPlaylist {
  const MantraPlaylist({
    required this.firstItem,
    required this.items,
    required this.source,
  });

  final MantraAudio? firstItem;
  final List<MantraAudio> items;
  final String source;

  bool get isEmpty => firstItem == null && items.isEmpty;
}

/// Full mantra detail (`GET /mantras/items/{id}`) backing the player — carries
/// the sacred Devanagari [mantraText] (line breaks preserved) + share payload.
@immutable
class MantraDetailData {
  const MantraDetailData({
    required this.audio,
    required this.mantraText,
    required this.transliterationText,
    required this.deepLinkUrl,
    required this.playlist,
    required this.playlistSource,
    this.deitySlug,
  });

  final MantraAudio audio;

  /// The single deity this mantra belongs to (`deities.slug` — `hanuman`,
  /// `krishna`, …), `null` when uncategorised. Carried so
  /// `mantras_repetition_completed` can be grouped by deity.
  final String? deitySlug;

  /// The sacred Devanagari mantra — rendered verbatim, line breaks preserved,
  /// never truncated (§6.8 / DP02/DP04).
  final String mantraText;
  final String? transliterationText;
  final String? deepLinkUrl;

  /// Server-authoritative playlist accompanying the detail (used to seed a
  /// deep-link / single-item open when no browsing queue was passed).
  final List<MantraAudio> playlist;
  final String playlistSource;

  factory MantraDetailData.fromResponse(MantraDetailResponseData d) =>
      MantraDetailData(
        audio: MantraAudio.fromDetail(d.item),
        mantraText: d.item.mantraText,
        transliterationText: d.item.transliterationText,
        deepLinkUrl: d.item.deepLinkUrl,
        playlist:
            d.playlist.map(MantraAudio.fromListItem).toList(growable: false),
        playlistSource: d.playlistSource.value,
        deitySlug: d.item.deity?.slug,
      );
}

/// The `sectionType` filter for a listing query.
enum MantraListSection {
  recentlyPlayed('recently_played'),
  newlyAdded('newly_added');

  const MantraListSection(this.wire);
  final String wire;
}

/// A fully-parameterized listing query — ONE screen backs Show-all /
/// recently-played / newly-added. Carries the `title` (dynamic top-nav) and
/// `sourceListType` (analytics `section_type`).
@immutable
class MantraListQuery {
  const MantraListQuery({
    required this.title,
    required this.sourceListType,
    this.categoryId,
    this.deityId,
    this.section,
    this.sectionId,
  });

  /// Dynamic top-nav title (from the source section).
  final String title;

  /// Analytics `section_type` (e.g. `recently_played`, `newly_added`).
  final String sourceListType;

  final String? categoryId;
  final String? deityId;
  final MantraListSection? section;

  /// A CURATED section's id (TAM-160) — its own primary filter, never combined
  /// with `sectionType`/`categoryId`/`deityId` (the server 400s on that).
  final String? sectionId;

  Map<String, dynamic> toQueryParameters({String? cursor, int? limit}) => {
        'categoryId': ?categoryId,
        'deityId': ?deityId,
        'sectionType': ?section?.wire,
        'sectionId': ?sectionId,
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
        'limit': ?limit,
      };
}
