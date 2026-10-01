import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audio/application/audio_providers.dart';
import 'package:mobile/features/audio/domain/audio_item.dart';
import 'package:mobile/features/audio/presentation/mini_player.dart';

import '../support/fake_audio_engine.dart';

/// Layout-intent test for the v2 mini-player (spec: TAM-N-mini-player-v2,
/// Figma node 1950:20911). Asserts the two structural intents that the design
/// encodes but Figma's ONE-height frame cannot verify:
///
///   1. The bar is `min`-height, not fixed — the container grows with font
///      scale rather than clipping (the `_CardHeader` font-scale trap from
///      `home_feed_card.dart`). Verified at textScaleFactor 2.0.
///   2. The title/subtitle column is `Expanded` — the play + close buttons
///      keep their intrinsic width regardless of title length, so long titles
///      ellipsize instead of pushing the close button off-screen. Verified
///      with a 200-char title at 320dp width (smallest common Android).
///
/// Pattern: `patterns_library/testing/flutter-layout-intent.md`. The mini-player
/// is not a full screen with pinned-top/pinned-bottom zones — it IS itself a
/// pinned-bottom zone inside the shell — so this file only asserts the two
/// intents relevant to a horizontal Row-with-flex-fill widget, not the vertical
/// pinned/flex triplet described in the pattern.

const _item = AudioItem(
  id: 'a',
  title: 'Shri Raam Dootam',
  audioUrl: 'https://cdn.test/a.mp3',
  subtitle: 'Prabhuji',
  artworkUrl: '',
);

const _longTitle =
    'Om Namah Shivaya Shivaya Namah Om Extended Sacred Chant for Morning '
    'Practice with Additional Devotional Text That Should Absolutely Ellipsize';

Future<ProviderContainer> _pumpMiniPlayer(
  WidgetTester tester, {
  required AudioItem item,
}) async {
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
  return container;
}

void main() {
  group('MiniPlayer layout intent', () {
    testWidgets('bar renders at MIN 74dp at default font scale', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await _pumpMiniPlayer(tester, item: _item);

      final rect =
          tester.getRect(find.byKey(const Key('mini-player-surface')));
      expect(rect.height, greaterThanOrEqualTo(74),
          reason: 'Bar min-height is 74dp per Figma node 1950:20911');
      // At scale 1.0 the intrinsic content (50 artwork + 12 pad*2 = 74)
      // matches the minHeight exactly, so height should be ~74.
      expect(rect.height, lessThan(90),
          reason: 'At scale 1.0 the bar should hug ~74dp, not balloon');
    });

    testWidgets('bar GROWS beyond 74dp at textScale 2.0 (font-scale trap)',
        (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 2.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(
          tester.platformDispatcher.clearTextScaleFactorTestValue);

      await _pumpMiniPlayer(tester, item: _item);

      final rect =
          tester.getRect(find.byKey(const Key('mini-player-surface')));
      // At 2.0 scale, title 12→24 + subtitle 10→20 lines expand — the bar's
      // MIN 74dp should be exceeded. If someone regresses to `height: 74`
      // this fails (and RenderFlex overflow would fire in analyze).
      expect(rect.height, greaterThan(74),
          reason:
              'Bar must GROW past its 74dp min at textScale 2.0 — regressing '
              'to `height: 74` clips text and violates the font-scale trap '
              '(figma-flutter skill, `home_feed_card.dart` #_CardHeader).');
    });

    testWidgets('title/subtitle column is Expanded — close button stays '
        'on-screen with a very long title at 320dp width', (tester) async {
      tester.view.physicalSize = const Size(320, 800); // smallest common Android
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final longItem = AudioItem(
        id: 'a',
        title: _longTitle,
        audioUrl: 'https://cdn.test/a.mp3',
        subtitle: 'A subtitle that is also uncomfortably long for a 320dp bar',
        artworkUrl: '',
      );
      await _pumpMiniPlayer(tester, item: longItem);

      final barRect =
          tester.getRect(find.byKey(const Key('mini-player-surface')));
      final closeRect =
          tester.getRect(find.byKey(const Key('mini-player-close')));
      final playRect =
          tester.getRect(find.byKey(const Key('mini-player-play-pause')));

      // Close button's right edge must sit within the bar. If the title
      // column were NOT `Expanded`, it would push the close button off-screen.
      expect(closeRect.right, lessThanOrEqualTo(barRect.right + 0.5),
          reason: 'Close button clipped off-screen — title column lost its '
              'Expanded (Figma node 1950:20914 `layoutGrow: 1`).');
      expect(playRect.right, lessThanOrEqualTo(barRect.right + 0.5),
          reason: 'Play button also off-screen — layout collapsed.');
      // And the close button must still be hit-testable.
      await tester.tap(find.byKey(const Key('mini-player-close')));
      await tester.pump();
      // (Tapping close stops playback + unmounts — an unmounted `mini-player-
      // surface` is proof the tap actually reached the button.)
      expect(find.byKey(const Key('mini-player-surface')), findsNothing);
    });

    testWidgets('the widget subtree contains NO SingleChildScrollView / '
        'Scrollable — the mini-player never scrolls internally',
        (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await _pumpMiniPlayer(tester, item: _item);

      // Scoped to the mini-player surface — the whole app's tree includes the
      // Overlay's Scrollables etc., which we don't care about here.
      expect(
        find.descendant(
          of: find.byKey(const Key('mini-player-surface')),
          matching: find.byType(Scrollable),
        ),
        findsNothing,
        reason: 'Long titles must ellipsize, never scroll — the bar has zero '
            'scrollable children.',
      );
      expect(
        find.descendant(
          of: find.byKey(const Key('mini-player-surface')),
          matching: find.byType(SingleChildScrollView),
        ),
        findsNothing,
        reason: 'No SingleChildScrollView inside the mini-player.',
      );
    });
  });
}
