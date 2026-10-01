import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../downloads/downloads_providers.dart';
import '../data/just_audio_engine.dart';
import '../domain/audio_engine.dart';
import 'audio_controller.dart';

/// The ONE app-wide [AudioEngine] (TAM-59 #EXPORT_CRITICAL: one engine = one
/// audio at a time, structurally). Overridden with a `FakeAudioEngine` in tests.
///
/// Constructing [JustAudioEngine] is cheap and channel-free — its player is
/// created lazily on first playback — so reading this provider while nothing is
/// playing (e.g. rendering an inactive mini-player) is safe under `flutter test`.
final audioEngineProvider = Provider<AudioEngine>((ref) {
  // TAM-125: the engine reads the encrypted-store seam so it can mount a
  // `DownloadedAudioSource` when the controller calls `setDownloadedSource`
  // (decrypt-on-play). Reads are lazy — `JustAudioEngine` itself doesn't
  // touch the store until a downloaded item is played.
  final engine = JustAudioEngine(
    downloadStore: ref.watch(encryptedStoreProvider),
  );
  ref.onDispose(engine.dispose);
  return engine;
});

/// The cross-cutting [AudioController] (Riverpod per TAM-56 constraint; Bloc
/// stays for module feature screens). The mini-player and every full player
/// bind to THIS single instance.
final audioControllerProvider =
    NotifierProvider<AudioController, AudioPlaybackState>(AudioController.new);
