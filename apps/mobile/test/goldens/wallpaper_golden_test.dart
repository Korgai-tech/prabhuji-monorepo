@Tags(['golden'])
library;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_bloc.dart';
import 'package:mobile/features/wallpaper/home/bloc/wallpaper_home_event.dart';
import 'package:mobile/features/wallpaper/home/presentation/wallpaper_home_screen.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_bloc.dart';
import 'package:mobile/features/wallpaper/listing/bloc/wallpaper_list_event.dart';
import 'package:mobile/features/wallpaper/listing/presentation/wallpaper_listing_screen.dart';
import 'package:mobile/features/wallpaper/preview/presentation/wallpaper_preview_screen.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../support/fake_repositories.dart';
import '../support/wallpaper_harness.dart';

/// Component goldens for the Wallpaper module (TAM-60 Phase 6). Rendered
/// headlessly at a pinned phone size and reviewed side-by-side with the Figma
/// frame exports under `specs/evidence/TAM-70/fidelity/figma-refs/`. Tagged
/// `golden` so the cross-platform gate (`--exclude-tags golden`) skips them;
/// refresh locally with
/// `flutter test --update-goldens test/goldens/wallpaper_golden_test.dart`.
Future<void> _pump(WidgetTester tester, Widget app, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('golden: wallpaper home (704:5223)', (tester) async {
    final repo = FakeWallpaperRepository();
    final bloc = WallpaperHomeBloc(repository: repo)
      ..add(const WallpaperHomeLoadRequested());
    await _pump(
      tester,
      wallpaperTestApp(
        repository: repo,
        child: BlocProvider.value(
          value: bloc,
          child: const WallpaperHomeScreen(),
        ),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(WallpaperHomeScreen),
      matchesGoldenFile('wallpaper_home.png'),
    );
  });

  testWidgets('golden: wallpaper listing (707:6427)', (tester) async {
    final repo = FakeWallpaperRepository(pageSize: 6);
    const query =
        WallpaperListQuery(title: 'Durga Ma Wallpapers', deityId: 'durga');
    final bloc = WallpaperListBloc(repository: repo, query: query)
      ..add(const WallpaperListLoadRequested());
    await _pump(
      tester,
      wallpaperTestApp(
        repository: repo,
        child: BlocProvider.value(
          value: bloc,
          child: const WallpaperListingScreen(query: query),
        ),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(WallpaperListingScreen),
      matchesGoldenFile('wallpaper_listing.png'),
    );
  });

  testWidgets('golden: static wallpaper preview (282:2812)', (tester) async {
    final repo = FakeWallpaperRepository();
    await _pump(
      tester,
      wallpaperTestApp(
        repository: repo,
        child: WallpaperPreviewScreen(
          args: WallpaperPreviewArgs(
            items: [wallpaperCardFixture('wp0', title: 'Durga Ma')],
            startIndex: 0,
          ),
        ),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(WallpaperPreviewScreen),
      matchesGoldenFile('wallpaper_static_preview.png'),
    );
  });

  testWidgets('golden: live wallpaper preview (712:6622)', (tester) async {
    final repo = FakeWallpaperRepository();
    await _pump(
      tester,
      wallpaperTestApp(
        repository: repo,
        child: WallpaperPreviewScreen(
          args: WallpaperPreviewArgs(
            items: [
              wallpaperCardFixture('live0',
                  title: 'Shiva Lingam', mediaType: WallpaperMediaType.live),
            ],
            startIndex: 0,
          ),
        ),
      ),
      const Size(360, 800),
    );
    await expectLater(
      find.byType(WallpaperPreviewScreen),
      matchesGoldenFile('wallpaper_live_preview.png'),
    );
  });
}
