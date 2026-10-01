import 'package:meta/meta.dart';

import '../../data/aarti_models.dart';

@immutable
sealed class AartiPlayerState {
  const AartiPlayerState();
}

/// Fetching the current track's detail.
class AartiPlayerLoading extends AartiPlayerState {
  const AartiPlayerLoading();
}

/// Ready — the player renders cover/title/metadata/engagement + controls and the
/// engine is (or is about to be) playing the current item.
class AartiPlayerReady extends AartiPlayerState {
  const AartiPlayerReady({
    required this.detail,
    required this.queue,
    required this.index,
    required this.liked,
    required this.likeCount,
    required this.shareCount,
  });

  final AartiDetail detail;
  final List<AartiAudio> queue;
  final int index;
  final bool liked;
  final int likeCount;
  final int shareCount;

  bool get hasPrevious => index > 0;
  bool get hasNext => index < queue.length - 1;

  AartiPlayerReady copyWith({
    AartiDetail? detail,
    int? index,
    bool? liked,
    int? likeCount,
    int? shareCount,
  }) =>
      AartiPlayerReady(
        detail: detail ?? this.detail,
        queue: queue,
        index: index ?? this.index,
        liked: liked ?? this.liked,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
      );
}

/// Entitlement could not be verified at play time / server withheld the stream
/// URL (q3) — a calm restore/login prompt BEFORE any playback; never play
/// without a server-provided URL.
class AartiPlayerGatedRestore extends AartiPlayerState {
  const AartiPlayerGatedRestore(this.audioId);
  final String audioId;
}

/// Audio-load / detail-fetch error → in-player retry, no auto-skip (§7.9).
class AartiPlayerErrorState extends AartiPlayerState {
  const AartiPlayerErrorState(this.message);
  final String message;
}
