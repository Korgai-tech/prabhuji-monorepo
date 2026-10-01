import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../state/providers.dart';
import '../domain/audio_engine.dart';
import '../domain/audio_item.dart';
import '../domain/repeat_counter.dart';
import 'audio_providers.dart';

/// One track completion (jaap step or target-reached advance). Emitted by
/// [AudioController.completionStream] the moment the engine reports
/// [EngineProcessingState.completed], BEFORE the controller mutates state or
/// starts the next play. Feature blocs (mantras/aarti) subscribe from their
/// player screens and fire per-repetition analytics + queue advance from this
/// signal — never from Riverpod state deltas, which race against just_audio's
/// playing/position/processingState emit order and can silently miss the
/// completion.
@immutable
class AudioTrackCompletion {
  const AudioTrackCompletion({
    required this.item,
    required this.repetitionNumber,
    required this.repeatTarget,
    required this.targetReached,
    required this.playheadPosition,
  });

  /// The item that just finished playing.
  final AudioItem item;

  /// 1-based repetition number this completion represents
  /// (`1..repeatTarget`). For a `target=1` track this is always `1`.
  final int repetitionNumber;

  /// The repeat target that was active for this completion.
  final int repeatTarget;

  /// `true` when [repetitionNumber] hit [repeatTarget] — the caller should
  /// advance to the next queue item.
  final bool targetReached;

  /// Playhead position captured at completion — used by Mantras Sheet 1 row 79
  /// to accumulate `total_listen_seconds` across the target window.
  final Duration playheadPosition;
}

/// Immutable snapshot of everything the mini-player and full player render from
/// (TAM-59 AC-b/AC-c). Both surfaces are driven ONLY by this state, so they can
/// never diverge (#EXPORT_CRITICAL).
@immutable
class AudioPlaybackState {
  const AudioPlaybackState({
    this.currentItem,
    this.playlist = const <AudioItem>[],
    this.index = -1,
    this.mode = PlaybackMode.full,
    this.playing = false,
    this.buffering = false,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.repeatTarget = 1,
    this.repeatCompleted = 0,
    this.hasError = false,
    this.processingState = EngineProcessingState.idle,
  });

  /// The empty state — no active item, mini-player hidden.
  static const AudioPlaybackState empty = AudioPlaybackState();

  /// The currently-active item (the "currently-playing item id" of the
  /// single-active invariant). `null` == nothing playing.
  final AudioItem? currentItem;

  /// Ordered playlist the current item belongs to (Mantras §6.10). Autoplay and
  /// skip walk this list; the calling module supplies it.
  final List<AudioItem> playlist;

  /// Index of [currentItem] within [playlist] (`-1` when idle).
  final int index;

  /// Whether this playback promotes the mini-player ([PlaybackMode.full]) or is
  /// a non-promoting preview ([PlaybackMode.preview]).
  final PlaybackMode mode;

  final bool playing;
  final bool buffering;
  final Duration position;
  final Duration duration;

  /// Repeat target for the current track (Mantras §6.9). `1` == play once then
  /// advance (Aarti + plain playlist autoplay).
  final int repeatTarget;

  /// Full playbacks completed for the current track so far.
  final int repeatCompleted;

  /// `true` when the current item could not be played (e.g. empty URL) — the
  /// consuming player shows a calm error, not a crash.
  final bool hasError;

  /// Engine's most recent processing state. `resume()` reads this so that
  /// tapping play AFTER a natural end (mantras jaap done, aarti last item)
  /// seeks back to zero first — `just_audio.play()` is a no-op once the player
  /// is parked in `completed`, which is why the play button appeared dead on
  /// the mantras full player + shared mini player after one full playthrough.
  final EngineProcessingState processingState;

  /// Active playback of any kind.
  bool get isActive => currentItem != null;

  /// Mini-player visibility: ONLY active full-mode playback promotes it; a
  /// preview never does (AC-d).
  bool get showMiniPlayer => currentItem != null && mode == PlaybackMode.full;

  bool get hasNext => index >= 0 && index < playlist.length - 1;
  bool get hasPrevious => index > 0;

