// Public seam — an initializing formal on `_downloadStore` would violate
// the file's existing named-param convention.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';

import 'package:just_audio/just_audio.dart' as ja;

import '../../downloads/data/encrypted_store.dart';
import '../domain/audio_engine.dart';
import 'downloaded_audio_source.dart';

/// The real [AudioEngine] over a SINGLE `just_audio` player (TAM-59
/// #PATH_DECISION).
///
/// `just_audio` covers streaming, seek, and completion callbacks — everything
/// the repeat counter and playlist autoplay need — with none of the
/// foreground-service/notification setup `audio_service` requires. Background +
/// lockscreen controls are Phase 2 (Aarti q2); when they land, `audio_service`
/// wraps this class behind the unchanged [AudioEngine] interface.
///
/// The underlying [ja.AudioPlayer] is created LAZILY on first use so that
/// merely constructing this engine (e.g. when the mini-player provider is read
/// in a widget test with no active playback) never touches a platform channel.
class JustAudioEngine implements AudioEngine {
  JustAudioEngine({EncryptedStore? downloadStore}) : _downloadStore = downloadStore;

  /// Injected at construction from the composition root — see
  /// `apps/mobile/lib/features/audio/application/audio_providers.dart`.
  /// Nullable so the engine still boots in test harnesses that never touch
  /// downloads (which pass `null` and rely on `setUrl` alone).
  final EncryptedStore? _downloadStore;

  ja.AudioPlayer? _player;

  ja.AudioPlayer get _p => _player ??= ja.AudioPlayer();

  @override
  Future<void> setUrl(String url) async {
    try {
      await _p.setUrl(url);
    } on ja.PlayerInterruptedException {
      // just_audio throws this when a newer setUrl (or a dispose) supersedes
      // this one — e.g. the user taps a second track while the first is
      // still loading, or track-complete auto-advance races a manual tap.
      // It is control flow, not an error: the newer load is already in
      // flight and will drive the player. Swallow so it doesn't surface as
      // "Unhandled Exception: Loading interrupted / Connection aborted"
      // (platform `abort` is mapped to the same exception type by
      // just_audio's _convertException).
    }
  }

  @override
  Future<void> setDownloadedSource({
    required String contentId,
    required String mimeType,
    required int sourceLength,
  }) async {
    final store = _downloadStore;
    if (store == null) {
      throw StateError(
        'JustAudioEngine was constructed without an EncryptedStore — '
        'downloaded playback is unavailable. Wire `downloadStore:` in '
        'audio_providers.dart before calling setDownloadedSource().',
      );
    }
    try {
      await _p.setAudioSource(
        DownloadedAudioSource(
          contentId: contentId,
          mimeType: mimeType,
          sourceLength: sourceLength,
          store: store,
        ),
      );
    } on ja.PlayerInterruptedException {
      // Same "control-flow, not error" swallow as setUrl above — a newer
      // source is already in flight.
    }
  }

  @override
  Future<void> play() async {
    // just_audio's `AudioPlayer.play()` returns a Future that resolves when
    // playback STOPS (ends / is paused / is stopped) — NOT when it starts. The
    // [AudioEngine] contract expects `play()` to complete once playback is
    // ISSUED, so callers ([AudioController._startCurrentSource], the bloc's
    // `_audioPort.play(...)`) can move on and rebuild the UI. Awaiting the raw
    // future froze the caller until the track finished — the audio played but
    // the "loading" state never cleared. Drop the completion signal on the
    // floor here; state transitions flow through `playingStream` /
    // `processingStateStream`, which the controller already subscribes to.
    unawaited(_p.play());
  }

  @override
  Future<void> pause() => _p.pause();

  @override
  Future<void> stop() => _p.stop();

  @override
  Future<void> seek(Duration position) => _p.seek(position);

  @override
  Future<void> dispose() async {
    await _player?.dispose();
    _player = null;
  }

  @override
  Stream<Duration> get positionStream => _p.positionStream;

  @override
  Stream<Duration?> get durationStream => _p.durationStream;

  @override
  Stream<bool> get playingStream => _p.playingStream;

  @override
  Stream<EngineProcessingState> get processingStateStream =>
      _p.processingStateStream.map(_mapProcessingState);

  static EngineProcessingState _mapProcessingState(ja.ProcessingState s) {
    switch (s) {
      case ja.ProcessingState.idle:
        return EngineProcessingState.idle;
      case ja.ProcessingState.loading:
        return EngineProcessingState.loading;
      case ja.ProcessingState.buffering:
        return EngineProcessingState.buffering;
      case ja.ProcessingState.ready:
        return EngineProcessingState.ready;
      case ja.ProcessingState.completed:
        return EngineProcessingState.completed;
    }
  }
}
