import 'package:meta/meta.dart';

import '../../mantras_routes.dart';

@immutable
sealed class MantrasPlayerEvent {
  const MantrasPlayerEvent();
}

/// Open the player for [args] — fetch detail, and (when `args.autoStart`) start
/// playback of the resolved item with the queue restored.
class MantrasPlayerOpened extends MantrasPlayerEvent {
  const MantrasPlayerOpened(this.args);
  final MantrasPlayerArgs args;
}

/// Advance within the queue (no-op at the last item). Resets the counter to 0.
class MantrasPlayerNextRequested extends MantrasPlayerEvent {
  const MantrasPlayerNextRequested();
}

/// Go back within the queue (no-op at the first item). Resets the counter to 0.
class MantrasPlayerPreviousRequested extends MantrasPlayerEvent {
  const MantrasPlayerPreviousRequested();
}

/// One full playthrough finished (jaap step or target-reached advance).
/// Forwarded from the screen's subscription to
/// `AudioController.completionStream` — never derived from Riverpod state
/// deltas, which raced against just_audio's playing/position emit order and
/// silently missed completions (TAM-130 mantras repeat regression).
///
/// The bloc uses [repetitionNumber] + [targetReached] to fire the per-repetition
/// analytics (Sheet 1 row 72), the target-completed analytics (row 79), and to
/// advance the queue when the target is met (§6.9). The engine handles the
/// actual jaap replay internally, so the bloc no longer calls `replay()`.
class MantrasPlayerTrackCompleted extends MantrasPlayerEvent {
  const MantrasPlayerTrackCompleted({
    required this.itemId,
    required this.repetitionNumber,
    required this.repeatTarget,
    required this.targetReached,
    required this.playheadPosition,
  });

  /// Id of the item that completed (screen filters to the mantras module
  /// before dispatching — aarti can complete while a pushed mantras route
  /// still lives underneath).
  final String itemId;

  /// 1-based repetition this completion produced (`1..repeatTarget`).
  final int repetitionNumber;

  /// Repeat target that was active for this completion.
  final int repeatTarget;

  /// `true` when [repetitionNumber] hit [repeatTarget].
  final bool targetReached;

  /// Playhead at completion — Sheet 1 row 79's `total_listen_seconds` rollup.
  final Duration playheadPosition;
}

/// The engine could not load/play the current source → in-player retry, NO
/// auto-skip. Forwarded from the engine by the screen.
class MantrasPlayerAudioErrored extends MantrasPlayerEvent {
  const MantrasPlayerAudioErrored();
}

/// Optimistic like toggle + count (fires `mantras_like_toggled`).
class MantrasPlayerLikeToggled extends MantrasPlayerEvent {
  const MantrasPlayerLikeToggled();
}

/// Native share of the current item's deep link (fires `mantras_share_tapped`).
class MantrasPlayerShareRequested extends MantrasPlayerEvent {
  const MantrasPlayerShareRequested();
}

/// The user picked a repeat target from the counter sheet — select + persist +
/// reset the completed count to 0 (§6.9).
class MantrasPlayerCounterTargetSelected extends MantrasPlayerEvent {
  const MantrasPlayerCounterTargetSelected(this.target);
  final int target;
}

/// The user picked an item from the playlist sheet — start it, reset the counter.
class MantrasPlayerPlaylistItemSelected extends MantrasPlayerEvent {
  const MantrasPlayerPlaylistItemSelected(this.index);
  final int index;
}

/// Retry after an audio-load / detail-fetch error.
class MantrasPlayerRetryRequested extends MantrasPlayerEvent {
  const MantrasPlayerRetryRequested();
}

/// App-lifecycle transition (foreground/background/terminated) forwarded from
/// the player screen's `WidgetsBindingObserver`. Wraps Sheet 1 row 84's
/// `mantras_audio_app_state_changed`. Only meaningful while a Ready state is
/// active; the bloc no-ops otherwise.
class MantrasPlayerAppStateChanged extends MantrasPlayerEvent {
  const MantrasPlayerAppStateChanged(this.state);

  /// Wire value: `foreground` | `background` | `terminated`.
  final String state;
}
