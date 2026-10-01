import 'package:meta/meta.dart';

/// Pure repeat-counter logic (TAM-59 Frontend Task 4).
///
/// Kept UI-free and Flutter-free so both audio modules share ONE implementation
/// and it is trivially unit-testable. Mantras (TAM-66) renders the visible
/// `0/N times` pill on top of this; Aarti plays with [target] `== 1`
/// (play-once-then-advance) so the same completion path drives plain playlist
/// autoplay too.
@immutable
class RepeatCounter {
  const RepeatCounter({this.target = kDefaultTarget, this.completed = 0})
      : assert(target >= 1, 'repeat target must be >= 1'),
        assert(completed >= 0, 'completed count cannot be negative');

  /// Mantras PRD §6.9 default. A pure ENGINE fallback for "how many times do I
  /// repeat if nobody told me" — not a content list, and never rendered as one.
  static const int kDefaultTarget = 7;

  /// The number of full playbacks requested for the current track.
  final int target;

  /// Full playbacks completed so far for the current track (`0..target`).
  final int completed;

  /// Register one full playback completion.
  ///
  /// Returns the next counter plus whether the [target] has now been reached —
  /// in which case the caller advances to the next playlist item and the
  /// returned counter is reset to `completed == 0` for that next track.
  /// Otherwise the same track replays with `completed` incremented.
  RepeatCounterResult onPlaybackCompleted() {
    final next = completed + 1;
    if (next >= target) {
      // Target met → advance; the next track starts a fresh count.
      return RepeatCounterResult(
        counter: RepeatCounter(target: target),
        advance: true,
      );
    }
    return RepeatCounterResult(
      counter: RepeatCounter(target: target, completed: next),
      advance: false,
    );
  }

  /// Change the target (Mantras counter bottom sheet) — resets progress, per
  /// PRD §6.9 "the counter pill updates immediately" and starts at `0/target`.
  RepeatCounter withTarget(int newTarget) => RepeatCounter(target: newTarget);

  @override
  bool operator ==(Object other) =>
      other is RepeatCounter &&
      other.target == target &&
      other.completed == completed;

  @override
  int get hashCode => Object.hash(target, completed);

  @override
  String toString() => 'RepeatCounter($completed/$target)';
}

/// Outcome of [RepeatCounter.onPlaybackCompleted].
@immutable
class RepeatCounterResult {
  const RepeatCounterResult({required this.counter, required this.advance});

  /// The counter to adopt after this completion.
  final RepeatCounter counter;

  /// When `true`, the target was reached — advance to the next playlist item.
  final bool advance;
}
