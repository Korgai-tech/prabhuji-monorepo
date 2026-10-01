import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/presentation/wallpaper_widgets.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../support/fake_repositories.dart';
import '../support/wallpaper_harness.dart';

void main() {
  const query = WallpaperListQuery(title: 'Durga Ma Wallpapers', deityId: 'durga');

  testWidgets('renders a two-column grid with a dynamic title', (tester) async {
    await pumpWallpaperListing(
      tester,
      repository: FakeWallpaperRepository(pageSize: 8),
      query: query,
    );
    expect(find.byKey(const Key('wallpaper-listing-screen')), findsOneWidget);
    expect(find.byKey(const Key('wallpaper-grid')), findsOneWidget);
    expect(find.text('Durga Ma Wallpapers'), findsOneWidget);

    final grid = tester.widget<GridView>(find.byKey(const Key('wallpaper-grid')));
    final delegate =
        grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
    expect(delegate.crossAxisCount, 2);
  });

  testWidgets('LIVE badge renders on live grid cards', (tester) async {
    await pumpWallpaperListing(
      tester,
      repository: FakeWallpaperRepository(pageSize: 8),
      query: query,
    );
    // live0/live4 are live in the fixture → LIVE badges present.
    expect(find.byType(WallpaperLiveBadge), findsWidgets);
  });

  testWidgets('empty listing shows the exact message', (tester) async {
    await pumpWallpaperListing(
      tester,
      repository: FakeWallpaperRepository(emptyDeityId: 'durga', rows: const []),
      query: query,
    );
    expect(find.byKey(const Key('wallpaper-listing-empty')), findsOneWidget);
    expect(find.text('No wallpapers available yet.'), findsOneWidget);
  });
}