  /// The `{completed, target}` pair Mantras' pill (TAM-66) renders.
  RepeatCounter get repeat =>
      RepeatCounter(target: repeatTarget, completed: repeatCompleted);

  AudioPlaybackState copyWith({
    AudioItem? currentItem,
    List<AudioItem>? playlist,
    int? index,
    PlaybackMode? mode,
    bool? playing,
    bool? buffering,
    Duration? position,
    Duration? duration,
    int? repeatTarget,
    int? repeatCompleted,
    bool? hasError,
    EngineProcessingState? processingState,
  }) {
    return AudioPlaybackState(
      currentItem: currentItem ?? this.currentItem,
      playlist: playlist ?? this.playlist,
      index: index ?? this.index,
      mode: mode ?? this.mode,
      playing: playing ?? this.playing,
      buffering: buffering ?? this.buffering,
      position: position ?? this.position,
      duration: duration ?? this.duration,
      repeatTarget: repeatTarget ?? this.repeatTarget,
      repeatCompleted: repeatCompleted ?? this.repeatCompleted,
      hasError: hasError ?? this.hasError,
      processingState: processingState ?? this.processingState,
    );
  }
}

/// The global, single-active-playback controller (TAM-59 AC-b).
///
/// Owns the ONE [AudioEngine] and the currently-active item. Because every
/// entry point — Home feed preview, Aarti/Mantras full player — routes through
/// this one controller/engine, two concurrent audio streams are impossible by
/// construction (#EXPORT_CRITICAL). It does not grant entitlement; `full` mode
/// assumes the caller already verified Pro via `PaywallGate` (TAM-58).
class AudioController extends Notifier<AudioPlaybackState> {
  late final AudioEngine _engine;
  final List<StreamSubscription<dynamic>> _subs = <StreamSubscription<dynamic>>[];
  final StreamController<AudioTrackCompletion> _completions =
      StreamController<AudioTrackCompletion>.broadcast();
  bool _wired = false;

  /// Track-completion signal (jaap step or target-reached advance). The
  /// mantras + aarti full-player screens subscribe from `initState` and
  /// forward to their bloc as `TrackCompleted`. See [AudioTrackCompletion].
  Stream<AudioTrackCompletion> get completionStream => _completions.stream;

  @override
  AudioPlaybackState build() {
    // Read (but do not USE) the engine — JustAudioEngine constructs its
    // underlying player lazily, so this touches no platform channel until the
    // first play(). Stream wiring is deferred to _ensureWired() for the same
    // reason (keeps widget tests that only render an inactive mini-player safe).
    _engine = ref.read(audioEngineProvider);
    // Playback belongs to the session that started it. Logout only navigates
    // to `/phone-input` — the `ProviderScope`, this controller and the one
    // app-wide engine all survive it — so without this the previous user's
    // aarti kept playing, and the mini-player kept showing their track, to
    // whoever signed in next on the same device. `stop()` (not `pause()`) is
    // the right verb: it releases the source AND resets to
    // `AudioPlaybackState.empty`, which is what dismisses the mini-player.
    //
    // A `ref.watch` here would be WRONG: rebuilding the notifier would cancel
    // the engine subscriptions and close `_completions` (breaking the
    // mantras/aarti screens that subscribed from `initState`) while the
    // engine — a separate keepAlive provider — kept playing with no UI bound
    // to it. Listening lets the controller keep its identity and act.
    ref.listen<String?>(authIdentityProvider, (previous, next) {
      if (previous == next) return;
      // No-op when nothing is loaded, so a login transition never touches
      // the platform channel just to stop silence.
      if (state.currentItem == null) return;
      unawaited(stop());
    });
    ref.onDispose(() {
      for (final s in _subs) {
        s.cancel();
      }
      _subs.clear();
      _completions.close();
    });
    return AudioPlaybackState.empty;
  }

  void _ensureWired() {
    if (_wired) return;
    _wired = true;
    _subs
      ..add(_engine.playingStream
          .listen((p) => state = state.copyWith(playing: p)))
      ..add(_engine.positionStream
          .listen((pos) => state = state.copyWith(position: pos)))
      ..add(_engine.durationStream.listen(
          (d) => state = state.copyWith(duration: d ?? Duration.zero)))
      ..add(_engine.processingStateStream.listen(_onProcessingState));
  }

