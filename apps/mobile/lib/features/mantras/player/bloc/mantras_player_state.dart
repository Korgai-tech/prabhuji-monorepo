import 'package:meta/meta.dart';

import '../../data/mantras_models.dart';

@immutable
sealed class MantrasPlayerState {
  const MantrasPlayerState();
}

/// Fetching the current track's detail.
class MantrasPlayerLoading extends MantrasPlayerState {
  const MantrasPlayerLoading();
}

/// Ready — the player renders artwork / title / singer / Devanagari text /
/// like+share / controls / next-card, the counter pill shows
/// `repeatCompleted/repeatTarget`, and the engine is playing the current item.
class MantrasPlayerReady extends MantrasPlayerState {
  const MantrasPlayerReady({
    required this.detail,
    required this.queue,
    required this.index,
    required this.liked,
    required this.likeCount,
    required this.shareCount,
    required this.repeatTarget,
    required this.repeatCompleted,
    this.availableTargets = const [],
  });

  final MantraDetailData detail;
  final List<MantraAudio> queue;
  final int index;
  final bool liked;
  final int likeCount;
  final int shareCount;

  /// Selected repeat target — the user's persisted preference.
  final int repeatTarget;

  /// Full playbacks completed for the current track so far (`0..target`).
  final int repeatCompleted;

  /// The SERVER's selectable targets (`availableTargets`), in display order —
  /// what the counter sheet renders. Empty ⇒ the preference call hasn't landed
  /// or failed, and the sheet offers nothing rather than a list we made up.
  final List<int> availableTargets;

  bool get hasPrevious => index > 0;
  bool get hasNext => index < queue.length - 1;

  /// The next queue item shown on the Next-track card (null at queue end).
  MantraAudio? get nextItem => hasNext ? queue[index + 1] : null;

  MantrasPlayerReady copyWith({
    MantraDetailData? detail,
    int? index,
    bool? liked,
    int? likeCount,
    int? shareCount,
    int? repeatTarget,
    int? repeatCompleted,
    List<int>? availableTargets,
  }) =>
      MantrasPlayerReady(
        detail: detail ?? this.detail,
        queue: queue,
        index: index ?? this.index,
        liked: liked ?? this.liked,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
        repeatTarget: repeatTarget ?? this.repeatTarget,
        repeatCompleted: repeatCompleted ?? this.repeatCompleted,
        availableTargets: availableTargets ?? this.availableTargets,
      );
}

/// Server withheld the stream URL (free/entitlement-lapsed) — a calm restore
/// prompt BEFORE any playback; never play without a server-provided URL.
class MantrasPlayerGatedRestore extends MantrasPlayerState {
  const MantrasPlayerGatedRestore(this.itemId);
  final String itemId;
}

/// Audio-load / detail-fetch error → in-player retry, no auto-skip.
class MantrasPlayerErrorState extends MantrasPlayerState {
  const MantrasPlayerErrorState(this.message);
  final String message;
}
