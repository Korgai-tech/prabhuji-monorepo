import '../../../audio/application/audio_controller.dart';
import '../../../audio/domain/audio_item.dart';

/// Narrow transport seam the [RingtonePreviewBloc] drives, so the bloc stays
/// free of Riverpod + `just_audio` and is unit-testable with a fake. The
/// production impl delegates to the ONE shared TAM-59 [AudioController] in
/// **preview mode** — single clip, one at a time, NO mini-player promotion, NO
/// background playback (§6). Starting the preview stops any other playback
/// structurally (one engine).
abstract interface class RingtonePreviewAudioPort {
  /// Play [item] as a non-promoting preview (never surfaces the mini-player).
  Future<void> play(AudioItem item);
  Future<void> pause();
  Future<void> resume();

  /// Stop + release (on back/exit) — no lingering audio.
  Future<void> stop();
}

/// Binds the port to the shared [AudioController] (Riverpod notifier), forcing
/// [PlaybackMode.preview] so the ringtone clip never promotes the mini-player.
class ControllerRingtonePreviewAudioPort implements RingtonePreviewAudioPort {
  ControllerRingtonePreviewAudioPort(this._controller);
  final AudioController _controller;

  @override
  Future<void> play(AudioItem item) =>
      _controller.play(item, mode: PlaybackMode.preview, playlist: [item]);

  @override
  Future<void> pause() => _controller.pause();

  @override
  Future<void> resume() => _controller.resume();

  @override
  Future<void> stop() => _controller.stop();
}