  /// Start playing [item]. Any previous playback is stopped structurally
  /// (one engine, source replaced). [mode] governs mini-player promotion;
  /// [playlist]/[startIndex] enable autoplay + skip; [repeatTarget] (default
  /// `1`) drives the Mantras repeat counter (AC-b).
  Future<void> play(
    AudioItem item, {
    PlaybackMode mode = PlaybackMode.full,
    List<AudioItem>? playlist,
    int? startIndex,
    int repeatTarget = 1,
  }) async {
    _ensureWired();
    final list = (playlist == null || playlist.isEmpty)
        ? <AudioItem>[item]
        : playlist;
    var idx = startIndex ?? list.indexWhere((e) => e.id == item.id);
    if (idx < 0) idx = 0;

    state = state.copyWith(
      currentItem: item,
      playlist: list,
      index: idx,
      mode: mode,
      repeatTarget: repeatTarget < 1 ? 1 : repeatTarget,
      repeatCompleted: 0,
      position: Duration.zero,
      duration: Duration.zero,
      hasError: item.audioUrl.trim().isEmpty,
      buffering: false,
    );
    await _startCurrentSource();
  }

  /// Pause without losing position (AC-b).
  Future<void> pause() => _engine.pause();

  /// Resume the current item; no-op when nothing is active. When the previous
  /// playback ran to a natural end, `just_audio` is parked in
  /// [EngineProcessingState.completed] and its `.play()` is a no-op — so we
  /// seek back to zero first, otherwise the play button appears dead after
  /// one full playthrough (mantras jaap end / aarti last item).
  Future<void> resume() async {
    if (state.currentItem == null) return;
    _ensureWired();
    if (state.processingState == EngineProcessingState.completed) {
      await _engine.seek(Duration.zero);
    }
    await _engine.play();
  }

  /// Stop playback AND dismiss the mini-player (AC-c: close = stop + dismiss).
  Future<void> stop() async {
    await _engine.stop();
    state = AudioPlaybackState.empty;
  }

  /// Seek the active item, clamped to `0..duration`.
  ///
  /// The target is written to [state] BEFORE the engine call, so every bound
  /// surface (the Home-feed scrub bar, the Aarti progress bar) repaints on the
  /// same frame as the gesture. Without the optimistic write the bar only
  /// moves once the engine's `positionStream` ticks back — which reads as a
  /// dead control, and makes a drag visibly fight the stream.
  ///
  /// No-op when nothing is active: there is no source to seek, and writing a
  /// position onto the empty state would give an idle surface a phantom
  /// playhead.
  Future<void> seek(Duration position) async {
    if (state.currentItem == null) return;
    var target = position < Duration.zero ? Duration.zero : position;
    // `duration` is Duration.zero until the engine reports it; don't clamp
    // everything to zero in that window — just pass the request through.
    if (state.duration > Duration.zero && target > state.duration) {
      target = state.duration;
    }
    state = state.copyWith(position: target);
    await _engine.seek(target);
  }

  /// External read of the current playback snapshot. Notifiers keep [state]
  /// private (Riverpod enforces this — the framework only intends for
  /// subclasses to touch it), so consumers outside the widget tree that
  /// need a one-shot read (transport ports, unit-testable dispatch layers)
  /// go through this getter instead of `ref.read(...provider)`.
  AudioPlaybackState get currentSnapshot => state;

  /// Advance to the next playlist item (Mantras §6.10). No-op at the end.
  Future<void> skipNext() async {
    if (!state.hasNext) return;
    await _playIndex(state.index + 1);
  }

  Future<void> skipPrevious() async {
    if (!state.hasPrevious) return;
    await _playIndex(state.index - 1);
  }

  /// Change the repeat target for the current track (Mantras counter sheet,
  /// TAM-66). Resets progress to `0/target` per PRD §6.9.
  void setRepeatTarget(int target) {
    state = state.copyWith(
      repeatTarget: target < 1 ? 1 : target,
      repeatCompleted: 0,
    );
  }

