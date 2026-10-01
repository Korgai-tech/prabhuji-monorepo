import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/audio/presentation/mini_player.dart';

import '../support/fake_audio_engine.dart';

// Empty artwork URL → AppNetworkImage short-circuits to the branded fallback,
// so the widget tests never touch the network.
const _item = AudioItem(
  id: 'a',
  title: 'Shri Raam Dootam',
  audioUrl: 'https://cdn.test/a.mp3',
  subtitle: 'Prabhuji',
  artworkUrl: '',
);

Future<ProviderContainer> _pumpMiniPlayer(
  WidgetTester tester, {
  required FakeAudioEngine engine,
  VoidCallback? onTap,
}) async {
  final container = ProviderContainer(
    overrides: [audioEngineProvider.overrideWithValue(engine)],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        home: Scaffold(bottomNavigationBar: MiniPlayer(onTap: onTap)),
      ),
    ),
  );
  return container;
}

void main() {
  group('MiniPlayer', () {
    testWidgets('is absent when no playback is active', (tester) async {
      final engine = FakeAudioEngine();
      await _pumpMiniPlayer(tester, engine: engine);
      await tester.pump();

      expect(find.byKey(const Key('mini-player-surface')), findsNothing);
    });

    testWidgets('reflects controller state (title + controls)', (tester) async {
      final engine = FakeAudioEngine();
      final container = await _pumpMiniPlayer(tester, engine: engine);

      await container.read(audioControllerProvider.notifier).play(_item);
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const Key('mini-player-surface')), findsOneWidget);
      expect(find.text('Shri Raam Dootam'), findsOneWidget);
      expect(find.byKey(const Key('mini-player-play-pause')), findsOneWidget);
      expect(find.byKey(const Key('mini-player-close')), findsOneWidget);
    });

    testWidgets('play/pause button drives the controller', (tester) async {
      final engine = FakeAudioEngine();
      final container = await _pumpMiniPlayer(tester, engine: engine);
      await container.read(audioControllerProvider.notifier).play(_item);
      await tester.pump();
      await tester.pump();

      // Engine is playing → tapping pauses.
      await tester.tap(find.byKey(const Key('mini-player-play-pause')));
      await tester.pump();
      await tester.pump();
      expect(engine.calls, contains('pause'));

      // Now paused → tapping resumes (play again).
      await tester.tap(find.byKey(const Key('mini-player-play-pause')));
      await tester.pump();
      await tester.pump();
      expect(engine.playCount, greaterThanOrEqualTo(2));
    });

    testWidgets('close stops playback and dismisses the mini-player',
        (tester) async {
      final engine = FakeAudioEngine();
      final container = await _pumpMiniPlayer(tester, engine: engine);
      await container.read(audioControllerProvider.notifier).play(_item);
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const Key('mini-player-surface')), findsOneWidget);

      await tester.tap(find.byKey(const Key('mini-player-close')));
      await tester.pump();
      await tester.pump();

      expect(engine.calls, contains('stop'));
      expect(find.byKey(const Key('mini-player-surface')), findsNothing);
    });

    testWidgets('tapping the surface reopens the full player (onTap)',
        (tester) async {
      final engine = FakeAudioEngine();
      var tapped = 0;
      final container = await _pumpMiniPlayer(
        tester,
        engine: engine,
        onTap: () => tapped++,
      );
      await container.read(audioControllerProvider.notifier).play(_item);
      await tester.pump();
      await tester.pump();

      await tester.tap(find.byKey(const Key('mini-player-surface')));
      await tester.pump();
      expect(tapped, 1);
    });

    testWidgets('preview-mode playback does NOT show the mini-player',
        (tester) async {
      final engine = FakeAudioEngine();
      final container = await _pumpMiniPlayer(tester, engine: engine);
      await container
          .read(audioControllerProvider.notifier)
          .play(_item, mode: PlaybackMode.preview);
      await tester.pump();
      await tester.pump();

      expect(find.byKey(const Key('mini-player-surface')), findsNothing);
    });
  });

  group('Render-tree cross-check (TAM-59 mini-player — working assumption)', () {
    testWidgets('dumps the rendered tree + component checklist to Evidence',
        (tester) async {
      final engine = FakeAudioEngine();
      final container = await _pumpMiniPlayer(tester, engine: engine);
      await container.read(audioControllerProvider.notifier).play(_item);
      await tester.pump();
      await tester.pump();

      // Confirm the documented minimum components are present (Aarti §6.12).
      final components = <String, bool>{
        'surface (tap → full player)':
            find.byKey(const Key('mini-player-surface')).evaluate().isNotEmpty,
        'title': find.byKey(const Key('mini-player-title')).evaluate().isNotEmpty,
        'play/pause (Figma glyph 423:4383/423:4382)':
            find.byKey(const Key('mini-player-play-pause')).evaluate().isNotEmpty,
        'close/dismiss (Figma cross glyph)':
            find.byKey(const Key('mini-player-close')).evaluate().isNotEmpty,
      };
      for (final entry in components.entries) {
        expect(entry.value, isTrue, reason: '${entry.key} missing');
      }

      final tree = WidgetsBinding.instance.rootElement!.toStringDeep();
      final checklist =
          components.entries.map((e) => '  [${e.value ? 'x' : ' '}] ${e.key}').join('\n');

      final dir = Directory(
          '${Directory.current.path}/../../specs/evidence/TAM-59/fidelity');
      dir.createSync(recursive: true);
      File('${dir.path}/render-tree-dump.txt').writeAsStringSync(
        'TAM-59 MiniPlayer render-tree cross-check\n'
        'Figma source: NONE for the mini-player composition (Aarti open-question '
        'q1 blocker).\n'
        'Icons ARE Figma-exported player glyphs (nodes 423:4384 / 423:4383 / '
        '423:4382) + design-system close cross.\n'
        'Verdict: WORKING-ASSUMPTION component — pending Design sign-off.\n\n'
        'Component checklist (Aarti PRD §6.12 minimum):\n$checklist\n\n'
        '--- WidgetsBinding.rootElement.toStringDeep() ---\n$tree\n',
      );
    });
  });
}
