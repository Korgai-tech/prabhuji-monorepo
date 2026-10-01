import '../../../audio/application/audio_controller.dart';
import '../../../audio/domain/audio_item.dart';

/// Narrow transport seam the [AartiPlayerBloc] drives, so the bloc stays free of
/// Riverpod + `just_audio` and is unit-testable with a fake. The production impl
/// delegates to the ONE shared TAM-59 [AudioController], so the full player and
/// the mini-player never diverge.
abstract interface class AartiPlayerAudioPort {
  /// Play [item] as a single-track full-mode playback (queue nav is driven by
  /// the bloc, not the engine's internal playlist).
  Future<void> play(AudioItem item);
  Future<void> pause();
  Future<void> resume();
  Future<void> stop();
  Future<void> seek(Duration position);

  /// The id of the item the shared engine is currently on (regardless of
  /// playing/paused). `null` when idle. Used by the bloc to skip a redundant
  /// `play()` when the player screen is reopened on the SAME item that's
  /// already active — restarting would lose position and interrupt playback
  /// for no reason.
  String? get currentItemId;

  /// The full [AudioItem] the shared engine is currently on (regardless of
  /// playing/paused). `null` when idle. The bloc reads [AudioItem.source]
  /// off this to detect DOWNLOADED playback and skip the network detail
  /// fetch (which fails offline — the typical downloads use case).
  AudioItem? get currentItem;

  /// Current playhead position — needed by the analytics wiring for
  /// `aarti_player_closed` (Sheet 1 row 59) and `aarti_audio_app_state_changed`
  /// (row 62), both of which carry `playback_position_seconds`.
  Duration get currentPosition;

  /// Whether the shared engine is currently PLAYING (as opposed to paused,
  /// buffering, or stopped). Fed into the `playback_state` property on the
  /// two analytics events above.
  bool get isPlaying;
}

/// Binds the port to the shared [AudioController] (Riverpod notifier).
class ControllerAartiPlayerAudioPort implements AartiPlayerAudioPort {
  ControllerAartiPlayerAudioPort(this._controller);
  final AudioController _controller;

  @override
  Future<void> play(AudioItem item) =>
      _controller.play(item, mode: PlaybackMode.full, playlist: [item]);

  @override
  Future<void> pause() => _controller.pause();

  @override
  Future<void> resume() => _controller.resume();

  @override
  Future<void> stop() => _controller.stop();

  @override
  Future<void> seek(Duration position) => _controller.seek(position);

  @override
  String? get currentItemId => _controller.currentSnapshot.currentItem?.id;

  @override
  AudioItem? get currentItem => _controller.currentSnapshot.currentItem;

  @override
  Duration get currentPosition => _controller.currentSnapshot.position;

  @override
  bool get isPlaying => _controller.currentSnapshot.playing;
}
