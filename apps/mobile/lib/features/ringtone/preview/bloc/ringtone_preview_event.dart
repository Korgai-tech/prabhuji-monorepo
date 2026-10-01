import 'package:meta/meta.dart';

import '../../ringtone_routes.dart';

@immutable
sealed class RingtonePreviewEvent {
  const RingtonePreviewEvent();
}

/// Open the Preview for [args] — fetch detail, enforce the server-URL gate, and
/// (when `args.autoPlay`) start preview-mode playback.
class RingtonePreviewOpened extends RingtonePreviewEvent {
  const RingtonePreviewOpened(this.args);
  final RingtonePreviewArgs args;
}

/// Optimistic like toggle + count (`ringtone_like_tapped`/`_removed`).
class RingtonePreviewLikeToggled extends RingtonePreviewEvent {
  const RingtonePreviewLikeToggled();
}

/// Native share of the deep link + title + preview image (never the audio file).
class RingtonePreviewShareRequested extends RingtonePreviewEvent {
  const RingtonePreviewShareRequested();
}

/// Playback crossed the local count threshold ([positionSeconds]) — report to
/// the server, which decides whether it counts (≥3s / ≥25%).
class RingtonePreviewPlayThresholdReached extends RingtonePreviewEvent {
  const RingtonePreviewPlayThresholdReached(this.positionSeconds);
  final double positionSeconds;
}

/// The clip played to its end (forwarded from the engine by the screen).
class RingtonePreviewPlayCompleted extends RingtonePreviewEvent {
  const RingtonePreviewPlayCompleted();
}

/// The engine could not load/play the clip — calm error, do NOT count.
class RingtonePreviewAudioErrored extends RingtonePreviewEvent {
  const RingtonePreviewAudioErrored();
}

/// The native set flow succeeded and returned a new [setCount] — reflect it.
class RingtonePreviewSetCountUpdated extends RingtonePreviewEvent {
  const RingtonePreviewSetCountUpdated(this.setCount);
  final int setCount;
}

/// Retry after a detail-fetch / audio error.
class RingtonePreviewRetryRequested extends RingtonePreviewEvent {
  const RingtonePreviewRetryRequested();
}
