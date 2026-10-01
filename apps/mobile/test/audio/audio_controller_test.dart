import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_controller.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_engine.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';

import '../support/fake_audio_engine.dart';

AudioItem _item(String id) => AudioItem(
      id: id,
      title: 'Track $id',
      audioUrl: 'https://cdn.test/$id.mp3',
      subtitle: 'singer $id',
      artworkUrl: 'https://cdn.test/$id.jpg',
    );

/// Flush pending microtasks so broadcast-stream listeners + the async
/// completion handler settle before assertions.
Future<void> _flush() async {
  for (var i = 0; i < 6; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  late FakeAudioEngine engine;
  late ProviderContainer container;

  setUp(() {
    engine = FakeAudioEngine();
    container = ProviderContainer(
      overrides: [audioEngineProvider.overrideWithValue(engine)],
    );
  });

  tearDown(() => container.dispose());

  AudioController controller() =>
      container.read(audioControllerProvider.notifier);
  AudioPlaybackState read() => container.read(audioControllerProvider);

  group('single-active-playback', () {
    test('playing B while A is playing stops A — one source at a time',
        () async {
      await controller().play(_item('a'));
      expect(read().currentItem!.id, 'a');
      expect(engine.loadedUrl, 'https://cdn.test/a.mp3');

      await controller().play(_item('b'));
      expect(read().currentItem!.id, 'b');
      // The ONE engine now holds only B's source — A is structurally gone.
      expect(engine.loadedUrl, 'https://cdn.test/b.mp3');
      expect(
        engine.calls.where((c) => c.startsWith('setUrl')).toList(),
        ['setUrl:https://cdn.test/a.mp3', 'setUrl:https://cdn.test/b.mp3'],
      );
    });
  });

  group('playlist auto-advance (no repeat target)', () {
    test('completion advances to the next item; last item ends cleanly',
        () async {
      final list = [_item('a'), _item('b')];
      await controller().play(_item('a'), playlist: list, repeatTarget: 1);
      expect(read().index, 0);
      expect(read().hasNext, isTrue);

      engine.completeTrack();
      await _flush();
      expect(read().currentItem!.id, 'b', reason: 'auto-advanced to next');
      expect(read().index, 1);

      engine.completeTrack();
      await _flush();
      // Last item finished — playback ends, still on b, not playing.
      expect(read().currentItem!.id, 'b');
      expect(read().playing, isFalse);
    });
  });

  group('repeat counter', () {
    test('target 3 replays until completed hits target, then advances',
        () async {
      final list = [_item('a'), _item('b')];
      await controller()
          .play(_item('a'), playlist: list, repeatTarget: 3);
      expect(read().repeatTarget, 3);
      expect(read().repeatCompleted, 0);

      engine.completeTrack();
      await _flush();
      expect(read().currentItem!.id, 'a', reason: 'still replaying a');
      expect(read().repeatCompleted, 1);

      engine.completeTrack();
      await _flush();
      expect(read().repeatCompleted, 2);

      engine.completeTrack();
      await _flush();
      // 3 plays == target → advance to b, counter reset.
      expect(read().currentItem!.id, 'b');
      expect(read().repeatCompleted, 0);
    });

    test('setRepeatTarget resets progress to 0/target', () async {
      await controller().play(_item('a'), repeatTarget: 7);
      controller().setRepeatTarget(108);
      expect(read().repeatTarget, 108);
      expect(read().repeatCompleted, 0);
    });
  });

  group('stop / pause / resume', () {
    test('stop clears the active item and dismisses the mini-player', () async {
      await controller().play(_item('a'));
      await controller().stop();
      expect(read().currentItem, isNull);
      expect(read().showMiniPlayer, isFalse);
      expect(engine.calls, contains('stop'));
    });

    test('pause then resume drives the engine and keeps the item', () async {
      await controller().play(_item('a'));
      await controller().pause();
      expect(engine.calls, contains('pause'));

      await controller().resume();
      expect(read().currentItem!.id, 'a');
      // play was called at start and again on resume.
      expect(engine.playCount, greaterThanOrEqualTo(2));
    });

    test('resume AFTER natural completion seeks back to zero first (TAM-130)',
        () async {
      // Regression for the mantras + aarti "play/pause dead after one full
      // playthrough" bug: `just_audio.play()` is a no-op once the player is
      // parked in `completed`, so the controller must seek(0) before play.
      await controller().play(_item('a'), repeatTarget: 1);
      engine.calls.clear(); // ignore the initial setUrl + play
      engine.completeTrack();
      await _flush();
      expect(read().processingState, EngineProcessingState.completed);

      await controller().resume();
      // seek to 0 MUST come before the play, or nothing restarts.
      final seekIdx = engine.calls.indexOf('seek:0');
      final playIdx = engine.calls.indexOf('play');
      expect(seekIdx, greaterThanOrEqualTo(0),
          reason: 'resume must seek(0) after a natural end');
      expect(playIdx, greaterThan(seekIdx));
    });
  });

  group('completion stream (TAM-130)', () {
    test('emits per-repetition + target-reached signals with playhead',
        () async {
      final events = <AudioTrackCompletion>[];
      final sub = controller().completionStream.listen(events.add);
      addTearDown(sub.cancel);

      await controller().play(_item('a'), repeatTarget: 3);
      engine.emitDuration(const Duration(seconds: 10));
      await _flush();

      engine.completeTrack();
      await _flush();
      engine.completeTrack();
      await _flush();
      engine.completeTrack();
      await _flush();

      expect(events.length, 3);
      expect(events[0].targetReached, isFalse);
      expect(events[0].repetitionNumber, 1);
      expect(events[0].item.id, 'a');
      expect(events[0].playheadPosition, const Duration(seconds: 10));
      expect(events[1].targetReached, isFalse);
      expect(events[1].repetitionNumber, 2);
      expect(events[2].targetReached, isTrue);
      expect(events[2].repetitionNumber, 3);
    });
  });

  group('target reached on the last item', () {
    test(
        'pauses the engine so the next play() re-syncs playing — '
        'mantras auto-advance must not leave the controls stuck', () async {
      await controller().play(_item('a'), repeatTarget: 1);
      await _flush();
      expect(read().playing, isTrue);

      engine.completeTrack();
      await _flush();
      expect(engine.playing, isFalse,
          reason: 'the engine itself must be paused, not just state');
      expect(read().playing, isFalse);

      // The mantras bloc advances its own queue with a fresh play().
      await controller().play(_item('b'), repeatTarget: 1);
      await _flush();
      expect(read().playing, isTrue,
          reason: 'UI must show pause while b plays');

      await controller().pause();
      await _flush();
      expect(read().playing, isFalse);
      expect(engine.playing, isFalse);
    });
  });

  group('preview vs full mode', () {
    test('preview does not promote the mini-player; full does', () async {
      await controller().play(_item('a'), mode: PlaybackMode.preview);
      expect(read().showMiniPlayer, isFalse, reason: 'preview never promotes');
      expect(read().isActive, isTrue);

      // Starting a full playback stops the preview (single engine) and promotes.
      await controller().play(_item('b'), mode: PlaybackMode.full);
      expect(read().currentItem!.id, 'b');
      expect(read().showMiniPlayer, isTrue);
      expect(engine.loadedUrl, 'https://cdn.test/b.mp3');
    });
  });

  group('error path', () {
    test('empty audio URL yields a calm error, not a crash', () async {
      await controller().play(
        const AudioItem(id: 'x', title: 'X', audioUrl: '   '),
      );
      expect(read().hasError, isTrue);
      expect(read().playing, isFalse);
      // Never attempted to load an empty source.
      expect(engine.loadedUrl, isNull);
    });
  });
}
