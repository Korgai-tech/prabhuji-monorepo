import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/audio/presentation/mini_player.dart';

import '../support/fake_audio_engine.dart';

/// Multi-size smoke test for the v2 mini-player (TAM-N-mini-player-v2). Pumps
/// the mini-player at 3 widths × 3 heights and at textScale 2.0, asserting NO
/// Flutter layout exception fires. Distinct from
/// `mini_player_layout_intent_test.dart` (which asserts *where* things sit) —
/// this asserts *does it explode*, per
/// `patterns_library/testing/flutter-multi-size-smoke.md`.
///
/// The 80-char-title × textScale 2.0 combination is the exact configuration
/// that would catch a regression to `height: 74` (fixed instead of `minHeight`)
/// — the row's Text children can't shrink further and a `RenderFlex overflowed`
/// exception fires. Widget tests defaulting to 800×600 at scale 1.0 miss this.

const _widths = [320.0, 390.0, 428.0];
const _heights = [600.0, 800.0, 1200.0];

const _shortItem = AudioItem(
  id: 'a',
  title: 'Shri Raam Dootam',
  audioUrl: 'https://cdn.test/a.mp3',
  subtitle: 'Prabhuji',
  artworkUrl: '',
);

const _longItem = AudioItem(
  id: 'b',
  title:
      'Om Namah Shivaya Shivaya Namah Om Extended Sacred Chant for Morning Practice',
  audioUrl: 'https://cdn.test/b.mp3',
  subtitle: 'Category name with a mid-length label',
  artworkUrl: '',
);

Future<void> _pump(WidgetTester tester, AudioItem item) async {
  final engine = FakeAudioEngine();
  final container = ProviderContainer(
    overrides: [audioEngineProvider.overrideWithValue(engine)],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(
        home: Scaffold(bottomNavigationBar: MiniPlayer()),
      ),
    ),
  );
  await container.read(audioControllerProvider.notifier).play(item);
  await tester.pump();
  await tester.pump();
}

void main() {
  group('MiniPlayer multi-size smoke', () {
    for (final w in _widths) {
      for (final h in _heights) {
        testWidgets('no layout exception at ${w.toInt()}x${h.toInt()}',
            (tester) async {
          final errors = <FlutterErrorDetails>[];
          final originalOnError = FlutterError.onError;
          FlutterError.onError = errors.add;
          addTearDown(() => FlutterError.onError = originalOnError);

          tester.view.physicalSize = Size(w, h);
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          await _pump(tester, _shortItem);

          expect(
            errors,
            isEmpty,
            reason: 'layout exceptions at ${w.toInt()}x${h.toInt()}:\n'
                '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
          );
        });
      }
    }

    testWidgets(
      'no layout exception at textScale 2.0 (320x800) with a very long title',
      (tester) async {
        final errors = <FlutterErrorDetails>[];
        final originalOnError = FlutterError.onError;
        FlutterError.onError = errors.add;
        addTearDown(() => FlutterError.onError = originalOnError);

        tester.view.physicalSize = const Size(320, 800);
        tester.view.devicePixelRatio = 1.0;
        tester.platformDispatcher.textScaleFactorTestValue = 2.0;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(
            tester.platformDispatcher.clearTextScaleFactorTestValue);

        await _pump(tester, _longItem);

        // The 320x800 × textScale 2.0 × 80-char-title triple is the exact
        // configuration that catches `height: 74` (fixed) regressing from
        // `minHeight: 74`. If someone re-introduces the fixed height, a
        // RenderFlex overflow lands here and this test fails loud.
        expect(
          errors,
          isEmpty,
          reason:
              'layout exceptions at textScale 2.0 with a long title — did '
              'someone regress `constraints: BoxConstraints(minHeight: 74)` '
              'back to `height: 74`?\n'
              '${errors.map((e) => e.exceptionAsString()).join('\n---\n')}',
        );
      },
    );
  });
}
