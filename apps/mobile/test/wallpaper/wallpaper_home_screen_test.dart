import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';
import 'package:mobile/features/wallpaper/presentation/wallpaper_widgets.dart';

import '../support/fake_repositories.dart';
import '../support/wallpaper_harness.dart';

void main() {
  testWidgets('renders CMS rows with titles + Show all; deity All Gods first',
      (tester) async {
    await pumpWallpaperHome(tester, repository: FakeWallpaperRepository());

    expect(find.byKey(const Key('wallpaper-home-screen')), findsOneWidget);
    expect(find.byKey(const Key('deity-chip-all')), findsOneWidget);
    expect(find.text('Top Live Wallpapers'), findsOneWidget);
    expect(find.text('New Wallpapers'), findsOneWidget);
    expect(find.text('Show all'), findsWidgets);
  });

  testWidgets('home cards carry NO LIVE badge (per Figma); cards are keyed',
      (tester) async {
    await pumpWallpaperHome(tester, repository: FakeWallpaperRepository());

    // Home row cards render image-only — the LIVE badge lives on the listing
    // grid, not the home strips (Figma 704:5223).
    expect(find.byType(WallpaperLiveBadge), findsNothing);
    expect(find.byKey(const Key('wallpaper-card-live0')), findsOneWidget);
    expect(find.byKey(const Key('wallpaper-card-live1')), findsOneWidget);
  });

  testWidgets("the row icon is driven by the server's iconKey", (tester) async {
    // Every fixture row carries an iconKey (live | new | trending | heart), just
    // as the API serves. Only `live` has bundled Figma art — which is the
    // design's rule — so only that row draws a glyph. The client no longer
    // decides this from `rowType == 'top_live'`.
    await pumpWallpaperHome(tester, repository: FakeWallpaperRepository());
    expect(
      find.byKey(const Key('wallpaper-row-icon-row-top-live')),
      findsOneWidget,
    );
    expect(find.byKey(const Key('wallpaper-row-icon-row-new')), findsNothing);
    expect(
      find.byKey(const Key('wallpaper-row-icon-row-trending')),
      findsNothing,
    );
  });

  testWidgets('a row typed top_live but keyed otherwise draws NO icon — the '
      'KEY decides, not the rowType', (tester) async {
    final rows = wallpaperHomeRowsFixture();
    final topLive = rows.first;
    await pumpWallpaperHome(
      tester,
      repository: FakeWallpaperRepository(rows: [
        WallpaperHomeRowData(
          rowId: topLive.rowId,
          title: topLive.title,
          rowType: 'top_live',
          // The CMS moved this row's glyph off `live`.
          iconKey: 'trending',
          items: topLive.items,
        ),
      ]),
    );

    expect(
      find.byKey(const Key('wallpaper-row-icon-row-top-live')),
      findsNothing,
    );
  });

  testWidgets('an unknown iconKey renders no icon and never crashes',
      (tester) async {
    final rows = wallpaperHomeRowsFixture();
    final topLive = rows.first;
    await pumpWallpaperHome(
      tester,
      repository: FakeWallpaperRepository(rows: [
        WallpaperHomeRowData(
          rowId: topLive.rowId,
          title: topLive.title,
          rowType: topLive.rowType,
          iconKey: 'hologram_v9',
          items: topLive.items,
        ),
      ]),
    );

    expect(
      find.byKey(const Key('wallpaper-row-icon-row-top-live')),
      findsNothing,
    );
    // The row itself still renders, with its title and cards.
    expect(find.text(topLive.title), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('hides the Liked row when the user has no likes', (tester) async {
    await pumpWallpaperHome(
      tester,
      repository: FakeWallpaperRepository(likedEmpty: true),
    );
    expect(find.text('Liked Wallpaper'), findsNothing);
    expect(find.text('Top Live Wallpapers'), findsOneWidget);
  });

  testWidgets('empty state shows the calm message', (tester) async {
    await pumpWallpaperHome(
      tester,
      repository: FakeWallpaperRepository(rows: const []),
    );
    expect(find.byKey(const Key('wallpaper-home-empty')), findsOneWidget);
    expect(find.text('No wallpapers available yet.'), findsOneWidget);
  });
}
