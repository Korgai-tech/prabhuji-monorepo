import 'package:meta/meta.dart';

import '../../aarti_routes.dart';

@immutable
sealed class AartiPlayerEvent {
  const AartiPlayerEvent();
}

/// Open the player for [args] — fetch detail, and (when `args.autoStart`) start
/// playback of the originally-tapped item with the queue restored.
class AartiPlayerOpened extends AartiPlayerEvent {
  const AartiPlayerOpened(this.args);
  final AartiPlayerArgs args;
}

/// Advance within the queue (no-op at the last item, §6.11).
class AartiPlayerNextRequested extends AartiPlayerEvent {
  const AartiPlayerNextRequested();
}

/// Go back within the queue (no-op at the first item, §6.11).
class AartiPlayerPreviousRequested extends AartiPlayerEvent {
  const AartiPlayerPreviousRequested();
}

/// The current track played to its end → auto-next, or stop at queue end (no
/// endless loop, §6.10/§6.11). Forwarded from the engine by the screen.
class AartiPlayerTrackCompleted extends AartiPlayerEvent {
  const AartiPlayerTrackCompleted();
}

/// The engine could not load/play the current source → in-player retry, NO
/// auto-skip (§7.9). Forwarded from the engine by the screen.
class AartiPlayerAudioErrored extends AartiPlayerEvent {
  const AartiPlayerAudioErrored();
}

/// Optimistic like toggle + count (fires `aarti_bhajans_like_toggled`).
class AartiPlayerLikeToggled extends AartiPlayerEvent {
  const AartiPlayerLikeToggled();
}

/// Native share of the current item's deep link (fires `aarti_bhajans_share_tapped`).
class AartiPlayerShareRequested extends AartiPlayerEvent {
  const AartiPlayerShareRequested();
}

/// Retry after an audio-load / detail-fetch error.
class AartiPlayerRetryRequested extends AartiPlayerEvent {
  const AartiPlayerRetryRequested();
}

/// App-lifecycle transition (foreground/background/terminated) forwarded
/// from the player screen's `WidgetsBindingObserver`. Wraps Sheet 1 row 62's
/// `aarti_audio_app_state_changed`. Only meaningful while a Ready state is
/// active; the bloc no-ops otherwise.
class AartiPlayerAppStateChanged extends AartiPlayerEvent {
  const AartiPlayerAppStateChanged(this.state);

  /// Wire value: `foreground` | `background` | `terminated`.
  final String state;
}
