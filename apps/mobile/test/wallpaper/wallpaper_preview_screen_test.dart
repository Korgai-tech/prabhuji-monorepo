import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/wallpaper/data/wallpaper_models.dart';
import 'package:mobile/features/wallpaper/wallpaper_routes.dart';

import '../support/fake_repositories.dart';
import '../support/fake_set_wallpaper_service.dart';
import '../support/fake_wallpaper_video_port.dart';
import '../support/wallpaper_harness.dart';

void main() {
  WallpaperPreviewArgs staticArgs() => WallpaperPreviewArgs(
        items: [
          wallpaperCardFixture('wp0', title: 'Durga 1'),
          wallpaperCardFixture('wp1', title: 'Durga 2'),
        ],
        startIndex: 0,
        query: const WallpaperListQuery(title: 'Durga', deityId: 'durga'),
      );

  WallpaperPreviewArgs liveArgs() => WallpaperPreviewArgs(
        items: [
          wallpaperCardFixture('live0',
              title: 'Shiva', mediaType: WallpaperMediaType.live),
        ],
        startIndex: 0,
      );

  testWidgets('static preview shows TWO Set CTAs + formatted set-count',
      (tester) async {
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: staticArgs(),
    );
    expect(find.byKey(const Key('wallpaper-preview-set-home')), findsOneWidget);
    expect(find.byKey(const Key('wallpaper-preview-set-lock')), findsOneWidget);
    expect(find.text('Set Wallpaper'), findsOneWidget);
    expect(find.text('Set Lockscreen'), findsOneWidget);
    expect(find.textContaining('Wallpaper set'), findsOneWidget);
    expect(find.textContaining('TIMES'), findsOneWidget);
  });

  testWidgets('static preview shows the engagement rail (like + share)',
      (tester) async {
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: staticArgs(),
    );
    expect(find.byKey(const Key('wallpaper-preview-like')), findsOneWidget);
    expect(find.byKey(const Key('wallpaper-preview-share')), findsOneWidget);
  });

  testWidgets('live preview shows ONLY Set Wallpaper (no Set Lockscreen)',
      (tester) async {
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: liveArgs(),
    );
    expect(find.byKey(const Key('wallpaper-preview-set-home')), findsOneWidget);
    expect(find.byKey(const Key('wallpaper-preview-set-lock')), findsNothing);
  });

  testWidgets('live page plays the (single) active muted video', (tester) async {
    final port = FakeWallpaperVideoPort();
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: liveArgs(),
      videoPortFactory: () => port,
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wallpaper-preview-video')), findsOneWidget);
    expect(port.playCalls, greaterThan(0));
  });

  testWidgets('Pro user tapping Set Wallpaper → native static call directly',
      (tester) async {
    final service = FakeSetWallpaperService();
    await pumpWallpaperPreview(
      tester,
      repository: FakeWallpaperRepository(),
      args: staticArgs(),
      setService: service,
      isPro: true,
    );
    await tester.tap(find.byKey(const Key('wallpaper-preview-set-home')));
    await tester.pumpAndSettle();
    expect(service.staticCalls, 1);
  });
}
