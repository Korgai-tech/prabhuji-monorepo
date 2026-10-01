import '../../../audio/application/audio_controller.dart';
import '../../../audio/domain/audio_item.dart';

/// Narrow transport seam the [BookReaderBloc] drives, so the bloc stays free of
/// Riverpod + `just_audio` and is unit-testable with a fake.
///
/// The production impl delegates to the ONE shared TAM-59 [AudioController] in
/// `PlaybackMode.full`, so chapter narration promotes the mini-player and keeps
/// playing while the user browses — and can never overlap Aarti/Mantras/Ringtone
/// playback (one engine = one audio, structurally). No bespoke player here
/// (TAM-76 AC "Audio").
abstract interface class BookReaderAudioPort {
  /// Play [item] as a single-track full-mode playback.
  Future<void> play(AudioItem item);

  Future<void> pause();
  Future<void> resume();

  /// Stop + clear — called when the reader leaves a chapter that was narrating.
  Future<void> stop();

  /// `true` when [contentId] is the controller's active item AND it is playing,
  /// so the Listen button can render its Pause variant (node 663:4295).
  bool isPlaying(String itemId);
}

/// Binds the port to the shared [AudioController] (Riverpod notifier).
///
/// [readState] is injected rather than read off the notifier: `Notifier.state`
/// is `@protected`/`@visibleForTesting`, so the supported way to observe the
/// controller from outside is the provider itself
/// (`() => ref.read(audioControllerProvider)`).
class ControllerBookReaderAudioPort implements BookReaderAudioPort {
  ControllerBookReaderAudioPort(this._controller, {required this.readState});

  final AudioController _controller;
  final AudioPlaybackState Function() readState;

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
  bool isPlaying(String itemId) {
    final state = readState();
    return state.currentItem?.id == itemId && state.playing;
  }
}
