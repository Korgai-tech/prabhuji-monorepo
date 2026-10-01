@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/audio/presentation/mini_player.dart';

import '../support/fake_audio_engine.dart';

/// Component golden for the v2 mini-player (TAM-N-mini-player-v2, Figma node
/// 1950:20911). Rendered at the Figma frame's own 360×74 pinned size so a
/// side-by-side against `specs/evidence/TAM-N/fidelity/miniplayer-bar-
/// figma-1950-20911@2x.png` is like-for-like.
///
/// Tagged `golden` so the cross-platform gate (`--exclude-tags golden`) skips
/// it (goldens render subtly differently on macOS vs Linux CI — figma-flutter
/// Trap "Cross-platform golden noise"). Refresh locally with:
///
/// ```
/// flutter test --update-goldens \
///   test/goldens/mini_player_v2_golden_test.dart
/// ```
void main() {
  testWidgets('golden: mini-player v2 bar (1950:20911)', (tester) async {
    // Physical pixels = logical dp × DPR. We want a 360×74 dp render captured
    // at @2x for a like-for-like against the pre-committed Figma reference PNG
    // (also @2x), so physical = 720×148 with DPR 2.0.
    tester.view.physicalSize = const Size(720, 148);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final engine = FakeAudioEngine();
    final container = ProviderContainer(
      overrides: [audioEngineProvider.overrideWithValue(engine)],
    );
    addTearDown(container.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          debugShowCheckedModeBanner: false,
          home: Scaffold(
            backgroundColor: Colors.white,
            body: Align(
              alignment: Alignment.bottomCenter,
              child: MiniPlayer(),
            ),
          ),
        ),
      ),
    );

    // Sample content mirrors Figma exactly (title deliberately duplicated in
    // the design to show ellipsis behaviour; subtitle "Category name"). The
    // Figma frame renders the PLAY triangle (i.e. audio is PAUSED and would
    // play on tap) so we pause the controller after starting playback to
    // match.
    final ctrl = container.read(audioControllerProvider.notifier);
    await ctrl.play(const AudioItem(
      id: 'a',
      title: 'Gurur Brahma MantraGurur Brahma Mantra',
      audioUrl: 'https://cdn.test/a.mp3',
      subtitle: 'Category name',
      artworkUrl: '', // AppNetworkImage short-circuits to the branded fallback
    ));
    await tester.pump();
    await ctrl.pause();
    await tester.pump();
    await tester.pump();

    await expectLater(
      find.byType(MiniPlayer),
      matchesGoldenFile('mini_player_v2_bar.png'),
    );
  });
}
