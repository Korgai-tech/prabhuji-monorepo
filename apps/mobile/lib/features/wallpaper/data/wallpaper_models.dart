import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';

/// Domain models for the Wallpaper module (TAM-70), mapped from the generated
/// api-client types (TAM-69 contract) — never raw `dynamic`. Wire enums are
/// resolved through `fromWire` so the UI branches on a Dart enum, not a string.

/// Static image vs live/video wallpaper.
enum WallpaperMediaType {
  static_,
  live;

  static WallpaperMediaType fromWire(String value) =>
      value == 'live' ? WallpaperMediaType.live : WallpaperMediaType.static_;

  bool get isLive => this == WallpaperMediaType.live;
}

/// Which surface a set applies to. `both` = home + lock in one call.
enum WallpaperTarget { home, lock, both }

/// The `type` of a count increment (`POST /wallpaper/:id/count`).
enum WallpaperCountType {
  share,
  set;

  WallpaperCountBodyTypeEnum get wire => this == WallpaperCountType.share
      ? WallpaperCountBodyTypeEnum.share
      : WallpaperCountBodyTypeEnum.set_;
}

/// A single wallpaper as it appears in home rows + the listing grid + as a
/// preview page. Immutable; [copyWith] applies optimistic like/count updates.
@immutable
class WallpaperCardItem {
  const WallpaperCardItem({
    required this.id,
    required this.title,
    required this.mediaType,
    required this.thumbnailUrl,
    required this.previewImageUrl,
    required this.deitySlug,
    required this.setCount,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  final String id;
  final String title;
  final WallpaperMediaType mediaType;
  final String thumbnailUrl;
  final String previewImageUrl;

  /// The single deity this wallpaper belongs to — one deity per asset
  /// (TAM-108), nullable when uncategorised.
  final String? deitySlug;
  final int setCount;
  final int likeCount;
  final int shareCount;
  final bool likedByMe;

  bool get isLive => mediaType.isLive;

  factory WallpaperCardItem.fromCard(WallpaperCard c) => WallpaperCardItem(
        id: c.id,
        title: c.title,
        mediaType: WallpaperMediaType.fromWire(c.mediaType.value),
        thumbnailUrl: c.thumbnailUrl,
        previewImageUrl: c.previewImageUrl,
        deitySlug: c.deitySlug,
        setCount: c.setCount,
        likeCount: c.likeCount,
        shareCount: c.shareCount,
        likedByMe: c.likedByMe,
      );

  WallpaperCardItem copyWith({
    int? setCount,
    int? likeCount,
    int? shareCount,
    bool? likedByMe,
  }) =>
      WallpaperCardItem(
        id: id,
        title: title,
        mediaType: mediaType,
        thumbnailUrl: thumbnailUrl,
        previewImageUrl: previewImageUrl,
        deitySlug: deitySlug,
        setCount: setCount ?? this.setCount,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
        likedByMe: likedByMe ?? this.likedByMe,
      );
}

/// One page of the listing/preview feed (`GET /wallpaper/list`) with cursor
/// pagination.
@immutable
class WallpaperListPage {
  const WallpaperListPage({required this.items, required this.nextCursor});

  final List<WallpaperCardItem> items;
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// A CMS-configured homepage row (`GET /wallpaper/home`). [rowType] is one of
/// `top_live|new|trending|liked|custom`; the client hides a row with no items
/// (and the Liked row is simply an empty row when the user has no likes).
@immutable
class WallpaperHomeRowData {
  const WallpaperHomeRowData({
    required this.rowId,
    required this.title,
    required this.rowType,
    required this.iconKey,
    required this.items,
  });

  final String rowId;
  final String title;
  final String rowType;
  final String? iconKey;
  final List<WallpaperCardItem> items;

  bool get isLiked => rowType == 'liked';

  factory WallpaperHomeRowData.fromRow(WallpaperHomeRow r) => WallpaperHomeRowData(
        rowId: r.rowId,
        title: r.title,
        rowType: r.rowType.value,
        iconKey: r.iconKey,
        items: r.items
            .map(WallpaperCardItem.fromCard)
            .toList(growable: false),
      );
}

/// The Wallpaper Home payload — deity filters + CMS rows.
@immutable
class WallpaperHomeData {
  const WallpaperHomeData({required this.rows});

  final List<WallpaperHomeRowData> rows;

  /// Rows that should actually render: non-empty rows only. An empty row (incl.
  /// the personalized Liked row when the user has no likes) is dropped (PRD
  /// §6.2–6.4). The server order is preserved.
  List<WallpaperHomeRowData> get visibleRows =>
      rows.where((r) => r.items.isNotEmpty).toList(growable: false);
}

/// Full wallpaper detail (`GET /wallpaper/{id}`) — resolves the apply/live asset
/// URLs needed by the native set flow (never present on the list card).
@immutable
class WallpaperDetailData {
  const WallpaperDetailData({
    required this.id,
    required this.title,
    required this.mediaType,
    required this.thumbnailUrl,
    required this.previewImageUrl,
    required this.previewVideoUrl,
    required this.liveWallpaperAssetUrl,
    required this.liveWallpaperPackage,
    required this.fallbackStaticThumbnailUrl,
    this.deitySlug,
    required this.setCount,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
  });

  final String id;
  final String title;
  final WallpaperMediaType mediaType;
  final String thumbnailUrl;
  final String previewImageUrl;

  /// Muted looping video for the live preview (`null` for static).
  final String? previewVideoUrl;

  /// The live-wallpaper package/asset (Phase-1 fallback uses the static frame).
  final String? liveWallpaperAssetUrl;
  final String? liveWallpaperPackage;

  /// A representative still to fall back to when the live video is unavailable,
  /// and the frame written for the Phase-1 live set.
  final String? fallbackStaticThumbnailUrl;

  /// The single deity this wallpaper belongs to (`deities.slug`), `null` when
  /// uncategorised. Carried onto `set_wallpaper_result` so the set funnel can
  /// be grouped by deity.
  final String? deitySlug;

  final int setCount;
  final int likeCount;
  final int shareCount;
  final bool likedByMe;

  bool get isLive => mediaType.isLive;

  /// Best still for the immersive preview background.
  String get heroImageUrl =>
      previewImageUrl.trim().isNotEmpty ? previewImageUrl : thumbnailUrl;

  /// The image the STATIC native set writes — the merged preview still (never
  /// the shared thumbnail-only payload).
  String get staticApplyUrl => heroImageUrl;

  /// The still frame the Phase-1 LIVE set writes (no WallpaperService ships in
  /// Phase 1 — see set_wallpaper_service.dart). Prefers the explicit fallback.
  String get liveFrameUrl =>
      (fallbackStaticThumbnailUrl ?? '').trim().isNotEmpty
          ? fallbackStaticThumbnailUrl!
          : heroImageUrl;

  factory WallpaperDetailData.fromDetail(WallpaperDetail d) =>
      WallpaperDetailData(
        id: d.id,
        title: d.title,
        mediaType: WallpaperMediaType.fromWire(d.mediaType.value),
        thumbnailUrl: d.thumbnailUrl,
        previewImageUrl: d.previewImageUrl,
        previewVideoUrl: d.previewVideoUrl,
        liveWallpaperAssetUrl: d.liveWallpaperAssetUrl,
        liveWallpaperPackage: d.liveWallpaperPackage,
        fallbackStaticThumbnailUrl: d.fallbackStaticThumbnailUrl,
        deitySlug: d.deity?.slug,
        setCount: d.setCount,
        likeCount: d.likeCount,
        shareCount: d.shareCount,
        likedByMe: d.likedByMe,
      );
}

/// Result of a like toggle (server-authoritative, TAM-69 `/like`).
@immutable
class WallpaperLikeOutcome {
  const WallpaperLikeOutcome({required this.liked, required this.likeCount});
  final bool liked;
  final int likeCount;
}

/// Indian compact-count formatting (Figma "12.5k", "3.2k"; §6.11):
///  * `< 1000`        → plain (`99`, `842`)
///  * `1_000..99_999` → thousands with `k` (`1k`, `12.5k`)
///  * `>= 100_000`    → lakhs with `L` (`1.5L`)
/// One decimal place, trailing `.0` trimmed.
String formatWallpaperCount(int value) {
  if (value < 0) return '0';
  if (value < 1000) return '$value';
  if (value < 100000) return '${_trim(value / 1000)}k';
  return '${_trim(value / 100000)}L';
}

String _trim(double v) {
  final s = v.toStringAsFixed(1);
  return s.endsWith('.0') ? s.substring(0, s.length - 2) : s;
}
