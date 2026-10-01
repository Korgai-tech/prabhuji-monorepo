import 'package:meta/meta.dart';

import '../../../api/generated/openapi.dart';
import '../../audio/domain/audio_item.dart';

/// Domain models for the Ringtone module (TAM-68), mapped from the generated
/// api-client types (TAM-67 contract) — never raw `dynamic`. `audioUrl` is
/// `null` for free users (server-side Pro gate, TAM-67); the client NEVER
/// synthesizes a URL, so a null always routes to the paywall before Preview.

/// A single ringtone as it appears in the 3-column grid + search results.
@immutable
class RingtoneCardItem {
  const RingtoneCardItem({
    required this.id,
    required this.title,
    required this.thumbnailImageUrl,
    required this.playCount,
    required this.setCount,
    required this.deityId,
    required this.deityName,
  });

  final String id;
  final String title;
  final String thumbnailImageUrl;
  final int playCount;
  final int setCount;
  final String deityId;
  final String deityName;

  factory RingtoneCardItem.fromCard(RingtoneCard c) => RingtoneCardItem(
        id: c.id,
        title: c.title,
        thumbnailImageUrl: c.thumbnailImageUrl,
        playCount: c.playCount,
        setCount: c.setCount,
        deityId: c.deityId,
        deityName: c.deityName,
      );
}

/// One page of the grid (`GET /ringtones`) with keyset pagination.
@immutable
class RingtoneGridPage {
  const RingtoneGridPage({required this.items, required this.nextCursor});

  final List<RingtoneCardItem> items;
  final String? nextCursor;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// One page of search results (`GET /ringtones/search`) — carries the
/// server-authoritative [resultCount] for the "N results" analytics/heading.
@immutable
class RingtoneSearchPage {
  const RingtoneSearchPage({
    required this.items,
    required this.nextCursor,
    required this.resultCount,
  });

  final List<RingtoneCardItem> items;
  final String? nextCursor;
  final int resultCount;

  bool get hasMore => (nextCursor ?? '').isNotEmpty;
}

/// Full ringtone detail (`GET /ringtones/{id}`) backing the Preview screen.
/// [audioUrl] resolved + Pro-gated by the server; `null` == not entitled.
@immutable
class RingtoneDetailData {
  const RingtoneDetailData({
    required this.id,
    required this.title,
    required this.thumbnailImageUrl,
    required this.audioUrl,
    required this.playCount,
    required this.setCount,
    required this.likeCount,
    required this.shareCount,
    required this.likedByMe,
    required this.deityId,
    required this.deityName,
    this.languages = const [],
  });

  final String id;
  final String title;
  final String thumbnailImageUrl;

  /// Server-provided resolved stream URL; `null` == not entitled (free user).
  final String? audioUrl;
  final int playCount;
  final int setCount;
  final int likeCount;
  final int shareCount;
  final bool likedByMe;
  final String deityId;
  final String deityName;

  /// Languages this ringtone is available in (TAM-108). Empty = all languages.
  final List<String> languages;

  /// The image for the large Preview hero — the single ringtone thumbnail
  /// (never a broken/empty URL through AppNetworkImage).
  String get heroImageUrl => thumbnailImageUrl;

  /// `true` when the server returned a stream URL — i.e. the user is entitled.
  bool get isPlayableNow => (audioUrl ?? '').trim().isNotEmpty;

  factory RingtoneDetailData.fromDetail(RingtoneDetail d) => RingtoneDetailData(
        id: d.id,
        title: d.title,
        thumbnailImageUrl: d.thumbnailImageUrl,
        audioUrl: d.audioUrl,
        playCount: d.playCount,
        setCount: d.setCount,
        likeCount: d.likeCount,
        shareCount: d.shareCount,
        likedByMe: d.likedByMe,
        deityId: d.deityId,
        deityName: d.deityName,
        languages: d.languages,
      );

  /// Bridge to the TAM-59 audio engine (preview mode). Only ever built with a
  /// resolved URL — the Preview refuses to play a free/gated item.
  AudioItem toAudioItem() => AudioItem(
        id: id,
        title: title,
        audioUrl: audioUrl ?? '',
        subtitle: deityName,
        artworkUrl: heroImageUrl,
      );

  RingtoneDetailData copyWith({
    bool? likedByMe,
    int? likeCount,
    int? shareCount,
    int? setCount,
  }) =>
      RingtoneDetailData(
        id: id,
        title: title,
        thumbnailImageUrl: thumbnailImageUrl,
        audioUrl: audioUrl,
        playCount: playCount,
        setCount: setCount ?? this.setCount,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
        likedByMe: likedByMe ?? this.likedByMe,
        deityId: deityId,
        deityName: deityName,
        languages: languages,
      );
}

/// Indian compact-count formatting (§DP / Figma "5.8L", "1.5k", "99"):
///  * `< 1000`        → plain (`99`, `842`)
///  * `1_000..99_999` → thousands with `k` (`1k`, `8.5k`, `85.4k`)
///  * `>= 100_000`    → lakhs with `L` (`1.5L`, `10.2L`)
///
/// One decimal place, trailing `.0` trimmed. Never uses `M`/`B` (Indian
/// notation stays in lakhs/crores; PRD Phase 1 only reaches lakhs).
String formatIndianCompactCount(int value) {
  if (value < 0) return '0';
  if (value < 1000) return '$value';
  if (value < 100000) return '${_trim(value / 1000)}k';
  return '${_trim(value / 100000)}L';
}

String _trim(double v) {
  final s = v.toStringAsFixed(1);
  return s.endsWith('.0') ? s.substring(0, s.length - 2) : s;
}