  Future<void> _playIndex(int i) async {
    final item = state.playlist[i];
    state = state.copyWith(
      currentItem: item,
      index: i,
      repeatCompleted: 0,
      position: Duration.zero,
      duration: Duration.zero,
      hasError: item.audioUrl.trim().isEmpty,
      buffering: false,
    );
    await _startCurrentSource();
  }

  Future<void> _startCurrentSource() async {
    final item = state.currentItem;
    if (item == null) return;
    // TAM-125 — downloaded items feed the engine from the encrypted store
    // (offline-first) instead of a signed URL. Route based on `item.source`
    // so streamed items continue to hit the network via `setUrl` and
    // downloaded items skip the network entirely.
    if (item.source == AudioSource.downloaded) {
      final size = item.downloadSizeBytes ?? 0;
      if (size <= 0) {
        // Downloaded item is missing the plaintext size — the decrypt-on-
        // play stream can't service just_audio's range requests without it.
        // Fall through to the calm-error state so playback doesn't crash.
        state = state.copyWith(playing: false, buffering: false, hasError: true);
        return;
      }
      await _engine.setDownloadedSource(
        contentId: item.id,
        mimeType: 'audio/mpeg', // every downloaded audio is MP3 (media allowlist)
        sourceLength: size,
      );
      await _engine.play();
      return;
    }
    if (item.audioUrl.trim().isEmpty) {
      // Calm error path — no source, no crash (AC / Input Validation).
      state = state.copyWith(playing: false, buffering: false);
      return;
    }
    await _engine.setUrl(item.audioUrl);
    await _engine.play();
  }

  void _onProcessingState(EngineProcessingState s) {
    state = state.copyWith(
      buffering:
          s == EngineProcessingState.buffering || s == EngineProcessingState.loading,
      processingState: s,
    );
    if (s == EngineProcessingState.completed) {
      unawaited(_onTrackCompleted());
    }
  }

  /// One full playback finished: emit the completion signal for feature blocs
  /// (mantras/aarti), increment the repeat counter, then either replay the
  /// same track (jaap loop) or advance to the next playlist item (AC-b).
  Future<void> _onTrackCompleted() async {
    final item = state.currentItem;
    if (item == null) return;
    final result = state.repeat.onPlaybackCompleted();
    // Repetition number this completion produced (1-based). When the target
    // is met, [result.counter.completed] is reset to 0, so we report the
    // full target instead — this is what the mantras `repetition_number`
    // property records on Sheet 1 row 72.
    final repetitionNumber =
        result.advance ? state.repeatTarget : result.counter.completed;
    // Capture the playhead BEFORE we mutate — the mantras bloc adds this
    // to `total_listen_seconds` (Sheet 1 row 79).
    final playhead =
        state.duration > Duration.zero ? state.duration : state.position;

    _completions.add(AudioTrackCompletion(
      item: item,
      repetitionNumber: repetitionNumber,
      repeatTarget: state.repeatTarget,
      targetReached: result.advance,
      playheadPosition: playhead,
    ));

    if (!result.advance) {
      // Repeat the same track (Mantras jaap loop).
      state = state.copyWith(
        repeatCompleted: result.counter.completed,
        position: Duration.zero,
      );
      await _engine.seek(Duration.zero);
      await _engine.play();
      return;
    }
    // Target reached → advance to the next playlist item, or end cleanly.
    if (state.hasNext) {
      await _playIndex(state.index + 1);
    } else {
      // Actually pause the engine rather than writing `playing: false` onto
      // state. just_audio keeps `playing == true` through `completed`, and its
      // `playingStream` only emits on change — so a state-only write left the
      // controller believing it was paused while the engine was still
      // "playing". The next play() (the mantras bloc auto-advancing its queue)
      // then started audio with NO playing emit: the button stayed on "play",
      // and tapping it called resume() → just_audio play() → no-op, so the
      // controls looked frozen. Pausing keeps both sides in sync; the
      // `playingStream` emit drives `state.playing`.
      state = state.copyWith(
        repeatCompleted: 0,
        position: state.duration,
      );
      await _engine.pause();
    }
  }
}
