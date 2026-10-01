import '../../../audio/application/audio_controller.dart';
import '../../../audio/domain/audio_item.dart';

/// Narrow transport seam the [MantrasPlayerBloc] drives, so the bloc stays free
/// of Riverpod + `just_audio` and is unit-testable with a fake. The production
/// impl delegates to the ONE shared TAM-59 [AudioController], so the full player
/// and the mini-player never diverge.
///
/// The shared engine now owns the jaap repeat loop end-to-end: the bloc passes
/// the current [repeatTarget] on [play] and updates it via [setRepeatTarget]
/// when the counter sheet fires, and the controller replays the track
/// internally until the target is met (TAM-66 §6.9). Each full playthrough
/// surfaces on [completionStream] with a per-repetition + target-reached flag
/// so the bloc still fires the analytics events (Sheet 1 rows 72 / 79) and
/// advances the queue on the target-reached case.
abstract interface class MantrasPlayerAudioPort {
  Future<void> play(AudioItem item, {int repeatTarget = 1});
  Future<void> pause();
  Future<void> resume();
  Future<void> stop();

  /// Update the engine's jaap target for the currently-playing track without
  /// restarting playback (counter sheet). Resets `repeatCompleted` to 0.
  void setRepeatTarget(int target);

  /// The id of the item the shared engine is currently on (regardless of
  /// playing/paused). `null` when idle. Used by the bloc to skip a redundant
  /// `play()` when the player screen is reopened on the SAME item that's
  /// already active — restarting would lose position and interrupt playback.
  String? get currentItemId;

  /// The full [AudioItem] the shared engine is currently on (regardless of
  /// playing/paused). `null` when idle. The bloc reads [AudioItem.source]
  /// off this to detect DOWNLOADED playback and skip the network detail
  /// fetch (which fails offline — the typical downloads use case).
  AudioItem? get currentItem;

  /// Current playhead position — needed by the analytics wiring for Sheet 1
  /// row 71 (`mantras_audio_paused`) + row 73 (`mantras_audio_like_changed`)
  /// + row 74 (`mantras_audio_share_clicked`) + row 84
  /// (`mantras_audio_app_state_changed`), all of which carry
  /// `playback_position_seconds`.
  Duration get currentPosition;

  /// Whether the shared engine is currently PLAYING (as opposed to paused,
  /// buffering, or stopped). Fed into the `playback_state` property on the
  /// app-state-change event above.
  bool get isPlaying;

  /// One event per full playthrough — the SOLE source of truth the bloc uses
  /// to fire per-repetition analytics + advance the queue when the target is
  /// met. Replaces the prior derived-state completion check on the screen,
  /// which raced against just_audio's playing/position emit order and
  /// silently missed completions.
  Stream<AudioTrackCompletion> get completionStream;
}

/// Binds the port to the shared [AudioController] (Riverpod notifier).
class ControllerMantrasPlayerAudioPort implements MantrasPlayerAudioPort {
  ControllerMantrasPlayerAudioPort(this._controller);
  final AudioController _controller;

  @override
  Future<void> play(AudioItem item, {int repeatTarget = 1}) =>
      _controller.play(
        item,
        mode: PlaybackMode.full,
        playlist: [item],
        repeatTarget: repeatTarget,
      );

  @override
  Future<void> pause() => _controller.pause();

  @override
  Future<void> resume() => _controller.resume();

  @override
  Future<void> stop() => _controller.stop();

  @override
  void setRepeatTarget(int target) => _controller.setRepeatTarget(target);

  @override
  String? get currentItemId => _controller.currentSnapshot.currentItem?.id;

  @override
  AudioItem? get currentItem => _controller.currentSnapshot.currentItem;

  @override
  Duration get currentPosition => _controller.currentSnapshot.position;

  @override
  bool get isPlaying => _controller.currentSnapshot.playing;

  @override
  Stream<AudioTrackCompletion> get completionStream =>
      _controller.completionStream;
}
