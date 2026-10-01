/// Engine-level processing state, mapped from `just_audio`'s `ProcessingState`
/// but declared here so nothing above the data layer imports `just_audio`
/// (keeps the `audio_service` swap — TAM-59 #PATH_DECISION — a one-file change).
enum EngineProcessingState {
  /// No source loaded.
  idle,

  /// Source is being loaded/prepared.
  loading,

  /// Playback is stalled waiting for more data.
  buffering,

  /// Loaded and able to play.
  ready,

  /// The current track played to its end (drives repeat/auto-advance).
  completed,
}

/// The audio playback seam (TAM-59 Frontend Task 2).
///
/// The real implementation ([JustAudioEngine]) wraps a SINGLE `just_audio`
/// player; tests use a `FakeAudioEngine`. Phase-2 Android background/lockscreen
/// controls (`audio_service`) slot in behind this SAME interface without any
/// change to [AudioController], the mini-player, or the full player
/// (#PATH_DECISION / #PLAN_UNCERTAINTY).
///
/// Only ONE instance ever exists app-wide, which is what makes
/// single-active-playback structural rather than policed.
abstract class AudioEngine {
  /// Point the engine at [url] (replacing any previous source) and prepare it
  /// from position zero. Replacing the source is what structurally stops the
  /// previously-playing track.
  Future<void> setUrl(String url);

  /// Point the engine at a downloaded (on-device, encrypted) source
  /// identified by [contentId]. The decrypt-on-play stream is materialised
  /// only in-memory — no plaintext file ever hits disk (TAM-125
  /// #EXPORT_CRITICAL). [sourceLength] is the plaintext content length
  /// (bytes); [mimeType] is the media type the engine advertises to
  /// downstream demuxers ("audio/mpeg" for MP3, etc.).
  Future<void> setDownloadedSource({
    required String contentId,
    required String mimeType,
    required int sourceLength,
  });

  Future<void> play();
  Future<void> pause();

  /// Stop and release the current source.
  Future<void> stop();

  Future<void> seek(Duration position);

  /// Release the underlying player. Called from the provider's `onDispose`.
  Future<void> dispose();

  /// Current playback position (ticks while playing).
  Stream<Duration> get positionStream;

  /// Total duration once known (null until the source reports it).
  Stream<Duration?> get durationStream;

  /// `true` while actively playing, `false` when paused/stopped.
  Stream<bool> get playingStream;

  /// Loading/buffering/ready/completed transitions. A `completed` event is the
  /// signal the controller uses to increment the repeat counter and advance.
  Stream<EngineProcessingState> get processingStateStream;
}
