import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/domain/repeat_counter.dart';

void main() {
  group('RepeatCounter (pure logic)', () {
    test('default target is 7 (engine fallback, not a rendered option list)', () {
      expect(const RepeatCounter().target, 7);
      // There is deliberately NO `RepeatCounter.options` any more: the selectable
      // targets are CMS content served as `availableTargets` on
      // `GET /mantras/counter-preference`. The engine only knows how to repeat
      // N times, and 7 is its fallback when nothing has told it otherwise.
    });

    test('target 1 → each completion advances immediately (Aarti / autoplay)',
        () {
      final result = const RepeatCounter(target: 1).onPlaybackCompleted();
      expect(result.advance, isTrue);
      expect(result.counter.completed, 0, reason: 'next track starts fresh');
    });

    test('target 3 → replays twice, advances on the 3rd completion', () {
      var counter = const RepeatCounter(target: 3);

      final first = counter.onPlaybackCompleted();
      expect(first.advance, isFalse);
      expect(first.counter.completed, 1);
      counter = first.counter;

      final second = counter.onPlaybackCompleted();
      expect(second.advance, isFalse);
      expect(second.counter.completed, 2);
      counter = second.counter;

      final third = counter.onPlaybackCompleted();
      expect(third.advance, isTrue, reason: '3 plays == target 3 → advance');
      expect(third.counter.completed, 0);
    });

    test('withTarget resets progress to 0/target', () {
      final counter = const RepeatCounter(target: 7, completed: 4).withTarget(108);
      expect(counter.target, 108);
      expect(counter.completed, 0);
    });

    test('value equality', () {
      expect(const RepeatCounter(target: 7, completed: 2),
          const RepeatCounter(target: 7, completed: 2));
      expect(const RepeatCounter(target: 7, completed: 2),
          isNot(const RepeatCounter(target: 7, completed: 3)));
    });
  });
}
