import 'package:meta/meta.dart';

import '../../data/ringtone_models.dart';

@immutable
sealed class RingtonePreviewState {
  const RingtonePreviewState();
}

/// Fetching the ringtone detail.
class RingtonePreviewLoading extends RingtonePreviewState {
  const RingtonePreviewLoading();
}

/// Ready — hero image / title / set-count / like·play·share metrics /
/// play-pause / Set Ringtone CTA; the engine is playing the clip (preview mode).
class RingtonePreviewReady extends RingtonePreviewState {
  const RingtonePreviewReady({
    required this.detail,
    required this.liked,
    required this.likeCount,
    required this.shareCount,
    required this.setCount,
    required this.playCount,
  });

  final RingtoneDetailData detail;
  final bool liked;
  final int likeCount;
  final int shareCount;
  final int setCount;
  final int playCount;

  RingtonePreviewReady copyWith({
    RingtoneDetailData? detail,
    bool? liked,
    int? likeCount,
    int? shareCount,
    int? setCount,
    int? playCount,
  }) =>
      RingtonePreviewReady(
        detail: detail ?? this.detail,
        liked: liked ?? this.liked,
        likeCount: likeCount ?? this.likeCount,
        shareCount: shareCount ?? this.shareCount,
        setCount: setCount ?? this.setCount,
        playCount: playCount ?? this.playCount,
      );
}

/// Server withheld the stream URL (free/entitlement-lapsed) — a calm restore
/// prompt BEFORE any playback; the client never synthesizes a URL.
class RingtonePreviewGatedRestore extends RingtonePreviewState {
  const RingtonePreviewGatedRestore(this.ringtoneId);
  final String ringtoneId;
}

/// Detail-fetch / audio error → in-place retry.
class RingtonePreviewErrorState extends RingtonePreviewState {
  const RingtonePreviewErrorState(this.message);
  final String message;
}
