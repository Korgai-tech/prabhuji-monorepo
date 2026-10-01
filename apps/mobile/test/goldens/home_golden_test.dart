@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/home/data/home_models.dart';
import 'package:mobile/features/home/presentation/home_header.dart';
import 'package:mobile/features/home/presentation/home_screen.dart';
import 'package:mobile/features/home/presentation/home_shortcut_grid.dart';

import '../support/fake_home_services.dart';
import '../support/golden_harness.dart';
import '../support/home_harness.dart';

/// Decode every asset image in the tree, then repaint.
///
/// `pumpForGolden` does this for the standalone component goldens; the
/// full-screen goldens go through `pumpHome` (which uses bounded pumps, since
/// Home can never `pumpAndSettle` — see `homeSettle`), so they need it too.
/// Image decode is real async I/O: without `runAsync` the 40px module thumbs
/// render blank while their fixture chrome renders fine.
Future<void> precacheAll(WidgetTester tester) async {
  await tester.runAsync(() async {
    for (final el in find.byType(Image).evaluate()) {
      await precacheImage((el.widget as Image).image, el);
    }
  });
  await homeSettle(tester);
}

/// Component goldens for Home (TAM-60 Phase 6). Rendered headlessly at the Figma
/// frame width (360) and reviewed side-by-side with the frame exports under
/// `specs/evidence/TAM-62/fidelity/figma-refs/`; the verdict lives in that
/// folder's `sweep-table.md`. Tagged `golden` so the cross-platform gate
/// (`--exclude-tags golden`) skips them; refresh locally with
/// `flutter test --update-goldens test/goldens/home_golden_test.dart`.
///
/// Hero/banner media is intentionally the branded AppNetworkImage fallback (the
/// fixtures use empty URLs) — a golden must never depend on the network. The
/// Figma refs show real deity art in that slot; everything AROUND it is what
/// these lock: chrome, icons, spacing, typography, tokens.
void main() {
  // Both are ConsumerWidgets (the header reads the session token to derive the
  // avatar initial), so they need a scope even when rendered standalone.
  testWidgets('golden: home header (285:3482)', (tester) async {
    await pumpForGolden(
      tester,
      const ProviderScope(child: HomeHeader()),
      size: const Size(360, 64),
    );
    await expectLater(
      find.byType(HomeHeader),
      matchesGoldenFile('home_header.png'),
    );
  });

  testWidgets('golden: feature shortcut grid (300:4338)', (tester) async {
    await pumpForGolden(
      tester,
      // The tiles are CMS content now, so the golden is pumped with the fixture
      // that mirrors what TAM-61 serves — the grid has no bundled list of its own.
      ProviderScope(child: HomeShortcutGrid(shortcuts: homeShortcutFixtures())),
      size: const Size(360, 260),
    );
    await expectLater(
      find.byType(HomeShortcutGrid),
      matchesGoldenFile('home_shortcut_grid.png'),
    );
  });

  testWidgets('golden: home screen — banners + shortcuts + feed (285:3464)',
      (tester) async {
    await pumpHome(
      tester,
      repository: FakeHomeRepository(
        // Empty banner media would be dropped by the bloc; a golden must not hit
        // the network, so the carousel is exercised in the widget suite instead
        // and the screen golden locks the chrome below it.
        banners: const [],
        items: [
          homeFeedItem(
            id: 'f-wallpaper',
            contentType: HomeContentType.wallpaper,
            module: 'wallpaper',
            ctaLabel: 'Set Wallpaper',
            label: 'Set Wallpaper',
            subtitle: 'Hanuman Blessing',
            badge: HomeBadge.trending,
          ),
        ],
      ),
      viewportHeight: 1200,
    );
    await precacheAll(tester);
    await expectLater(
      find.byType(HomeScreen),
      matchesGoldenFile('home_screen.png'),
    );
  });

  testWidgets('golden: aarti audio feed card (285:3639)', (tester) async {
    await pumpHome(
      tester,
      repository: FakeHomeRepository(
        banners: const [],
        items: [
          homeFeedItem(
            id: 'f-aarti',
            contentType: HomeContentType.aarti,
            module: 'aarti',
            ctaLabel: 'Listen to more',
            label: 'Aarti & Bhajan',
            subtitle: 'Hanuman Chalisa',
            badge: HomeBadge.suggested,
            audioPreviewUrl: 'https://cdn.example.com/aarti.mp3',
          ),
        ],
      ),
      viewportHeight: 900,
    );
    await precacheAll(tester);
    await expectLater(
      find.byType(HomeScreen),
      matchesGoldenFile('home_audio_card.png'),
    );
  });
}
