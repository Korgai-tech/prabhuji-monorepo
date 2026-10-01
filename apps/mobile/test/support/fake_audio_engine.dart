import 'dart:async';

import 'package:mobile/features/audio/domain/audio_engine.dart';

/// A controllable [AudioEngine] fake (TAM-59 Frontend Task 2 / Testing
/// Strategy). Records the call log so tests can assert single-active-playback
/// structurally, and exposes emitters to simulate track completion, position,
/// and playing transitions without any real audio or platform channel.
class FakeAudioEngine implements AudioEngine {
  final StreamController<Duration> _position =
      StreamController<Duration>.broadcast();
  final StreamController<Duration?> _duration =
      StreamController<Duration?>.broadcast();
  final StreamController<bool> _playing = StreamController<bool>.broadcast();
  final StreamController<EngineProcessingState> _processing =
      StreamController<EngineProcessingState>.broadcast();

  /// The most recently loaded URL — `null` after [stop]. One value at a time is
  /// the whole point: there is only ever ONE source loaded.
  String? loadedUrl;

  bool playing = false;
  Duration lastSeek = Duration.zero;
  int playCount = 0;

  /// Ordered call log (`setUrl:<url>`, `play`, `pause`, `stop`, `seek:<dur>`).
  final List<String> calls = <String>[];

  @override
  Future<void> setUrl(String url) async {
    loadedUrl = url;
    calls.add('setUrl:$url');
  }

  @override
  Future<void> setDownloadedSource({
    required String contentId,
    required String mimeType,
    required int sourceLength,
  }) async {
    // TAM-125 — mirror the setUrl bookkeeping so tests can assert single-
    // active-playback with a downloaded source too.
    loadedUrl = 'downloaded:$contentId';
    calls.add('setDownloadedSource:$contentId:$mimeType:$sourceLength');
  }

  @override
  Future<void> play() async {
    playCount++;
    calls.add('play');
    _setPlaying(true);
  }

  @override
  Future<void> pause() async {
    calls.add('pause');
    _setPlaying(false);
  }

  @override
  Future<void> stop() async {
    loadedUrl = null;
    calls.add('stop');
    _setPlaying(false);
  }

  /// Mirrors just_audio: `playing` survives a track reaching `completed`, and
  /// `playingStream` only emits when the value actually changes. A fake that
  /// re-emitted `true` on every play() hid the frozen-controls bug after a
  /// mantras auto-advance.
  void _setPlaying(bool value) {
    if (playing == value) return;
    playing = value;
    _playing.add(value);
  }

  @override
  Future<void> seek(Duration position) async {
    lastSeek = position;
    calls.add('seek:${position.inMilliseconds}');
    _position.add(position);
  }

  @override
  Future<void> dispose() async {
    await _position.close();
    await _duration.close();
    await _playing.close();
    await _processing.close();
  }

  @override
  Stream<Duration> get positionStream => _position.stream;

  @override
  Stream<Duration?> get durationStream => _duration.stream;

  @override
  Stream<bool> get playingStream => _playing.stream;

  @override
  Stream<EngineProcessingState> get processingStateStream => _processing.stream;

  // --- Test emitters ---------------------------------------------------------

  /// Simulate the current track playing to its end.
  void completeTrack() => _processing.add(EngineProcessingState.completed);

  void emitProcessing(EngineProcessingState s) => _processing.add(s);

  void emitPosition(Duration d) => _position.add(d);

  void emitDuration(Duration d) => _duration.add(d);
}
